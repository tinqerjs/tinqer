/**
 * Simplified Query Operation Types for Runtime Parsing
 *
 * These types represent the parsed expression tree without complex generics.
 * They are used by the parser to build query structures from lambda expressions.
 */

import type {
  Expression,
  BooleanExpression,
  ValueExpression,
  ObjectExpression,
} from "../expressions/expression.js";

/**
 * Parameter reference for external parameters
 */
export interface ParamRef {
  type: "param";
  param: string;
  property?: string;
}

/**
 * Base query operation
 */
export interface QueryOperation {
  type: "queryOperation";
  operationType: string;
}

/**
 * FROM operation - the root of all query chains
 * Can reference either a table or a subquery (derived table)
 */
export interface FromOperation extends QueryOperation {
  operationType: "from";
  table?: string;
  schema?: string;
  subquery?: QueryOperation; // Derived table / subquery
  aliasHint?: string; // Suggested alias name (often the original table name)
}

/**
 * WHERE operation - filters the source
 */
export interface WhereOperation extends QueryOperation {
  operationType: "where";
  source: QueryOperation;
  predicate: BooleanExpression;
}

/**
 * SELECT operation - projects the source
 */
export interface SelectOperation extends QueryOperation {
  operationType: "select";
  source: QueryOperation;
  selector: ValueExpression | ObjectExpression | null; // null means SELECT *
}

/**
 * JOIN operation
 */
export interface JoinOperation extends QueryOperation {
  operationType: "join";
  source: QueryOperation;
  inner: QueryOperation;
  outerKey: string; // Simple column name
  innerKey: string; // Simple column name
  outerKeySource?: number; // Which source table the outer key comes from (for chained JOINs)
  resultSelector?: Expression; // The projection expression from the result selector lambda
  resultShape?: ResultShape; // Tracks the shape of the JOIN result for nested property resolution
  joinType?: "inner" | "left" | "right" | "full" | "cross";
}

/**
 * GROUP JOIN operation (LINQ-style)
 */
export interface GroupJoinOperation extends QueryOperation {
  operationType: "groupJoin";
  source: QueryOperation;
  inner: QueryOperation;
  outerKey: string;
  innerKey: string;
  outerKeySource?: number;
  resultSelector?: Expression;
  resultShape?: ResultShape;
  outerParam?: string;
  innerGroupParam?: string;
  outerBindingName?: string;
  groupBindingName?: string;
}

/**
 * SELECT MANY operation (LINQ-style)
 */
export interface SelectManyOperation extends QueryOperation {
  operationType: "selectMany";
  source: QueryOperation;
  collection: QueryOperation | Expression;
  resultSelector?: Expression;
  sourceParam?: string;
  collectionParam?: string;
  resultParam?: string;
  collectionPropertyPath?: string[];
  usesDefaultIfEmpty?: boolean;
  resultShape?: ResultShape;
  resultBindings?: Array<{ name: string; source: "outer" | "inner"; path?: string[] }>;
}

/**
 * DEFAULT IF EMPTY operation
 */
export interface DefaultIfEmptyOperation extends QueryOperation {
  operationType: "defaultIfEmpty";
  source: QueryOperation;
  defaultValue?: Expression;
}

/**
 * Represents the shape of a JOIN result with full nested structure preservation
 */
export interface ResultShape {
  type: "object";
  properties: Map<string, ShapeNode>;
}

/**
 * A node in the shape tree that can be a column, object, or reference
 */
export type ShapeNode = ColumnShapeNode | ObjectShapeNode | ReferenceShapeNode | ArrayShapeNode;

/**
 * Represents a direct column reference
 */
export interface ColumnShapeNode {
  type: "column";
  sourceTable: number; // Which JOIN parameter (0=outer, 1=inner)
  columnName: string; // The actual column name
}

/**
 * Represents a nested object with properties
 */
export interface ObjectShapeNode {
  type: "object";
  properties: Map<string, ShapeNode>;
}

/**
 * Represents a reference to an entire table/parameter
 */
export interface ReferenceShapeNode {
  type: "reference";
  sourceTable: number; // References the entire table
}

/**
 * Represents an array (for future support)
 */
export interface ArrayShapeNode {
  type: "array";
  elementShape: ShapeNode;
}

/**
 * GROUP BY operation
 */
export interface GroupByOperation extends QueryOperation {
  operationType: "groupBy";
  source: QueryOperation;
  keySelector: Expression; // Support any expression including composite keys
}

/**
 * ORDER BY operation
 */
export interface OrderByOperation extends QueryOperation {
  operationType: "orderBy";
  source: QueryOperation;
  keySelector: string | ValueExpression; // Support both simple columns and computed expressions
  descending: boolean;
}

/**
 * THEN BY operation - secondary ordering
 */
export interface ThenByOperation extends QueryOperation {
  operationType: "thenBy";
  source: QueryOperation; // Must be OrderByOperation or ThenByOperation
  keySelector: string | ValueExpression; // Support both simple columns and computed expressions
  descending: boolean;
}

/**
 * DISTINCT operation
 */
export interface DistinctOperation extends QueryOperation {
  operationType: "distinct";
  source: QueryOperation;
}

/**
 * TAKE operation (LIMIT)
 */
export interface TakeOperation extends QueryOperation {
  operationType: "take";
  source: QueryOperation;
  count: number | ParamRef | import("../expressions/expression.js").ValueExpression;
}

/**
 * SKIP operation (OFFSET)
 */
export interface SkipOperation extends QueryOperation {
  operationType: "skip";
  source: QueryOperation;
  count: number | ParamRef | import("../expressions/expression.js").ValueExpression;
}

/**
 * REVERSE operation
 */
export interface ReverseOperation extends QueryOperation {
  operationType: "reverse";
  source: QueryOperation;
}

/**
 * ZIP operation
 */
export interface ZipOperation extends QueryOperation {
  operationType: "zip";
  source: QueryOperation;
  second: QueryOperation;
  resultSelector: ObjectExpression;
}

/**
 * APPEND operation
 */
export interface AppendOperation extends QueryOperation {
  operationType: "append";
  source: QueryOperation;
  element: ValueExpression | ObjectExpression;
}

/**
 * PREPEND operation
 */
export interface PrependOperation extends QueryOperation {
  operationType: "prepend";
  source: QueryOperation;
  element: ValueExpression | ObjectExpression;
}

/**
 * HAVING operation - filters after grouping
 */
export interface HavingOperation extends QueryOperation {
  operationType: "having";
  source: QueryOperation; // Must be GroupByOperation
  predicate: BooleanExpression;
}

// ==================== Terminal Operations ====================

/**
 * FIRST operation
 */
export interface FirstOperation extends QueryOperation {
  operationType: "first";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * FIRST OR DEFAULT operation
 */
export interface FirstOrDefaultOperation extends QueryOperation {
  operationType: "firstOrDefault";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * SINGLE operation
 */
export interface SingleOperation extends QueryOperation {
  operationType: "single";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * SINGLE OR DEFAULT operation
 */
export interface SingleOrDefaultOperation extends QueryOperation {
  operationType: "singleOrDefault";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * LAST operation
 */
export interface LastOperation extends QueryOperation {
  operationType: "last";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * LAST OR DEFAULT operation
 */
export interface LastOrDefaultOperation extends QueryOperation {
  operationType: "lastOrDefault";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * ANY operation
 */
export interface AnyOperation extends QueryOperation {
  operationType: "any";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * ALL operation
 */
export interface AllOperation extends QueryOperation {
  operationType: "all";
  source: QueryOperation;
  predicate: BooleanExpression; // Required for ALL
}

/**
 * CONTAINS operation
 */
export interface ContainsOperation extends QueryOperation {
  operationType: "contains";
  source: QueryOperation;
  value: ValueExpression;
}

/**
 * COUNT operation
 */
export interface CountOperation extends QueryOperation {
  operationType: "count";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * LONG COUNT operation
 */
export interface LongCountOperation extends QueryOperation {
  operationType: "longCount";
  source: QueryOperation;
  predicate?: BooleanExpression;
}

/**
 * SUM operation
 */
export interface SumOperation extends QueryOperation {
  operationType: "sum";
  source: QueryOperation;
  selectorExpression?: ValueExpression;
}

/**
 * AVERAGE operation
 */
export interface AverageOperation extends QueryOperation {
  operationType: "average";
  source: QueryOperation;
  selectorExpression?: ValueExpression;
}

/**
 * MIN operation
 */
export interface MinOperation extends QueryOperation {
  operationType: "min";
  source: QueryOperation;
  selectorExpression?: ValueExpression;
}

/**
 * MAX operation
 */
export interface MaxOperation extends QueryOperation {
  operationType: "max";
  source: QueryOperation;
  selectorExpression?: ValueExpression;
}

/**
 * AGGREGATE operation
 */
export interface AggregateOperation extends QueryOperation {
  operationType: "aggregate";
  source: QueryOperation;
  seed: ValueExpression;
  func: ObjectExpression; // Aggregate function
  resultSelector?: ObjectExpression;
}

/**
 * TO DICTIONARY operation
 */
export interface ToDictionaryOperation extends QueryOperation {
  operationType: "toDictionary";
  source: QueryOperation;
  keySelector: string | ValueExpression;
  elementSelector?: ValueExpression | ObjectExpression;
}

/**
 * TO LOOKUP operation
 */
export interface ToLookupOperation extends QueryOperation {
  operationType: "toLookup";
  source: QueryOperation;
  keySelector: string | ValueExpression;
  elementSelector?: ValueExpression | ObjectExpression;
}

/**
 * Union type for all chainable operations
 */
export type ChainableOperation =
  | FromOperation
  | WhereOperation
  | SelectOperation
  | JoinOperation
  | GroupJoinOperation
  | SelectManyOperation
  | DefaultIfEmptyOperation
  | GroupByOperation
  | OrderByOperation
  | ThenByOperation
  | DistinctOperation
  | TakeOperation
  | SkipOperation
  | ReverseOperation;

/**
 * Union type for all terminal operations
 */
export type TerminalOperation =
  | FirstOperation
  | FirstOrDefaultOperation
  | SingleOperation
  | SingleOrDefaultOperation
  | LastOperation
  | LastOrDefaultOperation
  | ContainsOperation
  | CountOperation
  | SumOperation
  | AverageOperation
  | MinOperation
  | MaxOperation;

// ==================== Data Modification Operations ====================

/**
 * INSERT operation
 */
export interface InsertOperation extends QueryOperation {
  operationType: "insert";
  table: string;
  schema?: string;
  values: ObjectExpression; // Column-value mapping
  returning?: ValueExpression | ObjectExpression; // For PostgreSQL RETURNING clause
  onConflict?: InsertOnConflictClause; // ON CONFLICT / upsert support
}

export type InsertOnConflictAction =
  | { type: "nothing" }
  | { type: "update"; assignments: ObjectExpression };

export interface InsertOnConflictClause {
  target: string[]; // Column names
  action?: InsertOnConflictAction;
}

/**
 * UPDATE operation
 */
export interface UpdateOperation extends QueryOperation {
  operationType: "update";
  table: string;
  schema?: string;
  assignments: ObjectExpression; // Column-value assignments from .set()
  predicate?: BooleanExpression; // WHERE clause
  allowFullTableUpdate?: boolean; // Explicit opt-in for updates without WHERE
  returning?: ValueExpression | ObjectExpression; // For PostgreSQL RETURNING clause
}

/**
 * DELETE operation
 */
export interface DeleteOperation extends QueryOperation {
  operationType: "delete";
  table: string;
  schema?: string;
  predicate?: BooleanExpression; // WHERE clause
  allowFullTableDelete?: boolean; // Explicit opt-in for deletes without WHERE
}

/**
 * Union type for all operations
 */
export type AnyQueryOperation =
  | ChainableOperation
  | TerminalOperation
  | InsertOperation
  | UpdateOperation
  | DeleteOperation;
