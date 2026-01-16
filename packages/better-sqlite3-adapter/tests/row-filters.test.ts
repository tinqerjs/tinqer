import { describe, it } from "mocha";
import { expect } from "chai";
import {
  createSchema,
  defineDelete,
  defineInsert,
  defineSelect,
  defineUpdate,
} from "@tinqerjs/tinqer";
import { toSql } from "../dist/index.js";

describe("Row filters (SQLite)", () => {
  interface Schema {
    users: {
      id: number;
      orgId: number;
      name: string;
    };
    posts: {
      id: number;
      userId: number;
      orgId: number;
      title: string;
    };
  }

  const baseSchema = createSchema<Schema>();

  const filteredSchema = baseSchema
    .withRowFilters<{ orgId: number }>({
      users: (u, ctx) => u.orgId === ctx.orgId,
      posts: (p, ctx) => p.orgId === ctx.orgId,
    })
    .withContext({ orgId: 7 });

  it("applies to SELECT", () => {
    const result = toSql(
      defineSelect(filteredSchema, (q) => q.from("users").select((u) => u.id)),
      {},
    );

    expect(result.sql).to.equal(
      'SELECT "id" FROM (SELECT * FROM "users" WHERE "orgId" = @__tinqer_row_filter_ctx__orgId) AS "users"',
    );
    expect(result.params).to.deep.equal({ __tinqer_row_filter_ctx__orgId: 7 });
  });

  it("applies inside LEFT JOIN derived tables", () => {
    const result = toSql(
      defineSelect(filteredSchema, (q) =>
        q
          .from("users")
          .groupJoin(
            q.from("posts"),
            (u) => u.id,
            (p) => p.userId,
            (u, postGroup) => ({ u, postGroup }),
          )
          .selectMany(
            (g) => g.postGroup.defaultIfEmpty(),
            (g, p) => ({ u: g.u, p }),
          )
          .select((x) => ({ userId: x.u.id })),
      ),
      {},
    );

    expect(result.sql).to.equal(
      'SELECT "users"."id" AS "userId" FROM (SELECT * FROM "users" WHERE "orgId" = @__tinqer_row_filter_ctx__orgId) AS "users" LEFT OUTER JOIN (SELECT * FROM "posts" WHERE "orgId" = @__tinqer_row_filter_ctx__orgId) AS "t0" ON "users"."id" = "t0"."userId"',
    );
    expect(result.params).to.deep.equal({ __tinqer_row_filter_ctx__orgId: 7 });
  });

  it("applies to UPDATE with check predicate", () => {
    const result = toSql(
      defineUpdate(filteredSchema, (q, p: { userId: number; newOrgId: number }) =>
        q
          .update("users")
          .set({ orgId: p.newOrgId })
          .where((u) => u.id === p.userId),
      ),
      { userId: 1, newOrgId: 9 },
    );

    expect(result.sql).to.equal(
      'UPDATE "users" SET "orgId" = @newOrgId WHERE (("id" = @userId AND "orgId" = @__tinqer_row_filter_ctx__orgId) AND @newOrgId = @__tinqer_row_filter_ctx__orgId)',
    );
    expect(result.params).to.deep.equal({
      userId: 1,
      newOrgId: 9,
      __tinqer_row_filter_ctx__orgId: 7,
    });
  });

  it("applies to DELETE even without explicit where()", () => {
    const result = toSql(
      defineDelete(filteredSchema, (q) => q.deleteFrom("posts")),
      {},
    );

    expect(result.sql).to.equal(
      'DELETE FROM "posts" WHERE "orgId" = @__tinqer_row_filter_ctx__orgId',
    );
    expect(result.params).to.deep.equal({ __tinqer_row_filter_ctx__orgId: 7 });
  });

  it("throws if schema is not context-bound", () => {
    const unbound = baseSchema.withRowFilters<{ orgId: number }>({
      users: (u, ctx) => u.orgId === ctx.orgId,
      posts: (p, ctx) => p.orgId === ctx.orgId,
    });

    expect(() =>
      toSql(
        defineSelect(unbound, (q) => q.from("users").select((u) => u.id)),
        {},
      ),
    ).to.throw("Row filters require context binding");
  });

  it("does not require context binding for INSERT", () => {
    const unbound = baseSchema.withRowFilters<{ orgId: number }>({
      users: (u, ctx) => u.orgId === ctx.orgId,
      posts: (p, ctx) => p.orgId === ctx.orgId,
    });

    const result = toSql(
      defineInsert(unbound, (q, p: { id: number; orgId: number; name: string }) =>
        q.insertInto("users").values({ id: p.id, orgId: p.orgId, name: p.name }),
      ),
      { id: 1, orgId: 7, name: "Alice" },
    );

    expect(result.sql).to.equal(
      'INSERT INTO "users" ("id", "orgId", "name") VALUES (@id, @orgId, @name)',
    );
    expect(result.params).to.deep.equal({ id: 1, orgId: 7, name: "Alice" });
  });
});
