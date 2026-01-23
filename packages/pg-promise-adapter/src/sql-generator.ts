/**
 * Main SQL generation orchestrator
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
  DistinctOperation,
  GroupByOperation,
  CountOperation,
  SumOperation,
  AverageOperation,
  MinOperation,
  MaxOperation,
  FirstOperation,
  FirstOrDefaultOperation,
  SingleOperation,
  SingleOrDefaultOperation,
  LastOperation,
  LastOrDefaultOperation,
  JoinOperation,
  AnyOperation,
  AllOperation,
  ContainsOperation,
  InsertOperation,
  UpdateOperation,
  DeleteOperation,
} from "@tinqerjs/tinqer";
import type { SqlContext } from "./types.js";
import { generateFrom } from "./generators/from.js";
import { generateSelect } from "./generators/select.js";
import { generateBooleanExpression, generateExpression } from "./expression-generator.js";
import { generateOrderBy } from "./generators/orderby.js";
import { generateThenBy } from "./generators/thenby.js";
import { generateTake } from "./generators/take.js";
import { generateSkip } from "./generators/skip.js";
import { generateDistinct } from "./generators/distinct.js";
import { generateGroupBy } from "./generators/groupby.js";
import { generateCount } from "./generators/count.js";
import { generateSum } from "./generators/sum.js";
import { generateAverage } from "./generators/average.js";
import { generateMin } from "./generators/min.js";
import { generateMax } from "./generators/max.js";
import { generateFirst } from "./generators/first.js";
import { generateSingle } from "./generators/single.js";
import { generateLast } from "./generators/last.js";
import { generateJoin } from "./generators/join.js";
import { generateInsert } from "./generators/insert.js";
import { generateUpdate } from "./generators/update.js";
import { generateDelete } from "./generators/delete.js";

/**
 * Generate SQL from a QueryOperation tree
 */
export function generateSql(operation: QueryOperation, params: unknown): string {
  const context: SqlContext = {
    tableAliases: new Map(),
    aliasCounter: 0,
    formatParameter: (paramName: string) => `$(${paramName})`, // pg-promise format
    params: params as Record<string, unknown>,
  };

  // Collect all operations in the chain
  const operations = collectOperations(operation);

  // Check if this is a CRUD operation chain (may have WHERE, etc.)
  // Find INSERT, UPDATE, or DELETE in the chain
  const insertOp = operations.find((op) => op.operationType === "insert") as InsertOperation;
  const updateOp = operations.find((op) => op.operationType === "update") as UpdateOperation;
  const deleteOp = operations.find((op) => op.operationType === "delete") as DeleteOperation;

  if (insertOp) {
    return generateInsert(insertOp, context);
  }
  if (updateOp) {
    return generateUpdate(updateOp, context);
  }
  if (deleteOp) {
    return generateDelete(deleteOp, context);
  }

  // Check for ANY or ALL operations - they need special handling
  const anyOp = operations.find((op) => op.operationType === "any") as AnyOperation;
  const allOp = operations.find((op) => op.operationType === "all") as AllOperation;

  if (anyOp || allOp) {
    return generateExistsQuery(operations, anyOp || allOp, context);
  }

  // Check for CONTAINS operation - it needs special handling
  const containsOp = operations.find((op) => op.operationType === "contains") as ContainsOperation;
  if (containsOp) {
    return generateContainsQuery(operations, containsOp, context);
  }

  // Find terminal operations early as they affect other clauses
  const firstOp = operations.find(
    (op) => op.operationType === "first" || op.operationType === "firstOrDefault",
  ) as FirstOperation | FirstOrDefaultOperation;
  const singleOp = operations.find(
    (op) => op.operationType === "single" || op.operationType === "singleOrDefault",
  ) as SingleOperation | SingleOrDefaultOperation;
  const lastOp = operations.find(
    (op) => op.operationType === "last" || op.operationType === "lastOrDefault",
  ) as LastOperation | LastOrDefaultOperation;

  const reverseIndices: number[] = [];
  operations.forEach((op, idx) => {
    if (op.operationType === "reverse") {
      reverseIndices.push(idx);
    }
  });

  const hasReverse = reverseIndices.length % 2 === 1;
  const lastReverseIndex =
    reverseIndices.length > 0 ? reverseIndices[reverseIndices.length - 1]! : -1;

  const takeIndex = operations.findIndex((op) => op.operationType === "take");
  const skipIndex = operations.findIndex((op) => op.operationType === "skip");

  if (
    hasReverse &&
    ((takeIndex !== -1 && lastReverseIndex > takeIndex) ||
      (skipIndex !== -1 && lastReverseIndex > skipIndex))
  ) {
    throw new Error(
      "reverse() after take/skip is not supported. Apply reverse() before take/skip.",
    );
  }

  // Build SQL fragments in correct order
  const fragments: string[] = [];

  // Check for DISTINCT
  const distinctOp = operations.find((op) => op.operationType === "distinct");
  const distinctKeyword = distinctOp
    ? generateDistinct(distinctOp as DistinctOperation, context)
    : "";

  // Check for aggregate operations
  const countOp = operations.find((op) => op.operationType === "count") as CountOperation;
  const sumOp = operations.find((op) => op.operationType === "sum") as SumOperation;
  const avgOp = operations.find((op) => op.operationType === "average") as AverageOperation;
  const minOp = operations.find((op) => op.operationType === "min") as MinOperation;
  const maxOp = operations.find((op) => op.operationType === "max") as MaxOperation;

  // Find GROUP BY early and store in context for SELECT generation
  const groupByOp = operations.find((op) => op.operationType === "groupBy") as GroupByOperation;
  if (groupByOp) {
    // Store the key selector in context for later use in SELECT expressions
    context.groupByKey = groupByOp.keySelector;
  }

  // Process JOIN operations to determine if we need table aliases
  const joinOps = operations.filter((op) => op.operationType === "join") as JoinOperation[];

  // Set hasJoins flag in context before processing FROM
  if (joinOps.length > 0) {
    context.hasJoins = true;
  }

  // Process FROM first to establish base table
  const fromOp = operations.find((op) => op.operationType === "from") as FromOperation;
  if (!fromOp) {
    throw new Error("Query must have a FROM operation");
  }
  const fromClause = generateFrom(fromOp, context);
  const joinClauses: string[] = [];
  joinOps.forEach((joinOp) => {
    joinClauses.push(generateJoin(joinOp, context));
  });

  // Check if we have a JOIN with result selector but no explicit SELECT
  const hasJoinWithResultSelector = joinOps.some((op) => op.resultSelector);
  const selectOp = operations.find((op) => op.operationType === "select") as SelectOperation;

  // Generate SELECT clause
  if (countOp) {
    fragments.push(`SELECT ${generateCount(countOp, context)}`);
  } else if (sumOp) {
    fragments.push(`SELECT ${generateSum(sumOp, context)}`);
  } else if (avgOp) {
    fragments.push(`SELECT ${generateAverage(avgOp, context)}`);
  } else if (minOp) {
    fragments.push(`SELECT ${generateMin(minOp, context)}`);
  } else if (maxOp) {
    fragments.push(`SELECT ${generateMax(maxOp, context)}`);
  } else if (selectOp) {
    const selectClause = generateSelect(selectOp, context);
    if (distinctKeyword) {
      fragments.push(selectClause.replace("SELECT", `SELECT ${distinctKeyword}`));
    } else {
      fragments.push(selectClause);
    }
  } else if (hasJoinWithResultSelector) {
    // JOINs with result selectors ALWAYS require explicit SELECT projection
    throw new Error(
      "JOIN with result selector requires explicit SELECT projection. " +
        "Add .select() to specify which columns to return. " +
        "Example: .select((joined) => ({ userName: joined.u.name, deptName: joined.d.name }))",
    );
  } else if (groupByOp) {
    // GROUP BY without SELECT requires explicit projection of grouped columns
    // SELECT * is invalid with GROUP BY in PostgreSQL
    const selectClause = generateSelectForGroupBy(groupByOp, context);
    fragments.push(
      distinctKeyword ? `SELECT ${distinctKeyword} ${selectClause}` : `SELECT ${selectClause}`,
    );
  } else {
    // Default SELECT *
    fragments.push(distinctKeyword ? `SELECT ${distinctKeyword} *` : "SELECT *");
  }

  // Add FROM clause
  fragments.push(fromClause);

  // Add JOIN clauses
  fragments.push(...joinClauses);

  // Process WHERE clauses (combine multiple with AND)
  const whereOps = operations.filter((op) => op.operationType === "where") as WhereOperation[];
  const wherePredicates: string[] = [];

  // Collect predicates from WHERE operations
  whereOps.forEach((whereOp) => {
    wherePredicates.push(generateBooleanExpression(whereOp.predicate, context));
  });

  // Also check for predicates in terminal operations (first, single, last and their OrDefault variants)
  // Note: firstOp, singleOp, and lastOp are already declared above

  if (firstOp?.predicate) {
    wherePredicates.push(generateBooleanExpression(firstOp.predicate, context));
  } else if (singleOp?.predicate) {
    wherePredicates.push(generateBooleanExpression(singleOp.predicate, context));
  } else if (lastOp?.predicate) {
    wherePredicates.push(generateBooleanExpression(lastOp.predicate, context));
  }

  // Also check for COUNT predicate
  if (countOp?.predicate) {
    wherePredicates.push(generateBooleanExpression(countOp.predicate, context));
  }

  // Add WHERE clause if we have any predicates
  if (wherePredicates.length > 0) {
    fragments.push(`WHERE ${wherePredicates.join(" AND ")}`);
  }

  // Process GROUP BY (already found and stored in context earlier)
  if (groupByOp) {
    fragments.push(generateGroupBy(groupByOp, context));
  }

  // Process ORDER BY and THEN BY
  const orderByOp = operations.find((op) => op.operationType === "orderBy") as OrderByOperation;

  if (orderByOp) {
    // Reverse ORDER BY for LAST and/or reverse()
    const shouldReverse = !!lastOp !== hasReverse;

    let orderByClause = generateOrderBy(
      {
        ...orderByOp,
        descending: shouldReverse ? !orderByOp.descending : orderByOp.descending,
      } as OrderByOperation,
      context,
    );

    // Collect all THEN BY operations
    const thenByOps = operations.filter((op) => op.operationType === "thenBy") as ThenByOperation[];
    thenByOps.forEach((thenByOp) => {
      orderByClause += generateThenBy(
        {
          ...thenByOp,
          descending: shouldReverse ? !thenByOp.descending : thenByOp.descending,
        } as ThenByOperation,
        context,
      );
    });

    fragments.push(orderByClause);
  } else if (hasReverse) {
    fragments.push("ORDER BY 1 DESC");
  }

  // Process terminal operations (LIMIT clauses)
  // Note: firstOp, singleOp, lastOp are already declared above for predicate handling
  if (firstOp) {
    fragments.push(generateFirst(firstOp, context));
  } else if (singleOp) {
    fragments.push(generateSingle(singleOp, context));
  } else if (lastOp) {
    // For LAST, we need an ORDER BY to be meaningful
    // If there's no ORDER BY, we need to add one (by first column)
    if (!orderByOp) {
      // Add default ORDER BY for LAST to work
      fragments.push("ORDER BY 1 DESC");
    }
    // The ORDER BY reversal is already handled above
    fragments.push(generateLast(lastOp, context));
  } else {
    // Process LIMIT/OFFSET
    const takeOp = operations.find((op) => op.operationType === "take") as TakeOperation;
    if (takeOp) {
      fragments.push(generateTake(takeOp, context));
    }

    const skipOp = operations.find((op) => op.operationType === "skip") as SkipOperation;
    if (skipOp) {
      fragments.push(generateSkip(skipOp, context));
    }
  }

  return fragments.join(" ");
}

/**
 * Collect all operations in the chain
 */
function collectOperations(operation: QueryOperation): QueryOperation[] {
  const operations: QueryOperation[] = [];
  let current: QueryOperation | undefined = operation;

  while (current) {
    operations.push(current);

    // Stop if we hit a FROM with a subquery - the subquery will be handled separately
    if (current.operationType === "from" && (current as FromOperation).subquery) {
      break;
    }

    current = (current as QueryOperation & { source?: QueryOperation }).source;
  }

  // Reverse to get operations in execution order (from -> where -> select)
  return operations.reverse();
}

/**
 * Generate EXISTS query for ANY/ALL operations
 */
function generateExistsQuery(
  operations: QueryOperation[],
  terminalOp: AnyOperation | AllOperation,
  context: SqlContext,
): string {
  const fragments: string[] = [];

  // Build the inner SELECT for EXISTS
  fragments.push("SELECT 1");

  // Process FROM
  const fromOp = operations.find((op) => op.operationType === "from") as FromOperation;
  if (!fromOp) {
    throw new Error("Query must have a FROM operation");
  }
  fragments.push(generateFrom(fromOp, context));

  // Process JOIN operations
  const joinOps = operations.filter((op) => op.operationType === "join") as JoinOperation[];
  joinOps.forEach((joinOp) => {
    fragments.push(generateJoin(joinOp, context));
  });

  // Collect WHERE predicates
  const wherePredicates: string[] = [];

  // Get WHERE operations
  const whereOps = operations.filter((op) => op.operationType === "where") as WhereOperation[];
  whereOps.forEach((whereOp) => {
    wherePredicates.push(generateBooleanExpression(whereOp.predicate, context));
  });

  // Add predicate from ANY/ALL operation
  if (terminalOp.operationType === "any" && (terminalOp as AnyOperation).predicate) {
    wherePredicates.push(
      generateBooleanExpression((terminalOp as AnyOperation).predicate!, context),
    );
  } else if (terminalOp.operationType === "all") {
    // For ALL, we check NOT EXISTS where NOT predicate
    const predicate = generateBooleanExpression((terminalOp as AllOperation).predicate, context);
    // We'll handle the NOT wrapping later
    wherePredicates.push(`NOT (${predicate})`);
  }

  // Add WHERE clause if we have predicates
  if (wherePredicates.length > 0) {
    const whereClause = wherePredicates.join(" AND ");
    fragments.push(`WHERE ${whereClause}`);
  }

  const innerQuery = fragments.join(" ");

  // Wrap in EXISTS/NOT EXISTS with CASE WHEN for boolean result
  if (terminalOp.operationType === "any") {
    return `SELECT CASE WHEN EXISTS(${innerQuery}) THEN 1 ELSE 0 END`;
  } else {
    // For ALL: NOT EXISTS(SELECT 1 WHERE NOT predicate)
    // But we already added the NOT to the predicate above
    return `SELECT CASE WHEN NOT EXISTS(${innerQuery}) THEN 1 ELSE 0 END`;
  }
}

/**
 * Generate EXISTS query for CONTAINS operation
 */
function generateContainsQuery(
  operations: QueryOperation[],
  terminalOp: ContainsOperation,
  context: SqlContext,
): string {
  if (operations.some((op) => op.operationType === "take" || op.operationType === "skip")) {
    throw new Error("contains() is not supported with take/skip.");
  }

  // Find the SELECT closest to the terminal operation (the effective projection)
  let selectOp: SelectOperation | undefined;
  for (let i = operations.length - 1; i >= 0; i--) {
    const op = operations[i];
    if (op?.operationType === "select") {
      selectOp = op as SelectOperation;
      break;
    }
  }

  if (!selectOp || !selectOp.selector) {
    throw new Error("contains() requires a scalar .select(...) projection.");
  }

  if (selectOp.selector.type === "object" || selectOp.selector.type === "allColumns") {
    throw new Error("contains() requires a scalar .select(...) projection.");
  }

  // Find GROUP BY early and store in context for SELECT generation
  const groupByOp = operations.find((op) => op.operationType === "groupBy") as GroupByOperation;
  if (groupByOp) {
    context.groupByKey = groupByOp.keySelector;
  }

  // Process JOIN operations to determine if we need table aliases
  const joinOps = operations.filter((op) => op.operationType === "join") as JoinOperation[];
  if (joinOps.length > 0) {
    context.hasJoins = true;
  }

  const fromOp = operations.find((op) => op.operationType === "from") as FromOperation;
  if (!fromOp) {
    throw new Error("Query must have a FROM operation");
  }

  const fromClause = generateFrom(fromOp, context);
  const joinClauses = joinOps.map((joinOp) => generateJoin(joinOp, context));

  const projection = generateExpression(selectOp.selector, context);

  const fragments: string[] = [];
  fragments.push(`SELECT ${projection} AS "__tinqer_value"`);
  fragments.push(fromClause);
  fragments.push(...joinClauses);

  const whereOps = operations.filter((op) => op.operationType === "where") as WhereOperation[];
  const wherePredicates = whereOps.map((whereOp) =>
    generateBooleanExpression(whereOp.predicate, context),
  );

  if (wherePredicates.length > 0) {
    fragments.push(`WHERE ${wherePredicates.join(" AND ")}`);
  }

  if (groupByOp) {
    fragments.push(generateGroupBy(groupByOp, context));
  }

  const innerQuery = fragments.join(" ");
  const containsValue = generateExpression(terminalOp.value, context);

  return (
    `SELECT CASE WHEN EXISTS(` +
    `SELECT 1 FROM (${innerQuery}) AS "__tinqer_contains" ` +
    `WHERE "__tinqer_contains"."__tinqer_value" = ${containsValue}` +
    `) THEN 1 ELSE 0 END`
  );
}

/**
 * Generate SELECT clause for GROUP BY when no explicit SELECT is provided
 */
function generateSelectForGroupBy(groupByOp: GroupByOperation, context: SqlContext): string {
  const keySelector = groupByOp.keySelector;

  if (keySelector.type === "object") {
    // Composite key - project each grouped column
    const columns: string[] = [];
    for (const propName in keySelector.properties) {
      const propExpr = keySelector.properties[propName];
      if (propExpr) {
        const sqlExpr = generateExpression(propExpr, context);
        columns.push(`${sqlExpr} AS "${propName}"`);
      }
    }
    return columns.join(", ");
  } else if (keySelector.type === "column") {
    // Single column grouping
    const sqlExpr = generateExpression(keySelector, context);
    return sqlExpr;
  } else {
    // Any other expression type
    const sqlExpr = generateExpression(keySelector, context);
    return sqlExpr;
  }
}
