/**
 * Visitor for INSERT .onConflict() operation
 */

import type { ColumnExpression } from "../../expressions/expression.js";
import type { InsertOperation } from "../../query-tree/operations.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { visitExpression } from "../index.js";

export interface OnConflictVisitorResult {
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
 * Visit a .onConflict() operation on an INSERT
 */
export function visitOnConflictOperation(
  ast: ASTCallExpression,
  source: InsertOperation,
  visitorContext: VisitorContext,
): OnConflictVisitorResult | null {
  // .onConflict((row) => row.col, (row) => row.otherCol, ...)
  const args = ast.arguments;
  if (!args || args.length === 0) {
    throw new Error("onConflict() requires at least one column selector");
  }

  if (source.onConflict) {
    throw new Error("onConflict() can only be called once per INSERT");
  }

  const columns: string[] = [];

  for (const arg of args) {
    if (!arg || arg.type !== "ArrowFunctionExpression") {
      throw new Error("onConflict() requires lambda expressions");
    }

    const arrowFn = arg as ArrowFunctionExpression;
    const params = arrowFn.params;
    if (!params || params.length === 0 || params[0]?.type !== "Identifier") {
      throw new Error("onConflict() lambda must have a parameter");
    }

    const paramName = params[0].name;

    const originalTableParams = new Set(visitorContext.tableParams);
    visitorContext.tableParams.add(paramName);

    const bodyExpr = getArrowBodyExpression(arrowFn, "onConflict()");
    const expr = visitExpression(bodyExpr, visitorContext);

    visitorContext.tableParams = originalTableParams;

    if (!expr || expr.type !== "column") {
      throw new Error("onConflict() selectors must return a column reference");
    }

    const columnExpr = expr as ColumnExpression;
    if (columnExpr.table || columnExpr.source) {
      throw new Error("onConflict() selectors must be direct column access (e.g. row.id)");
    }

    columns.push(columnExpr.name);
  }

  const unique = new Set(columns);
  if (unique.size !== columns.length) {
    throw new Error("onConflict() cannot include duplicate columns");
  }

  const updatedOperation: InsertOperation = {
    ...source,
    onConflict: { target: columns },
  };

  return {
    operation: updatedOperation,
    autoParams: {},
  };
}
