/**
 * Full-text-search MATCH visitor for WHERE clauses
 * Handles helpers.fts.match(target, query, options?) calls
 */

import type { FtsMatchExpression } from "../../expressions/expression.js";
import type { CallExpression, Expression as ASTExpression } from "../../parser/ast-types.js";
import type { WhereContext, VisitorResult } from "./context.js";
import { visitValue } from "./value.js";
import { matchesFtsCallee, parseFtsColumns, parseFtsOptions } from "../fts/index.js";

/**
 * Visit a full-text-search match call.
 * Expects pattern: helpersParam.fts.match(target, query, options?)
 */
export function visitFtsMatch(
  node: CallExpression,
  context: WhereContext,
): VisitorResult<FtsMatchExpression | null> {
  let currentCounter = context.autoParamCounter;

  if (!matchesFtsCallee(node, context.helpersParam, "match")) {
    return { value: null, counter: currentCounter };
  }

  // match(target, query, options?) — at least target + query
  if (!node.arguments || node.arguments.length < 2) {
    return { value: null, counter: currentCounter };
  }

  const columns = parseFtsColumns(node.arguments[0] as ASTExpression);

  const queryResult = visitValue(node.arguments[1] as ASTExpression, {
    ...context,
    autoParamCounter: currentCounter,
  });
  if (!queryResult.value) {
    return { value: null, counter: currentCounter };
  }
  currentCounter = queryResult.counter;

  const { mode, config } = parseFtsOptions(node.arguments[2] as ASTExpression | undefined);

  const expr: FtsMatchExpression = {
    type: "ftsMatch",
    columns,
    query: queryResult.value,
    mode,
  };
  if (config) expr.config = config;

  return { value: expr, counter: currentCounter };
}
