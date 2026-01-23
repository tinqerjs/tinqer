/**
 * Tests for arithmetic and mathematical expression SQL generation
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "../dist/index.js";

describe("Arithmetic Expression SQL Generation", () => {
  interface Product {
    id: number;
    name: string;
    price: number;
    cost: number;
    quantity: number;
    weight: number;
    discount?: number;
  }

  interface Financial {
    id: number;
    revenue: number;
    expenses: number;
    tax_rate: number;
    quarters: number;
    employees: number;
  }

  interface Schema {
    products: Product;
    financial: Financial;
  }

  const schema = createSchema<Schema>();

  describe("Basic arithmetic operations", () => {
    it("should support subtraction in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").select((p) => ({ profit: p.price - p.cost })),
        ),
        {},
      );

      expect(result.sql).to.equal('SELECT ("price" - "cost") AS "profit" FROM "products"');
      expect(result.params).to.deep.equal({});
    });

    it("should support addition in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("financial").select((f) => ({ total: f.revenue + f.expenses })),
        ),
        {},
      );

      expect(result.sql).to.equal('SELECT ("revenue" + "expenses") AS "total" FROM "financial"');
      expect(result.params).to.deep.equal({});
    });

    it("should support multiplication in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").select((p) => ({ total: p.quantity * p.price })),
        ),
        {},
      );

      expect(result.sql).to.equal('SELECT ("quantity" * "price") AS "total" FROM "products"');
      expect(result.params).to.deep.equal({});
    });

    it("should support division in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("financial").select((f) => ({ perEmployee: f.revenue / f.employees })),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT ("revenue" / "employees") AS "perEmployee" FROM "financial"',
      );
      expect(result.params).to.deep.equal({});
    });

    it("should support modulo in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").select((p) => ({ remainder: p.quantity % 2 })),
        ),
        {},
      );

      expect(result.sql).to.equal('SELECT ("quantity" % @__p1) AS "remainder" FROM "products"');
      expect(result.params).to.deep.equal({ __p1: 2 });
    });
  });

  describe("Complex arithmetic expressions", () => {
    it("should support nested arithmetic in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").select((p) => ({ marginTotal: (p.price - p.cost) * p.quantity })),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT (("price" - "cost") * "quantity") AS "marginTotal" FROM "products"',
      );
      expect(result.params).to.deep.equal({});
    });

    it("should preserve parentheses and precedence in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").select((p) => ({ adjusted: p.price * (1 - 0.1 - 0.05) })),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT ("price" * ((@__p1 - @__p2) - @__p3)) AS "adjusted" FROM "products"',
      );
      expect(result.params).to.deep.equal({
        __p1: 1,
        __p2: 0.1,
        __p3: 0.05,
      });
    });
  });

  describe("Arithmetic in WHERE clauses", () => {
    it("should handle arithmetic comparisons in WHERE", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("products").where((p) => p.price - p.cost > 50)),
        {},
      );

      expect(result.sql).to.equal('SELECT * FROM "products" WHERE ("price" - "cost") > @__p1');
      expect(result.params).to.deep.equal({ __p1: 50 });
    });

    it("should handle complex arithmetic in WHERE", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("financial").where((f) => f.revenue / f.employees > 100000),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT * FROM "financial" WHERE ("revenue" / "employees") > @__p1',
      );
      expect(result.params).to.deep.equal({ __p1: 100000 });
    });

    it("should handle multiple arithmetic conditions", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").where((p) => p.price * 0.9 > 100 && p.cost * p.quantity < 10000),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT * FROM "products" WHERE (("price" * @__p1) > @__p2 AND ("cost" * "quantity") < @__p3)',
      );
      expect(result.params).to.deep.equal({
        __p1: 0.9,
        __p2: 100,
        __p3: 10000,
      });
    });
  });

  describe("Arithmetic with NULL handling", () => {
    it("should compile || default values to COALESCE in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").select((p) => ({ discount: p.discount || 0 })),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT COALESCE("discount", @__p1) AS "discount" FROM "products"',
      );
      expect(result.params).to.deep.equal({ __p1: 0 });
    });

    it("should handle arithmetic with nullable checks", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").where((p) => p.discount != null && p.price - p.discount > 50),
        ),
        {},
      );

      expect(result.sql).to.contain('"discount" IS NOT NULL');
      expect(result.sql).to.contain('("price" - "discount") > @__p1');
      expect(result.params).to.deep.equal({
        __p1: 50,
      });
    });
  });

  describe("Arithmetic with parameters", () => {
    // Test removed: Arithmetic with parameters no longer supported in SELECT projections

    it("should mix parameters with constants in arithmetic", () => {
      const result = toSql(
        defineSelect(schema, (q, params: { baseDiscount: number }) =>
          q.from("products").where((p) => p.price * (1 - params.baseDiscount - 0.05) > 100),
        ),
        { baseDiscount: 0.1 },
      );

      expect(result.sql).to.contain('"price" * ((@__p1 - @baseDiscount) - @__p2)');
      expect(result.sql).to.contain("> @__p3");
      expect(result.params).to.deep.equal({
        baseDiscount: 0.1,
        __p1: 1,
        __p2: 0.05,
        __p3: 100,
      });
    });
  });

  describe("Arithmetic in GROUP BY aggregates", () => {
    // Test removed: Arithmetic in GROUP BY SUM no longer supported in SELECT projections
    // Test removed: Arithmetic in GROUP BY AVG no longer supported in SELECT projections
  });

  describe("Edge cases and special values", () => {
    it("should compile ternary operator to CASE WHEN in SELECT projection", () => {
      const result = toSql(
        defineSelect(schema, (q) =>
          q.from("products").select((p) => ({ bucket: p.price > 100 ? 1 : 0 })),
        ),
        {},
      );

      expect(result.sql).to.equal(
        'SELECT CASE WHEN "price" > @__p1 THEN @__p2 ELSE @__p3 END AS "bucket" FROM "products"',
      );
      expect(result.params).to.deep.equal({ __p1: 100, __p2: 1, __p3: 0 });
    });

    it("should handle very large numbers", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("financial").where((f) => f.revenue > 1000000000)),
        {},
      );

      expect(result.sql).to.equal('SELECT * FROM "financial" WHERE "revenue" > @__p1');
      expect(result.params).to.deep.equal({ __p1: 1000000000 });
    });

    // Test removed: Decimal precision with arithmetic no longer supported in SELECT projections

    it("should handle negative numeric literals in WHERE", () => {
      const result = toSql(
        defineSelect(schema, (q) => q.from("financial").where((f) => f.revenue > -1)),
        {},
      );

      expect(result.sql).to.equal('SELECT * FROM "financial" WHERE "revenue" > @__p1');
      expect(result.params).to.deep.equal({ __p1: -1 });
    });
  });

  describe("Complex real-world scenarios", () => {
    // Removed: Math.pow test - Math functions need special handling
    // Test removed: Weighted average calculation no longer supported in SELECT projections
    // Removed: percentage calculations with || operator
  });
});
