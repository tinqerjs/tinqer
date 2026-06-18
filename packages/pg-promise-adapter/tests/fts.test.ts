/**
 * Full-Text Search Tests - PostgreSQL
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
    search_vector: string;
  };
}

const base = createSchema<Schema>();

// Inline to_tsvector index (English config).
const ftsEnglish = base.withFts({
  articles: { columns: ["title", "content"], pg: { config: "english" } },
});

// Stored, GIN-indexed tsvector column.
const ftsVector = base.withFts({
  articles: { columns: ["title", "content"], pg: { config: "english", vector: "search_vector" } },
});

// No config → defaults to "simple".
const ftsSimple = base.withFts({
  articles: { columns: ["title"] },
});

describe("Full-Text Search - PostgreSQL", () => {
  describe("match (WHERE)", () => {
    it("matches the table's whole index", () => {
      const result = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term)),
        ),
        { term: "graph databases" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", '')) @@ websearch_to_tsquery('english', $(term))`,
      );
      expect(result.params).to.deep.equal({ term: "graph databases" });
    });

    it("matches a single declared column", () => {
      const result = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a.title, p.term)),
        ),
        { term: "indexes" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE to_tsvector('english', coalesce("title", '')) @@ websearch_to_tsquery('english', $(term))`,
      );
    });

    it("matches an array of declared columns", () => {
      const result = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match([a.title, a.content], p.term)),
        ),
        { term: "indexes" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", '')) @@ websearch_to_tsquery('english', $(term))`,
      );
    });

    it("honours the query mode", () => {
      const plain = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term, { mode: "plain" })),
        ),
        { term: "x" },
      );
      expect(plain.sql).to.contain("@@ plainto_tsquery('english', $(term))");

      const phrase = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term, { mode: "phrase" })),
        ),
        { term: "x" },
      );
      expect(phrase.sql).to.contain("@@ phraseto_tsquery('english', $(term))");

      const raw = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term, { mode: "raw" })),
        ),
        { term: "x" },
      );
      expect(raw.sql).to.contain("@@ to_tsquery('english', $(term))");
    });

    it("honours a per-call config override", () => {
      const result = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term, { config: "simple" })),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("content", '')) @@ websearch_to_tsquery('simple', $(term))`,
      );
    });

    it("uses a stored, GIN-indexed tsvector column when configured", () => {
      const result = toSql(
        defineSelect(ftsVector, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term)),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE "search_vector" @@ websearch_to_tsquery('english', $(term))`,
      );
    });

    it("defaults to the 'simple' config when none is declared", () => {
      const result = toSql(
        defineSelect(ftsSimple, (q, p: { term: string }, h) =>
          q.from("articles").where((a) => h.fts.match(a, p.term)),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE to_tsvector('simple', coalesce("title", '')) @@ websearch_to_tsquery('simple', $(term))`,
      );
    });
  });

  describe("rank (ORDER BY / SELECT)", () => {
    it("ranks results in ORDER BY (higher = more relevant)", () => {
      const result = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q
            .from("articles")
            .where((a) => h.fts.match(a, p.term))
            .orderByDescending((a) => h.fts.rank(a, p.term)),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT * FROM "articles" WHERE to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", '')) @@ websearch_to_tsquery('english', $(term)) ORDER BY ts_rank(to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", '')), websearch_to_tsquery('english', $(term))) DESC`,
      );
    });

    it("projects a relevance score in SELECT", () => {
      const result = toSql(
        defineSelect(ftsEnglish, (q, p: { term: string }, h) =>
          q.from("articles").select((a) => ({ id: a.id, score: h.fts.rank(a, p.term) })),
        ),
        { term: "x" },
      );

      expect(result.sql).to.equal(
        `SELECT "id" AS "id", ts_rank(to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", '')), websearch_to_tsquery('english', $(term))) AS "score" FROM "articles"`,
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
      ).to.throw(/no FTS configuration|Full-text-search/i);
    });

    it("throws when the source table has no fts index", () => {
      const other = base.withFts({ articles: { columns: ["title"] } });
      // articles IS configured; query a different (unconfigured) table to trigger the error.
      interface S2 {
        notes: { id: number; body: string };
      }
      const s2 = createSchema<S2>().withFts({} as never);
      void other;
      expect(() =>
        toSql(
          defineSelect(s2, (q, p: { term: string }, h) =>
            q.from("notes").where((n) => h.fts.match(n, p.term)),
          ),
          { term: "x" },
        ),
      ).to.throw(/No full-text-search index is configured for table "notes"/);
    });
  });
});
