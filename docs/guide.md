[← Back to README](../README.md)

# Tinqer Query Operations Guide

Complete reference for all query operations, parameters, and CRUD functionality in Tinqer.

## Table of Contents

- [1. Filtering Operations](#1-filtering-operations)
  - [1.1 Basic Comparison](#11-basic-comparison)
  - [1.2 Multiple Predicates](#12-multiple-predicates)
  - [1.3 Logical Nesting and Arithmetic](#13-logical-nesting-and-arithmetic)
  - [1.4 Null Checks and Null Coalescing](#14-null-checks-and-null-coalescing)
  - [1.5 String Operations](#15-string-operations)
  - [1.6 Case-Insensitive Helpers](#16-case-insensitive-helpers)
  - [1.7 Array Membership (IN)](#17-array-membership-in)
  - [1.8 Combined Filter Example](#18-combined-filter-example)
- [2. Projections](#2-projections)
  - [2.1 Full Row Projection](#21-full-row-projection)
  - [2.2 Object Projection](#22-object-projection)
  - [2.3 Projection with Null Coalescing and Arithmetic](#23-projection-with-null-coalescing-and-arithmetic)
- [3. Ordering](#3-ordering)
  - [3.1 Single Key Ascending](#31-single-key-ascending)
  - [3.2 Mixed Ordering](#32-mixed-ordering)
  - [3.3 Reverse](#33-reverse)
- [4. Distinct Operations](#4-distinct-operations)
- [5. Pagination](#5-pagination)
  - [5.1 Offset/Limit Pattern](#51-offsetlimit-pattern)
  - [5.2 Pagination with Filtering](#52-pagination-with-filtering)
- [6. Joins](#6-joins)
  - [6.1 Simple Inner Join](#61-simple-inner-join)
  - [6.2 Join with Additional Filter](#62-join-with-additional-filter)
  - [6.3 Join with Grouped Results](#63-join-with-grouped-results)
  - [6.4 Left Outer Join](#64-left-outer-join)
  - [6.5 Cross Join](#65-cross-join)
- [7. Grouping and Aggregation](#7-grouping-and-aggregation)
  - [7.1 Basic Grouping](#71-basic-grouping)
  - [7.2 Group with Multiple Aggregates](#72-group-with-multiple-aggregates)
  - [7.3 Group with Post-Filter](#73-group-with-post-filter)
- [8. Window Functions](#8-window-functions)
  - [8.1 ROW_NUMBER](#81-row_number)
  - [8.2 RANK](#82-rank)
  - [8.3 DENSE_RANK](#83-dense_rank)
  - [8.4 Multiple Window Functions](#84-multiple-window-functions)
  - [8.5 Filtering on Window Function Results](#85-filtering-on-window-function-results)
- [9. Scalar Aggregates on Root Queries](#9-scalar-aggregates-on-root-queries)
- [10. Quantifiers](#10-quantifiers)
  - [10.1 Any Operation](#101-any-operation)
  - [10.2 All Operation](#102-all-operation)
  - [10.3 Contains Operation](#103-contains-operation)
- [11. Element Retrieval](#11-element-retrieval)
- [12. Materialisation](#12-materialisation)
- [13. Parameters and Auto-Parameterisation](#13-parameters-and-auto-parameterisation)
  - [13.1 External Parameter Objects](#131-external-parameter-objects)
  - [13.2 Literal Auto-Parameterisation](#132-literal-auto-parameterisation)
  - [13.3 Array Membership](#133-array-membership)
  - [13.4 Case-Insensitive Helper Functions](#134-case-insensitive-helper-functions)
- [14. CRUD Operations](#14-crud-operations)
  - [14.1 INSERT Statements](#141-insert-statements)
  - [14.2 UPDATE Statements](#142-update-statements)
  - [14.3 DELETE Statements](#143-delete-statements)
  - [14.4 Safety Features](#144-safety-features)
  - [14.5 Executing CRUD Operations](#145-executing-crud-operations)
- [15. Query Composition and Reusability](#15-query-composition-and-reusability)
  - [15.1 Chaining Operations on Plans](#151-chaining-operations-on-plans)
  - [15.2 Immutability and Base Queries](#152-immutability-and-base-queries)
  - [15.3 Branching from Base Queries](#153-branching-from-base-queries)
  - [15.4 Parameter Accumulation](#154-parameter-accumulation)
  - [15.5 Composition with All Operations](#155-composition-with-all-operations)
  - [15.6 Practical Patterns](#156-practical-patterns)
- [16. Row Filters](#16-row-filters)
  - [16.1 Basic Usage](#161-basic-usage)
  - [16.2 Per-Operation Filters](#162-per-operation-filters)
  - [16.3 Behavior Notes](#163-behavior-notes)

---

## 1. Filtering Operations

The `where` method applies predicates to filter query results. Multiple `where` calls are combined with AND logic.

### 1.1 Basic Comparison

```typescript
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; age: number; email: string; active: boolean };
}

const schema = createSchema<Schema>();

const adults = toSql(
  defineSelect(schema, (q) => q.from("users").where((u) => u.age >= 18)),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE "age" >= $(__p1)
```

```sql
-- SQLite
SELECT * FROM "users" WHERE "age" >= @__p1
```

```json
{ "__p1": 18 }
```

### 1.2 Multiple Predicates

```typescript
const activeRange = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .where((u) => u.age >= 21)
      .where((u) => u.age <= 60)
      .where((u) => u.active === true),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users"
WHERE "age" >= $(__p1) AND "age" <= $(__p2) AND "active" = $(__p3)
```

```sql
-- SQLite
SELECT * FROM "users"
WHERE "age" >= @__p1 AND "age" <= @__p2 AND "active" = @__p3
```

```json
{ "__p1": 21, "__p2": 60, "__p3": true }
```

### 1.3 Logical Nesting and Arithmetic

```typescript
const premium = toSql(
  defineSelect(schema, (q) =>
    q.from("users").where((u) => (u.salary * 0.9 > 150_000 && u.age < 55) || u.active === false),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users"
WHERE ((("salary" * $(__p1)) > $(__p2) AND "age" < $(__p3)) OR "active" = $(__p4))
```

```sql
-- SQLite
SELECT * FROM "users"
WHERE ((("salary" * @__p1) > @__p2 AND "age" < @__p3) OR "active" = @__p4)
```

```json
{ "__p1": 0.9, "__p2": 150000, "__p3": 55, "__p4": false }
```

### 1.4 Null Checks and Null Coalescing

```typescript
const preferredName = toSql(
  defineSelect(schema, (q) => q.from("users").where((u) => (u.nickname ?? u.name) === "anonymous")),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE COALESCE("nickname", "name") = $(__p1)
```

```sql
-- SQLite
SELECT * FROM "users" WHERE COALESCE("nickname", "name") = @__p1
```

```json
{ "__p1": "anonymous" }
```

### 1.5 String Operations

```typescript
const emailFilters = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .where((u) => u.email.startsWith("admin"))
      .where((u) => u.email.endsWith("@example.com"))
      .where((u) => u.name.toLowerCase() === "john"),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users"
WHERE "email" LIKE $(__p1) || '%'
  AND "email" LIKE '%' || $(__p2)
  AND LOWER("name") = $(__p3)
```

```sql
-- SQLite
SELECT * FROM "users"
WHERE "email" LIKE @__p1 || '%'
  AND "email" LIKE '%' || @__p2
  AND LOWER("name") = @__p3
```

```json
{ "__p1": "admin", "__p2": "@example.com", "__p3": "john" }
```

### 1.6 Case-Insensitive Helpers

```typescript
const insensitive = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("users").where((u) => helpers.functions.iequals(u.name, "ALICE")),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE LOWER("name") = LOWER($(__p1))
```

```sql
-- SQLite
SELECT * FROM "users" WHERE LOWER("name") = LOWER(@__p1)
```

```json
{ "__p1": "ALICE" }
```

### 1.7 Array Membership (IN)

```typescript
const allowed = toSql(
  defineSelect(schema, (q) =>
    q.from("users").where((u) => ["admin", "support", "auditor"].includes(u.role)),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE "role" IN ($(__p1), $(__p2), $(__p3))
```

```sql
-- SQLite
SELECT * FROM "users" WHERE "role" IN (@__p1, @__p2, @__p3)
```

```json
{ "__p1": "admin", "__p2": "support", "__p3": "auditor" }
```

Negating the predicate (`!array.includes(...)`) yields `NOT IN`.

### 1.8 Combined Filter Example

```typescript
const advancedFilter = toSql(
  defineSelect(schema, (q, params: { minAge: number; categories: string[] }, helpers) =>
    q
      .from("users")
      .where((u) => u.age >= params.minAge)
      .where((u) => params.categories.includes(u.departmentId.toString()))
      .where((u) => helpers.functions.icontains(u.email, "company")),
  ),
  { minAge: 25, categories: ["10", "11"] },
);
```

```sql
-- PostgreSQL
SELECT * FROM "users"
WHERE "age" >= $(minAge)
  AND "departmentId" IN ($(categories_0), $(categories_1))
  AND LOWER("email") LIKE '%' || LOWER($(__p1)) || '%'
```

```sql
-- SQLite
SELECT * FROM "users"
WHERE "age" >= @minAge
  AND "departmentId" IN (@categories_0, @categories_1)
  AND LOWER("email") LIKE '%' || LOWER(@__p1) || '%'
```

```json
{
  "minAge": 25,
  "categories": ["10", "11"],
  "categories_0": "10",
  "categories_1": "11",
  "__p1": "company"
}
```

---

## 2. Projections

The `select` method transforms query results by projecting columns or computed expressions.

### 2.1 Full Row Projection

```typescript
const fullRow = toSql(
  defineSelect(schema, (q) => q.from("users")),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users"
```

```sql
-- SQLite
SELECT * FROM "users"
```

### 2.2 Object Projection

```typescript
const summary = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .where((u) => u.active)
      .select((u) => ({
        id: u.id,
        name: u.name,
        contact: {
          email: u.email,
        },
      })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "id" AS "id", "name" AS "name", "email" AS "contact.email" FROM "users" WHERE "active"
```

```sql
-- SQLite
SELECT "id" AS "id", "name" AS "name", "email" AS "contact.email" FROM "users" WHERE "active"
```

### 2.3 Projection with Null Coalescing and Arithmetic

```typescript
interface ProductSchema {
  products: { id: number; name: string; price: number; discount: number | null };
}
const schema = createSchema<ProductSchema>();

const pricing = toSql(
  defineSelect(schema, (q) =>
    q.from("products").select((p) => ({
      id: p.id,
      name: p.name,
      effectivePrice: p.price - (p.discount ?? 0),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "id" AS "id", "name" AS "name", ("price" - COALESCE("discount", $(__p1))) AS "effectivePrice" FROM "products"
```

```sql
-- SQLite
SELECT "id" AS "id", "name" AS "name", ("price" - COALESCE("discount", @__p1)) AS "effectivePrice" FROM "products"
```

```json
{ "__p1": 0 }
```

---

## 3. Ordering

Methods `orderBy`, `orderByDescending`, `thenBy`, and `thenByDescending` control result ordering.

### 3.1 Single Key Ascending

```typescript
const alphabetical = toSql(
  defineSelect(schema, (q) => q.from("users").orderBy((u) => u.name)),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" ORDER BY "name" ASC
```

```sql
-- SQLite
SELECT * FROM "users" ORDER BY "name" ASC
```

### 3.2 Mixed Ordering

```typescript
const ordered = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .orderBy((u) => u.departmentId)
      .thenByDescending((u) => u.salary)
      .thenBy((u) => u.name),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" ORDER BY "departmentId" ASC, "salary" DESC, "name" ASC
```

```sql
-- SQLite
SELECT * FROM "users" ORDER BY "departmentId" ASC, "salary" DESC, "name" ASC
```

### 3.3 Reverse

`reverse()` flips the effective ordering. If an explicit `orderBy`/`thenBy` chain exists, Tinqer inverts the direction of each ordering. If no `orderBy` exists, Tinqer emits `ORDER BY 1 DESC`.

```typescript
const reversed = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .orderBy((u) => u.name)
      .reverse(),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" ORDER BY "name" DESC

-- SQLite
SELECT * FROM "users" ORDER BY "name" DESC
```

> **Note:** `reverse()` after `take()`/`skip()` is not supported. Apply `reverse()` before pagination.

---

## 4. Distinct Operations

```typescript
const departments = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .select((u) => u.departmentId)
      .distinct(),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT DISTINCT "departmentId" AS "departmentId" FROM "users"
```

```sql
-- SQLite
SELECT DISTINCT "departmentId" AS "departmentId" FROM "users"
```

---

## 5. Pagination

Methods `skip` and `take` implement OFFSET and LIMIT clauses.

### 5.1 Offset/Limit Pattern

```typescript
const page = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .orderBy((u) => u.id)
      .skip(30)
      .take(15),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" ORDER BY "id" ASC LIMIT $(__p2) OFFSET $(__p1)
```

```sql
-- SQLite
SELECT * FROM "users" ORDER BY "id" ASC LIMIT @__p2 OFFSET @__p1
```

```json
{ "__p1": 30, "__p2": 15 }
```

### 5.2 Pagination with Filtering

```typescript
const filteredPage = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .where((u) => u.active)
      .orderBy((u) => u.name)
      .skip(50)
      .take(25),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE "active" ORDER BY "name" ASC LIMIT $(__p3) OFFSET $(__p2)
```

```sql
-- SQLite
SELECT * FROM "users" WHERE "active" ORDER BY "name" ASC LIMIT @__p3 OFFSET @__p2
```

```json
{ "__p1": true, "__p2": 50, "__p3": 25 }
```

---

## 6. Joins

The `join` method creates INNER JOIN operations. Left outer joins and cross joins follow the same LINQ patterns used in .NET: `groupJoin` + `selectMany(...defaultIfEmpty())` for left joins, and `selectMany` with a query-returning collection selector for cross joins.

### 6.1 Simple Inner Join

```typescript
interface JoinSchema {
  users: { id: number; name: string; departmentId: number };
  departments: { id: number; name: string };
}
const schema = createSchema<JoinSchema>();

const userDepartments = toSql(
  defineSelect(schema, (q) =>
    q.from("users").join(
      q.from("departments"),
      (u) => u.departmentId,
      (d) => d.id,
      (u, d) => ({ userName: u.name, departmentName: d.name }),
    ),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "t0"."name" AS "userName", "t1"."name" AS "departmentName"
FROM "users" AS "t0"
INNER JOIN "departments" AS "t1" ON "t0"."departmentId" = "t1"."id"
```

```sql
-- SQLite
SELECT "t0"."name" AS "userName", "t1"."name" AS "departmentName"
FROM "users" AS "t0"
INNER JOIN "departments" AS "t1" ON "t0"."departmentId" = "t1"."id"
```

### 6.2 Join with Additional Filter

```typescript
interface OrderSchema {
  users: { id: number; name: string };
  orders: { id: number; userId: number; total: number };
}
const schema = createSchema<OrderSchema>();

const regionOrders = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .where((u) => u.id > 100)
      .join(
        q.from("orders"),
        (u) => u.id,
        (o) => o.userId,
        (u, o) => ({ userName: u.name, total: o.total }),
      )
      .where((row) => row.total > 500),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "t0"."name" AS "userName", "t1"."total" AS "total"
FROM "users" AS "t0"
INNER JOIN "orders" AS "t1" ON "t0"."id" = "t1"."userId"
WHERE "t0"."id" > $(__p1) AND "t1"."total" > $(__p2)
```

```sql
-- SQLite
SELECT "t0"."name" AS "userName", "t1"."total" AS "total"
FROM "users" AS "t0"
INNER JOIN "orders" AS "t1" ON "t0"."id" = "t1"."userId"
WHERE "t0"."id" > @__p1 AND "t1"."total" > @__p2
```

```json
{ "__p1": 100, "__p2": 500 }
```

### 6.3 Join with Grouped Results

```typescript
const totalsByDepartment = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .join(
        q.from("orders"),
        (u) => u.id,
        (o) => o.userId,
        (u, o) => ({ u, o }),
      )
      .groupBy((joined) => joined.u.departmentId)
      .select((g) => ({
        departmentId: g.key,
        totalOrders: g.count(),
        revenue: g.sum((row) => row.o.total),
      })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "t0"."departmentId" AS "departmentId", COUNT(*) AS "totalOrders", SUM("t1"."total") AS "revenue"
FROM "users" AS "t0"
INNER JOIN "orders" AS "t1" ON "t0"."id" = "t1"."userId"
GROUP BY "t0"."departmentId"
```

```sql
-- SQLite
SELECT "t0"."departmentId" AS "departmentId", COUNT(*) AS "totalOrders", SUM("t1"."total") AS "revenue"
FROM "users" AS "t0"
INNER JOIN "orders" AS "t1" ON "t0"."id" = "t1"."userId"
GROUP BY "t0"."departmentId"
```

### 6.4 Left Outer Join

Model the classic LINQ pattern: start with `groupJoin`, then expand the grouped results with `selectMany(...defaultIfEmpty())`. Any missing matches appear as `null` in the projection.

```typescript
const usersWithDepartments = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .groupJoin(
        q.from("departments"),
        (user) => user.departmentId,
        (department) => department.id,
        (user, deptGroup) => ({ user, deptGroup }),
      )
      .selectMany(
        (g) => g.deptGroup.defaultIfEmpty(),
        (g, department) => ({ user: g.user, department }),
      )
      .select((row) => ({
        userId: row.user.id,
        departmentName: row.department ? row.department.name : null,
      })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "t0"."id" AS "userId", CASE WHEN "t1"."id" IS NOT NULL THEN "t1"."name" ELSE NULL END AS "departmentName"
FROM "users" AS "t0"
LEFT OUTER JOIN "departments" AS "t1" ON "t0"."departmentId" = "t1"."id"
```

```sql
-- SQLite
SELECT "t0"."id" AS "userId", CASE WHEN "t1"."id" IS NOT NULL THEN "t1"."name" ELSE NULL END AS "departmentName"
FROM "users" AS "t0"
LEFT OUTER JOIN "departments" AS "t1" ON "t0"."departmentId" = "t1"."id"
```

### 6.5 Cross Join

Return a `Queryable` from the collection selector passed to `selectMany`. Because we skip `defaultIfEmpty`, the parser normalizes the operation into a `CROSS JOIN`.

```typescript
const departmentUsers = toSql(
  defineSelect(schema, (q) =>
    q
      .from("departments")
      .selectMany(
        () => q.from("users"),
        (department, user) => ({ department, user }),
      )
      .select((row) => ({
        departmentId: row.department.id,
        userId: row.user.id,
      })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "t0"."id" AS "departmentId", "t1"."id" AS "userId"
FROM "departments" AS "t0"
CROSS JOIN "users" AS "t1"
```

```sql
-- SQLite
SELECT "t0"."id" AS "departmentId", "t1"."id" AS "userId"
FROM "departments" AS "t0"
CROSS JOIN "users" AS "t1"
```

Right and full outer joins still require manual SQL, mirroring the .NET APIs.

---

## 7. Grouping and Aggregation

The `groupBy` method groups results and enables aggregate functions: `count`, `sum`, `avg`, `min`, `max`.

### 7.1 Basic Grouping

```typescript
const byDepartment = toSql(
  defineSelect(schema, (q) => q.from("users").groupBy((u) => u.departmentId)),
  {},
);
```

```sql
-- PostgreSQL
SELECT "departmentId" FROM "users" GROUP BY "departmentId"
```

```sql
-- SQLite
SELECT "departmentId" FROM "users" GROUP BY "departmentId"
```

### 7.2 Group with Multiple Aggregates

```typescript
const departmentStats = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .groupBy((u) => u.departmentId)
      .select((g) => ({
        departmentId: g.key,
        headcount: g.count(),
        totalSalary: g.sum((u) => u.salary),
        averageSalary: g.avg((u) => u.salary),
        maxSalary: g.max((u) => u.salary),
      }))
      .orderByDescending((row) => row.totalSalary),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "departmentId" AS "departmentId", COUNT(*) AS "headcount", SUM("salary") AS "totalSalary", AVG("salary") AS "averageSalary", MAX("salary") AS "maxSalary"
FROM "users"
GROUP BY "departmentId"
ORDER BY "totalSalary" DESC
```

```sql
-- SQLite
SELECT "departmentId" AS "departmentId", COUNT(*) AS "headcount", SUM("salary") AS "totalSalary", AVG("salary") AS "averageSalary", MAX("salary") AS "maxSalary"
FROM "users"
GROUP BY "departmentId"
ORDER BY "totalSalary" DESC
```

### 7.3 Group with Post-Filter

```typescript
const largeDepartments = await executeSelect(
  db,
  schema,
  (q) =>
    q
      .from("users")
      .groupBy((u) => u.departmentId)
      .select((g) => ({ departmentId: g.key, headcount: g.count() }))
      .where((row) => row.headcount > 5),
  {},
);
```

The adapter emits the `WHERE` on the grouped projection; explicit HAVING clauses are not generated.

---

## 8. Window Functions

Window functions perform calculations across rows related to the current row without collapsing the result set. Tinqer supports `ROW_NUMBER()`, `RANK()`, and `DENSE_RANK()` for ranking operations with optional partitioning and required ordering.

All window functions are accessed via the helpers parameter (second parameter in query builders) and support:

- **`partitionBy(...selectors)`**: Optional partitioning (0 or more selectors)
- **`orderBy(selector)`** / **`orderByDescending(selector)`**: Required ordering (at least one)
- **`thenBy(selector)`** / **`thenByDescending(selector)`**: Additional ordering

### 8.1 ROW_NUMBER

`ROW_NUMBER()` assigns sequential numbers to rows within a partition, starting from 1. The numbering resets for each partition.

```typescript
interface EmployeeSchema {
  employees: { id: number; name: string; department: string; salary: number };
}
const schema = createSchema<EmployeeSchema>();

const rankedEmployees = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("employees").select((e) => ({
      name: e.name,
      department: e.department,
      salary: e.salary,
      rank: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .rowNumber(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "name", "department", "salary",
  ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
FROM "employees"
```

```sql
-- SQLite
SELECT "name", "department", "salary",
  ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
FROM "employees"
```

#### Without Partition

```typescript
interface OrderTimeSchema {
  orders: { id: number; createdAt: Date };
}
const schema = createSchema<OrderTimeSchema>();

const chronological = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("orders").select((o) => ({
      orderId: o.id,
      rowNum: helpers
        .window(o)
        .orderBy((r) => r.createdAt)
        .rowNumber(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL and SQLite
SELECT "id" AS "orderId", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS "rowNum"
FROM "orders"
```

#### Multiple Partitions

```typescript
interface RegionEmployeeSchema {
  employees: { name: string; region: string; department: string; salary: number };
}
const schema = createSchema<RegionEmployeeSchema>();

const multiPartition = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("employees").select((e) => ({
      name: e.name,
      rank: helpers
        .window(e)
        .partitionBy(
          (r) => r.region,
          (r) => r.department,
        )
        .orderByDescending((r) => r.salary)
        .rowNumber(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL and SQLite
SELECT "name",
  ROW_NUMBER() OVER (PARTITION BY "region", "department" ORDER BY "salary" DESC) AS "rank"
FROM "employees"
```

#### Secondary Ordering with thenBy

```typescript
const ranked = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("employees").select((e) => ({
      name: e.name,
      rank: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .thenBy((r) => r.name)
        .rowNumber(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL and SQLite
SELECT "name",
  ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC, "name" ASC) AS "rank"
FROM "employees"
```

### 8.2 RANK

`RANK()` assigns ranks with gaps for tied values. If two rows have the same rank, the next rank skips numbers.

```typescript
const rankedSalaries = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("employees").select((e) => ({
      name: e.name,
      salary: e.salary,
      rank: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .rank(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "name", "salary",
  RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
FROM "employees"
```

```sql
-- SQLite
SELECT "name", "salary",
  RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
FROM "employees"
```

Example result with gaps:

| name  | salary | rank |
| ----- | ------ | ---- |
| Alice | 90000  | 1    |
| Bob   | 90000  | 1    |
| Carol | 85000  | 3    |

Notice rank 2 is skipped because two employees share rank 1.

#### RANK Without Partition

```typescript
interface PlayerSchema {
  players: { name: string; score: number };
}
const schema = createSchema<PlayerSchema>();

const globalRank = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("players").select((p) => ({
      player: p.name,
      score: p.score,
      rank: helpers
        .window(p)
        .orderByDescending((r) => r.score)
        .rank(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL and SQLite
SELECT "name" AS "player", "score", RANK() OVER (ORDER BY "score" DESC) AS "rank"
FROM "players"
```

### 8.3 DENSE_RANK

`DENSE_RANK()` assigns ranks without gaps. Tied values receive the same rank, and the next rank is consecutive.

```typescript
const denseRanked = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("employees").select((e) => ({
      name: e.name,
      salary: e.salary,
      rank: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .denseRank(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "name", "salary",
  DENSE_RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
FROM "employees"
```

```sql
-- SQLite
SELECT "name", "salary",
  DENSE_RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
FROM "employees"
```

Example result without gaps:

| name  | salary | rank |
| ----- | ------ | ---- |
| Alice | 90000  | 1    |
| Bob   | 90000  | 1    |
| Carol | 85000  | 2    |

#### Complex thenBy Chain

```typescript
interface EmployeeAgeSchema {
  employees: { name: string; department: string; salary: number; age: number };
}
const schema = createSchema<EmployeeAgeSchema>();

const complexRanking = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("employees").select((e) => ({
      name: e.name,
      rank: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .thenByDescending((r) => r.age)
        .thenBy((r) => r.name)
        .denseRank(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL and SQLite
SELECT "name",
  DENSE_RANK() OVER (
    PARTITION BY "department"
    ORDER BY "salary" DESC, "age" DESC, "name" ASC
  ) AS "rank"
FROM "employees"
```

### 8.4 Multiple Window Functions

Combine multiple window functions in a single SELECT:

```typescript
const allRankings = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("employees").select((e) => ({
      name: e.name,
      department: e.department,
      salary: e.salary,
      rowNum: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .rowNumber(),
      rank: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .rank(),
      denseRank: helpers
        .window(e)
        .partitionBy((r) => r.department)
        .orderByDescending((r) => r.salary)
        .denseRank(),
    })),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT "name", "department", "salary",
  ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rowNum",
  RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank",
  DENSE_RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "denseRank"
FROM "employees"
```

```sql
-- SQLite
SELECT "name", "department", "salary",
  ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rowNum",
  RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank",
  DENSE_RANK() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "denseRank"
FROM "employees"
```

### 8.5 Filtering on Window Function Results

Window function results can be filtered using `where()` clauses. Tinqer automatically wraps queries in subqueries when window function columns are referenced in WHERE conditions, since SQL does not allow filtering on window functions in the same query level where they're defined.

#### Top-N Per Group

Get the top earner from each department:

```typescript
const topEarners = await executeSelect(
  db,
  schema,
  (q, params, helpers) =>
    q
      .from("employees")
      .select((e) => ({
        ...e,
        rank: helpers
          .window(e)
          .partitionBy((r) => r.department)
          .orderByDescending((r) => r.salary)
          .rowNumber(),
      }))
      .where((r) => r.rank === 1)
      .orderBy((r) => r.department),
  {},
);
```

```sql
-- PostgreSQL (automatically wrapped in subquery)
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
  FROM "employees"
) AS "employees"
WHERE "rank" = 1
ORDER BY "department" ASC
```

```sql
-- SQLite (automatically wrapped in subquery)
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank"
  FROM "employees"
) AS "employees"
WHERE "rank" = 1
ORDER BY "department" ASC
```

#### Top-3 Per Group

Get the top 3 highest-paid employees from a specific department:

```typescript
interface EmployeeDeptSchema {
  employees: { name: string; salary: number; department_id: number };
}
const schema = createSchema<EmployeeDeptSchema>();

const top3Engineering = await executeSelect(
  db,
  schema,
  (q, params: { deptId: number }, helpers) =>
    q
      .from("employees")
      .select((e) => ({
        name: e.name,
        salary: e.salary,
        rank: helpers
          .window(e)
          .partitionBy((r) => r.department_id)
          .orderByDescending((r) => r.salary)
          .rowNumber(),
      }))
      .where((r) => r.rank <= 3 && r.department_id === params.deptId)
      .orderBy((r) => r.rank),
  { deptId: 1 },
);
```

```sql
-- PostgreSQL and SQLite
SELECT * FROM (
  SELECT "name", "salary", "department_id",
    ROW_NUMBER() OVER (PARTITION BY "department_id" ORDER BY "salary" DESC) AS "rank"
  FROM "employees"
) AS "employees"
WHERE "rank" <= 3 AND "department_id" = $(deptId)
ORDER BY "rank" ASC
```

#### Filtering with Spread Operator

The spread operator (`...e`) includes all original columns along with window function results:

```typescript
interface PerformanceSchema {
  employees: { id: number; name: string; performance_score: number };
}
const schema = createSchema<PerformanceSchema>();

const topPerformers = await executeSelect(
  db,
  schema,
  (q, params, helpers) =>
    q
      .from("employees")
      .select((e) => ({
        ...e, // All original columns
        performance_rank: helpers
          .window(e)
          .orderByDescending((r) => r.performance_score)
          .rowNumber(),
      }))
      .where((r) => r.performance_rank <= 10),
  {},
);
```

```sql
-- PostgreSQL and SQLite
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY "performance_score" DESC) AS "performance_rank"
  FROM "employees"
) AS "employees"
WHERE "performance_rank" <= 10
```

#### Combined Filters

Combine window function filters with regular WHERE conditions:

```typescript
interface ActiveEmployeeSchema {
  employees: { name: string; department: string; salary: number; is_active: boolean };
}
const schema = createSchema<ActiveEmployeeSchema>();

const activeTopEarners = await executeSelect(
  db,
  schema,
  (q, params, helpers) =>
    q
      .from("employees")
      .select((e) => ({
        name: e.name,
        department: e.department,
        salary: e.salary,
        is_active: e.is_active,
        dept_rank: helpers
          .window(e)
          .partitionBy((r) => r.department)
          .orderByDescending((r) => r.salary)
          .rowNumber(),
      }))
      .where((r) => r.dept_rank <= 2 && r.is_active === true)
      .orderBy((r) => r.department)
      .thenBy((r) => r.dept_rank),
  {},
);
```

```sql
-- PostgreSQL and SQLite (note: is_active filter can be applied before or after window function)
SELECT * FROM (
  SELECT "name", "department", "salary", "is_active",
    ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "dept_rank"
  FROM "employees"
) AS "employees"
WHERE "dept_rank" <= 2 AND "is_active" = TRUE
ORDER BY "department" ASC, "dept_rank" ASC
```

**Note**: Tinqer automatically detects when WHERE clauses reference window function columns and wraps the query in a subquery. This transformation is transparent—you write natural TypeScript code, and Tinqer generates the correct SQL structure.

**Note**: SQLite window function support requires SQLite 3.25 or later.

---

## 9. Scalar Aggregates on Root Queries

Aggregate methods can be called directly on queries to return single values.

```typescript
const totals = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .where((u) => u.active === true)
      .sum((u) => u.salary),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT SUM("salary") FROM "users" WHERE "active" = $(__p1)
```

```sql
-- SQLite
SELECT SUM("salary") FROM "users" WHERE "active" = @__p1
```

```json
{ "__p1": true }
```

Methods `count`, `average`, `min`, and `max` follow the same structure. The `count` method also accepts a predicate:

```typescript
const activeCount = toSql(
  defineSelect(schema, (q) => q.from("users").count((u) => u.active)),
  {},
);
```

```sql
-- PostgreSQL
SELECT COUNT(*) FROM "users" WHERE "active"
```

```sql
-- SQLite
SELECT COUNT(*) FROM "users" WHERE "active"
```

---

## 10. Quantifiers

Methods `any` and `all` test whether elements satisfy conditions.

### 10.1 Any Operation

```typescript
const hasAdults = toSql(
  defineSelect(schema, (q) => q.from("users").any((u) => u.age >= 18)),
  {},
);
```

```sql
-- PostgreSQL
SELECT CASE WHEN EXISTS(SELECT 1 FROM "users" WHERE "age" >= $(__p1)) THEN 1 ELSE 0 END
```

```sql
-- SQLite
SELECT CASE WHEN EXISTS(SELECT 1 FROM "users" WHERE "age" >= @__p1) THEN 1 ELSE 0 END
```

```json
{ "__p1": 18 }
```

### 10.2 All Operation

The `all` method emits a `NOT EXISTS` check:

```typescript
const allActive = toSql(
  defineSelect(schema, (q) => q.from("users").all((u) => u.active === true)),
  {},
);
```

```sql
-- PostgreSQL
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM "users" WHERE NOT ("active" = $(__p1))) THEN 1 ELSE 0 END
```

```sql
-- SQLite
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM "users" WHERE NOT ("active" = @__p1)) THEN 1 ELSE 0 END
```

---

### 10.3 Contains Operation

`contains(value)` is a terminal operation that returns `true`/`false`. It requires a scalar `.select(...)` projection (for example, `.select((u) => u.id)`), and is not supported with `take()`/`skip()`.

```typescript
const hasId = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .select((u) => u.id)
      .contains(1),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT CASE WHEN EXISTS(SELECT 1 FROM (SELECT "id" AS "__tinqer_value" FROM "users") AS "__tinqer_contains" WHERE "__tinqer_contains"."__tinqer_value" = $(__p1)) THEN 1 ELSE 0 END
```

```sql
-- SQLite
SELECT CASE WHEN EXISTS(SELECT 1 FROM (SELECT "id" AS "__tinqer_value" FROM "users") AS "__tinqer_contains" WHERE "__tinqer_contains"."__tinqer_value" = @__p1) THEN 1 ELSE 0 END
```

```json
{ "__p1": 1 }
```

## 11. Element Retrieval

Methods `first`, `firstOrDefault`, `single`, `singleOrDefault`, `last`, and `lastOrDefault` retrieve single elements.

```typescript
const newestUser = toSql(
  defineSelect(schema, (q) =>
    q
      .from("users")
      .orderBy((u) => u.createdAt)
      .last(),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" ORDER BY "createdAt" DESC LIMIT 1
```

```sql
-- SQLite
SELECT * FROM "users" ORDER BY "createdAt" DESC LIMIT 1
```

- `single` ensures at most one result
- `firstOrDefault` / `singleOrDefault` / `lastOrDefault` return `null` when no rows match
- `last` and `lastOrDefault` reverse ordering (or emit `ORDER BY 1 DESC` when no explicit `orderBy` exists)

---

## 12. Materialisation

Queries are executed directly without requiring a materialization method. The query builder returns results as arrays by default.

```typescript
const activeUsers = await executeSelect(
  db,
  schema,
  (q) =>
    q
      .from("users")
      .where((u) => u.active)
      .orderBy((u) => u.name),
  {},
);
```

The generated SQL matches the entire query chain.

---

## 13. Parameters and Auto-Parameterisation

Tinqer automatically parameterizes all values to prevent SQL injection and enable prepared statements.

### 13.1 External Parameter Objects

```typescript
const filtered = toSql(
  defineSelect(schema, (q, params: { minAge: number; role: string }) =>
    q
      .from("users")
      .where((u) => u.age >= params.minAge)
      .where((u) => u.role === params.role),
  ),
  { minAge: 30, role: "manager" },
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE "age" >= $(minAge) AND "role" = $(role)
```

```sql
-- SQLite
SELECT * FROM "users" WHERE "age" >= @minAge AND "role" = @role
```

```json
{ "minAge": 30, "role": "manager" }
```

Nested properties and array indices are preserved (`params.filters.departments[0]`).

### 13.2 Literal Auto-Parameterisation

```typescript
const autoParams = toSql(
  defineSelect(schema, (q) =>
    q.from("users").where((u) => u.departmentId === 7 && u.name.startsWith("A")),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE "departmentId" = $(__p1) AND "name" LIKE $(__p2) || '%'
```

```sql
-- SQLite
SELECT * FROM "users" WHERE "departmentId" = @__p1 AND "name" LIKE @__p2 || '%'
```

```json
{ "__p1": 7, "__p2": "A" }
```

### 13.3 Array Membership

```typescript
const membership = toSql(
  defineSelect(schema, (q) => q.from("users").where((u) => [1, 2, 3].includes(u.id))),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE "id" IN ($(__p1), $(__p2), $(__p3))
```

```sql
-- SQLite
SELECT * FROM "users" WHERE "id" IN (@__p1, @__p2, @__p3)
```

```json
{ "__p1": 1, "__p2": 2, "__p3": 3 }
```

Parameterized array example:

```typescript
const dynamicMembership = toSql(
  defineSelect(schema, (q, params: { allowed: number[] }) =>
    q.from("users").where((u) => params.allowed.includes(u.id)),
  ),
  { allowed: [5, 8] },
);
```

```json
{ "allowed[0]": 5, "allowed[1]": 8 }
```

### 13.4 Case-Insensitive Helper Functions

```typescript
const ic = toSql(
  defineSelect(schema, (q, params, helpers) =>
    q.from("users").where((u) => helpers.functions.icontains(u.email, "support")),
  ),
  {},
);
```

```sql
-- PostgreSQL
SELECT * FROM "users" WHERE LOWER("email") LIKE '%' || LOWER($(__p1)) || '%'
```

```sql
-- SQLite
SELECT * FROM "users" WHERE LOWER("email") LIKE '%' || LOWER(@__p1) || '%'
```

```json
{ "__p1": "support" }
```

---

## 14. CRUD Operations

Tinqer provides full CRUD support with the same type-safety and lambda expression support as SELECT queries. All CRUD operations follow the same pattern: builder functions return operation chains, statement functions generate SQL, and execute functions run the queries.

### 14.1 INSERT Statements

The `insertInto` function creates INSERT operations. Values are specified using direct object syntax (no lambda wrapping required).

#### Basic INSERT

```typescript
import { createSchema, defineInsert } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; age: number; email: string };
}
const schema = createSchema<Schema>();

// Insert with literal values - direct object syntax
const insert = toSql(
  defineInsert(schema, (q) =>
    q.insertInto("users").values({
      name: "Alice",
      age: 30,
      email: "alice@example.com",
    }),
  ),
  {},
);
```

Generated SQL:

```sql
-- PostgreSQL
INSERT INTO "users" ("name", "age", "email")
VALUES ($(__p1), $(__p2), $(__p3))

-- SQLite
INSERT INTO "users" ("name", "age", "email")
VALUES (@__p1, @__p2, @__p3)
```

#### INSERT with External Parameters

External variables must be passed via the params object - closure variables are not supported:

```typescript
const insert = toSql(
  defineInsert(schema, (q, params: { name: string; age: number }) =>
    q.insertInto("users").values({
      name: params.name,
      age: params.age,
      email: "default@example.com",
    }),
  ),
  { name: "Bob", age: 25 },
);
```

Generated SQL uses external parameters directly:

```sql
INSERT INTO "users" ("name", "age", "email")
VALUES ($(name), $(age), $(__p1))  -- PostgreSQL
VALUES (@name, @age, @__p1)        -- SQLite
```

> **Tip:** When a property in `.values()` evaluates to `undefined`, the column is omitted from the INSERT. Explicit `null` values still emit `NULL`. The insert throws if every value is `undefined`.

#### INSERT Upserts (ON CONFLICT)

Tinqer supports upserts for PostgreSQL and SQLite via `ON CONFLICT`. Conflict targets use **typed column selectors** (no string column names). Composite conflict targets are specified by passing multiple selectors: `.onConflict((u) => u.col1, (u) => u.col2)`.

```typescript
// Ignore duplicates (ON CONFLICT DO NOTHING)
const upsertIgnore = toSql(
  defineInsert(schema, (q, params: { email: string; name: string }) =>
    q
      .insertInto("users")
      .values({ email: params.email, name: params.name })
      .onConflict((u) => u.email)
      .doNothing(),
  ),
  { email: "alice@example.com", name: "Alice" },
);

// Update on conflict (ON CONFLICT DO UPDATE SET ...)
const upsertUpdate = toSql(
  defineInsert(schema, (q, params: { email: string; name: string }) =>
    q
      .insertInto("users")
      .values({ email: params.email, name: params.name })
      .onConflict((u) => u.email)
      .doUpdateSet((_existing, excluded) => ({
        name: excluded.name,
      })),
  ),
  { email: "alice@example.com", name: "Alice" },
);
```

Generated SQL:

```sql
-- PostgreSQL
INSERT INTO "users" ("email", "name")
VALUES ($(email), $(name))
ON CONFLICT ("email") DO NOTHING

INSERT INTO "users" ("email", "name")
VALUES ($(email), $(name))
ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"

-- SQLite
INSERT INTO "users" ("email", "name")
VALUES (@email, @name)
ON CONFLICT ("email") DO NOTHING

INSERT INTO "users" ("email", "name")
VALUES (@email, @name)
ON CONFLICT ("email") DO UPDATE SET "name" = excluded."name"
```

> **Note:** `onConflict(...)` must be followed by either `.doNothing()` or `.doUpdateSet(...)`.

#### INSERT with RETURNING Clause

Both PostgreSQL and SQLite (3.35.0+) support the RETURNING clause to retrieve values from inserted rows:

```typescript
// Return specific columns
const insertWithReturn = toSql(
  defineInsert(schema, (q) =>
    q
      .insertInto("users")
      .values({ name: "Charlie", age: 35 })
      .returning((u) => ({ id: u.id, createdAt: u.createdAt })),
  ),
  {},
);

// Return all columns
const insertReturnAll = toSql(
  defineInsert(
    schema,
    (q) =>
      q
        .insertInto("users")
        .values({ name: "David", age: 40 })
        .returning((u) => u), // Returns *
  ),
  {},
);
```

#### NULL Values in INSERT

```typescript
const insert = toSql(
  defineInsert(schema, (q) =>
    q.insertInto("users").values({
      name: "Eve",
      email: null, // Generates NULL, not parameterized
      phone: undefined, // Column omitted from INSERT
    }),
  ),
  {},
);
```

### 14.2 UPDATE Statements

The `update` function creates UPDATE operations. The `.set()` method accepts either an object literal or an arrow function returning an object literal (to support column self-reference).

#### Basic UPDATE

```typescript
import { createSchema, defineUpdate } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

const schema = createSchema<Schema>();

const updateStmt = toSql(
  defineUpdate(schema, (q) =>
    q
      .update("users")
      .set({ age: 31, lastModified: new Date() })
      .where((u) => u.id === 1),
  ),
  {},
);
```

Generated SQL:

```sql
-- PostgreSQL
UPDATE "users"
SET "age" = $(__p1), "lastModified" = $(__p2)
WHERE "id" = $(__p3)

-- SQLite
UPDATE "users"
SET "age" = @__p1, "lastModified" = @__p2
WHERE "id" = @__p3
```

> **Tip:** If any property in the `.set()` object evaluates to `undefined` (for example because a parameter was omitted), Tinqer simply skips that column. Explicit `null` values still generate `SET column = NULL`. The query builder throws if every assignment resolves to `undefined`.

#### UPDATE with Column Self-Reference

```typescript
const updateStmt = toSql(
  defineUpdate(schema, (q, params: { userId: number; delta: number }) =>
    q
      .update("users")
      .set((u) => ({ view_count: u.view_count + params.delta }))
      .where((u) => u.id === params.userId),
  ),
  { userId: 1, delta: 1 },
);
```

Generated SQL:

```sql
-- PostgreSQL
UPDATE "users"
SET "view_count" = ("view_count" + $(delta))
WHERE "id" = $(userId)

-- SQLite
UPDATE "users"
SET "view_count" = ("view_count" + @delta)
WHERE "id" = @userId
```

#### UPDATE with External Parameters

External variables must be passed via the params object:

```typescript
const updateStmt = toSql(
  defineUpdate(schema, (q, params: { newAge: number }) =>
    q
      .update("users")
      .set({ age: params.newAge })
      .where((u) => u.id === 1),
  ),
  { newAge: 32 },
);
```

#### UPDATE with Complex WHERE

```typescript
const updateStmt = toSql(
  defineUpdate(schema, (q) =>
    q
      .update("users")
      .set({ status: "inactive" })
      .where((u) => u.lastLogin < new Date("2023-01-01") && u.role !== "admin"),
  ),
  {},
);
```

#### UPDATE with RETURNING Clause

```typescript
const updateWithReturn = toSql(
  defineUpdate(schema, (q) =>
    q
      .update("users")
      .set({ age: 32 })
      .where((u) => u.id === 2)
      .returning((u) => ({ id: u.id, age: u.age, updatedAt: u.updatedAt })),
  ),
  {},
);
```

#### Full Table UPDATE (Requires Explicit Permission)

```typescript
// UPDATE without WHERE requires explicit permission
const updateAll = toSql(
  defineUpdate(
    schema,
    (q) => q.update("users").set({ isActive: true }).allowFullTableUpdate(), // Required flag
  ),
  {},
);
```

Without the flag, attempting an UPDATE without WHERE throws an error:

```
Error: UPDATE requires a WHERE clause or explicit allowFullTableUpdate().
Full table updates are dangerous and must be explicitly allowed.
```

### 14.3 DELETE Statements

The `deleteFrom` function creates DELETE operations with optional WHERE conditions.

#### Basic DELETE

```typescript
import { createSchema, defineDelete } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

const schema = createSchema<Schema>();

const del = toSql(
  defineDelete(schema, (q) => q.deleteFrom("users").where((u) => u.age > 100)),
  {},
);
```

Generated SQL:

```sql
DELETE FROM "users" WHERE "age" > $(__p1)  -- PostgreSQL
DELETE FROM "users" WHERE "age" > @__p1    -- SQLite
```

#### DELETE with Complex Conditions

```typescript
const del = toSql(
  defineDelete(schema, (q) =>
    q
      .deleteFrom("users")
      .where((u) => u.isDeleted === true || (u.age < 18 && u.role !== "admin") || u.email === null),
  ),
  {},
);
```

#### DELETE with IN Clause

```typescript
const del = toSql(
  defineDelete(schema, (q, params: { userIds: number[] }) =>
    q.deleteFrom("users").where((u) => params.userIds.includes(u.id)),
  ),
  { userIds: [1, 2, 3, 4, 5] },
);
```

Generated SQL:

```sql
-- PostgreSQL
DELETE FROM "users"
WHERE "id" IN ($(userIds_0), $(userIds_1), $(userIds_2), $(userIds_3), $(userIds_4))

-- SQLite
DELETE FROM "users"
WHERE "id" IN (@userIds_0, @userIds_1, @userIds_2, @userIds_3, @userIds_4)
```

```json
{
  "userIds": [1, 2, 3, 4, 5],
  "userIds_0": 1,
  "userIds_1": 2,
  "userIds_2": 3,
  "userIds_3": 4,
  "userIds_4": 5
}
```

#### Full Table DELETE (Requires Explicit Permission)

```typescript
// DELETE without WHERE requires explicit permission
const deleteAll = toSql(
  defineDelete(schema, (q) => q.deleteFrom("users").allowFullTableDelete()), // Required flag
  {},
);
```

### 14.4 Safety Features

Tinqer includes multiple safety guards for CRUD operations:

#### Mandatory WHERE Clauses

UPDATE and DELETE operations require WHERE clauses by default to prevent accidental full-table operations:

```typescript
// This throws an error
toSql(
  defineDelete(schema, (q) => q.deleteFrom("users")),
  {},
);
// Error: DELETE requires a WHERE clause or explicit allowFullTableDelete()

// This works
toSql(
  defineDelete(schema, (q) => q.deleteFrom("users").allowFullTableDelete()),
  {},
);
```

#### Type Safety

All CRUD operations maintain full TypeScript type safety:

```typescript
interface UserSchema {
  users: { id: number; name: string; email: string | null; age: number };
}
const schema = createSchema<UserSchema>();

// Type error: 'username' doesn't exist on users table
toSql(
  defineInsert(schema, (q) =>
    q.insertInto("users").values({
      username: "Alice", // ❌ Type error
    }),
  ),
  {},
);

// Type error: age must be number
toSql(
  defineUpdate(schema, (q) =>
    q.update("users").set({
      age: "30", // ❌ Type error - must be number
    }),
  ),
  {},
);
```

#### Parameter Sanitization

All values are automatically parameterized to prevent SQL injection:

```typescript
const maliciousName = "'; DROP TABLE users; --";
const insert = toSql(
  defineInsert(schema, (q) =>
    q.insertInto("users").values({
      name: maliciousName, // Safely parameterized
    }),
  ),
  {},
);
// Generates: INSERT INTO "users" ("name") VALUES ($(__p1))
// Parameters: { __p1: "'; DROP TABLE users; --" }
```

### 14.5 Executing CRUD Operations

The adapter packages provide execution functions for all CRUD operations:

#### PostgreSQL (pg-promise)

```typescript
import { createSchema } from "@tinqerjs/tinqer";
import { executeInsert, executeUpdate, executeDelete } from "@tinqerjs/pg-promise-adapter";

const schema = createSchema<Schema>();

// Execute INSERT with RETURNING
const insertedUsers = await executeInsert(
  db,
  schema,
  (q) =>
    q
      .insertInto("users")
      .values({ name: "Frank", age: 28 })
      .returning((u) => ({ id: u.id, name: u.name })),
  {},
);
// Returns: [{ id: 123, name: "Frank" }]

// Execute UPDATE - returns affected row count
const updateCount = await executeUpdate(
  db,
  schema,
  (q) =>
    q
      .update("users")
      .set({ age: 29 })
      .where((u) => u.id === 123),
  {},
);
// Returns number of affected rows

// Execute DELETE - returns affected row count
const deleteCount = await executeDelete(
  db,
  schema,
  (q) => q.deleteFrom("users").where((u) => u.id === 123),
  {},
);
```

#### SQLite (better-sqlite3)

```typescript
import { createSchema } from "@tinqerjs/tinqer";
import { executeInsert, executeUpdate, executeDelete } from "@tinqerjs/better-sqlite3-adapter";

const schema = createSchema<Schema>();

// Execute INSERT - returns row count
const insertCount = executeInsert(
  db,
  schema,
  (q) => q.insertInto("users").values({ name: "Grace", age: 30 }),
  {},
);
// Returns number of inserted rows

// Execute UPDATE - returns row count
const updateCount = executeUpdate(
  db,
  schema,
  (q) =>
    q
      .update("users")
      .set({ age: 33 })
      .where((u) => u.name === "Henry"),
  {},
);

// Execute DELETE - returns row count
const deleteCount = executeDelete(
  db,
  schema,
  (q) => q.deleteFrom("users").where((u) => u.age > 100),
  {},
);
```

SQLite helpers always return the number of affected rows. To inspect row data after an insert or update, run a follow-up SELECT query using `executeSelect`.

#### Transaction Support

Both adapters support transactions through their respective database drivers:

```typescript
interface TxSchema {
  users: { id: number; name: string; lastLogin: Date };
  user_logs: { userId: number; action: string };
}
const schema = createSchema<TxSchema>();

// PostgreSQL transactions
await db.tx(async (t) => {
  const users = await executeInsert(
    t,
    schema,
    (q) =>
      q
        .insertInto("users")
        .values({ name: "Ivy" })
        .returning((u) => u.id),
    {},
  );

  await executeInsert(
    t,
    schema,
    (q) =>
      q.insertInto("user_logs").values({
        userId: users[0]!.id,
        action: "created",
      }),
    {},
  );
});

// SQLite transactions
const transaction = sqliteDb.transaction(() => {
  executeInsert(db, schema, (q) => q.insertInto("users").values({ name: "Jack" }), {});
  executeUpdate(
    db,
    schema,
    (q) =>
      q
        .update("users")
        .set({ lastLogin: new Date() })
        .where((u) => u.name === "Jack"),
    {},
  );
});
transaction();
```

---

## 15. Query Composition and Reusability

Tinqer query plans are **immutable and composable**. Plan handles returned by `define*` functions support method chaining - each operation returns a new plan without modifying the original. This enables powerful query composition patterns: reusable base queries, branching specialized variations, and parameter accumulation.

### 15.1 Chaining Operations on Plans

All plan handles support chaining operations like `where()`, `orderBy()`, `select()`, etc.:

```typescript
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

interface Schema {
  users: { id: number; name: string; age: number; isActive: boolean };
}

const schema = createSchema<Schema>();

// Chain operations on the plan handle
const plan = defineSelect(schema, (q) => q.from("users"))
  .where((u) => u.age > 18)
  .where((u) => u.isActive === true)
  .orderBy((u) => u.name)
  .select((u) => ({ id: u.id, name: u.name }));

const { sql, params } = toSql(plan, {});
// SELECT "id" AS "id", "name" AS "name" FROM "users"
// WHERE "age" > $(__p1) AND "isActive" = $(__p2)
// ORDER BY "name" ASC
```

### 15.2 Immutability and Base Queries

Plans are immutable - calling a method returns a **new plan** without modifying the original:

```typescript
const basePlan = defineSelect(schema, (q) => q.from("users"));

const withAge = basePlan.where((u) => u.age > 18);
const withStatus = basePlan.where((u) => u.isActive === true);

// basePlan is unchanged
// withAge and withStatus are independent plans
```

This immutability enables creating **reusable base queries**:

```typescript
interface Schema {
  orders: {
    id: number;
    userId: number;
    total: number;
    status: string;
    createdAt: Date;
  };
}

const schema = createSchema<Schema>();

// Reusable base query
type UserOrdersParams = { userId: number };

const userOrders = defineSelect(schema, (q, p: UserOrdersParams) =>
  q
    .from("orders")
    .where((o) => o.userId === p.userId)
    .orderBy((o) => o.createdAt),
);

// Use the base query in different contexts
const recentUserOrders = userOrders.take(10);
const highValueUserOrders = userOrders.where((o) => o.total > 1000);

// Execute with parameters
toSql(recentUserOrders, { userId: 42 });
toSql(highValueUserOrders, { userId: 42 });
```

### 15.3 Branching from Base Queries

Since plans are immutable, you can branch multiple specialized queries from a single base:

```typescript
interface Schema {
  users: {
    id: number;
    name: string;
    age: number;
    isActive: boolean;
    departmentId: number;
  };
}

const schema = createSchema<Schema>();

type DeptParams = { departmentId: number };

// Base query: users in a department
const usersInDept = defineSelect(schema, (q, p: DeptParams) =>
  q.from("users").where((u) => u.departmentId === p.departmentId),
);

// Branch 1: Active users only
const activeUsersInDept = usersInDept
  .where((u) => u.isActive === true)
  .where<{ minAge: number }>((u, p) => u.age >= p.minAge)
  .orderBy((u) => u.name);

// Branch 2: Inactive users only
const inactiveUsersInDept = usersInDept
  .where((u) => u.isActive === false)
  .where<{ maxAge: number }>((u, p) => u.age <= p.maxAge)
  .orderBy((u) => u.age);

// Branch 3: Senior staff
const seniorStaffInDept = usersInDept
  .where((u) => u.age >= 50)
  .select((u) => ({ id: u.id, name: u.name, age: u.age }));

// Execute branches with different parameters
toSql(activeUsersInDept, { departmentId: 1, minAge: 25 });
toSql(inactiveUsersInDept, { departmentId: 1, maxAge: 65 });
toSql(seniorStaffInDept, { departmentId: 1 });
```

### 15.4 Parameter Accumulation

Parameters from the builder function and chained operations are **merged automatically**:

```typescript
interface Schema {
  products: {
    id: number;
    name: string;
    price: number;
    category: string;
    inStock: boolean;
  };
}

const schema = createSchema<Schema>();

// Builder function defines initial params
type BuilderParams = { category: string };

const plan = defineSelect(schema, (q, p: BuilderParams) =>
  q.from("products").where((prod) => prod.category === p.category),
);

// Chained operations add more params
type ChainParams1 = { minPrice: number };
type ChainParams2 = { maxPrice: number };

const refinedPlan = plan
  .where<ChainParams1>((prod, p) => prod.price >= p.minPrice)
  .where<ChainParams2>((prod, p) => prod.price <= p.maxPrice)
  .where((prod) => prod.inStock === true);

// Must provide ALL accumulated parameters
const { sql, params } = toSql(refinedPlan, {
  category: "electronics",
  minPrice: 100,
  maxPrice: 1000,
});

// params contains: { category, minPrice, maxPrice, __p1: true }
```

**Type safety**: TypeScript enforces that all accumulated parameters are provided at execution time.

### 15.5 Composition with All Operations

Composition works with all CRUD operations, not just SELECT:

#### INSERT Composition

```typescript
interface Schema {
  posts: {
    id: number;
    userId: number;
    title: string;
    content: string;
    isPublished: boolean;
  };
}

const schema = createSchema<Schema>();

const insertPost = defineInsert(schema, (q) => q.insertInto("posts"))
  .values({
    userId: 1,
    title: "My Post",
    content: "Post content",
    isPublished: false,
  })
  .returning((p) => ({ id: p.id, title: p.title }));

toSql(insertPost, {});
```

#### UPDATE Composition

```typescript
const updatePlan = defineUpdate(schema, (q) => q.update("posts"))
  .set({ isPublished: true })
  .where<{ minViews: number }>((p, params) => p.viewCount > params.minViews)
  .returning((p) => p.id);

toSql(updatePlan, { minViews: 1000 });
```

#### DELETE Composition

```typescript
const deletePlan = defineDelete(schema, (q) => q.deleteFrom("posts"))
  .where((p) => p.isPublished === false)
  .where<{ beforeDate: Date }>((p, params) => p.createdAt < params.beforeDate);

toSql(deletePlan, { beforeDate: new Date("2024-01-01") });
```

### 15.6 Practical Patterns

#### Pattern 1: Pagination Helper

```typescript
interface Schema {
  articles: {
    id: number;
    title: string;
    createdAt: Date;
    viewCount: number;
  };
}

const schema = createSchema<Schema>();

type PageParams = { page: number; pageSize: number };

function paginate<TPlan extends { skip: Function; take: Function }>(
  plan: TPlan,
  page: number,
  pageSize: number,
): TPlan {
  return plan.skip((page - 1) * pageSize).take(pageSize) as TPlan;
}

const allArticles = defineSelect(schema, (q) => q.from("articles").orderBy((a) => a.createdAt));

// Page 1
const page1 = paginate(allArticles, 1, 20);
toSql(page1, {});

// Page 2
const page2 = paginate(allArticles, 2, 20);
toSql(page2, {});
```

#### Pattern 2: Common Filters

```typescript
const activeArticles = defineSelect(schema, (q) =>
  q.from("articles").where((a) => a.isActive === true),
);

const popularActiveArticles = activeArticles.where((a) => a.viewCount > 1000);

const recentActiveArticles = activeArticles
  .where<{ since: Date }>((a, p) => a.createdAt >= p.since)
  .orderBy((a) => a.createdAt);

toSql(popularActiveArticles, {});
toSql(recentActiveArticles, { since: new Date("2024-01-01") });
```

#### Pattern 3: Repository Pattern

```typescript
class UserRepository {
  private baseQuery = defineSelect(schema, (q) => q.from("users"));

  findActive() {
    return this.baseQuery.where((u) => u.isActive === true);
  }

  findByDepartment(deptId: number) {
    return this.baseQuery.where((u) => u.departmentId === deptId);
  }

  findActiveInDepartment(deptId: number) {
    return this.findActive().where((u) => u.departmentId === deptId);
  }
}

const repo = new UserRepository();
toSql(repo.findActive(), {});
toSql(repo.findActiveInDepartment(5), {});
```

**Key Takeaway**: Query composition enables building reusable, composable query fragments that can be combined and specialized without duplication.

---

## 16. Row Filters

Row filters let you attach row-level predicates to a schema so that SELECT/UPDATE/DELETE automatically include them. This is useful for authorization scoping, and can provide an RLS-like safety net even on databases without native RLS support.

### 16.1 Basic Usage

```typescript
import { createSchema } from "@tinqerjs/tinqer";

interface Schema {
  users: { id: number; orgId: number; email: string };
  posts: { id: number; orgId: number; title: string };
}

type ScopeContext = { orgId: number };

const dangerousUnrestrictedSchema = createSchema<Schema>();

const rowFilteredSchema = dangerousUnrestrictedSchema.withRowFilters<ScopeContext>({
  users: (u, ctx) => u.orgId === ctx.orgId,
  posts: (p, ctx) => p.orgId === ctx.orgId,
});

const schema = rowFilteredSchema.withContext({ orgId: 7 });
```

Use `schema` anywhere you would normally pass a `DatabaseSchema` (execution or plan APIs). Any SELECT/UPDATE/DELETE built from it will include the filter automatically.

### 16.2 Per-Operation Filters

You can define different filters per operation, or disable filtering for a specific table by using `null`.

```typescript
const schemaWithPolicies = dangerousUnrestrictedSchema.withRowFilters<ScopeContext>({
  users: {
    select: (u, ctx) => u.orgId === ctx.orgId,
    update: (u, ctx) => u.orgId === ctx.orgId,
    delete: (u, ctx) => u.orgId === ctx.orgId,
  },
  posts: (p, ctx) => p.orgId === ctx.orgId,
});
```

### 16.3 Behavior Notes

- Row filters are enforced for SELECT/UPDATE/DELETE only (not required for INSERT).
- Row-filtered schemas require `.withContext(...)` before SELECT/UPDATE/DELETE; otherwise query generation throws (fail closed).
- For left joins, row filters are applied inside derived tables to preserve outer join semantics.
- For updates, an additional safety predicate is applied so updates can’t “move” a row outside of the allowed filter scope via SET.

[← Back to README](../README.md)
