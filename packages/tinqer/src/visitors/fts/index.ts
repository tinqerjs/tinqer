/**
 * Full-text-search visitor helpers
 * Handles h.fts.match(target, query, options?) and h.fts.rank(target, query, options?)
 *
 * The pure parsers (callee recognition, column + options extraction) are shared by the
 * boolean-context `match` visitor (see ../where/fts.ts) and the value-context `rank` visitor below.
 */

import type {
  FtsRankExpression,
  FtsMode,
  ValueExpression,
  Expression,
} from "../../expressions/expression.js";
import { isValueExpression } from "../../expressions/expression.js";
import type {
  CallExpression,
  MemberExpression,
  Identifier,
  Expression as ASTExpression,
  ObjectExpression as ASTObjectExpression,
  ArrayExpression as ASTArrayExpression,
} from "../../parser/ast-types.js";

const FTS_MODES: readonly string[] = ["websearch", "plain", "phrase", "raw"];

/**
 * Check whether a call expression is `helpersParam.fts.<method>(...)`.
 */
export function matchesFtsCallee(
  node: CallExpression,
  helpersParam: string | undefined,
  method: "match" | "rank",
): boolean {
  if (!helpersParam) return false;

  const callee = node.callee;
  if (callee.type !== "MemberExpression") return false;
  const member = callee as MemberExpression;

  // .match / .rank
  if (member.property.type !== "Identifier" || (member.property as Identifier).name !== method) {
    return false;
  }

  // object must be `helpersParam.fts`
  const obj = member.object;
  if (obj.type !== "MemberExpression") return false;
  const objMember = obj as MemberExpression;

  if (
    objMember.property.type !== "Identifier" ||
    (objMember.property as Identifier).name !== "fts"
  ) {
    return false;
  }

  return (
    objMember.object.type === "Identifier" && (objMember.object as Identifier).name === helpersParam
  );
}

/**
 * Extract the declared columns from the first argument of an fts helper.
 * - the row parameter itself (`d`) → `[]` (the table's whole index)
 * - a column access (`d.title`) → `["title"]`
 * - an array of column accesses (`[d.title, d.body]`) → `["title", "body"]`
 */
export function parseFtsColumns(target: ASTExpression): string[] {
  if (target.type === "MemberExpression") {
    const member = target as MemberExpression;
    if (member.property.type === "Identifier") {
      return [(member.property as Identifier).name];
    }
    return [];
  }

  if (target.type === "ArrayExpression") {
    const columns: string[] = [];
    for (const element of (target as ASTArrayExpression).elements) {
      if (element && element.type === "MemberExpression") {
        const member = element as MemberExpression;
        if (member.property.type === "Identifier") {
          columns.push((member.property as Identifier).name);
        }
      }
    }
    return columns;
  }

  // Identifier (the row param) or anything else → whole index
  return [];
}

/**
 * Parse the optional options object literal (`{ mode, config }`) of an fts helper.
 */
export function parseFtsOptions(optsArg: ASTExpression | undefined): {
  mode: FtsMode;
  config?: string;
} {
  let mode: FtsMode = "websearch";
  let config: string | undefined;

  if (optsArg && optsArg.type === "ObjectExpression") {
    for (const property of (optsArg as ASTObjectExpression).properties) {
      if (property.type !== "Property") continue;

      const key =
        property.key.type === "Identifier"
          ? (property.key as Identifier).name
          : String((property.key as { value?: unknown }).value);

      const valueNode = property.value;
      const value =
        valueNode.type === "StringLiteral" || valueNode.type === "Literal"
          ? (valueNode as { value?: unknown }).value
          : undefined;

      if (key === "mode" && typeof value === "string" && FTS_MODES.includes(value)) {
        mode = value as FtsMode;
      } else if (key === "config" && typeof value === "string") {
        config = value;
      }
    }
  }

  return { mode, config };
}

/**
 * Build an FtsRankExpression from an `h.fts.rank(target, query, options?)` call. The caller supplies
 * `visitQuery` bound to its own value context (the value visitor, select projection, or orderby key
 * selector) — so the same builder serves every value-producing site that can contain a rank call.
 */
export function buildFtsRankExpression(
  node: CallExpression,
  visitQuery: (arg: ASTExpression) => Expression | null,
): FtsRankExpression | null {
  const args = node.arguments as ASTExpression[];
  if (!args || args.length < 2) return null;

  const columns = parseFtsColumns(args[0]!);

  const queryExpr = visitQuery(args[1]!);
  if (!queryExpr || !isValueExpression(queryExpr)) return null;

  const { mode, config } = parseFtsOptions(args[2]);

  const expr: FtsRankExpression = {
    type: "ftsRank",
    columns,
    query: queryExpr as ValueExpression,
    mode,
  };
  if (config) expr.config = config;
  return expr;
}
