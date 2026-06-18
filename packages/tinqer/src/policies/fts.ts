/**
 * Full-text-search resolution policy.
 *
 * The parser produces `ftsMatch` / `ftsRank` expression nodes carrying only the developer's intent
 * (columns, query, mode). At plan-finalize time this policy looks up the schema's FTS configuration
 * for the query's source table and stamps each node's `index` so SQL generation stays self-contained
 * and dialect-specific (PostgreSQL inline `tsvector`, SQLite FTS5 virtual table).
 *
 * Resolution is purely structural and param-independent, so it is idempotent: stamping the same
 * deterministic `index` again on a re-finalize is a no-op.
 */

import type { FtsConfigState } from "../linq/database-context.js";
import type { FtsIndexConfig } from "../expressions/expression.js";
import type { FromOperation, QueryOperation } from "../query-tree/operations.js";

/**
 * Walk every value in an operation/expression tree and invoke `visit` on each fts node.
 */
function forEachFtsNode(root: unknown, visit: (node: Record<string, unknown>) => void): void {
  const seen = new Set<unknown>();

  function walk(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const element of value) walk(element);
      return;
    }

    const obj = value as Record<string, unknown>;
    if (obj.type === "ftsMatch" || obj.type === "ftsRank") {
      visit(obj);
    }

    for (const key of Object.keys(obj)) {
      if (key === "index") continue; // never descend into an already-resolved index
      walk(obj[key]);
    }
  }

  walk(root);
}

/**
 * Find the base/source table by walking the operation's `source` chain to its FromOperation.
 */
function findRootTable(operation: QueryOperation): string | undefined {
  let current: QueryOperation | undefined = operation;
  while (current && current.operationType !== "from") {
    current = (current as { source?: QueryOperation }).source;
  }
  return current ? (current as FromOperation).table : undefined;
}

/**
 * Resolve the `index` on every fts node in a select operation from the schema's FTS configuration.
 * Throws a clear error if fts helpers were used without a matching configuration.
 */
export function resolveFtsInSelectOperation(
  operation: QueryOperation,
  ftsConfig: FtsConfigState | undefined,
): QueryOperation {
  const ftsNodes: Array<Record<string, unknown>> = [];
  forEachFtsNode(operation, (node) => ftsNodes.push(node));

  if (ftsNodes.length === 0) {
    return operation;
  }

  if (!ftsConfig) {
    throw new Error(
      "Full-text-search helpers (helpers.fts.*) were used, but the schema has no FTS configuration. " +
        "Declare it with createSchema<...>().withFts({ <table>: { columns: [...] } }).",
    );
  }

  const table = findRootTable(operation);
  if (!table) {
    throw new Error("Could not resolve the source table for a full-text-search query.");
  }

  const config = ftsConfig.configs[table];
  if (!config) {
    throw new Error(
      `No full-text-search index is configured for table "${table}". ` +
        `Add it to createSchema<...>().withFts({ ${table}: { columns: [...] } }).`,
    );
  }

  for (const node of ftsNodes) {
    const declared = node.columns as string[] | undefined;
    const columns = declared && declared.length > 0 ? declared : config.columns;

    const index: FtsIndexConfig = { table, columns };
    if (config.pg) {
      index.pg = { config: config.pg.config, vector: config.pg.vector };
    }
    if (config.sqlite) {
      index.sqlite = { table: config.sqlite.table, key: config.sqlite.key ?? "rowid" };
    }
    node.index = index;
  }

  return operation;
}
