/**
 * Full-Text Search Tests - SQLite (FTS5)
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "../dist/index.js";

interface Schema {
  articles: {
    id: number;
    title: string;
    content: string;
  };
}

const base = createSchema<Schema>();

// FTS5 virtual table aligned with the base table's rowid.
const fts = base.withFts({
  articles: { columns: ["title", "content"], sqlite: { table: "articles_fts" } },
});

// FTS5 virtual table aligned with an explicit key column.
const ftsKeyed = base.withFts({
  articles: { columns: ["title", "content"], sqlite: { table: "articles_fts", key: "id" } },
});

describe("Full-Text Search - SQLite", () => {
  describe("match (WHERE)", () => {
    it("matches via the FTS5 virtual table (default rowid key)", () => {
      const result = toSql(
        defineSelect(fts, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term)),
        ),
        { term: "graph databases" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE "articles"."rowid" IN (SELECT "rowid" FROM "articles_fts" WHERE "articles_fts" MATCH @term)`,
      );
      expect(result.params).to.deep.equal({ term: "graph databases" });
    });

    it("matches via an explicit key column", () => {
      const result = toSql(
        defineSelect(ftsKeyed, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term)),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE "articles"."id" IN (SELECT "rowid" FROM "articles_fts" WHERE "articles_fts" MATCH @term)`,
      );
    });

    it("ignores PostgreSQL-only mode/config (FTS5 query is used as-is)", () => {
      const result = toSql(
        defineSelect(fts, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term, { mode: "phrase", config: "x" })),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE "articles"."rowid" IN (SELECT "rowid" FROM "articles_fts" WHERE "articles_fts" MATCH @term)`,
      );
    });
  });

  describe("rank (ORDER BY / SELECT)", () => {
    it("ranks results in ORDER BY via -bm25 (higher = more relevant)", () => {
      const result = toSql(
        defineSelect(fts, (q, p: { term: string }, h) =>
          q
            .from("articles")
            .where((a) => h.fts.match(a, p.term))
            .orderByDescending((a) => h.fts.rank(a, p.term)),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE "articles"."rowid" IN (SELECT "rowid" FROM "articles_fts" WHERE "articles_fts" MATCH @term) ORDER BY (SELECT -bm25("articles_fts") FROM "articles_fts" WHERE "articles_fts" MATCH @term AND "articles_fts"."rowid" = "articles"."rowid") DESC`,
      );
    });

    it("projects a relevance score in SELECT", () => {
      const result = toSql(
        defineSelect(fts, (q, p: { term: string }, h) =>
          q.from("articles").select((a) => ({ id: a.id, score: h.fts.rank(a, p.term) })),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT "id" AS "id", (SELECT -bm25("articles_fts") FROM "articles_fts" WHERE "articles_fts" MATCH @term AND "articles_fts"."rowid" = "articles"."rowid") AS "score" FROM "articles"`,
      );
    });
  });

  describe("errors", () => {
    it("throws when fts helpers are used without a configuration", () => {
      expect(() =>
        toSql(
          defineSelect(base, (q, p: { term: string }, h) =>
            q.from("articles").where((a) => h.fts.match(a, p.term)),
          ),
          { term: "x" },
        ),
      ).to.throw(/Full-text-search|no FTS configuration/i);
    });

    it("throws when the table has no SQLite FTS5 binding", () => {
      const pgOnly = base.withFts({ articles: { columns: ["title"] } });
      expect(() =>
        toSql(
          defineSelect(pgOnly, (q, p: { term: string }, h) =>
            q.from("articles").where((a) => h.fts.match(a, p.term)),
          ),
          { term: "x" },
        ),
      ).to.throw(/without a SQLite FTS5 configuration/);
    });
  });
});
