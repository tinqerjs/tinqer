/**
 * Visitor for INSERT .doNothing() operation
 */

import type { InsertOperation } from "../../query-tree/operations.js";
import type { CallExpression as ASTCallExpression } from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";

export interface DoNothingVisitorResult {
  operation: InsertOperation;
  autoParams: Record<string, unknown>;
}

/**
 * Visit a .doNothing() operation on an INSERT upsert
 */
export function visitDoNothingOperation(
  _ast: ASTCallExpression,
  source: InsertOperation,
  _visitorContext: VisitorContext,
): DoNothingVisitorResult | null {
  if (!source.onConflict) {
    throw new Error("doNothing() must be called after onConflict()");
  }

  if (source.onConflict.action) {
    throw new Error("doNothing() cannot be used after an upsert action is already set");
  }

  const updatedOperation: InsertOperation = {
    ...source,
    onConflict: {
      ...source.onConflict,
      action: { type: "nothing" },
    },
  };

  return {
    operation: updatedOperation,
    autoParams: {},
  };
}
