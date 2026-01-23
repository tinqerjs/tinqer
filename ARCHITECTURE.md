# Architecture

Tinqer is a type-safe query builder (for TypeScript) that converts lambda expressions into SQL queries through runtime parsing and expression tree generation. The API is similar to DotNet's LINQ-based frameworks.

## Database Adapters

The core package is adapter-agnostic; database-specific behavior lives in companion adapters. The repository currently ships two adapters:

- `@tinqerjs/pg-promise-adapter` – PostgreSQL integration built on pg-promise
- `@tinqerjs/better-sqlite3-adapter` – SQLite integration powered by better-sqlite3

Both adapters provide execution functions (`executeSelect`, `executeInsert`, etc.) that accept plan handles created by `define*` functions from the core package. Query plans are created using `defineSelect`, `defineInsert`, `defineUpdate`, and `defineDelete`, which parse query builder lambdas. Plans can then be executed with adapter-specific `execute*` functions or converted to SQL using `toSql`, allowing database switching without rewriting query code.

## Core Design Principles

### Dual Type System

Tinqer employs a dual type system to provide both compile-time type safety and runtime SQL generation:

1. **Compile-time Layer**: TypeScript classes (`Queryable<T>`, `TerminalQuery<T>`) provide type-safe APIs for users
2. **Runtime Layer**: Simplified expression trees without generics for parsing and SQL generation

This separation allows users to write fully type-safe queries while the parser works with simplified data structures.

### Expression Trees

Tinqer uses expression trees to represent queries, matching the design of .NET LINQ. Each query operation wraps its source operation, creating a nested tree structure that preserves the complete operation chain.

### Runtime Lambda Parsing

TypeScript lambdas are parsed at runtime using the OXC parser. The function string representation is converted to AST, then to our expression tree format.

## Expression Type System

### Expression Type Hierarchy

Expressions are precisely typed based on their evaluation result:

```typescript
// Base type - all possible expressions
export type Expression = BooleanExpression | ValueExpression | ObjectExpression | ArrayExpression;

// Boolean expressions - evaluate to true/false
export type BooleanExpression =
  | ComparisonExpression // x.age >= 18
  | LogicalExpression // x.age >= 18 && x.isActive
  | BooleanMemberExpression // x.isActive
  | BooleanMethodExpression // x.name.startsWith("J")
  | NotExpression // !x.isDeleted
  | BooleanConstantExpression; // true or false

// Value expressions - evaluate to a value
export type ValueExpression =
  | ColumnExpression // x.name
  | ConstantExpression // 42, "hello"
  | ParameterExpression // p.minAge
  | ArithmeticExpression // x.age + 1
  | StringMethodExpression // x.name.toLowerCase()
  | CaseExpression; // CASE WHEN ... THEN ...
```

### Detailed Expression Types

#### ComparisonExpression

Represents binary comparisons that produce boolean results.

```typescript
export interface ComparisonExpression {
  type: "comparison";
  operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
  left: ValueExpression;
  right: ValueExpression;
}
```

**Example Input**: `x => x.age >= 18`
**Example Output**:

```typescript
{
  type: "comparison",
  operator: ">=",
  left: { type: "column", name: "age" },
  right: { type: "constant", value: 18 }
}
```

#### LogicalExpression

Combines boolean expressions with logical operators.

```typescript
export interface LogicalExpression {
  type: "logical";
  operator: "&&" | "||";
  left: BooleanExpression;
  right: BooleanExpression;
}
```

**Example Input**: `x => x.age >= 18 && x.isActive`
**Example Output**:

```typescript
{
  type: "logical",
  operator: "&&",
  left: {
    type: "comparison",
    operator: ">=",
    left: { type: "column", name: "age" },
    right: { type: "constant", value: 18 }
  },
  right: { type: "column", name: "isActive" }
}
```

#### ColumnExpression

References a table column.

```typescript
export interface ColumnExpression {
  type: "column";
  name: string;
  table?: string; // Optional table alias for joins
}
```

**Example Input**: `x => x.name`
**Example Output**: `{ type: "column", name: "name" }`

#### ParameterExpression

References an external parameter passed to the query.

```typescript
export interface ParameterExpression {
  type: "param";
  param: string; // Parameter name (e.g., "p")
  property?: string; // Property path (e.g., "minAge")
}
```

**Example Input**: `p => p.minAge`
**Example Output**: `{ type: "param", param: "p", property: "minAge" }`

#### ObjectExpression

Represents object literals, typically used in SELECT projections.

```typescript
export interface ObjectExpression {
  type: "object";
  properties: Array<{
    key: string;
    value: ValueExpression | BooleanExpression;
  }>;
}
```

**Example Input**: `x => ({ id: x.id, name: x.name })`
**Example Output**:

```typescript
{
  type: "object",
  properties: [
    { key: "id", value: { type: "column", name: "id" } },
    { key: "name", value: { type: "column", name: "name" } }
  ]
}
```

## Query Operations

### Simplified Operation Structure

Query operations no longer use complex generics. Each operation has a precise structure with specific expression types.

### Base QueryOperation

```typescript
export interface QueryOperation {
  type: "queryOperation";
  operationType: string;
}
```

### Chainable Operations

#### FromOperation

The root of all query chains.

```typescript
export interface FromOperation extends QueryOperation {
  operationType: "from";
  table: string;
  schema?: string;
}
```

**User-Facing API**: `(q, ) => q.from("users")`

**Internal Representation**:

```typescript
{
  type: "queryOperation",
  operationType: "from",
  table: "users"
}
```

#### WhereOperation

Filters rows based on a boolean predicate.

```typescript
export interface WhereOperation extends QueryOperation {
  operationType: "where";
  source: QueryOperation;
  predicate: BooleanExpression; // Must be boolean
}
```

**Example Input**: `.where(x => x.age >= 18 && x.isActive)`
**Example Output**:

```typescript
{
  operationType: "where",
  source: { /* previous operation */ },
  predicate: {
    type: "logical",
    operator: "&&",
    left: {
      type: "comparison",
      operator: ">=",
      left: { type: "column", name: "age" },
      right: { type: "constant", value: 18 }
    },
    right: { type: "column", name: "isActive" }
  }
}
```

#### SelectOperation

Projects data into a new shape.

```typescript
export interface SelectOperation extends QueryOperation {
  operationType: "select";
  source: QueryOperation;
  selector: ValueExpression | ObjectExpression;
}
```

**Example Input**: `.select(x => ({ id: x.id, name: x.name }))`
**Example Output**:

```typescript
{
  operationType: "select",
  source: { /* previous operation */ },
  selector: {
    type: "object",
    properties: [
      { key: "id", value: { type: "column", name: "id" } },
      { key: "name", value: { type: "column", name: "name" } }
    ]
  }
}
```

#### JoinOperation

Joins two tables on matching keys.

```typescript
export interface JoinOperation extends QueryOperation {
  operationType: "join";
  source: QueryOperation;
  inner: QueryOperation;
  outerKey: string; // Simple column name
  innerKey: string; // Simple column name
  resultSelector: ObjectExpression;
  joinType: "inner" | "left" | "right" | "full" | "cross";
}
```

**Example Input**:

```typescript
users.join(
  departments,
  (u) => u.departmentId,
  (d) => d.id,
  (u, d) => ({ userName: u.name, deptName: d.name }),
);
```

**Example Output**:

```typescript
{
  operationType: "join",
  source: { /* users table */ },
  inner: { /* departments table */ },
  outerKey: "departmentId",
  innerKey: "id",
  resultSelector: {
    type: "object",
    properties: [
      { key: "userName", value: { type: "column", name: "name", table: "t0" } },
      { key: "deptName", value: { type: "column", name: "name", table: "t1" } }
    ]
  },
  joinType: "inner"
}
```

#### OrderByOperation

Sorts results by a key.

```typescript
export interface OrderByOperation extends QueryOperation {
  operationType: "orderBy";
  source: QueryOperation;
  keySelector: string | ValueExpression;
  direction: "ascending" | "descending";
}
```

**Example Input**: `.orderBy(x => x.name)`
**Example Output**:

```typescript
{
  operationType: "orderBy",
  source: { /* previous operation */ },
  keySelector: "name",
  direction: "ascending"
}
```

#### GroupByOperation

Groups rows by a key.

```typescript
export interface GroupByOperation extends QueryOperation {
  operationType: "groupBy";
  source: QueryOperation;
  keySelector: string | ValueExpression;
  elementSelector?: ValueExpression | ObjectExpression;
}
```

**Example Input**: `.groupBy(x => x.departmentId)`
**Example Output**:

```typescript
{
  operationType: "groupBy",
  source: { /* previous operation */ },
  keySelector: "departmentId"
}
```

#### TakeOperation / SkipOperation

Limits or skips rows.

```typescript
export interface TakeOperation extends QueryOperation {
  operationType: "take";
  source: QueryOperation;
  count: number | ParamRef;
}

export interface SkipOperation extends QueryOperation {
  operationType: "skip";
  source: QueryOperation;
  count: number | ParamRef;
}
```

**Example Input**: `.take(10).skip(p => p.offset)`
**Example Output**:

```typescript
{
  operationType: "take",
  source: {
    operationType: "skip",
    source: { /* previous */ },
    count: { param: "p", property: "offset" }
  },
  count: 10
}
```

### Terminal Operations

Terminal operations end the query chain and produce a result.

#### CountOperation

Counts rows.

```typescript
export interface CountOperation extends QueryOperation {
  operationType: "count";
  source: QueryOperation;
  predicate?: BooleanExpression;
}
```

**Example Input**: `.count(x => x.isActive)`
**Example Output**:

```typescript
{
  operationType: "count",
  source: { /* previous operation */ },
  predicate: { type: "column", name: "isActive" }
}
```

#### FirstOperation / SingleOperation

Gets first or single row.

```typescript
export interface FirstOperation extends QueryOperation {
  operationType: "first";
  source: QueryOperation;
  predicate?: BooleanExpression;
}
```

#### Aggregate Operations

Sum, Average, Min, Max operations.

```typescript
export interface SumOperation extends QueryOperation {
  operationType: "sum";
  source: QueryOperation;
  selectorExpression?: ValueExpression;
}
```

**Example Input**: `.sum(x => x.amount)`
**Example Output**:

```typescript
{
  operationType: "sum",
  source: { /* previous operation */ },
  selectorExpression: { type: "column", name: "amount" }
}
```

## Query Processing Pipeline

The query execution flow follows a multi-stage pipeline that transforms user code into SQL:

```
User Code → Parser → Normalization Passes → SQL Generator → SQL
```

### Stage 1: Parsing (Runtime Lambda Parsing)

The parser uses OXC to convert lambda expressions into an Abstract Syntax Tree (AST), then transforms it into Tinqer's operation tree.

**Input**: Lambda expression with DSL parameter pattern

```typescript
(q) =>
  q
    .from("employees")
    .select((e) => ({ ...e, rn: window.rowNumber() }))
    .where((r) => r.rn === 1);
```

**Output**: Operation tree

```typescript
{
  operationType: "where",
  predicate: { type: "comparison", ... },
  source: {
    operationType: "select",
    selector: { type: "object", properties: { ... } },
    source: {
      operationType: "from",
      table: "employees"
    }
  }
}
```

### Stage 2: Normalization Passes

Normalization passes transform the operation tree to handle SQL constraints and optimize structure. These run **after parsing, before SQL generation**.

#### Current Normalization Passes:

1. **`normalizeJoins`** - Converts CROSS JOIN with WHERE to INNER JOIN
2. **`wrapWindowFilters`** - Wraps queries in subqueries when WHERE references window function columns

#### Window Filter Normalization

SQL doesn't allow filtering on window functions at the same level where they're defined:

```sql
-- INVALID ❌
SELECT *, ROW_NUMBER() OVER (...) AS rn
FROM users
WHERE rn = 1
```

The normalization pass detects this pattern and automatically wraps it:

```sql
-- VALID ✅ (automatically generated)
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (...) AS rn
  FROM users
) AS users
WHERE rn = 1
```

**Implementation**: `packages/tinqer/src/parser/normalize-window-filters.ts`

**Algorithm**:

1. Traverse operation tree bottom-up
2. Track window function column names through SELECT operations
3. When WHERE operation is encountered:
   - Check if predicate references any tracked window columns
   - If yes, wrap the source in a FROM operation with subquery
4. Propagate window aliases up the tree for nested queries

**Key Design**: The normalization creates a new `FromOperation` with:

- `subquery`: The original operation tree
- `aliasHint`: Original table name for readability

**Example Transformation**:

Before:

```typescript
WHERE {
  predicate: rn === 1,
  source: SELECT {
    selector: { rn: WindowFunction(...) },
    source: FROM { table: "users" }
  }
}
```

After:

```typescript
WHERE {
  predicate: rn === 1,
  source: FROM {
    subquery: SELECT {
      selector: { rn: WindowFunction(...) },
      source: FROM { table: "users" }
    },
    aliasHint: "users"
  }
}
```

### Stage 3: SQL Generation

The SQL generator traverses the normalized operation tree and emits database-specific SQL.

**Key Features**:

- Recursive generation for subqueries
- Adapter-specific parameter formatting (`$(name)` for pg-promise, `@name` for better-sqlite3)
- Operation collection stops at subquery boundaries
- Table alias management for joins and derived tables

**Subquery Handling**:

```typescript
function generateFrom(operation: FromOperation, context: SqlContext): string {
  if (operation.subquery) {
    // Recursive call for inner query
    const innerSql = generateSql(operation.subquery, context.params);
    const alias = operation.aliasHint || `t${context.aliasCounter++}`;
    return `FROM (${innerSql}) AS "${alias}"`;
  }
  // Regular table
  return `FROM "${operation.table}"`;
}
```

**Operation Collection**:

```typescript
function collectOperations(operation: QueryOperation): QueryOperation[] {
  while (current) {
    operations.push(current);

    // Stop at subquery boundary - inner operations handled separately
    if (current.operationType === "from" && current.subquery) {
      break;
    }

    current = current.source;
  }
  return operations.reverse();
}
```

### Normalization Pass Pattern

Normalization passes follow a consistent pattern for extensibility:

1. **Bottom-up traversal**: Process children before parents
2. **Immutable transforms**: Return new operations rather than mutating
3. **Context propagation**: Track state (e.g., window aliases) as you traverse
4. **Conditional wrapping**: Only transform when necessary

**Adding a new normalization pass**:

```typescript
// packages/tinqer/src/parser/normalize-*.ts
export function normalizeXYZ(operation: QueryOperation): QueryOperation {
  return visit(operation);
}

function visit(op: QueryOperation): QueryOperation {
  // Recursively process source first
  if (op.source) {
    const normalizedSource = visit(op.source);
    // Apply transformation logic
    // Return transformed operation
  }
  return op;
}
```

Then add to pipeline in `parse-query.ts`:

```typescript
let normalizedOperation = normalizeJoins(result.operation);
normalizedOperation = wrapWindowFilters(normalizedOperation);
normalizedOperation = normalizeXYZ(normalizedOperation); // New pass
```

### Benefits of Normalization Architecture

- **Separation of Concerns**: Parser focuses on AST conversion, normalizer on SQL semantics, generator on dialect
- **Composability**: Multiple independent passes can be chained
- **Testability**: Each pass can be tested in isolation
- **Maintainability**: SQL semantics separated from parsing logic
- **Extensibility**: New SQL patterns can be added as new passes

## API Layers

### User-Facing API (Compile-Time)

```typescript
// Database schema provides type context
interface DatabaseSchema<TSchema> {
  _schemaType?: TSchema;
}

// Query builder provides table access
interface QueryBuilder<TSchema> {
  from<TTable extends keyof TSchema>(table: TTable): Queryable<TSchema[TTable]>;
}

// Queryable class for type-safe chaining
class Queryable<T> {
  where(predicate: (item: T) => boolean): Queryable<T>;
  select<TResult>(selector: (item: T) => TResult): Queryable<TResult>;
  orderBy<TKey>(keySelector: (item: T) => TKey): OrderedQueryable<T>;

  // Terminal operations
  count(predicate?: (item: T) => boolean): TerminalQuery<number>;
  first(predicate?: (item: T) => boolean): TerminalQuery<T>;
}

// Terminal query marker
class TerminalQuery<T> {
  private _phantom?: T;
}

// Query functions receive (q, params, helpers)
type QueryFunction<TParams, TResult> = (
  q: QueryBuilder<TSchema>,
  params: TParams,
  helpers: Helpers,
) => Queryable<TResult> | TerminalQuery<TResult>;
```

### Parser API (Runtime)

```typescript
// Main parsing function
function parseQuery<TContext, TParams, TQuery>(
  builder:
    | ((ctx: TContext) => TQuery)
    | ((ctx: TContext, params: TParams) => TQuery)
    | ((ctx: TContext, params: TParams, helpers: Helpers) => TQuery),
  options?: ParseQueryOptions,
): ParseResult | null;

// Parses individual lambdas
function parseLambdaExpression(fn: Function, methodName: string): LambdaExpression;

// Converts AST to expressions
function convertAstToExpression(ast: unknown, context: Context): Expression;

// Converts method chains to operations
function convertAstToQueryOperation(ast: unknown): QueryOperation;
```

### SQL Adapter API

```typescript
// Plan creation functions (in core package)
function defineSelect<TSchema, TParams, TResult>(
  schema: DatabaseSchema<TSchema>,
  queryBuilder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: Helpers,
  ) => Queryable<TResult> | TerminalQuery<TResult>,
  options?: ParseQueryOptions,
): SelectPlanHandle<TResult, TParams> | SelectTerminalHandle<TResult, TParams>;

function defineInsert<TSchema, TParams, TTable, TReturning>(
  schema: DatabaseSchema<TSchema>,
  queryBuilder: (q: QueryBuilder<TSchema>, params: TParams, helpers: Helpers) => InsertQuery,
  options?: ParseQueryOptions,
): InsertPlanHandle<TTable, TReturning, TParams>;

// Execution functions (in adapters)
async function executeSelect<TResult, TParams>(
  db: Database,
  plan: SelectPlanHandle<TResult, TParams> | SelectTerminalHandle<TResult, TParams>,
  params: TParams,
): Promise<TResult[]>;

async function executeInsert<TTable, TReturning, TParams>(
  db: Database,
  plan: InsertPlanHandle<TTable, TReturning, TParams>,
  params: TParams,
): Promise<TReturning extends never ? number : TReturning[]>;

// SQL generation functions (in adapters, for testing/debugging)
function toSql<TParams>(
  plan: SelectPlanHandle<unknown, TParams> | SelectTerminalHandle<unknown, TParams>,
  params: TParams,
): { sql: string; params: TParams & Record<string, unknown> };

// SQL generation (internal)
function generateSql(operation: QueryOperation, params: unknown): string;
```

### Current Gaps

- `HAVING` clauses are not emitted yet. Query builders can shape grouped results, but aggregated filters must be applied by chaining `.where` after `.select` or by filtering results in application code.

## Complete Example Flow

### User Code

```typescript
// Create database context
const schema = createSchema<Schema>();

// Define query plan
const usersPlan = defineSelect(schema, (q, p: { minAge: number; dept: string }) =>
  q
    .from("users")
    .where((x) => x.age >= p.minAge && x.department === p.dept)
    .select((x) => ({ id: x.id, name: x.name, age: x.age }))
    .orderBy((x) => x.name)
    .take(10),
);

// Execute query with parameters
const result = await executeSelect(db, usersPlan, {
  minAge: 18,
  dept: "Engineering",
});
```

### Parsed Expression Tree

```typescript
{
  type: "queryOperation",
  operationType: "take",
  count: 10,
  source: {
    operationType: "orderBy",
    keySelector: "name",
    direction: "ascending",
    source: {
      operationType: "select",
      selector: {
        type: "object",
        properties: [
          { key: "id", value: { type: "column", name: "id" } },
          { key: "name", value: { type: "column", name: "name" } },
          { key: "age", value: { type: "column", name: "age" } }
        ]
      },
      source: {
        operationType: "where",
        predicate: {
          type: "logical",
          operator: "&&",
          left: {
            type: "comparison",
            operator: ">=",
            left: { type: "column", name: "age" },
            right: { type: "param", param: "p", property: "minAge" }
          },
          right: {
            type: "comparison",
            operator: "==",
            left: { type: "column", name: "department" },
            right: { type: "param", param: "p", property: "dept" }
          }
        },
        source: {
          operationType: "from",
          table: "users"
        }
      }
    }
  }
}
```

### Generated SQL

```sql
SELECT id, name, age
FROM users
WHERE age >= :minAge AND department = :dept
ORDER BY name ASC
LIMIT 10
```

## Data Flow

```
User TypeScript Code
    ↓
Function.toString()
    ↓
OXC Parser (WASM)
    ↓
JavaScript AST
    ↓
convertAstToQueryOperation()
    ↓
Query Operation Tree (simplified, no generics)
    ↓
SQL Adapter generateSql()
    ↓
SQL String + Parameters
```

## Type Safety Guarantees

1. **Compile-time**: TypeScript validates lambda signatures and types
2. **Parse-time**: Expression types ensure correct operation combinations
3. **Generation-time**: SQL adapter validates expression semantics

## Performance Considerations

- **Parser Caching**: Cache parsed query functions to avoid re-parsing
- **Expression Reuse**: Identify and reuse common sub-expressions
- **Prepared Statements**: Generated SQL uses parameterized queries
- **Lazy Evaluation**: Operations build trees without immediate execution

## Security

- **No String Concatenation**: All values use parameterized queries
- **Expression Validation**: Only safe expressions allowed
- **No Dynamic Code**: No eval() or Function constructor usage
- **SQL Injection Prevention**: Expression tree approach prevents injection by design
