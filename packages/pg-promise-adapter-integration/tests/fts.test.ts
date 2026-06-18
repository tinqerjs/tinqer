/**
 * Full-text-search integration tests (PostgreSQL)
 *
 * Exercises real `tsvector @@ tsquery` matching and `ts_rank` relevance — both the inline
 * `to_tsvector` form and a stored, GIN-indexed tsvector column.
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { createSchema } from "@tinqerjs/tinqer";
import { executeSelect } from "@tinqerjs/pg-promise-adapter";
import { db } from "./shared-db.js";

interface FtsDb {
  docs: { id: number; title: string; body: string; search_vector: string };
}

// Inline to_tsvector over the declared columns.
const inlineSchema = createSchema<FtsDb>().withFts({
  docs: { columns: ["title", "body"], pg: { config: "english" } },
});

// Stored, GIN-indexed tsvector column.
const vectorSchema = createSchema<FtsDb>().withFts({
  docs: { columns: ["title", "body"], pg: { config: "english", vector: "search_vector" } },
});

describe("PostgreSQL Integration - Full-Text Search", () => {
  before(async () => {
    await db.none(`
      DROP TABLE IF EXISTS docs CASCADE;
      CREATE TABLE docs (
        id integer PRIMARY KEY,
        title text NOT NULL,
        body text NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS
          (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) STORED
      );
      CREATE INDEX docs_search_idx ON docs USING GIN (search_vector);
      INSERT INTO docs (id, title, body) VALUES
        (1, 'Graph databases', 'Indexes make graph queries fast'),
        (2, 'Relational design', 'Normalization and foreign keys'),
        (3, 'Search internals', 'tsvector, bm25 ranking and graph traversal of the search index');
    `);
  });

  it("filters rows with @@ (inline to_tsvector)", async () => {
    const rows = await executeSelect(
      db,
      inlineSchema,
      (q, p: { term: string }, h) =>
        q
          .from("docs")
          .where((d) => h.fts.match(d, p.term))
          .select((d) => ({ id: d.id, title: d.title })),
      { term: "keys" },
    );

    expect(rows).to.have.length(1);
    expect(rows[0]!.id).to.equal(2);
  });

  it("matches a single declared column only", async () => {
    // "graph" is in doc 1's title and doc 3's body; restrict to title → only doc 1.
    const rows = await executeSelect(
      db,
      inlineSchema,
      (q, p: { term: string }, h) =>
        q
          .from("docs")
          .where((d) => h.fts.match(d.title, p.term))
          .select((d) => ({ id: d.id })),
      { term: "graph" },
    );

    expect(rows.map((r) => r.id)).to.deep.equal([1]);
  });

  it("orders by relevance with ts_rank (higher = more relevant)", async () => {
    const rows = await executeSelect(
      db,
      inlineSchema,
      (q, p: { term: string }, h) =>
        q
          .from("docs")
          .where((d) => h.fts.match(d, p.term))
          .orderByDescending((d) => h.fts.rank(d, p.term))
          .select((d) => ({ id: d.id })),
      { term: "graph" },
    );

    expect(rows.map((r) => r.id)).to.have.members([1, 3]);
    expect(rows[0]!.id).to.equal(1);
  });

  it("matches and ranks against a stored, GIN-indexed tsvector column", async () => {
    const rows = await executeSelect(
      db,
      vectorSchema,
      (q, p: { term: string }, h) =>
        q
          .from("docs")
          .where((d) => h.fts.match(d, p.term))
          .select((d) => ({ id: d.id, score: h.fts.rank(d, p.term) })),
      { term: "graph" },
    );

    const byId = new Map(rows.map((r) => [r.id, r.score]));
    expect(byId.get(1)).to.be.a("number");
    expect(byId.get(3)).to.be.a("number");
    expect(byId.get(1)!).to.be.greaterThan(0);
  });
});
