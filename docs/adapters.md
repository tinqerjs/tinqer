[← Back to README](../README.md)

# Database Adapters

Tinqer ships dedicated adapters for PostgreSQL (`@tinqerjs/pg-promise-adapter`) and SQLite (`@tinqerjs/better-sqlite3-adapter`). Both share the same builder APIs while handling dialect-specific SQL generation and parameter formatting.

## Table of Contents

- [1. PostgreSQL Adapter](#1-postgresql-adapter)
  - [1.1 Installation](#11-installation)
  - [1.2 Setup & Query Execution](#12-setup--query-execution)
  - [1.3 PostgreSQL Dialect Notes](#13-postgresql-dialect-notes)
- [2. SQLite Adapter](#2-sqlite-adapter)
  - [2.1 Installation](#21-installation)
  - [2.2 Setup & Query Execution](#22-setup--query-execution)
  - [2.3 SQLite Dialect Notes](#23-sqlite-dialect-notes)
- [3. Key Differences](#3-key-differences)
  - [3.1 Parameter Placeholders](#31-parameter-placeholders)
  - [3.2 Data Types](#32-data-types)
  - [3.3 Case-Insensitive Matching](#33-case-insensitive-matching)
  - [3.4 RETURNING Behaviour](#34-returning-behaviour)

---

## 1. PostgreSQL Adapter

### 1.1 Installation

```bash
npm install @tinqerjs/pg-promise-adapter pg-promise
```

### 1.2 Setup & Query Execution

```typescript
import pgPromise from "pg-promise";
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import {
  executeSelect,
  executeInsert,
  executeUpdate,
  executeDelete,
  toSql,
} from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; email: string; age: number; active: boolean };
}

const pgp = pgPromise();
const db = pgp("postgresql://user:pass@localhost:5432/mydb");
const schema = createSchema<Schema>();

// Execute with params
const activeUsers = await executeSelect(
  db,
  schema,
  (q, params: { minAge: number }) =>
    q
      .from("users")
      .where((u) => u.active && u.age >= params.minAge)
      .orderBy((u) => u.name),
  { minAge: 18 },
);

// Execute with params
const matchingUsers = await executeSelect(
  db,
  schema,
  (q, params: { minAge: number }) =>
    q
      .from("users")
      .where((u) => u.age >= params.minAge)
      .select((u) => ({ id: u.id, name: u.name })),
  { minAge: 21 },
);

// INSERT with RETURNING
const createdUsers = await executeInsert(
  db,
  schema,
  (q) =>
    q
      .insertInto("users")
      .values({ name: "Alice", email: "alice@example.com", age: 30, active: true })
      .returning((u) => ({ id: u.id, createdAt: u.createdAt })),
  {},
);

// UPDATE
const updatedCount = await executeUpdate(
  db,
  schema,
  (q) =>
    q
      .update("users")
      .set({ active: false })
      .where((u) => u.age > 65),
  {},
);

// DELETE
const deletedCount = await executeDelete(
  db,
  schema,
  (q) => q.deleteFrom("users").where((u) => !u.active),
  {},
);

// Generate SQL without executing
const { sql, params } = toSql(
  defineSelect(schema, (q) => q.from("users").where((u) => u.email.endsWith("@example.com"))),
  {},
);
```

### 1.3 PostgreSQL Dialect Notes

- Booleans map to `BOOLEAN` values (`true`/`false`).
- Case-insensitive helper functions generate `LOWER()` comparisons for portable SQL.
- RETURNING clauses are fully supported on INSERT, UPDATE, and DELETE through the execution helpers.
- Parameter placeholders use the `$()` syntax expected by pg-promise (e.g., `$(minAge)`).
- Window functions (`ROW_NUMBER()`, `RANK()`, `DENSE_RANK()`) are fully supported.
- Full-text search (via [`withFts`](guide.md#17-full-text-search)) emits `tsvector @@ tsquery` for `helpers.fts.match` and `ts_rank(...)` for `helpers.fts.rank`. The vector is an inline `to_tsvector(config, …)` over the declared columns, or a stored, GIN-indexed column when `pg.vector` is set; `mode` selects the `*_tsquery` function (`websearch`/`plain`/`phrase`/`raw`). Create the GIN index yourself.

---

## 2. SQLite Adapter

### 2.1 Installation

```bash
npm install @tinqerjs/better-sqlite3-adapter better-sqlite3
```

### 2.2 Setup & Query Execution

```typescript
import Database from "better-sqlite3";
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import {
  executeSelect,
  executeInsert,
  executeUpdate,
  executeDelete,
  toSql,
} from "@tinqerjs/better-sqlite3-adapter";

interface Schema {
  users: { id: number; name: string; email: string; age: number; isActive: number };
}

const db = new Database(":memory:");
const schema = createSchema<Schema>();

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    age INTEGER,
    isActive INTEGER NOT NULL DEFAULT 1
  );
`);

const inserted = executeInsert(
  db,
  schema,
  (q) => q.insertInto("users").values({ name: "Sam", email: "sam@example.com", age: 28 }),
  {},
);
// inserted === 1

const users = executeSelect(
  db,
  schema,
  (q, params: { active: number }) =>
    q
      .from("users")
      .where((u) => u.isActive === params.active)
      .orderBy((u) => u.name),
  { active: 1 },
);

const updated = executeUpdate(
  db,
  schema,
  (q) =>
    q
      .update("users")
      .set({ isActive: 0 })
      .where((u) => u.age > 60),
  {},
);

const removed = executeDelete(
  db,
  schema,
  (q, params: { cutoff: number }) => q.deleteFrom("users").where((u) => u.age < params.cutoff),
  { cutoff: 18 },
);

// Need the SQL text for custom execution?
const { sql, params } = toSql(
  defineSelect(schema, (q) => q.from("users").where((u) => u.name.startsWith("S"))),
  {},
);
const rows = db.prepare(sql).all(params);
```

### 2.3 SQLite Dialect Notes

- SQLite has no native boolean type; represent booleans as `INTEGER` 0/1 in your schema.
- All parameters are passed as named values (e.g., `@__p1`, `@minAge`). The adapter converts booleans and dates to SQLite-friendly values automatically.
- The execution helpers return row counts. SQLite currently ignores RETURNING clauses when running through the helpers; use a follow-up SELECT if you need inserted rows.
- Window functions (`ROW_NUMBER()`, `RANK()`, `DENSE_RANK()`) require **SQLite 3.25 or later**.
- Full-text search (via [`withFts`](guide.md#17-full-text-search)) targets an **FTS5 virtual table** you create (`sqlite.table`). `helpers.fts.match` emits `<key> IN (SELECT rowid FROM <fts> WHERE <fts> MATCH @q)`; `helpers.fts.rank` emits a correlated `-bm25(<fts>)` subquery (negated so higher = more relevant). The PostgreSQL-only `mode`/`config` options are ignored; the FTS5 query string is used as-is.

---

## 3. Key Differences

### 3.1 Parameter Placeholders

| Database   | Placeholder Format    | Example                    |
| ---------- | --------------------- | -------------------------- |
| PostgreSQL | `$(name)` / `$(__p1)` | `WHERE "age" >= $(minAge)` |
| SQLite     | `@name` / `@__p1`     | `WHERE "age" >= @minAge`   |

### 3.2 Data Types

| Type      | PostgreSQL                 | SQLite                           | Schema Recommendation                 |
| --------- | -------------------------- | -------------------------------- | ------------------------------------- |
| Boolean   | `BOOLEAN` (`true`/`false`) | `INTEGER` (0/1)                  | `boolean` for PG, `number` for SQLite |
| Integer   | `INTEGER`, `BIGINT`        | `INTEGER`                        | `number` or `bigint`                  |
| Decimal   | `NUMERIC`, `DECIMAL`       | `REAL`                           | `number`                              |
| String    | `TEXT`, `VARCHAR`          | `TEXT`                           | `string`                              |
| Date/Time | `TIMESTAMP`, `DATE`        | `TEXT` / `INTEGER` (ISO strings) | `Date` or `string`                    |
| JSON      | `JSONB`, `JSON`            | `TEXT` (with JSON functions)     | `unknown` / structured type           |

### 3.3 Case-Insensitive Matching

Use query helpers for portable case-insensitive comparisons:

```typescript
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; email: string };
}

const schema = createSchema<Schema>();

const { sql } = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("users").where((u) => helpers.functions.icontains(u.name, "alice")),
  ),
  {},
);
// PostgreSQL: WHERE LOWER("name") LIKE '%' || LOWER($(__p1)) || '%'
// SQLite: WHERE LOWER("name") LIKE '%' || LOWER(@__p1) || '%'
```

### 3.4 RETURNING Behaviour

- **PostgreSQL**: `executeInsert`, `executeUpdate`, and `executeDelete` return the projected values when a `.returning()` clause is present.
- **SQLite**: `executeInsert`, `executeUpdate`, and `executeDelete` return the row count. To inspect affected rows, issue a follow-up SELECT.
