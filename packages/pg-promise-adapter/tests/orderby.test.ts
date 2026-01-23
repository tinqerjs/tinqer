/**
 * Tests for ORDER BY clause generation
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "../dist/index.js";
import { schema } from "./test-schema.js";

describe("ORDER BY SQL Generation", () => {
  it("should generate ORDER BY with simple column", () => {
    const result = toSql(
      defineSelect(schema, (q) => q.from("users").orderBy((x) => x.name)),
      {},
    );

    expect(result.sql).to.equal('SELECT * FROM "users" ORDER BY "name" ASC');
  });

  it("should generate ORDER BY DESC", () => {
    const result = toSql(
      defineSelect(schema, (q) => q.from("posts").orderByDescending((x) => x.createdAt)),
      {},
    );

    expect(result.sql).to.equal('SELECT * FROM "posts" ORDER BY "createdAt" DESC');
  });

  it("should generate ORDER BY with THEN BY", () => {
    const result = toSql(
      defineSelect(schema, (q) =>
        q
          .from("products")
          .orderBy((x) => x.category)
          .thenBy((x) => x.name),
      ),
      {},
    );

    expect(result.sql).to.equal('SELECT * FROM "products" ORDER BY "category" ASC, "name" ASC');
  });

  it("should generate mixed ORDER BY and THEN BY DESC", () => {
    const result = toSql(
      defineSelect(schema, (q) =>
        q
          .from("products")
          .orderBy((x) => x.category)
          .thenByDescending((x) => x.rating)
          .thenBy((x) => x.price),
      ),
      {},
    );

    expect(result.sql).to.equal(
      'SELECT * FROM "products" ORDER BY "category" ASC, "rating" DESC, "price" ASC',
    );
  });

  it("should support reverse() by flipping ORDER BY direction", () => {
    const result = toSql(
      defineSelect(schema, (q) =>
        q
          .from("users")
          .orderBy((u) => u.name)
          .reverse(),
      ),
      {},
    );

    expect(result.sql).to.equal('SELECT * FROM "users" ORDER BY "name" DESC');
  });

  it("should add default ORDER BY for reverse() without existing ORDER BY", () => {
    const result = toSql(
      defineSelect(schema, (q) => q.from("users").reverse()),
      {},
    );

    expect(result.sql).to.equal('SELECT * FROM "users" ORDER BY 1 DESC');
  });

  it("should throw when reverse() is applied after take()", () => {
    expect(() =>
      toSql(
        defineSelect(schema, (q) => q.from("users").take(10).reverse()),
        {},
      ),
    ).to.throw(/reverse\(\) after take\/skip is not supported/);
  });
});
