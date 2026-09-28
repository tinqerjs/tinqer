import type {
  QueryOperation,
  SelectManyOperation,
  ResultShape,
} from "../../query-tree/operations.js";
import type { Expression, ObjectExpression } from "../../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  Expression as ASTExpression,
  ArrowFunctionExpression,
  Identifier,
  ObjectExpression as ASTObjectExpression,
  Property as ASTProperty,
  MemberExpression,
  BlockStatement,
  Statement,
  ParenthesizedExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { visitAstToQueryOperation } from "../ast-visitor.js";
import { buildResultShape } from "../join/shape.js";

interface CollectionInfo {
  path: string[];
  usesDefaultIfEmpty: boolean;
}

function extractPathFromMember(expr: MemberExpression, rootName: string): string[] | null {
  const segments: string[] = [];
  let current: ASTExpression = expr;

  // Traverse member chain backwards
  while (current.type === "MemberExpression" && !current.computed) {
    const member = current as MemberExpression;
    if (member.property.type !== "Identifier") {
      return null;
    }
    segments.unshift(member.property.name);
    current = member.object;
  }

  if (current.type === "Identifier" && (current as Identifier).name === rootName) {
    return segments;
  }

  return null;
}

function parseCollectionSelector(arrow: ArrowFunctionExpression): {
  sourceParam: string | undefined;
  info: CollectionInfo | null;
  bodyExpression: ASTExpression | null;
} {
  const sourceParam =
    arrow.params && arrow.params[0]?.type === "Identifier"
      ? (arrow.params[0] as Identifier).name
      : undefined;

  let bodyExpr: ASTExpression;
  if (arrow.body.type === "BlockStatement") {
    const block = arrow.body as BlockStatement;
    const returnStmt = block.body.find((stmt: Statement) => stmt.type === "ReturnStatement") as
      { argument?: ASTExpression } | undefined;
    if (!returnStmt || !returnStmt.argument) {
      return { sourceParam, info: null, bodyExpression: null };
    }
    bodyExpr = returnStmt.argument;
  } else {
    bodyExpr = arrow.body as ASTExpression;
  }

  if (!sourceParam) {
    return { sourceParam, info: null, bodyExpression: bodyExpr };
  }

  bodyExpr = unwrapParentheses(bodyExpr);

  // defaultIfEmpty call
  if (bodyExpr.type === "CallExpression") {
    const call = bodyExpr as ASTCallExpression;
    if (
      call.callee.type === "MemberExpression" &&
      !call.callee.computed &&
      call.callee.property.type === "Identifier" &&
      call.callee.property.name === "defaultIfEmpty" &&
      call.callee.object.type === "MemberExpression"
    ) {
      const path = extractPathFromMember(call.callee.object as MemberExpression, sourceParam);
      if (path && path.length > 0) {
        return {
          sourceParam,
          info: {
            path,
            usesDefaultIfEmpty: true,
          },
          bodyExpression: bodyExpr,
        };
      }
    }
  }

  if (bodyExpr.type === "MemberExpression" && !bodyExpr.computed) {
    const path = extractPathFromMember(bodyExpr as MemberExpression, sourceParam);
    if (path && path.length > 0) {
      return {
        sourceParam,
        info: {
          path,
          usesDefaultIfEmpty: false,
        },
        bodyExpression: bodyExpr,
      };
    }
  }

  return { sourceParam, info: null, bodyExpression: bodyExpr };
}

interface ResultBinding {
  name: string;
  source: "outer" | "inner";
  path?: string[];
}

function parseResultSelector(
  arrow: ArrowFunctionExpression,
): { bindings: ResultBinding[]; outerParam?: string; innerParam?: string } | null {
  if (!arrow.params || arrow.params.length < 2) {
    return null;
  }

  const outerParamNode = arrow.params[0]!;
  const innerParamNode = arrow.params[1]!;
  if (outerParamNode.type !== "Identifier" || innerParamNode.type !== "Identifier") {
    return null;
  }
  const outerParam = (outerParamNode as Identifier).name;
  const innerParam = (innerParamNode as Identifier).name;

  let bodyExpr: ASTExpression;
  if (arrow.body.type === "BlockStatement") {
    const block = arrow.body as BlockStatement;
    const returnStmt = block.body.find((stmt: Statement) => stmt.type === "ReturnStatement") as
      { argument?: ASTExpression } | undefined;
    if (!returnStmt || !returnStmt.argument) {
      return null;
    }
    bodyExpr = returnStmt.argument;
  } else {
    bodyExpr = arrow.body as ASTExpression;
  }

  const processedBody = unwrapParentheses(bodyExpr);
  if (processedBody.type !== "ObjectExpression") {
    return null;
  }

  const objExpr = processedBody as ASTObjectExpression;
  const bindings: ResultBinding[] = [];

  for (const prop of objExpr.properties) {
    const property = prop as ASTProperty;
    if (property.type !== "Property" || property.key.type !== "Identifier") {
      return null;
    }
    const propName = property.key.name;
    const value = property.value;

    if (value.type === "Identifier") {
      const identName = (value as Identifier).name;
      if (identName === innerParam) {
        bindings.push({ name: propName, source: "inner" });
        continue;
      }
      if (identName === outerParam) {
        bindings.push({ name: propName, source: "outer" });
        continue;
      }
      return null;
    }

    if (value.type === "MemberExpression" && !value.computed) {
      const path = extractPathFromMember(value as MemberExpression, outerParam);
      if (path) {
        bindings.push({ name: propName, source: "outer", path });
        continue;
      }
    }

    return null;
  }

  return { bindings, outerParam, innerParam };
}

function buildPlaceholderShape(
  bindings: ResultBinding[],
  outerParam?: string,
  innerParam?: string,
): { expression: ObjectExpression; shape: ResultShape | undefined } {
  const properties: Record<string, Expression> = {};

  for (const binding of bindings) {
    if (binding.source === "outer") {
      properties[binding.name] = {
        type: "reference",
        table: outerParam,
      } as Expression;
    } else {
      properties[binding.name] = {
        type: "reference",
        table: innerParam,
      } as Expression;
    }
  }

  const expression: ObjectExpression = {
    type: "object",
    properties,
  };

  const shape = buildResultShape(expression, outerParam || "", innerParam || "");
  return { expression, shape };
}

export function visitSelectManyOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  _methodName: string,
  _visitorContext: VisitorContext,
): { operation: SelectManyOperation; autoParams: Record<string, unknown> } | null {
  if (!ast.arguments || ast.arguments.length === 0) {
    return null;
  }

  const collectionSelectorArg = ast.arguments[0];
  if (!collectionSelectorArg || collectionSelectorArg.type !== "ArrowFunctionExpression") {
    return null;
  }

  const { sourceParam, info, bodyExpression } = parseCollectionSelector(
    collectionSelectorArg as ArrowFunctionExpression,
  );

  let resultBindings: ResultBinding[] = [];
  let resultSelectorExpression: ObjectExpression | undefined;
  let resultShape: ResultShape | undefined;
  let resultOuterParam: string | undefined;
  let resultInnerParam: string | undefined;

  const autoParams: Record<string, unknown> = {};
  let collectionOperation: QueryOperation | null = null;

  if (!info && bodyExpression) {
    const collectionContextTables = new Set(_visitorContext.tableParams);
    const collectionContextParams = new Set(_visitorContext.queryParams);
    const collectionResult = visitAstToQueryOperation(
      bodyExpression,
      collectionContextTables,
      collectionContextParams,
      _visitorContext,
    );

    if (collectionResult?.operation) {
      collectionOperation = collectionResult.operation;

      if (collectionResult.autoParams) {
        Object.assign(autoParams, collectionResult.autoParams);

        let maxParamNum = _visitorContext.autoParamCounter;
        for (const key of Object.keys(collectionResult.autoParams)) {
          if (key.startsWith("__p")) {
            const num = parseInt(key.substring(3), 10);
            if (!Number.isNaN(num) && num > maxParamNum) {
              maxParamNum = num;
            }
          }
        }
        _visitorContext.autoParamCounter = maxParamNum;
      }
    }
  }

  if (!info && !collectionOperation) {
    return null;
  }

  if (ast.arguments.length > 1) {
    const resultSelectorArg = ast.arguments[1];
    if (!resultSelectorArg || resultSelectorArg.type !== "ArrowFunctionExpression") {
      return null;
    }

    const parsed = parseResultSelector(resultSelectorArg as ArrowFunctionExpression);
    if (!parsed) {
      return null;
    }

    resultBindings = parsed.bindings;
    resultOuterParam = parsed.outerParam;
    resultInnerParam = parsed.innerParam;

    const placeholder = buildPlaceholderShape(resultBindings, resultOuterParam, resultInnerParam);
    resultSelectorExpression = placeholder.expression;
    resultShape = placeholder.shape;
  }

  let collectionExpression: Expression | undefined;
  if (info) {
    collectionExpression = {
      type: "reference",
      table: sourceParam,
    } as Expression;
  }

  const operation: SelectManyOperation = {
    type: "queryOperation",
    operationType: "selectMany",
    source,
    collection: collectionOperation ?? collectionExpression!,
    collectionPropertyPath: info ? info.path : undefined,
    usesDefaultIfEmpty: info ? info.usesDefaultIfEmpty : false,
    sourceParam,
    collectionParam: collectionOperation ? resultInnerParam : sourceParam,
    resultSelector: resultSelectorExpression,
    resultShape,
    resultBindings,
    resultParam: resultInnerParam,
  };

  return { operation, autoParams };
}
function unwrapParentheses(expr: ASTExpression): ASTExpression {
  let current: ASTExpression = expr;
  while (current.type === "ParenthesizedExpression") {
    current = (current as ParenthesizedExpression).expression;
  }
  return current;
}
