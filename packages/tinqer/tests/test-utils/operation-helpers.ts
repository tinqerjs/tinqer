/**
 * Type-safe helpers for accessing QueryOperation properties in tests
 */

import type {
  QueryOperation,
  FromOperation,
  WhereOperation,
  SelectOperation,
  OrderByOperation,
  ThenByOperation,
  TakeOperation,
  SkipOperation,
  GroupByOperation,
} from "../../dist/query-tree/operations.js";
import type { ParseResult } from "../../dist/parser/parse-query.js";

/**
 * Extract operation from ParseResult
 */
export function getOperation(result: ParseResult | null): QueryOperation | null {
  return result?.operation || null;
}

/**
 * Type guard and accessor for FromOperation
 */
export function asFromOperation(op: QueryOperation | null): FromOperation {
  if (!op || op.operationType !== "from") {
    throw new Error(`Expected FromOperation but got ${op?.operationType || "null"}`);
  }
  return op as FromOperation;
}

/**
 * Type guard and accessor for WhereOperation
 */
export function asWhereOperation(op: QueryOperation | null): WhereOperation {
  if (!op || op.operationType !== "where") {
    throw new Error(`Expected WhereOperation but got ${op?.operationType || "null"}`);
  }
  return op as WhereOperation;
}

/**
 * Type guard and accessor for SelectOperation
 */
export function asSelectOperation(op: QueryOperation | null): SelectOperation {
  if (!op || op.operationType !== "select") {
    throw new Error(`Expected SelectOperation but got ${op?.operationType || "null"}`);
  }
  return op as SelectOperation;
}

/**
 * Type guard and accessor for OrderByOperation
 */
export function asOrderByOperation(op: QueryOperation | null): OrderByOperation {
  if (!op || op.operationType !== "orderBy") {
    throw new Error(`Expected OrderByOperation but got ${op?.operationType || "null"}`);
  }
  return op as OrderByOperation;
}

/**
 * Type guard and accessor for ThenByOperation
 */
export function asThenByOperation(op: QueryOperation | null): ThenByOperation {
  if (!op || op.operationType !== "thenBy") {
    throw new Error(`Expected ThenByOperation but got ${op?.operationType || "null"}`);
  }
  return op as ThenByOperation;
}

/**
 * Type guard and accessor for TakeOperation
 */
export function asTakeOperation(op: QueryOperation | null): TakeOperation {
  if (!op || op.operationType !== "take") {
    throw new Error(`Expected TakeOperation but got ${op?.operationType || "null"}`);
  }
  return op as TakeOperation;
}

/**
 * Type guard and accessor for SkipOperation
 */
export function asSkipOperation(op: QueryOperation | null): SkipOperation {
  if (!op || op.operationType !== "skip") {
    throw new Error(`Expected SkipOperation but got ${op?.operationType || "null"}`);
  }
  return op as SkipOperation;
}

/**
 * Type guard and accessor for GroupByOperation
 */
export function asGroupByOperation(op: QueryOperation | null): GroupByOperation {
  if (!op || op.operationType !== "groupBy") {
    throw new Error(`Expected GroupByOperation but got ${op?.operationType || "null"}`);
  }
  return op as GroupByOperation;
}
