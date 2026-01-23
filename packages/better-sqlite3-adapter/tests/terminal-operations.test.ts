/**
 * Terminal Operations SQL Generation Tests
 * Verifies that first, last, single operations generate correct SQL
 */

import { expect } from "chai";
import { defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "../dist/index.js";
import { schema } from "./test-schema.js";

describe("Terminal Operations", () => {
  describe("FIRST operations", () => {
    it("should generate SQL for first()", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").first()),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for first() with predicate", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").first((u) => u.age > 18)),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" WHERE "age" > @__p1 LIMIT 1');
      expect(result.params).to.deep.equal({ __p1: 18 });
    });

    it("should generate SQL for firstOrDefault()", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").firstOrDefault()),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for firstOrDefault() with predicate", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").firstOrDefault((u) => u.isActive)),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" WHERE "isActive" LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should combine WHERE and first() predicate", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q
            .from("users")
            .where((u) => u.age > 18)
            .first((u) => u.isActive),
        ),
        {},
      );
      expect(result.sql).to.equal(
        'SELECT * FROM "users" WHERE "age" > @__p1 AND "isActive" LIMIT 1',
      );
      expect(result.params).to.deep.equal({ __p1: 18 });
    });
  });

  describe("SINGLE operations", () => {
    it("should generate SQL for single()", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").single()),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" LIMIT 2');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for single() with predicate", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").single((u) => u.id == 1)),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" WHERE "id" = @__p1 LIMIT 2');
      expect(result.params).to.deep.equal({ __p1: 1 });
    });

    it("should generate SQL for singleOrDefault()", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").singleOrDefault()),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" LIMIT 2');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for singleOrDefault() with predicate", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").singleOrDefault((u) => u.name == "John")),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" WHERE "name" = @__p1 LIMIT 2');
      expect(result.params).to.deep.equal({ __p1: "John" });
    });
  });

  describe("LAST operations", () => {
    it("should generate SQL for last() without ORDER BY", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").last()),
        {},
      );
      // Without ORDER BY, we add a default ORDER BY 1 DESC
      expect(result.sql).to.equal('SELECT * FROM "users" ORDER BY 1 DESC LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for last() with existing ORDER BY", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q
            .from("users")
            .orderBy((u) => u.id)
            .last(),
        ),
        {},
      );
      // With existing ORDER BY, last() reverses the direction
      expect(result.sql).to.equal('SELECT * FROM "users" ORDER BY "id" DESC LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for last() with predicate", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").last((u) => u.isActive)),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" WHERE "isActive" ORDER BY 1 DESC LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for lastOrDefault()", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").lastOrDefault()),
        {},
      );
      expect(result.sql).to.equal('SELECT * FROM "users" ORDER BY 1 DESC LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should generate SQL for lastOrDefault() with predicate", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("users").lastOrDefault((u) => u.age < 30)),
        {},
      );
      expect(result.sql).to.equal(
        'SELECT * FROM "users" WHERE "age" < @__p1 ORDER BY 1 DESC LIMIT 1',
      );
      expect(result.params).to.deep.equal({ __p1: 30 });
    });
  });

  describe("Complex terminal operations", () => {
    it("should work with SELECT projection and first()", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q
            .from("users")
            .select((u) => ({ name: u.name }))
            .first(),
        ),
        {},
      );
      // Note: name AS name is generated for object projections
      expect(result.sql).to.equal('SELECT "name" AS "name" FROM "users" LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should work with JOIN and single()", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q
            .from("users")
            .join(
              q.from("orders"),
              (u) => u.id,
              (o) => o.userId,
              (u, o) => ({ u, o }),
            )
            .select((joined) => ({ userName: joined.u.name, orderAmount: joined.o.total }))
            .single(),
        ),
        {},
      );
      expect(result.sql).to.equal(
        'SELECT "t0"."name" AS "userName", "t1"."total" AS "orderAmount" FROM "users" AS "t0" INNER JOIN "orders" AS "t1" ON "t0"."id" = "t1"."userId" LIMIT 2',
      );
      expect(result.params).to.deep.equal({});
    });

    it("should work with DISTINCT and first()", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q
            .from("users")
            .select((u) => ({ name: u.name }))
            .distinct()
            .first(),
        ),
        {},
      );
      expect(result.sql).to.equal('SELECT DISTINCT "name" AS "name" FROM "users" LIMIT 1');
      expect(result.params).to.deep.equal({});
    });

    it("should work with ORDER BY and last()", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q
            .from("users")
            .orderBy((u) => u.name)
            .last(),
        ),
        {},
      );
      // last() reverses ORDER BY direction
      expect(result.sql).to.equal('SELECT * FROM "users" ORDER BY "name" DESC LIMIT 1');
      expect(result.params).to.deep.equal({});
    });
  });

  describe("CONTAINS operations", () => {
    it("should generate SQL for contains()", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q
            .from("users")
            .select((u) => u.id)
            .contains(1),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT CASE WHEN EXISTS(SELECT 1 FROM (SELECT "id" AS "__tinqer_value" FROM "users") AS "__tinqer_contains" WHERE "__tinqer_contains"."__tinqer_value" = @__p1) THEN 1 ELSE 0 END',
      );
      expect(result.params).to.deep.equal({ __p1: 1 });
    });

    it("should throw when contains() is used with take()", () => {
      expect(() =>
        toSql(
          defineSelect(schema, (q) =>
            q
              .from("users")
              .select((u) => u.id)
              .take(1)
              .contains(1),
          ),
          {},
        ),
      ).to.throw(/contains\(\) is not supported with take\/skip/);
    });

    it("should throw when contains() is used with object projection", () => {
      expect(() =>
        toSql(
          defineSelect(schema, (q, p: { value: { id: number } }) =>
            q
              .from("users")
              .select((u) => ({ id: u.id }))
              .contains(p.value),
          ),
          { value: { id: 1 } },
        ),
      ).to.throw(/contains\(\) requires a scalar \.select/);
    });
  });
});
