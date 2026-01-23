/**
 * Tests for UPDATE statement generation
 */

import { describe, it } from "mocha";
import { strict as assert } from "assert";
import { defineUpdate } from "@tinqerjs/tinqer";
import { toSql } from "../dist/index.js";
import { schema } from "./test-schema.js";
import type { TestSchema } from "./test-schema.js";

describe("UPDATE Statement Generation", () => {
  describe("Basic UPDATE", () => {
    it("should generate UPDATE with WHERE clause", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ age: 31 })
            .where((u) => u.id === 1),
        ),
        {},
      );

      assert.equal(result.sql, `UPDATE "users" SET "age" = $(__p1) WHERE "id" = $(__p2)`);
      assert.deepEqual(result.params, {
        __p1: 31,
        __p2: 1,
      });
    });

    it("should generate UPDATE with set lambda referencing current values", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set((u) => ({ age: u.age + 1 }))
            .where((u) => u.id === 1),
        ),
        {},
      );

      assert.equal(result.sql, `UPDATE "users" SET "age" = ("age" + $(__p1)) WHERE "id" = $(__p2)`);
      assert.deepEqual(result.params, {
        __p1: 1,
        __p2: 1,
      });
    });

    it("should allow external parameters in set lambda via builder params", () => {
      const result = toSql(
        defineUpdate(schema, (q, p: { inc: number; id: number }) =>
          q
            .update("users")
            .set((u) => ({ age: u.age + p.inc }))
            .where((u) => u.id === p.id),
        ),
        { inc: 2, id: 1 },
      );

      assert.equal(result.sql, `UPDATE "users" SET "age" = ("age" + $(inc)) WHERE "id" = $(id)`);
      assert.deepEqual(result.params, { inc: 2, id: 1 });
    });

    it("should support set lambda when chaining from UpdatePlanHandleInitial", () => {
      const base = defineUpdate(schema, (q) => q.update("users"));

      const result = toSql(
        base.set((u) => ({ age: u.age + 1 })).where((u) => u.id === 1),
        {},
      );

      assert.equal(result.sql, `UPDATE "users" SET "age" = ("age" + $(__p1)) WHERE "id" = $(__p2)`);
      assert.deepEqual(result.params, {
        __p1: 1,
        __p2: 1,
      });
    });

    it("should allow external params parameter in plan-handle set lambda", () => {
      const base = defineUpdate(schema, (q) => q.update("users"));

      const result = toSql(
        base
          .set((u: TestSchema["users"], p: { inc: number }) => ({ age: u.age + p.inc }))
          .where((u: TestSchema["users"], p: { id: number }) => u.id === p.id),
        { inc: 2, id: 1 },
      );

      assert.equal(result.sql, `UPDATE "users" SET "age" = ("age" + $(inc)) WHERE "id" = $(id)`);
      assert.deepEqual(result.params, { inc: 2, id: 1 });
    });

    it("should generate UPDATE with multiple columns", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ age: 32, email: "updated@example.com" })
            .where((u) => u.id === 2),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "age" = $(__p1), "email" = $(__p2) WHERE "id" = $(__p3)`,
      );
      assert.deepEqual(result.params, {
        __p1: 32,
        __p2: "updated@example.com",
        __p3: 2,
      });
    });

    it("should generate UPDATE with schema prefix in table name", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("public.users")
            .set({ age: 33 })
            .where((u) => u.id === 3),
        ),
        {},
      );

      assert.equal(result.sql, `UPDATE "public"."users" SET "age" = $(__p1) WHERE "id" = $(__p2)`);
    });
  });

  describe("UPDATE with complex WHERE clauses", () => {
    it("should handle AND conditions", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ age: 34 })
            .where((u) => u.id === 4 && u.name === "Alice"),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "age" = $(__p1) WHERE ("id" = $(__p2) AND "name" = $(__p3))`,
      );
    });

    it("should handle OR conditions", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ isActive: true })
            .where((u) => u.age > 50 || u.department === "Sales"),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "isActive" = $(__p1) WHERE ("age" > $(__p2) OR "department" = $(__p3))`,
      );
    });

    it("should handle complex nested conditions", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ salary: 75000 })
            .where((u) => (u.age > 30 && u.department === "IT") || u.role === "Manager"),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "salary" = $(__p1) WHERE (("age" > $(__p2) AND "department" = $(__p3)) OR "role" = $(__p4))`,
      );
    });
  });

  describe("UPDATE with parameters", () => {
    it("should use external parameters in SET", () => {
      const result = toSql(
        defineUpdate(schema, (q, p: { newAge: number; userId: number }) =>
          q
            .update("users")
            .set({ age: p.newAge })
            .where((u) => u.id === p.userId),
        ),
        { newAge: 35, userId: 5 },
      );

      assert.equal(result.sql, `UPDATE "users" SET "age" = $(newAge) WHERE "id" = $(userId)`);
      assert.deepEqual(result.params, {
        newAge: 35,
        userId: 5,
      });
    });

    it("should mix external parameters with literals", () => {
      const result = toSql(
        defineUpdate(schema, (q, p: { userId: number }) =>
          q
            .update("users")
            .set({ age: 36, email: "fixed@example.com" })
            .where((u) => u.id === p.userId),
        ),
        { userId: 6 },
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "age" = $(__p1), "email" = $(__p2) WHERE "id" = $(userId)`,
      );
      assert.deepEqual(result.params, {
        __p1: 36,
        __p2: "fixed@example.com",
        userId: 6,
      });
    });

    it("should skip assignments when parameter values are undefined", () => {
      type UpdateParams = { userId: number; name: string; email?: string };
      const result = toSql(
        defineUpdate(schema, (q, p: UpdateParams) =>
          q
            .update("users")
            .set({ email: p.email, name: p.name })
            .where((u) => u.id === p.userId),
        ),
        { userId: 9, name: "Updated Name" },
      );

      assert.equal(result.sql, `UPDATE "users" SET "name" = $(name) WHERE "id" = $(userId)`);
      assert.deepEqual(result.params, {
        userId: 9,
        name: "Updated Name",
      });
    });

    it("should throw when all assignments resolve to undefined", () => {
      type UpdateParams = { userId: number; email?: string };
      assert.throws(() => {
        toSql(
          defineUpdate(schema, (q, p: UpdateParams) =>
            q
              .update("users")
              .set({ email: p.email })
              .where((u) => u.id === p.userId),
          ),
          { userId: 10 },
        );
      }, /All provided values were undefined/);
    });
  });

  describe("UPDATE with RETURNING", () => {
    it("should generate UPDATE with RETURNING single column", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ age: 37 })
            .where((u) => u.id === 7)
            .returning((u) => u.age),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "age" = $(__p1) WHERE "id" = $(__p2) RETURNING "age"`,
      );
    });

    it("should generate UPDATE with RETURNING multiple columns", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ age: 38, email: "new@example.com" })
            .where((u) => u.id === 8)
            .returning((u) => ({ id: u.id, age: u.age, email: u.email })),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "age" = $(__p1), "email" = $(__p2) WHERE "id" = $(__p3) RETURNING "id" AS "id", "age" AS "age", "email" AS "email"`,
      );
    });

    it("should generate UPDATE with RETURNING all columns (*)", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ age: 39 })
            .where((u) => u.id === 9)
            .returning((u) => u),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "age" = $(__p1) WHERE "id" = $(__p2) RETURNING *`,
      );
    });
  });

  describe("UPDATE with allowFullTableUpdate", () => {
    it("should generate UPDATE without WHERE when allowed", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q.update("users").set({ isActive: true }).allowFullTableUpdate(),
        ),
        {},
      );

      assert.equal(result.sql, `UPDATE "users" SET "isActive" = $(__p1)`);
    });

    it("should throw error when UPDATE has no WHERE and no allow flag", () => {
      assert.throws(() => {
        toSql(
          defineUpdate(schema, (q) => q.update("users").set({ isActive: true })),
          {},
        );
      }, /UPDATE requires a WHERE clause or explicit allowFullTableUpdate/);
    });
  });

  describe("UPDATE with special values", () => {
    it("should handle boolean values", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ isActive: false })
            .where((u) => u.id === 10),
        ),
        {},
      );

      assert.deepEqual(result.params, {
        __p1: false,
        __p2: 10,
      });
    });

    it("should handle null values", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ email: null })
            .where((u) => u.id === 11),
        ),
        {},
      );

      assert.equal(result.sql, `UPDATE "users" SET "email" = NULL WHERE "id" = $(__p1)`);
    });

    it("should handle numeric edge cases", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ age: 0, salary: -500 })
            .where((u) => u.id === 12),
        ),
        {},
      );

      assert.deepEqual(result.params, {
        __p1: 0,
        __p2: -500,
        __p3: 12,
      });
    });
  });

  describe("UPDATE with string operations in WHERE", () => {
    it("should handle startsWith in WHERE", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ department: "Engineering" })
            .where((u) => u.name.startsWith("A")),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "department" = $(__p1) WHERE "name" LIKE $(__p2) || '%'`,
      );
    });

    it("should handle contains in WHERE", () => {
      const result = toSql(
        defineUpdate(schema, (q) =>
          q
            .update("users")
            .set({ role: "Senior" })
            .where((u) => u.email !== null && u.email.includes("@company.com")),
        ),
        {},
      );

      assert.equal(
        result.sql,
        `UPDATE "users" SET "role" = $(__p1) WHERE ("email" IS NOT NULL AND "email" LIKE '%' || $(__p2) || '%')`,
      );
    });
  });
});
