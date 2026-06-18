import type {
  QueryOperation,
  GroupJoinOperation,
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
  ParenthesizedExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { getParameterName, getReturnExpression } from "../visitor-utils.js";
import { visitAstToQueryOperation } from "../ast-visitor.js";
import { visitGenericExpression } from "../shared/generic-visitor.js";
import { buildResultShape } from "../join/shape.js";

interface ParsedResultSelector {
  expression: ObjectExpression;
  resultShape: ResultShape | undefined;
  outerParam: string;
  groupParam: string;
  outerBinding: string;
  groupBinding: string;
}

function parseResultSelector(
  resultSelectorAst: ArrowFunctionExpression,
): ParsedResultSelector | null {
  if (!resultSelectorAst.params || resultSelectorAst.params.length < 2) {
    return null;
  }

  const outerParamNode = resultSelectorAst.params[0]!;
  const groupParamNode = resultSelectorAst.params[1]!;

  if (outerParamNode.type !== "Identifier" || groupParamNode.type !== "Identifier") {
    return null;
  }

  const outerParam = (outerParamNode as Identifier).name;
  const groupParam = (groupParamNode as Identifier).name;

  let bodyExpr: ASTExpression | null;
  if (resultSelectorAst.body.type === "BlockStatement") {
    bodyExpr = getReturnExpression(resultSelectorAst.body.body);
  } else {
    bodyExpr = resultSelectorAst.body;
  }

  if (!bodyExpr) {
    return null;
  }

  const processedBody = unwrapParentheses(bodyExpr);
  if (processedBody.type !== "ObjectExpression") {
    return null;
  }

  const astObject = processedBody as ASTObjectExpression;
  const properties: Record<string, Expression> = {};

  let outerBinding: string | null = null;
  let groupBinding: string | null = null;

  for (const prop of astObject.properties) {
    const property = prop as ASTProperty;
    if (property.type !== "Property" || property.key.type !== "Identifier") {
      return null;
    }

    const propName = property.key.name;
    const value = property.value;

    if (value.type === "Identifier") {
      const identName = (value as Identifier).name;
      if (identName === outerParam) {
        outerBinding = propName;
        properties[propName] = {
          type: "reference",
          table: outerParam,
        } as Expression;
        continue;
      }

      if (identName === groupParam) {
        groupBinding = propName;
        properties[propName] = {
          type: "reference",
          table: groupParam,
        } as Expression;
        continue;
      }
    }

    return null;
  }

  if (!outerBinding || !groupBinding) {
    return null;
  }

  const expression: ObjectExpression = {
    type: "object",
    properties,
  };

  const resultShape = buildResultShape(expression, outerParam, groupParam);

  return {
    expression,
    resultShape,
    outerParam,
    groupParam,
    outerBinding,
    groupBinding,
  };
}

export function visitGroupJoinOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  _methodName: string,
  visitorContext: VisitorContext,
): { operation: GroupJoinOperation; autoParams: Record<string, unknown> } | null {
  if (!ast.arguments || ast.arguments.length < 4) {
    return null;
  }

  const [innerArg, outerKeySelectorAst, innerKeySelectorAst] = ast.arguments;
  const resultSelectorAst = ast.arguments[3] as ASTExpression;

  const innerResult = innerArg
    ? visitAstToQueryOperation(
        innerArg as ASTExpression,
        visitorContext.tableParams,
        visitorContext.queryParams,
        visitorContext,
      )
    : null;

  const inner = innerResult?.operation || null;
  if (!inner) {
    return null;
  }

  const autoParams: Record<string, unknown> = {};

  if (innerResult?.autoParams) {
    Object.assign(autoParams, innerResult.autoParams);

    let maxParamNum = visitorContext.autoParamCounter;
    for (const key of Object.keys(innerResult.autoParams)) {
      if (key.startsWith("__p")) {
        const num = parseInt(key.substring(3), 10);
        if (!Number.isNaN(num) && num > maxParamNum) {
          maxParamNum = num;
        }
      }
    }
    visitorContext.autoParamCounter = maxParamNum;
  }

  let outerKey: string | null = null;
  let innerKey: string | null = null;

  if (outerKeySelectorAst && outerKeySelectorAst.type === "ArrowFunctionExpression") {
    const outerArrow = outerKeySelectorAst as ArrowFunctionExpression;
    const paramName = getParameterName(outerArrow);

    const outerContext = new Set(visitorContext.tableParams);
    if (paramName) {
      outerContext.add(paramName);
    }

    let bodyExpr: ASTExpression | null;
    if (outerArrow.body.type === "BlockStatement") {
      bodyExpr = getReturnExpression(outerArrow.body.body);
    } else {
      bodyExpr = outerArrow.body;
    }

    if (bodyExpr) {
      const result = visitGenericExpression(
        bodyExpr,
        outerContext,
        visitorContext.queryParams,
        visitorContext.autoParams,
        visitorContext.autoParamCounter,
      );
      if (result && result.expression && result.expression.type === "column") {
        outerKey = result.expression.name;
        Object.assign(autoParams, result.autoParams);
        visitorContext.autoParamCounter = result.counter;
      }
    }
  }

  if (innerKeySelectorAst && innerKeySelectorAst.type === "ArrowFunctionExpression") {
    const innerArrow = innerKeySelectorAst as ArrowFunctionExpression;
    const paramName = getParameterName(innerArrow);

    const innerContext = new Set(visitorContext.tableParams);
    if (paramName) {
      innerContext.add(paramName);
    }

    let bodyExpr: ASTExpression | null;
    if (innerArrow.body.type === "BlockStatement") {
      bodyExpr = getReturnExpression(innerArrow.body.body);
    } else {
      bodyExpr = innerArrow.body;
    }

    if (bodyExpr) {
      const result = visitGenericExpression(
        bodyExpr,
        innerContext,
        visitorContext.queryParams,
        visitorContext.autoParams,
        visitorContext.autoParamCounter,
      );
      if (result && result.expression && result.expression.type === "column") {
        innerKey = result.expression.name;
        Object.assign(autoParams, result.autoParams);
        visitorContext.autoParamCounter = result.counter;
      }
    }
  }

  if (!outerKey || !innerKey || resultSelectorAst.type !== "ArrowFunctionExpression") {
    return null;
  }

  const parsedResult = parseResultSelector(resultSelectorAst as ArrowFunctionExpression);

  if (!parsedResult) {
    return null;
  }

  const operation: GroupJoinOperation = {
    type: "queryOperation",
    operationType: "groupJoin",
    source,
    inner,
    outerKey,
    innerKey,
    resultSelector: parsedResult.expression,
    resultShape: parsedResult.resultShape,
    outerParam: parsedResult.outerParam,
    innerGroupParam: parsedResult.groupParam,
    outerBindingName: parsedResult.outerBinding,
    groupBindingName: parsedResult.groupBinding,
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
