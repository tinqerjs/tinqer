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
function defineSelect<TSchema, TParams, TResult>(
  schema: DatabaseSchema<TSchema>,
  queryBuilder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) => Queryable<TResult> | OrderedQueryable<TResult> | TerminalQuery<TResult>,
  paramDefaults?: TParams,
): SelectPlanHandle<TResult, TParams> | SelectTerminalHandle<TResult, TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan: SelectPlanHandle<unknown, TParams> | SelectTerminalHandle<unknown, TParams>,
  params: TParams,
): { sql: string; params: TParams & Record<string, unknown> };

// Execution (from adapter packages)
async function executeSelect<TResult, TParams>(
  db: PgDatabase | BetterSqlite3Database,
  plan: SelectPlanHandle<TResult, TParams> | SelectTerminalHandle<TResult, TParams>,
  params: TParams,
  options?: ExecuteOptions,
): Promise<TResult[] | TResult>;
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

### 1.2 defineInsert, toSql & executeInsert

Creates INSERT query plans, generates SQL, or executes queries with optional RETURNING clauses.

**Signatures**

```typescript
// Plan definition (from @tinqerjs/tinqer)
function defineInsert<TSchema, TParams, TTable, TReturning = never>(
  schema: DatabaseSchema<TSchema>,
  queryBuilder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) => Insertable<TTable> | InsertableWithReturning<TTable, TReturning>,
  paramDefaults?: TParams,
): InsertPlanHandle<TTable, TReturning, TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan: InsertPlanHandle<unknown, unknown, TParams>,
  params: TParams,
): { sql: string; params: TParams & Record<string, unknown> };

// Execution (from adapter packages)
async function executeInsert<TTable, TReturning, TParams>(
  db: PgDatabase | BetterSqlite3Database,
  plan: InsertPlanHandle<TTable, TReturning, TParams>,
  params: TParams,
  options?: ExecuteOptions,
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

### 1.3 defineUpdate, toSql & executeUpdate

Creates UPDATE query plans, generates SQL, or executes queries with optional RETURNING clauses.

**Signatures**

```typescript
// Plan definition (from @tinqerjs/tinqer)
function defineUpdate<TSchema, TParams, TTable, TReturning = never>(
  schema: DatabaseSchema<TSchema>,
  queryBuilder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) =>
    | UpdatableWithSet<TTable>
    | UpdatableComplete<TTable>
    | UpdatableWithReturning<TTable, TReturning>,
  paramDefaults?: TParams,
): UpdatePlanHandle<TTable, TReturning, TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan: UpdatePlanHandle<unknown, unknown, TParams>,
  params: TParams,
): { sql: string; params: TParams & Record<string, unknown> };

// Execution (from adapter packages)
async function executeUpdate<TTable, TReturning, TParams>(
  db: PgDatabase | BetterSqlite3Database,
  plan: UpdatePlanHandle<TTable, TReturning, TParams>,
  params: TParams,
  options?: ExecuteOptions,
): Promise<TReturning extends never ? number : TReturning[]>;
```

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
  queryBuilder: (
    q: QueryBuilder<TSchema>,
    params: TParams,
    helpers: QueryHelpers,
  ) => Deletable<unknown> | DeletableComplete<unknown>,
  paramDefaults?: TParams,
): DeletePlanHandle<TParams>;

// SQL generation (from adapter packages)
function toSql<TParams>(
  plan: DeletePlanHandle<TParams>,
  params: TParams,
): { sql: string; params: TParams & Record<string, unknown> };

// Execution (from adapter packages)
async function executeDelete<TParams>(
  db: PgDatabase | BetterSqlite3Database,
  plan: DeletePlanHandle<TParams>,
  params: TParams,
  options?: ExecuteOptions,
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

type PermisoContext = { orgId: number };

const baseSchema = createSchema<Schema>();

const permisoSchema = baseSchema.withRowFilters<PermisoContext>({
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
const schema = permisoSchema.withContext({ orgId: 7 });
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

- `ilike(field, pattern)` - Case-insensitive LIKE comparison
- `contains(field, substring)` - Check if field contains substring (case-sensitive)
- `icontains(field, substring)` - Check if field contains substring (case-insensitive)
- `startsWith(field, prefix)` - Check if field starts with prefix (case-sensitive)
- `istartsWith(field, prefix)` - Check if field starts with prefix (case-insensitive)
- `endsWith(field, suffix)` - Check if field ends with suffix (case-sensitive)
- `iendsWith(field, suffix)` - Check if field ends with suffix (case-insensitive)

**Creating Custom Helpers**

You can create helpers with custom functions:

```typescript
const helpers = createQueryHelpers<Schema>();
// Use helpers in your queries through the third parameter
```
