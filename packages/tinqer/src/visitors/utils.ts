/**
 * Utility functions for visitor implementations
 * Type guards and helper functions
 */

import type { Expression } from "../expressions/expression.js";

/**
 * Type guard for boolean expressions
 */
export function isBooleanExpression(expr: Expression | unknown): boolean {
  if (!expr || typeof expr !== "object") return false;

  const type = (expr as Expression).type;
  return [
    "comparison",
    "logical",
    "not",
    "in",
    "booleanColumn",
    "booleanMethod",
    "booleanConstant",
  ].includes(type);
}

/**
 * Type guard for value expressions
 */
export function isValueExpression(expr: Expression | unknown): boolean {
  if (!expr || typeof expr !== "object") return false;

  const type = (expr as Expression).type;
  return [
    "column",
    "excludedColumn",
    "constant",
    "param",
    "arithmetic",
    "concat",
    "stringMethod",
    "case",
    "coalesce",
    "aggregate",
    "windowFunction",
    "groupKey",
  ].includes(type);
}

/**
 * Check if a column name likely represents a string
 * Used for heuristic string concatenation detection
 */
export function isLikelyStringColumn(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    lower.includes("name") ||
    lower.includes("title") ||
    lower.includes("description") ||
    lower.includes("text") ||
    lower.includes("email") ||
    lower.includes("url") ||
    lower.includes("address") ||
    lower.includes("phone") ||
    lower.includes("message") ||
    lower.includes("comment") ||
    lower.includes("note") ||
    lower.includes("code") ||
    lower.includes("id") ||
    lower.includes("key") ||
    lower.includes("value") ||
    lower.includes("path") ||
    lower.includes("file") ||
    lower.includes("content") ||
    lower.includes("body") ||
    lower.includes("subject")
  );
}

/**
 * Check if a parameter property likely represents a string
 * Used for heuristic string concatenation detection
 */
export function isLikelyStringParam(property?: string): boolean {
  if (!property) return false;
  return isLikelyStringColumn(property);
}

/**
 * Extract parameter name from arrow function
 */
export function getParameterName(arrowFunc: { params?: Array<{ name?: string }> }): string | null {
  if (!arrowFunc.params || arrowFunc.params.length === 0) return null;
  return arrowFunc.params[0]?.name || null;
}

/**
 * Get return expression from function body
 */
export function getReturnExpression(body: unknown[]): unknown | null {
  if (!Array.isArray(body)) return null;

  for (const stmt of body) {
    if (
      stmt &&
      typeof stmt === "object" &&
      (stmt as { type?: string }).type === "ReturnStatement"
    ) {
      return (stmt as { argument?: unknown }).argument || null;
    }
  }
  return null;
}
