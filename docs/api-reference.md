[← Back to README](../README.md)

# Tinqer API Reference

Reference for adapter execution helpers, typed contexts, and query utilities.

## Table of Contents

- [1. Execution APIs](#1-execution-apis)
  - [1.1 defineSelect, toSql & executeSelect](#11-defineselect-tosql--executeselect)
  - [1.2 defineInsert, toSql & executeInsert](#12-defineinsert-tosql--executeinsert)
  - [1.3 defineUpdate, toSql & executeUpdate](#13-defineupdate-tosql--executeupdate)
  - [1.4 defineDelete, toSql & executeDelete](#14-definedelete-tosql--executedelete)
  - [1.5 ExecuteOptions & SqlResult](#15-executeoptions--sqlresult)
- [2. Type-Safe Contexts](#2-type-safe-contexts)
  - [2.1 createSchema](#21-createschema)
  - [2.2 withRowFilters](#22-withrowfilters)
  - [2.3 withContext](#23-withcontext)
- [3. Helper Utilities](#3-helper-utilities)
  - [3.1 createQueryHelpers](#31-createqueryhelpers)

---

## 1. Execution APIs

Tinqer uses a two-step API:

1. **Plan definition** (`define*` functions from `@tinqerjs/tinqer`) - Creates type-safe query plans
2. **Execution or SQL generation** (`execute*` or `toSql` from adapter packages) - Executes plans or generates SQL

Adapter packages live in `@tinqerjs/pg-promise-adapter` (PostgreSQL) and `@tinqerjs/better-sqlite3-adapter` (SQLite).

### 1.1 defineSelect, toSql & executeSelect

Creates SELECT query plans, generates SQL, or executes queries.

**Signatures**

```typescript
// Plan definition (from @tinqerjs/tinqer)
function defineSelect<TSchema, TParams, TRecord>(
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) => Queryable<TRecord> | OrderedQueryable<TRecord>,
  options?: ParseQueryOptions,
): SelectPlanHandle<TRecord, TParams>;

function defineSelect<TSchema, TParams, TResult>(
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) => TerminalQuery<TResult>,
  options?: ParseQueryOptions,
): SelectTerminalHandle<TResult, TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan: SelectPlanHandle<unknown, TParams> | SelectTerminalHandle<unknown, TParams>,
  params: TParams,
): { sql: string; params: Record<string, unknown> };

// Execution (from adapter packages)
async function executeSelect<TSchema, TParams, TQuery>(
  db: PgDatabase | BetterSqlite3Database,
  schema: DatabaseSchema<TSchema>,
  builder: (q: QueryBuilder<TSchema>, params: TParams, helpers: QueryHelpers) => TQuery,
  params: TParams,
  options?: ExecuteOptions & ParseQueryOptions,
): Promise<
  TQuery extends TerminalQuery<infer TResult>
    ? TResult
    : TQuery extends Queryable<infer TRecord> | OrderedQueryable<infer TRecord>
      ? TRecord[]
      : never
>;
```

**Example - SQL Generation**

```typescript
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; age: number };
}

const schema = createSchema<Schema>();

const { sql, params } = toSql(
  defineSelect(schema, (q, params: { minAge: number }) =>
    q
      .from("users")
      .where((u) => u.age >= params.minAge)
      .select((u) => ({ id: u.id, name: u.name })),
  ),
  { minAge: 18 },
);
// sql: SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE "age" >= $(minAge)
// params: { minAge: 18 }
```

**Example - Execution**

```typescript
import { createSchema } from "@tinqerjs/tinqer";
import { executeSelect } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; age: number };
}

const schema = createSchema<Schema>();

const users = await executeSelect(
  db,
  schema,
  (q, params: { minAge: number }) =>
    q
      .from("users")
      .where((u) => u.age >= params.minAge)
      .orderBy((u) => u.name),
  { minAge: 21 },
);
// Returns: Array of user objects
```

**Notes**

- `firstOrDefault` / `singleOrDefault` / `lastOrDefault` return `null` when no rows match.
- `reverse()` flips the effective ordering. If no `orderBy` is present, Tinqer generates `ORDER BY 1 DESC`. `reverse()` after `take()`/`skip()` is not supported.
- `contains(value)` is a terminal operation on scalar queries (use `.select(...)` first). `contains()` is not supported with `take()`/`skip()`.

**Example - reverse()**

```typescript
const newestFirst = defineSelect(schema, (q) =>
  q
    .from("users")
    .orderBy((u) => u.id)
    .reverse(),
);
```

**Example - contains()**

```typescript
const hasUserId = defineSelect(schema, (q, p: { id: number }) =>
  q
    .from("users")
    .select((u) => u.id)
    .contains(p.id),
);
```

### 1.2 defineInsert, toSql & executeInsert

Creates INSERT query plans, generates SQL, or executes queries with optional RETURNING clauses.

**Signatures**

```typescript
// Plan definition (from @tinqerjs/tinqer)
function defineInsert<TSchema, TParams, TTable, TReturning = never>(
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) => Insertable<TTable> | InsertableWithReturning<TTable, TReturning>,
  options?: ParseQueryOptions,
):
  | InsertPlanHandleInitial<TTable, TParams>
  | InsertPlanHandleWithValues<TTable, TParams>
  | InsertPlanHandleWithReturning<TReturning, TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan:
    | InsertPlanHandleInitial<unknown, TParams>
    | InsertPlanHandleWithValues<unknown, TParams>
    | InsertPlanHandleWithReturning<unknown, TParams>,
  params: TParams,
): { sql: string; params: Record<string, unknown> };

// Execution (from adapter packages)
async function executeInsert<TSchema, TTable, TReturning, TParams>(
  db: PgDatabase | BetterSqlite3Database,
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers?: QueryHelpers,
  ) => Insertable<TTable> | InsertableWithReturning<TTable, TReturning>,
  params: TParams,
  options?: ExecuteOptions & ParseQueryOptions,
): Promise<TReturning extends never ? number : TReturning[]>;
```

**Example - SQL Generation**

```typescript
import { createSchema, defineInsert } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string };
}

const schema = createSchema<Schema>();

const { sql, params } = toSql(
  defineInsert(schema, (q, params: { name: string }) =>
    q.insertInto("users").values({ name: params.name }),
  ),
  { name: "Alice" },
);
// sql: INSERT INTO "users" ("name") VALUES ($(name))
// params: { name: "Alice" }
```

**Example - Execution**

```typescript
import { createSchema } from "@tinqerjs/tinqer";
import { executeInsert } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string };
}

const schema = createSchema<Schema>();

// Without RETURNING - returns number of rows inserted
const rowCount = await executeInsert(
  db,
  schema,
  (q, params: { name: string }) => q.insertInto("users").values({ name: params.name }),
  { name: "Alice" },
);

// With RETURNING - returns inserted rows
const createdUsers = await executeInsert(
  db,
  schema,
  (q, params: { name: string }) =>
    q
      .insertInto("users")
      .values({ name: params.name })
      .returning((u) => ({ id: u.id, name: u.name })),
  { name: "Bob" },
);
```

**Example - Upsert (ON CONFLICT)**

```typescript
// PostgreSQL + SQLite: INSERT ... ON CONFLICT
await executeInsert(
  db,
  schema,
  (q, params: { email: string; name: string }) =>
    q
      .insertInto("users")
      .values({ email: params.email, name: params.name })
      .onConflict((u) => u.email)
      .doUpdateSet((_existing, excluded) => ({ name: excluded.name })),
  { email: "alice@example.com", name: "Alice" },
);

// Composite conflict targets are supported:
// .onConflict((u) => u.email, (u) => u.name)
```

### 1.3 defineUpdate, toSql & executeUpdate

Creates UPDATE query plans, generates SQL, or executes queries with optional RETURNING clauses.

**Signatures**

```typescript
// Plan definition (from @tinqerjs/tinqer)
function defineUpdate<TSchema, TParams, TTable, TReturning = never>(
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) =>
    | UpdatableWithSet<TTable>
    | UpdatableComplete<TTable>
    | UpdatableWithReturning<TTable, TReturning>,
  options?: ParseQueryOptions,
):
  | UpdatePlanHandleInitial<TTable, TParams>
  | UpdatePlanHandleWithSet<TTable, TParams>
  | UpdatePlanHandleComplete<TTable, TParams>
  | UpdatePlanHandleWithReturning<TReturning, TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan:
    | UpdatePlanHandleWithSet<unknown, TParams>
    | UpdatePlanHandleComplete<unknown, TParams>
    | UpdatePlanHandleWithReturning<unknown, TParams>,
  params: TParams,
): { sql: string; params: Record<string, unknown> };

// Execution (from adapter packages)
async function executeUpdate<TSchema, TTable, TReturning, TParams>(
  db: PgDatabase | BetterSqlite3Database,
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers?: QueryHelpers,
  ) =>
    | UpdatableWithSet<TTable>
    | UpdatableComplete<TTable>
    | UpdatableWithReturning<TTable, TReturning>,
  params: TParams,
  options?: ExecuteOptions & ParseQueryOptions,
): Promise<TReturning extends never ? number : TReturning[]>;
```

**SET clause**

`.set(...)` supports both direct assignments and column self-references:

```typescript
q.update("users").set({ status: "inactive" });

q.update("users").set((u) => ({ viewCount: u.viewCount + 1 }));
```

Notes:

- The lambda form must return an object literal.
- `.set(...)` can only be called once per UPDATE.

**Example - SQL Generation**

```typescript
import { createSchema, defineUpdate } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; status: string; lastLogin: Date };
}

const schema = createSchema<Schema>();

const { sql, params } = toSql(
  defineUpdate(schema, (q, params: { cutoff: Date }) =>
    q
      .update("users")
      .set({ status: "inactive" })
      .where((u) => u.lastLogin < params.cutoff),
  ),
  { cutoff: new Date("2024-01-01") },
);
// sql: UPDATE "users" SET "status" = 'inactive' WHERE "lastLogin" < $(cutoff)
// params: { cutoff: Date }
```

**Example - Execution**

```typescript
import { createSchema } from "@tinqerjs/tinqer";
import { executeUpdate } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; lastLogin: Date; status: string };
}

const schema = createSchema<Schema>();

// Without RETURNING - returns number of rows updated
const updatedRows = await executeUpdate(
  db,
  schema,
  (q, params: { cutoff: Date }) =>
    q
      .update("users")
      .set({ status: "inactive" })
      .where((u) => u.lastLogin < params.cutoff),
  { cutoff: new Date("2024-01-01") },
);

// With RETURNING - returns updated rows
const updatedUsers = await executeUpdate(
  db,
  schema,
  (q, params: { cutoff: Date }) =>
    q
      .update("users")
      .set({ status: "inactive" })
      .where((u) => u.lastLogin < params.cutoff)
      .returning((u) => ({ id: u.id, status: u.status })),
  { cutoff: new Date("2024-01-01") },
);
```

### 1.4 defineDelete, toSql & executeDelete

Creates DELETE query plans, generates SQL, or executes queries.

**Signatures**

```typescript
// Plan definition (from @tinqerjs/tinqer)
function defineDelete<TSchema, TParams>(
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) => Deletable<unknown> | DeletableComplete<unknown>,
  options?: ParseQueryOptions,
): DeletePlanHandleInitial<unknown, TParams> | DeletePlanHandleComplete<unknown, TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan: DeletePlanHandleInitial<unknown, TParams> | DeletePlanHandleComplete<unknown, TParams>,
  params: TParams,
): { sql: string; params: Record<string, unknown> };

// Execution (from adapter packages)
async function executeDelete<TSchema, TParams>(
  db: PgDatabase | BetterSqlite3Database,
  schema: DatabaseSchema<TSchema>,
  builder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers?: QueryHelpers,
  ) => Deletable<unknown> | DeletableComplete<unknown>,
  params: TParams,
  options?: ExecuteOptions & ParseQueryOptions,
): Promise<number>;
```

**Example - SQL Generation**

```typescript
import { createSchema, defineDelete } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; status: string };
}

const schema = createSchema<Schema>();

const { sql, params } = toSql(
  defineDelete(schema, (q, params: { status: string }) =>
    q.deleteFrom("users").where((u) => u.status === params.status),
  ),
  { status: "inactive" },
);
// sql: DELETE FROM "users" WHERE "status" = $(status)
// params: { status: "inactive" }
```

**Example - Execution**

```typescript
import { createSchema } from "@tinqerjs/tinqer";
import { executeDelete } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; status: string };
}

const schema = createSchema<Schema>();

const deletedCount = await executeDelete(
  db,
  schema,
  (q, params: { status: string }) => q.deleteFrom("users").where((u) => u.status === params.status),
  { status: "inactive" },
);
```

### 1.5 ExecuteOptions & SqlResult

Both adapters expose `ExecuteOptions` and `SqlResult` for inspection and typing.

```typescript
interface ExecuteOptions {
  onSql?: (result: SqlResult<Record<string, unknown>, unknown>) => void;
}

interface SqlResult<TParams, TResult> {
  sql: string;
  params: TParams;
  _resultType?: TResult; // phantom type information
}
```

Use `onSql` for logging, testing, or debugging without changing execution flow.

---

## 2. Type-Safe Contexts

### 2.1 createSchema

Creates a phantom-typed `DatabaseSchema` that ties table names to row types. The schema is passed to execution functions, which provide a type-safe query builder through the lambda's first parameter.

```typescript
import { createSchema } from "@tinqerjs/tinqer";
import { executeSelect } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; email: string };
  posts: { id: number; userId: number; title: string };
}

const schema = createSchema<Schema>();

// Schema is passed to executeSelect, which provides the query builder 'q' parameter
const results = await executeSelect(
  db,
  schema,
  (q) => q.from("users").where((u) => u.email.endsWith("@example.com")),
  {},
);
```

### 2.2 withRowFilters

Attaches row-level predicates to a schema so that SELECT/UPDATE/DELETE operations automatically include them (RLS-like behavior for query generation).

Filters are provided per table, and **all tables must be covered**. For tables that should not be scoped by row filters, use `null`.

```typescript
import { createSchema } from "@tinqerjs/tinqer";

interface Schema {
  users: { id: number; orgId: number; email: string };
  posts: { id: number; orgId: number; title: string };
}

type ScopeContext = { orgId: number };

const baseSchema = createSchema<Schema>();

const rowFilteredSchema = baseSchema.withRowFilters<ScopeContext>({
  users: (u, ctx) => u.orgId === ctx.orgId,
  posts: (p, ctx) => p.orgId === ctx.orgId,
});
```

Notes:

- Row filters are enforced for SELECT/UPDATE/DELETE only (not required for INSERT).
- If a row-filtered schema is used without context binding, it throws (fail closed).
- Unrestricted access is done by using the original/base schema directly.

### 2.3 withContext

Binds a concrete context object to a row-filtered schema (typically per request).

```typescript
const schema = rowFilteredSchema.withContext({ orgId: 7 });
```

Once bound, you can pass the schema to `defineSelect` / `executeSelect` / `toSql` (and the UPDATE/DELETE equivalents) and the policy is applied automatically.

---

## 3. Helper Utilities

### 3.1 createQueryHelpers

Provides helper functions for case-insensitive comparisons and string searches. Helpers are automatically passed as the third parameter to query builder functions.

```typescript
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string };
}

const schema = createSchema<Schema>();

const result = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("users").where((u) => helpers.functions.icontains(u.name, "alice")),
  ),
  {},
);
```

**Available Helper Functions**

Helpers expose the following functions that adapt per database dialect:

- `helpers.functions.iequals(a, b)` - Case-insensitive equality
- `helpers.functions.istartsWith(str, prefix)` - Case-insensitive startsWith
- `helpers.functions.iendsWith(str, suffix)` - Case-insensitive endsWith
- `helpers.functions.icontains(str, substring)` - Case-insensitive contains

**Window Functions**

Helpers also include a window-function builder:

- `helpers.window(row).partitionBy(...).orderBy(...).rowNumber()`
- `helpers.window(row).partitionBy(...).orderByDescending(...).rank()`
- `helpers.window(row).denseRank()`

These are parsed into SQL window functions (they should never run at runtime).

**createQueryHelpers**

You usually do not need to call this directly (adapters provide helpers automatically), but it is exported for custom integrations:

```typescript
import { createQueryHelpers } from "@tinqerjs/tinqer";

const helpers = createQueryHelpers();
```
