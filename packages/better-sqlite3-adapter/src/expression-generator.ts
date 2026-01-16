/**
 * Converts expression trees to SQL fragments
 */

import type {
  Expression,
  BooleanExpression,
  ValueExpression,
  ComparisonExpression,
  LogicalExpression,
  InExpression,
  IsNullExpression,
  ColumnExpression,
  ExcludedColumnExpression,
  ConstantExpression,
  ParameterExpression,
  ArithmeticExpression,
  NotExpression,
  StringMethodExpression,
  BooleanMethodExpression,
  CaseInsensitiveFunctionExpression,
  ObjectExpression,
  ArrayExpression,
  ConcatExpression,
  AggregateExpression,
  ConditionalExpression,
  CoalesceExpression,
  CaseExpression,
  ReferenceExpression,
  WindowFunctionExpression,
} from "@tinqerjs/tinqer";
import type { SqlContext } from "./types.js";

/**
 * Generate SQL for any expression
 */
export function generateExpression(expr: Expression, context: SqlContext): string {
  if (isBooleanExpression(expr)) {
    return generateBooleanExpression(expr, context);
  }
  if (isValueExpression(expr)) {
    return generateValueExpression(expr, context);
  }
  if (isObjectExpression(expr)) {
    return generateObjectExpression(expr, context);
  }
  if (isConditionalExpression(expr)) {
    return generateConditionalExpression(expr, context);
  }
  if (isArrayExpression(expr)) {
    throw new Error("Array expressions not yet supported");
  }
  // Check for reference type directly since it might not be in a union yet
  if ((expr as { type: string }).type === "reference") {
    return generateReferenceExpression(expr as unknown as ReferenceExpression, context);
  }
  throw new Error(`Unknown expression type: ${(expr as Expression & { type: string }).type}`);
}

/**
 * Generate SQL for boolean expressions
 */
export function generateBooleanExpression(expr: BooleanExpression, context: SqlContext): string {
  // Handle reference type which can appear in boolean context (e.g., row.dept ? ... : ...)
  if ((expr as { type: string }).type === "reference") {
    const refExpr = expr as unknown as ReferenceExpression;
    // For null checking in LEFT JOINs, check a primary key or first column instead of *
    // Extract table alias from reference
    if (refExpr.source && refExpr.source.type === "joinParam") {
      const aliases = Array.from(context.tableAliases.values());
      const alias = aliases[refExpr.source.paramIndex] || `t${refExpr.source.paramIndex}`;
      // Assume 'id' column exists for null check (common pattern)
      return `"${alias}"."id" IS NOT NULL`;
    }
    // Fallback
    return `"t1"."id" IS NOT NULL`;
  }

  switch (expr.type) {
    case "comparison":
      return generateComparisonExpression(expr, context);
    case "logical":
      return generateLogicalExpression(expr, context);
    case "not":
      return generateNotExpression(expr, context);
    case "booleanColumn":
      return `"${expr.name}"`;
    case "booleanConstant":
      return expr.value ? "TRUE" : "FALSE";
    case "booleanMethod":
      return generateBooleanMethodExpression(expr, context);
    case "caseInsensitiveFunction":
      return generateCaseInsensitiveFunctionExpression(expr, context);
    case "in":
      return generateInExpression(expr as InExpression, context);
    case "isNull":
      return generateIsNullExpression(expr as IsNullExpression, context);
    default:
      throw new Error(
        `Unsupported boolean expression type: ${(expr as BooleanExpression & { type: string }).type}`,
      );
  }
}

/**
 * Generate SQL for value expressions
 */
export function generateValueExpression(expr: ValueExpression, context: SqlContext): string {
  switch (expr.type) {
    case "column":
      return generateColumnExpression(expr as ColumnExpression, context);
    case "excludedColumn":
      return generateExcludedColumnExpression(expr as ExcludedColumnExpression);
    case "constant":
      return generateConstantExpression(expr as ConstantExpression);
    case "param":
      return generateParameterExpression(expr as ParameterExpression, context);
    case "arithmetic":
      return generateArithmeticExpression(expr as ArithmeticExpression, context);
    case "concat":
      return generateConcatExpression(expr as ConcatExpression, context);
    case "stringMethod":
      return generateStringMethodExpression(expr as StringMethodExpression, context);
    case "aggregate":
      return generateAggregateExpression(expr as AggregateExpression, context);
    case "windowFunction":
      return generateWindowFunctionExpression(expr as WindowFunctionExpression, context);
    case "coalesce":
      return generateCoalesceExpression(expr as CoalesceExpression, context);
    case "case":
      return generateCaseExpression(expr as CaseExpression, context);
    case "reference":
      return generateReferenceExpression(expr as ReferenceExpression, context);
    case "allColumns":
      return "*";
    default:
      throw new Error(
        `Unsupported value expression type: ${(expr as ValueExpression & { type: string }).type}`,
      );
  }
}

function generateExcludedColumnExpression(expr: ExcludedColumnExpression): string {
  return `excluded."${expr.name}"`;
}

/**
 * Generate SQL for comparison expressions
 */
function generateComparisonExpression(expr: ComparisonExpression, context: SqlContext): string {
  // Handle cases where left or right side might be boolean expressions
  const left = generateExpressionForComparison(expr.left, context);
  const right = generateExpressionForComparison(expr.right, context);

  // Special handling for NULL comparisons
  if (right === "NULL") {
    if (expr.operator === "==") {
      return `${left} IS NULL`;
    } else if (expr.operator === "!=") {
      return `${left} IS NOT NULL`;
    }
  }
  if (left === "NULL") {
    if (expr.operator === "==") {
      return `${right} IS NULL`;
    } else if (expr.operator === "!=") {
      return `${right} IS NOT NULL`;
    }
  }

  const operator = mapComparisonOperator(expr.operator);
  return `${left} ${operator} ${right}`;
}

/**
 * Generate expression for use in comparisons - handles both value and boolean expressions
 */
function generateExpressionForComparison(expr: Expression, context: SqlContext): string {
  // Check if it's a boolean expression
  if (isBooleanExpression(expr)) {
    return generateBooleanExpression(expr, context);
  }
  // Check if it's a value expression
  if (isValueExpression(expr)) {
    return generateValueExpression(expr, context);
  }
  // Handle other expression types
  return generateExpression(expr, context);
}

/**
 * Map JavaScript comparison operators to SQL
 */
function mapComparisonOperator(op: string): string {
  switch (op) {
    case "==":
    case "===":
      return "=";
    case "!=":
    case "!==":
      return "!=";
    case ">":
      return ">";
    case ">=":
      return ">=";
    case "<":
      return "<";
    case "<=":
      return "<=";
    default:
      return op;
  }
}

/**
 * Generate SQL for logical expressions
 */
function generateLogicalExpression(expr: LogicalExpression, context: SqlContext): string {
  const left = generateBooleanExpression(expr.left, context);
  const right = generateBooleanExpression(expr.right, context);
  const operator = expr.operator === "and" ? "AND" : "OR";
  return `(${left} ${operator} ${right})`;
}

/**
 * Generate SQL for NOT expressions
 */
function generateNotExpression(expr: NotExpression, context: SqlContext): string {
  // Special handling for NOT IN with array parameters
  if (expr.expression.type === "in") {
    const inExpr = expr.expression as InExpression;
    if (!Array.isArray(inExpr.list) && inExpr.list.type === "param") {
      const value = generateValueExpression(inExpr.value, context);
      const paramExpr = inExpr.list as ParameterExpression;
      const paramName = paramExpr.property || paramExpr.param;

      // Check if this parameter is an array in the runtime params
      const paramValue = context.params?.[paramName];

      if (!Array.isArray(paramValue)) {
        throw new Error(`Expected array parameter '${paramName}' but got ${typeof paramValue}`);
      }

      if (paramValue.length === 0) {
        // Empty NOT IN list always returns true
        return "TRUE";
      }

      // Expand array parameters into NOT IN clause with indexed parameters
      // e.g., params.ids = [3,6,4,5] becomes NOT IN (@ids_0, @ids_1, @ids_2, @ids_3)
      const listValues = paramValue.map((_, index) =>
        context.formatParameter(`${paramName}_${index}`),
      );
      return `${value} NOT IN (${listValues.join(", ")})`;
    }
  }

  const operand = generateBooleanExpression(expr.expression, context);
  // Check if operand is a simple column reference (no operators)
  if (!operand.includes(" ") && !operand.includes("(")) {
    return `NOT ${operand}`;
  }
  return `NOT (${operand})`;
}

/**
 * Generate SQL for reference expressions (entire table/object references)
 */
function generateReferenceExpression(expr: ReferenceExpression, context: SqlContext): string {
  // A reference expression like { u, d } needs special handling
  // In SELECT context, we'd want to expand all columns from the referenced table

  // Handle new source-based references
  if (expr.source) {
    const aliases = Array.from(context.tableAliases.values());

    switch (expr.source.type) {
      case "joinParam": {
        // Map parameter references to table aliases
        if (expr.source.paramIndex < aliases.length) {
          // Return all columns from this table (will be expanded in SELECT generation)
          return `"${aliases[expr.source.paramIndex]}".*`;
        }
        return `"t${expr.source.paramIndex}".*`;
      }

      case "table": {
        // Explicit table alias
        return `"${expr.source.alias}".*`;
      }

      default:
        // Should not happen, but handle gracefully
        return `"t0".*`;
    }
  }

  // Handle regular table references
  if (expr.table) {
    const alias = context.tableAliases.get(expr.table) || expr.table;
    return `"${alias}".*`;
  }

  // Fallback
  return `"t0".*`;
}

/**
 * Generate SQL for column references
 */
function generateColumnExpression(expr: ColumnExpression, context: SqlContext): string {
  // Handle GROUP BY key references
  if (context.groupByKey) {
    // Handle g.key - single column or expression group by
    if (expr.name === "key" && !expr.table) {
      // Return the GROUP BY expression
      if (context.groupByKey.type === "column") {
        // Simple column - check if it maps to a source column
        const columnExpr = context.groupByKey as ColumnExpression;
        if (context.symbolTable) {
          const sourceRef = context.symbolTable.entries.get(columnExpr.name);
          if (sourceRef) {
            return `"${sourceRef.tableAlias}"."${sourceRef.columnName}"`;
          }
        }
        // For non-JOIN queries, use unqualified column name
        return `"${columnExpr.name}"`;
      } else {
        // Complex expression (including objects, method calls, etc.)
        return generateExpression(context.groupByKey, context);
      }
    }

    // Handle g.key.property - composite group by with object key
    if (expr.table === "key" && context.groupByKey.type === "object") {
      // Look up the property in the composite key
      const objExpr = context.groupByKey as ObjectExpression;
      const keyProperty = objExpr.properties[expr.name];
      if (keyProperty) {
        return generateExpression(keyProperty, context);
      }
    }
  }

  // Handle ColumnSource for proper table alias resolution
  if (expr.source) {
    const aliases = Array.from(context.tableAliases.values());
    let tableAlias: string;

    switch (expr.source.type) {
      case "joinParam":
        // Direct parameter references
        tableAlias = aliases[expr.source.paramIndex] || `t${expr.source.paramIndex}`;
        return `"${tableAlias}"."${expr.name}"`;

      case "joinResult":
        // Nested JOIN property access
        tableAlias = aliases[expr.source.tableIndex] || `t${expr.source.tableIndex}`;
        return `"${tableAlias}"."${expr.name}"`;

      case "spread":
        // Spread operator source
        tableAlias = aliases[expr.source.sourceIndex] || `t${expr.source.sourceIndex}`;
        return `"${tableAlias}"."${expr.name}"`;

      case "table":
        // Explicit table alias
        return `"${expr.source.alias}"."${expr.name}"`;

      case "direct":
        // Direct table access (no qualifier needed)
        return `"${expr.name}"`;
    }
  }

  // Check symbol table for JOIN result references
  if (context.symbolTable) {
    // First check for direct property name
    const sourceRef = context.symbolTable.entries.get(expr.name);
    if (sourceRef) {
      // If it's a reference node (marked with "*"), we need special handling
      if (sourceRef.columnName === "*" && expr.table) {
        // This is accessing a property through a reference
        // The symbol table entry tells us which table the reference points to
        return `"${sourceRef.tableAlias}"."${expr.name}"`;
      }
      return `"${sourceRef.tableAlias}"."${sourceRef.columnName}"`;
    }

    // If there's a table prefix, try to build a path
    if (expr.table) {
      const path = `${expr.table}.${expr.name}`;
      const pathRef = context.symbolTable.entries.get(path);
      if (pathRef) {
        return `"${pathRef.tableAlias}"."${pathRef.columnName}"`;
      }

      // Check if the table itself is a reference in the symbol table
      const tableRef = context.symbolTable.entries.get(expr.table);
      if (tableRef && tableRef.columnName === "*") {
        // This is a reference node - resolve to the actual table
        return `"${tableRef.tableAlias}"."${expr.name}"`;
      }
    }
  }

  // Regular column handling
  if (expr.table) {
    // Check if the table is a reference from JOIN result shape
    // When we have joined.c.id, it becomes column with table="c" and name="id"
    // We need to check if "c" is actually a reference in the symbol table
    if (context.symbolTable) {
      const tableRef = context.symbolTable.entries.get(expr.table);
      if (tableRef && tableRef.columnName === "*") {
        // This is a reference node - use the mapped table alias
        return `"${tableRef.tableAlias}"."${expr.name}"`;
      }
    }

    // Check if the table contains a dot (like "o.amount" from bad parsing)
    // This happens when ORDER BY expression isn't properly parsed
    if (expr.table.includes(".")) {
      // This is a mis-parsed expression, try to resolve it through symbol table
      const parts = expr.table.split(".");
      if (parts.length === 2 && context.symbolTable) {
        const tableRef = context.symbolTable.entries.get(parts[0]!);
        if (tableRef && tableRef.columnName === "*") {
          // Use the resolved table alias and the field name
          return `"${tableRef.tableAlias}"."${parts[1]}"`;
        }
      }
      // If we can't resolve it, return as-is (will likely fail)
      return `"${expr.table}"`;
    }

    const alias = context.tableAliases.get(expr.table) || expr.table;
    return `"${alias}"."${expr.name}"`;
  }

  // No table specified - only use alias if we have JOINs
  // For single-table queries, use unqualified column names
  if (context.hasJoins) {
    const firstAlias = context.tableAliases.values().next().value || "t0";
    return `"${firstAlias}"."${expr.name}"`;
  }

  return `"${expr.name}"`;
}

/**
 * Generate SQL for constants
 */
function generateConstantExpression(expr: ConstantExpression): string {
  if (expr.value === null || expr.value === undefined) {
    return "NULL";
  }
  if (typeof expr.value === "string") {
    // Escape single quotes in strings
    const escaped = expr.value.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  if (typeof expr.value === "boolean") {
    return expr.value ? "TRUE" : "FALSE";
  }
  return String(expr.value);
}

/**
 * Generate SQL for parameter references
 */
function generateParameterExpression(expr: ParameterExpression, context: SqlContext): string {
  // Handle array indexing
  if (expr.index !== undefined) {
    // For array access, we need to extract the value at runtime
    // The parameter should reference the array element directly
    // e.g., params.roles[0] becomes roles[0] in the parameter
    const baseName = expr.property || expr.param;
    const indexedName = `${baseName}[${expr.index}]`;

    // Store the array access for runtime resolution
    // The query executor will need to resolve this
    return context.formatParameter(indexedName);
  }

  // Extract only the last property name for the parameter
  const paramName = expr.property || expr.param;
  return context.formatParameter(paramName);
}

/**
 * Generate SQL for arithmetic expressions
 */
function generateArithmeticExpression(expr: ArithmeticExpression, context: SqlContext): string {
  const left = generateValueExpression(expr.left, context);
  const right = generateValueExpression(expr.right, context);

  // In PostgreSQL, use || for string concatenation
  if (expr.operator === "+") {
    // Check if either operand is definitely a string
    const isStringConcat =
      // String constants
      (expr.left.type === "constant" &&
        typeof (expr.left as ConstantExpression).value === "string") ||
      (expr.right.type === "constant" &&
        typeof (expr.right as ConstantExpression).value === "string") ||
      // String method results (toLowerCase, toUpperCase, substring, etc.)
      expr.left.type === "stringMethod" ||
      expr.right.type === "stringMethod" ||
      // Check if expressions are likely to produce strings
      isLikelyStringExpression(expr.left) ||
      isLikelyStringExpression(expr.right) ||
      // Check for string-related parameter names (heuristic)
      (expr.left.type === "param" && isLikelyStringParam(expr.left as ParameterExpression)) ||
      (expr.right.type === "param" && isLikelyStringParam(expr.right as ParameterExpression)) ||
      // If both operands are parameters, assume string concat to be safe
      (expr.left.type === "param" && expr.right.type === "param");

    if (isStringConcat) {
      return `(${left} || ${right})`;
    }
  }

  return `(${left} ${expr.operator} ${right})`;
}

/**
 * Check if a parameter expression is likely a string based on naming patterns
 */
function isLikelyStringParam(expr: ParameterExpression): boolean {
  const param = expr.param.toLowerCase();

  // Check for common string parameter patterns
  const stringPatterns = [
    /text/i,
    /name/i,
    /title/i,
    /description/i,
    /message/i,
    /suffix/i,
    /prefix/i,
    /email/i,
    /url/i,
    /path/i,
    /label/i,
    /firstname/i,
    /lastname/i,
    /string/i,
    /content/i,
    /body/i,
  ];

  return stringPatterns.some((pattern) => pattern.test(param));
}

/**
 * Check if an expression is likely to produce a string value
 */
function isLikelyStringExpression(expr: Expression): boolean {
  // Check for COALESCE with string-like columns
  if (expr.type === "coalesce") {
    const coalesceExpr = expr as CoalesceExpression;
    // If any expression in COALESCE is string-like, the result is string-like
    return coalesceExpr.expressions.some((e: Expression) => {
      if (e.type === "column") {
        const col = e as ColumnExpression;
        // Check if column name suggests it's a string
        return /text|name|title|description|message|email|url|path|label/i.test(col.name);
      }
      if (e.type === "constant") {
        return typeof (e as ConstantExpression).value === "string";
      }
      if (e.type === "stringMethod") {
        return true;
      }
      return false;
    });
  }

  return false;
}

/**
 * Generate SQL for string concatenation
 */
function generateConcatExpression(expr: ConcatExpression, context: SqlContext): string {
  const left = generateValueExpression(expr.left, context);
  const right = generateValueExpression(expr.right, context);
  // PostgreSQL uses || for concatenation
  return `${left} || ${right}`;
}

/**
 * Generate SQL for string method expressions
 */
function generateStringMethodExpression(expr: StringMethodExpression, context: SqlContext): string {
  const object = generateValueExpression(expr.object, context);

  switch (expr.method) {
    case "toLowerCase":
      return `LOWER(${object})`;
    case "toUpperCase":
      return `UPPER(${object})`;
    default:
      throw new Error(`Unsupported string method: ${expr.method}`);
  }
}

/**
 * Generate SQL for IS NULL / IS NOT NULL expressions
 */
function generateIsNullExpression(expr: IsNullExpression, context: SqlContext): string {
  const value = generateValueExpression(expr.expression, context);
  return expr.negated ? `${value} IS NOT NULL` : `${value} IS NULL`;
}

/**
 * Generate SQL for IN expressions
 */
function generateInExpression(expr: InExpression, context: SqlContext): string {
  const value = generateValueExpression(expr.value, context);

  // Handle list as array expression, array of values, or parameter
  if (!Array.isArray(expr.list) && expr.list.type === "param") {
    // Handle parameter that represents an array
    const paramExpr = expr.list as ParameterExpression;
    // Use property if it exists (e.g., params.targetIds), otherwise use param
    const paramName = paramExpr.property || paramExpr.param;

    // Check if this parameter is an array in the runtime params
    const paramValue = context.params?.[paramName];

    if (!Array.isArray(paramValue)) {
      throw new Error(`Expected array parameter '${paramName}' but got ${typeof paramValue}`);
    }

    if (paramValue.length === 0) {
      // Empty IN list always returns false
      return "FALSE";
    }

    // Expand array parameters into IN clause with indexed parameters
    // e.g., params.ids = [3,6,4,5] becomes IN (@ids_0, @ids_1, @ids_2, @ids_3)
    const listValues = paramValue.map((_, index) =>
      context.formatParameter(`${paramName}_${index}`),
    );
    return `${value} IN (${listValues.join(", ")})`;
  }

  let listValues: string[];
  if (Array.isArray(expr.list)) {
    listValues = expr.list.map((item) => generateValueExpression(item, context));
  } else if (expr.list.type === "array") {
    const arrayExpr = expr.list as ArrayExpression;
    listValues = arrayExpr.elements.map((item) => generateExpression(item, context));
  } else {
    throw new Error("IN expression requires an array or array parameter");
  }

  if (listValues.length === 0) {
    // Empty IN list always returns false
    return "FALSE";
  }

  return `${value} IN (${listValues.join(", ")})`;
}

/**
 * Generate SQL for boolean method expressions
 */
function generateBooleanMethodExpression(
  expr: BooleanMethodExpression,
  context: SqlContext,
): string {
  const object = generateValueExpression(expr.object, context);

  switch (expr.method) {
    case "startsWith":
      if (expr.arguments && expr.arguments.length > 0) {
        const prefix = generateValueExpression(expr.arguments[0]!, context);
        return `${object} LIKE ${prefix} || '%'`;
      }
      throw new Error("startsWith requires an argument");
    case "endsWith":
      if (expr.arguments && expr.arguments.length > 0) {
        const suffix = generateValueExpression(expr.arguments[0]!, context);
        return `${object} LIKE '%' || ${suffix}`;
      }
      throw new Error("endsWith requires an argument");
    case "includes":
    case "contains":
      if (expr.arguments && expr.arguments.length > 0) {
        const search = generateValueExpression(expr.arguments[0]!, context);
        return `${object} LIKE '%' || ${search} || '%'`;
      }
      throw new Error("includes/contains requires an argument");
    default:
      throw new Error(`Unsupported boolean method: ${expr.method}`);
  }
}

/**
 * Generate SQL for case-insensitive function expressions
 */
function generateCaseInsensitiveFunctionExpression(
  expr: CaseInsensitiveFunctionExpression,
  context: SqlContext,
): string {
  const left = generateValueExpression(expr.arguments[0], context);
  const right = generateValueExpression(expr.arguments[1], context);

  switch (expr.function) {
    case "iequals":
      return `LOWER(${left}) = LOWER(${right})`;
    case "istartsWith":
      return `LOWER(${left}) LIKE LOWER(${right}) || '%'`;
    case "iendsWith":
      return `LOWER(${left}) LIKE '%' || LOWER(${right})`;
    case "icontains":
      return `LOWER(${left}) LIKE '%' || LOWER(${right}) || '%'`;
    default:
      throw new Error(`Unsupported case-insensitive function: ${expr.function}`);
  }
}

/**
 * Generate SQL for aggregate expressions
 */
function generateAggregateExpression(expr: AggregateExpression, context: SqlContext): string {
  const func = expr.function.toUpperCase();

  // COUNT(*) special case
  if (func === "COUNT" && !expr.expression) {
    return "COUNT(*)";
  }

  // Aggregate with expression (e.g., SUM(amount), COUNT(id))
  if (expr.expression) {
    const innerExpr = generateValueExpression(expr.expression, context);
    return `${func}(${innerExpr})`;
  }

  // Default to COUNT(*) for other aggregates without expression
  return `${func}(*)`;
}

/**
 * Generate SQL for window function expressions
 */
function generateWindowFunctionExpression(
  expr: WindowFunctionExpression,
  context: SqlContext,
): string {
  // Map function name to SQL
  let funcName: string;
  switch (expr.function) {
    case "rowNumber":
      funcName = "ROW_NUMBER";
      break;
    case "rank":
      funcName = "RANK";
      break;
    case "denseRank":
      funcName = "DENSE_RANK";
      break;
  }

  // Build OVER clause parts
  const overParts: string[] = [];

  // PARTITION BY clause (optional)
  if (expr.partitionBy.length > 0) {
    const partitions = expr.partitionBy.map((p) => generateValueExpression(p, context));
    overParts.push(`PARTITION BY ${partitions.join(", ")}`);
  }

  // ORDER BY clause (required)
  const orders = expr.orderBy.map((o) => {
    const orderExpr = generateValueExpression(o.expression, context);
    const direction = o.direction === "asc" ? "ASC" : "DESC";
    return `${orderExpr} ${direction}`;
  });
  overParts.push(`ORDER BY ${orders.join(", ")}`);

  // Build complete OVER clause
  const overClause = overParts.join(" ");

  return `${funcName}() OVER (${overClause})`;
}

/**
 * Generate SQL for coalesce expressions
 */
function generateCoalesceExpression(expr: CoalesceExpression, context: SqlContext): string {
  const expressions = expr.expressions.map((e) => generateValueExpression(e, context));
  return `COALESCE(${expressions.join(", ")})`;
}

/**
 * Generate SQL for conditional expressions (ternary)
 */
function generateConditionalExpression(expr: ConditionalExpression, context: SqlContext): string {
  const condition = generateBooleanExpression(expr.condition, context);
  const thenExpr = generateExpression(expr.then, context);
  const elseExpr = generateExpression(expr.else, context);
  // Use SQL CASE expression
  return `CASE WHEN ${condition} THEN ${thenExpr} ELSE ${elseExpr} END`;
}

/**
 * Generate SQL for CASE expressions (from ternary operator)
 */
function generateCaseExpression(expr: CaseExpression, context: SqlContext): string {
  // Handle multiple WHEN conditions
  if (!expr.conditions || expr.conditions.length === 0) {
    throw new Error("CASE expression must have at least one condition");
  }

  const whenClauses = expr.conditions
    .map((cond) => {
      const when = generateBooleanExpression(cond.when, context);
      const then = generateExpression(cond.then, context);
      return `WHEN ${when} THEN ${then}`;
    })
    .join(" ");

  const elseClause = expr.else ? ` ELSE ${generateExpression(expr.else, context)}` : "";

  return `CASE ${whenClauses}${elseClause} END`;
}

/**
 * Generate SQL for object expressions (used in SELECT)
 */
function generateObjectExpression(expr: ObjectExpression, context: SqlContext): string {
  if (!expr.properties) {
    throw new Error("Object expression must have properties");
  }

  const parts = Object.entries(expr.properties).map(([key, value]) => {
    // Handle spread operator (AllColumnsExpression with special key)
    if (key === "__spread__" && value.type === "allColumns") {
      return "*";
    }

    let sqlValue = generateExpression(value, context);

    // If it's a boolean expression in SELECT context, wrap it in a CASE to return boolean value
    if (
      isBooleanExpression(value) &&
      value.type !== "booleanColumn" &&
      value.type !== "booleanConstant"
    ) {
      sqlValue = `CASE WHEN ${sqlValue} THEN TRUE ELSE FALSE END`;
    }

    return `${sqlValue} AS "${key}"`;
  });

  return parts.join(", ");
}

// Type guards
function isBooleanExpression(expr: Expression): expr is BooleanExpression {
  return [
    "comparison",
    "logical",
    "not",
    "booleanColumn",
    "booleanConstant",
    "booleanMethod",
    "exists",
  ].includes((expr as Expression & { type: string }).type);
}

function isValueExpression(expr: Expression): expr is ValueExpression {
  return [
    "column",
    "excludedColumn",
    "constant",
    "param",
    "arithmetic",
    "concat",
    "stringMethod",
    "case",
    "aggregate",
    "windowFunction",
    "coalesce",
  ].includes((expr as Expression & { type: string }).type);
}

function isObjectExpression(expr: Expression): expr is ObjectExpression {
  return (expr as Expression & { type: string }).type === "object";
}

function isArrayExpression(expr: Expression): expr is ArrayExpression {
  return (expr as Expression & { type: string }).type === "array";
}

function isConditionalExpression(expr: Expression): expr is ConditionalExpression {
  return (expr as Expression & { type: string }).type === "conditional";
}
