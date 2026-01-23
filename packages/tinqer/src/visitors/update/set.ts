/**
 * Visitor for UPDATE .set() operation
 */

import type { UpdateOperation } from "../../query-tree/operations.js";
import type { ObjectExpression } from "../../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Identifier,
  ObjectExpression as ASTObjectExpression,
  ParenthesizedExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { visitExpression } from "../index.js";

export interface SetVisitorResult {
  operation: UpdateOperation;
  autoParams: Record<string, unknown>;
}

/**
 * Visit a .set() operation on an UPDATE
 */
export function visitSetOperation(
  ast: ASTCallExpression,
  source: UpdateOperation,
  visitorContext: VisitorContext,
): SetVisitorResult | null {
  // Check if .set() has already been called (assignments should be empty object initially)
  if (
    source.assignments.type === "object" &&
    Object.keys(source.assignments.properties).length > 0
  ) {
    throw new Error("set() can only be called once per UPDATE query");
  }

  // .set({ column1: value1, column2: value2 })
  const args = ast.arguments;
  if (!args || args.length === 0) {
    return null;
  }

  const firstArg = args[0];
  if (!firstArg) {
    return null;
  }

  let assignmentsNode: ASTObjectExpression;
  let originalTableParams: Set<string> | null = null;

  if (firstArg.type === "ObjectExpression") {
    assignmentsNode = firstArg as ASTObjectExpression;
  } else if (firstArg.type === "ArrowFunctionExpression") {
    const arrowFn = firstArg as ArrowFunctionExpression;

    // Extract parameter name (e.g., "row")
    const params = arrowFn.params;
    if (!params || params.length === 0 || params[0]?.type !== "Identifier") {
      throw new Error("set() lambda must have a parameter");
    }

    const rowParamName = (params[0] as Identifier).name;

    // Add to table params temporarily for expression resolution
    originalTableParams = new Set(visitorContext.tableParams);
    visitorContext.tableParams.add(rowParamName);

    // Check for second parameter (external params)
    if (params.length > 1 && params[1]?.type === "Identifier") {
      const externalParamName = (params[1] as Identifier).name;
      visitorContext.queryParams.add(externalParamName);
    }

    let bodyExpr = arrowFn.body;

    // Handle block statement with return
    if (bodyExpr.type === "BlockStatement") {
      const returnStmt = bodyExpr.body?.find((stmt) => stmt.type === "ReturnStatement");
      if (!returnStmt || !returnStmt.argument) {
        throw new Error("set() lambda must return an object literal");
      }
      bodyExpr = returnStmt.argument;
    }

    if (bodyExpr.type !== "ObjectExpression") {
      // Arrow functions returning object literals are often parenthesized: () => ({ ... })
      while (bodyExpr.type === "ParenthesizedExpression") {
        bodyExpr = (bodyExpr as ParenthesizedExpression).expression;
      }
    }

    if (bodyExpr.type !== "ObjectExpression") {
      throw new Error("set() lambda must return an object literal");
    }

    assignmentsNode = bodyExpr as ASTObjectExpression;
  } else {
    throw new Error("set() must be an object literal or a lambda returning an object literal");
  }

  // Visit the object expression to get column-value assignments
  const assignmentsExpr = visitExpression(assignmentsNode, visitorContext);
  if (originalTableParams) {
    visitorContext.tableParams = originalTableParams;
  }
  if (!assignmentsExpr || assignmentsExpr.type !== "object") {
    return null;
  }

  // Validate that assignments object is not empty
  if (Object.keys(assignmentsExpr.properties).length === 0) {
    throw new Error("set() must specify at least one column assignment");
  }

  // Create updated UPDATE operation with assignments
  const updatedOperation: UpdateOperation = {
    ...source,
    assignments: assignmentsExpr as ObjectExpression,
  };

  return {
    operation: updatedOperation,
    autoParams: {},
  };
}
