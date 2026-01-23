/**
 * Tests for INSERT statement generation (SQLite)
 */

import { describe, it } from "mocha";
import { strict as assert } from "assert";
import { defineInsert } from "@tinqerjs/tinqer";
import { toSql } from "../dist/index.js";
import { schema } from "./test-schema.js";

describe("INSERT Statement Generation (SQLite)", () => {
  describe("Basic INSERT", () => {
    it("should generate INSERT with all columns using @param format", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("users").values({
            name: "Alice",
            age: 30,
            email: "alice@example.com",
          }),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "email") VALUES (@__p1, @__p2, @__p3)`,
      );
      assert.deepEqual(result.params, {
        __p1: "Alice",
        __p2: 30,
        __p3: "alice@example.com",
      });
    });

    it("should generate INSERT with partial columns", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("users").values({
            name: "Bob",
            age: 25,
          }),
        ),
        {},
      );

      assert.equal(result.sql, `INSERT INTO "users" ("name", "age") VALUES (@__p1, @__p2)`);
      assert.deepEqual(result.params, {
        __p1: "Bob",
        __p2: 25,
      });
    });

    it("should generate INSERT with schema prefix in table name", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("user_accounts").values({
            username: "Charlie",
          }),
        ),
        {},
      );

      assert.equal(result.sql, `INSERT INTO "user_accounts" ("username") VALUES (@__p1)`);
    });
  });

  describe("INSERT with parameters", () => {
    it("should use external parameters", () => {
      const result = toSql(
        defineInsert(schema, (q, p: { name: string; age: number }) =>
          q.insertInto("users").values({
            name: p.name,
            age: p.age,
          }),
        ),
        { name: "David", age: 40 },
      );

      assert.equal(result.sql, `INSERT INTO "users" ("name", "age") VALUES (@name, @age)`);
      assert.deepEqual(result.params, {
        name: "David",
        age: 40,
      });
    });

    it("should mix external parameters with literals", () => {
      const result = toSql(
        defineInsert(schema, (q, p: { name: string }) =>
          q.insertInto("users").values({
            name: p.name,
            age: 25,
            email: "default@example.com",
          }),
        ),
        { name: "Eve" },
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "email") VALUES (@name, @__p1, @__p2)`,
      );
      assert.deepEqual(result.params, {
        name: "Eve",
        __p1: 25,
        __p2: "default@example.com",
      });
    });
  });

  describe("INSERT with optional fields", () => {
    it("should skip columns with undefined parameter values", () => {
      type InsertParams = { name: string; email?: string };
      const result = toSql(
        defineInsert(schema, (q, p: InsertParams) =>
          q
            .insertInto("users")
            .values({ name: p.name, email: p.email })
            .returning((u) => u.id),
        ),
        { name: "Optional User" },
      );

      assert.equal(result.sql, `INSERT INTO "users" ("name") VALUES (@name) RETURNING "id"`);
      assert.deepEqual(result.params, { name: "Optional User" });
    });

    it("should throw when all insert values are undefined", () => {
      type InsertParams = { name?: string; email?: string };
      assert.throws(() => {
        toSql(
          defineInsert(schema, (q, p: InsertParams) =>
            q.insertInto("users").values({ name: p.name, email: p.email }),
          ),
          {},
        );
      }, /All provided values were undefined/);
    });
  });

  describe("INSERT with RETURNING", () => {
    it("should generate INSERT with RETURNING single column", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({ name: "Frank", age: 45 })
            .returning((u) => u.id),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age") VALUES (@__p1, @__p2) RETURNING "id"`,
      );
    });

    it("should generate INSERT with RETURNING multiple columns", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({ name: "Grace", age: 50 })
            .returning((u) => ({ id: u.id, name: u.name })),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age") VALUES (@__p1, @__p2) RETURNING "id" AS "id", "name" AS "name"`,
      );
    });

    it("should generate INSERT with RETURNING all columns (*)", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({ name: "Helen", age: 55 })
            .returning((u) => u),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age") VALUES (@__p1, @__p2) RETURNING *`,
      );
    });
  });

  describe("INSERT with ON CONFLICT (Upsert)", () => {
    it("should generate INSERT with ON CONFLICT DO NOTHING", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({
              name: "Alice",
              email: "alice@example.com",
            })
            .onConflict((u) => u.email)
            .doNothing(),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "email") VALUES (@__p1, @__p2) ON CONFLICT ("email") DO NOTHING`,
      );
      assert.deepEqual(result.params, {
        __p1: "Alice",
        __p2: "alice@example.com",
      });
    });

    it("should generate INSERT with ON CONFLICT DO NOTHING using multiple target columns", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({
              name: "Alice",
              email: "alice@example.com",
            })
            .onConflict(
              (u) => u.email,
              (u) => u.name,
            )
            .doNothing(),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "email") VALUES (@__p1, @__p2) ON CONFLICT ("email", "name") DO NOTHING`,
      );
      assert.deepEqual(result.params, {
        __p1: "Alice",
        __p2: "alice@example.com",
      });
    });

    it("should generate INSERT with ON CONFLICT DO UPDATE SET using excluded", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({
              name: "Alice",
              age: 30,
              email: "alice@example.com",
            })
            .onConflict((u) => u.email)
            .doUpdateSet((_existing, excluded) => ({
              name: excluded.name,
              age: excluded.age,
            })),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "email") VALUES (@__p1, @__p2, @__p3) ON CONFLICT ("email") DO UPDATE SET "name" = excluded."name", "age" = excluded."age"`,
      );
      assert.deepEqual(result.params, {
        __p1: "Alice",
        __p2: 30,
        __p3: "alice@example.com",
      });
    });

    it("should generate INSERT with ON CONFLICT DO UPDATE SET using multiple target columns", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({
              name: "Alice",
              age: 30,
              email: "alice@example.com",
            })
            .onConflict(
              (u) => u.email,
              (u) => u.name,
            )
            .doUpdateSet((_existing, excluded) => ({
              age: excluded.age,
            })),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "email") VALUES (@__p1, @__p2, @__p3) ON CONFLICT ("email", "name") DO UPDATE SET "age" = excluded."age"`,
      );
      assert.deepEqual(result.params, {
        __p1: "Alice",
        __p2: 30,
        __p3: "alice@example.com",
      });
    });

    it("should generate INSERT with ON CONFLICT DO UPDATE SET and RETURNING", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q
            .insertInto("users")
            .values({
              name: "Alice",
              age: 30,
              email: "alice@example.com",
            })
            .onConflict((u) => u.email)
            .doUpdateSet((_existing, excluded) => ({
              name: excluded.name,
            }))
            .returning((u) => u.id),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "email") VALUES (@__p1, @__p2, @__p3) ON CONFLICT ("email") DO UPDATE SET "name" = excluded."name" RETURNING "id"`,
      );
    });

    it("should throw if ON CONFLICT has no action", () => {
      assert.throws(() => {
        toSql(
          defineInsert(schema, (q) =>
            q
              .insertInto("users")
              .values({ name: "Alice" })
              .onConflict((u) => u.email),
          ),
          {},
        );
      }, /ON CONFLICT requires doNothing\(\) or doUpdateSet\(\)/);
    });
  });

  describe("INSERT with special values", () => {
    it("should handle boolean values (converted to 1/0 in SQLite)", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("users").values({
            name: "Ian",
            age: 60,
            isActive: true,
          }),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "isActive") VALUES (@__p1, @__p2, @__p3)`,
      );
      assert.deepEqual(result.params, {
        __p1: "Ian",
        __p2: 60,
        __p3: true, // Will be converted to 1 at execution time
      });
    });

    it("should handle null values", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("users").values({
            name: "Jane",
            age: 65,
            email: null,
          }),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "email") VALUES (@__p1, @__p2, NULL)`,
      );
      assert.deepEqual(result.params, {
        __p1: "Jane",
        __p2: 65,
      });
    });

    it("should handle numeric edge cases", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("users").values({
            name: "Kevin",
            age: 0,
            salary: -1000,
          }),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `INSERT INTO "users" ("name", "age", "salary") VALUES (@__p1, @__p2, @__p3)`,
      );
      assert.deepEqual(result.params, {
        __p1: "Kevin",
        __p2: 0,
        __p3: -1000,
      });
    });
  });

  describe("INSERT with special characters", () => {
    it("should handle strings with quotes", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("users").values({
            name: "O'Brien",
            email: 'test"email@example.com',
          }),
        ),
        {},
      );

      assert.equal(result.sql, `INSERT INTO "users" ("name", "email") VALUES (@__p1, @__p2)`);
      assert.deepEqual(result.params, {
        __p1: "O'Brien",
        __p2: 'test"email@example.com',
      });
    });

    it("should handle Unicode characters", () => {
      const result = toSql(
        defineInsert(schema, (q) =>
          q.insertInto("users").values({
            name: "李明",
            email: "test@例え.com",
          }),
        ),
        {},
      );

      assert.deepEqual(result.params, {
        __p1: "李明",
        __p2: "test@例え.com",
      });
    });
  });
});
