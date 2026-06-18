/**
 * Visitor for call expressions (method calls, function calls)
 * Handles string methods, boolean methods, aggregate functions
 */

import type {
  Expression,
  ValueExpression,
  BooleanMethodExpression,
  StringMethodExpression,
  AggregateExpression,
  InExpression,
  ArrayExpression,
  ParameterExpression,
} from "../../expressions/expression.js";

import type {
  CallExpression as ASTCallExpression,
  MemberExpression as ASTMemberExpression,
  ArrowFunctionExpression,
  Identifier,
  Expression as ASTExpression,
  Literal,
  NumericLiteral,
  StringLiteral,
  BooleanLiteral,
  NullLiteral,
} from "../../parser/ast-types.js";

import type { VisitorContext } from "../types.js";
import { visitLiteral } from "../common/literal.js";
import { isValueExpression, getParameterName, getReturnExpression } from "../utils.js";
import { isWindowFunctionCall, visitWindowFunction } from "../window/index.js";
import { matchesFtsCallee, buildFtsRankExpression } from "../fts/index.js";

/**
 * Visit a call expression
 */
export function visitCall(
  node: ASTCallExpression,
  context: VisitorContext,
  visitExpression: (node: unknown, ctx: VisitorContext) => Expression | null,
): Expression | null {
  // Check for window function calls first
  const windowFunctionType = isWindowFunctionCall(node, context);
  if (windowFunctionType) {
    return visitWindowFunction(node, windowFunctionType, context, visitExpression);
  }

  // Check for full-text-search rank calls (h.fts.rank)
  if (matchesFtsCallee(node, context.helpersParam, "rank")) {
    return buildFtsRankExpression(node, (arg) => visitExpression(arg, context));
  }

  // Must be a method call
  if (node.callee.type !== "MemberExpression") {
    throw new Error(
      `Unsupported call expression: ${node.callee.type}. ` +
        `Method calls are only supported for specific string and boolean methods.`,
    );
  }

  const memberCallee = node.callee as ASTMemberExpression;

  // Check for aggregate methods on grouping parameters
  if (memberCallee.object.type === "Identifier" && memberCallee.property.type === "Identifier") {
    const objName = (memberCallee.object as Identifier).name;
    const methodName = (memberCallee.property as Identifier).name;

    // Check if this is an aggregate method on grouping
    if (context.groupingParams?.has(objName)) {
      return handleAggregateMethod(methodName, node.arguments, context, visitExpression);
    }
  }

  // Convert the object being called on
  const obj = visitExpression(memberCallee.object, context);

  if (!obj || memberCallee.property.type !== "Identifier") {
    return null;
  }

  const methodName = (memberCallee.property as Identifier).name;

  // Handle array.includes() -> IN expression (only for arrays/params)
  if (methodName === "includes" && (obj.type === "array" || obj.type === "param")) {
    return handleIncludesMethod(obj, node.arguments, context, visitExpression);
  }

  // String/boolean methods (including string.includes)
  if (isValueExpression(obj)) {
    return handleValueMethods(
      obj as ValueExpression,
      methodName,
      node.arguments,
      context,
      visitExpression,
    );
  }

  return null;
}

/**
 * Handle aggregate methods on grouping parameters
 */
function handleAggregateMethod(
  methodName: string,
  args: unknown[],
  context: VisitorContext,
  visitExpression: (node: unknown, ctx: VisitorContext) => Expression | null,
): AggregateExpression | null {
  const aggregateFunc = normalizeAggregateFunction(methodName);
  if (!aggregateFunc) return null;

  // Handle selector argument if present
  if (args && args.length > 0) {
    const selectorArg = args[0];
    if (selectorArg && (selectorArg as { type?: string }).type === "ArrowFunctionExpression") {
      const arrowFunc = selectorArg as ArrowFunctionExpression;
      const paramName = getParameterName(arrowFunc);

      // Add parameter to context
      if (paramName) {
        context.tableParams.add(paramName);
      }

      // Get body expression
      const bodyExpr =
        arrowFunc.body.type === "BlockStatement"
          ? getReturnExpression(arrowFunc.body.body)
          : arrowFunc.body;

      if (bodyExpr) {
        const expr = visitExpression(bodyExpr as ASTExpression, context);
        if (expr && isValueExpression(expr)) {
          return {
            type: "aggregate",
            function: aggregateFunc,
            expression: expr as ValueExpression,
          } as AggregateExpression;
        }
      }
    }
  }

  // No arguments - COUNT(*) or similar
  return {
    type: "aggregate",
    function: aggregateFunc,
  } as AggregateExpression;
}

/**
 * Handle array.includes() method
 */
function handleIncludesMethod(
  obj: Expression,
  args: unknown[],
  context: VisitorContext,
  visitExpression: (node: unknown, ctx: VisitorContext) => Expression | null,
): InExpression | null {
  const isArrayLike = obj.type === "array" || obj.type === "param";

  if (isArrayLike && args && args.length === 1 && args[0]) {
    const valueArg = visitExpression(args[0], context);
    if (valueArg && isValueExpression(valueArg)) {
      return {
        type: "in",
        value: valueArg as ValueExpression,
        list: obj as ArrayExpression | ParameterExpression,
      } as InExpression;
    }
  }

  return null;
}

/**
 * Handle methods on value expressions
 */
function handleValueMethods(
  obj: ValueExpression,
  methodName: string,
  args: unknown[],
  context: VisitorContext,
  visitExpression: (node: unknown, ctx: VisitorContext) => Expression | null,
): BooleanMethodExpression | StringMethodExpression | null {
  // Boolean methods
  if (["startsWith", "endsWith", "includes", "contains"].includes(methodName)) {
    // Convert arguments
    const convertedArgs = args.map((arg: unknown) => {
      // Convert literals
      if (isLiteralNode(arg)) {
        return visitLiteral(arg, context);
      }
      return visitExpression(arg, context);
    });

    return {
      type: "booleanMethod",
      object: obj,
      method: methodName as "startsWith" | "endsWith" | "includes" | "contains",
      arguments: convertedArgs.filter(Boolean) as ValueExpression[],
    } as BooleanMethodExpression;
  }

  // String methods
  if (["toLowerCase", "toUpperCase"].includes(methodName)) {
    return {
      type: "stringMethod",
      object: obj,
      method: methodName as "toLowerCase" | "toUpperCase",
    } as StringMethodExpression;
  }

  return null;
}

/**
 * Normalize aggregate function name
 */
function normalizeAggregateFunction(methodName: string): AggregateExpression["function"] | null {
  const lower = methodName.toLowerCase();
  switch (lower) {
    case "count":
      return "count";
    case "sum":
      return "sum";
    case "avg":
    case "average":
      return "avg";
    case "min":
      return "min";
    case "max":
      return "max";
    default:
      return null;
  }
}

/**
 * Check if node is a literal
 */
function isLiteralNode(
  node: unknown,
): node is Literal | NumericLiteral | StringLiteral | BooleanLiteral | NullLiteral {
  if (!node) return false;
  const type = (node as { type?: string }).type;
  return ["Literal", "NumericLiteral", "StringLiteral", "BooleanLiteral", "NullLiteral"].includes(
    type || "",
  );
}
