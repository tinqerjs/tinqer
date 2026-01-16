/**
 * Visitor for INSERT .doUpdateSet() operation
 */

import type { ObjectExpression } from "../../expressions/expression.js";
import type { InsertOperation } from "../../query-tree/operations.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  ObjectExpression as ASTObjectExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { visitExpression } from "../index.js";

export interface DoUpdateSetVisitorResult {
  operation: InsertOperation;
  autoParams: Record<string, unknown>;
}

function getArrowBodyExpression(
  arrowFn: ArrowFunctionExpression,
  label: string,
): import("../../parser/ast-types.js").Expression {
  const bodyExpr = arrowFn.body;

  if (bodyExpr.type !== "BlockStatement") {
    return bodyExpr;
  }

  const returnStmt = bodyExpr.body?.find((stmt) => stmt.type === "ReturnStatement");
  if (!returnStmt || !returnStmt.argument) {
    throw new Error(`${label} lambda must return a value`);
  }

  return returnStmt.argument;
}

/**
 * Visit a .doUpdateSet() operation on an INSERT upsert
 */
export function visitDoUpdateSetOperation(
  ast: ASTCallExpression,
  source: InsertOperation,
  visitorContext: VisitorContext,
): DoUpdateSetVisitorResult | null {
  if (!source.onConflict) {
    throw new Error("doUpdateSet() must be called after onConflict()");
  }

  if (source.onConflict.action) {
    throw new Error("doUpdateSet() cannot be used after an upsert action is already set");
  }

  const args = ast.arguments;
  if (!args || args.length === 0) {
    throw new Error("doUpdateSet() requires an object or lambda");
  }

  const firstArg = args[0];
  if (!firstArg) {
    return null;
  }

  let assignmentsExpr: ObjectExpression | null = null;

  if (firstArg.type === "ObjectExpression") {
    const expr = visitExpression(firstArg as ASTObjectExpression, visitorContext);
    if (!expr || expr.type !== "object") {
      throw new Error("doUpdateSet() must return an object literal");
    }
    assignmentsExpr = expr as ObjectExpression;
  } else if (firstArg.type === "ArrowFunctionExpression") {
    const arrowFn = firstArg as ArrowFunctionExpression;
    const params = arrowFn.params;
    if (!params || params.length === 0 || params[0]?.type !== "Identifier") {
      throw new Error("doUpdateSet() lambda must have at least one parameter");
    }

    const rowParam = params[0].name;
    const excludedParam = params[1]?.type === "Identifier" ? params[1].name : undefined;

    const originalTableParams = new Set(visitorContext.tableParams);
    const originalExcludedParam = visitorContext.upsertExcludedParam;

    visitorContext.tableParams.add(rowParam);
    visitorContext.upsertExcludedParam = excludedParam;

    const bodyExpr = getArrowBodyExpression(arrowFn, "doUpdateSet()");
    const expr = visitExpression(bodyExpr, visitorContext);

    visitorContext.tableParams = originalTableParams;
    visitorContext.upsertExcludedParam = originalExcludedParam;

    if (!expr || expr.type !== "object") {
      throw new Error("doUpdateSet() lambda must return an object literal");
    }
    assignmentsExpr = expr as ObjectExpression;
  } else {
    throw new Error("doUpdateSet() requires an object literal or lambda expression");
  }

  if (!assignmentsExpr || Object.keys(assignmentsExpr.properties).length === 0) {
    throw new Error("doUpdateSet() must specify at least one column assignment");
  }

  const updatedOperation: InsertOperation = {
    ...source,
    onConflict: {
      ...source.onConflict,
      action: { type: "update", assignments: assignmentsExpr },
    },
  };

  return {
    operation: updatedOperation,
    autoParams: {},
  };
}
