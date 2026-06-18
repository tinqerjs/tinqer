/**
 * Full-text-search integration tests (SQLite FTS5)
 *
 * Exercises a real FTS5 external-content virtual table: match filtering, bm25 relevance ordering,
 * and a projected relevance score — proving the generated SQL runs and ranks correctly.
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { createSchema } from "@tinqerjs/tinqer";
import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { dbClient } from "./shared-db.js";

interface FtsDb {
  docs: { id: number; title: string; body: string };
}

const schema = createSchema<FtsDb>().withFts({
  docs: { columns: ["title", "body"], sqlite: { table: "docs_fts", key: "id" } },
});

describe("Better SQLite3 Integration - Full-Text Search (FTS5)", () => {
  before(() => {
    dbClient.exec(`
      DROP TABLE IF EXISTS docs_fts;
      DROP TABLE IF EXISTS docs;
      CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL);
      INSERT INTO docs (id, title, body) VALUES
        (1, 'Graph databases', 'Indexes make graph queries fast'),
        (2, 'Relational design', 'Normalization and foreign keys'),
        (3, 'Search internals', 'tsvector, bm25 ranking and graph traversal of the search index');
      CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, content='docs', content_rowid='id');
      INSERT INTO docs_fts (rowid, title, body) SELECT id, title, body FROM docs;
    `);
  });

  it("filters rows with MATCH", () => {
    const rows = executeSelect(
      dbClient,
      schema,
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

  it("orders by relevance (higher = more relevant)", () => {
    // "graph" appears in docs 1 and 3; bm25 ranking decides the order, surfaced highest-first.
    const rows = executeSelect(
      dbClient,
      schema,
      (q, p: { term: string }, h) =>
        q
          .from("docs")
          .where((d) => h.fts.match(d, p.term))
          .orderByDescending((d) => h.fts.rank(d, p.term))
          .select((d) => ({ id: d.id })),
      { term: "graph" },
    );

    expect(rows.map((r) => r.id)).to.have.members([1, 3]);
    // The shorter doc (1) is the stronger match for a single occurrence vs the longer doc (3).
    expect(rows[0]!.id).to.equal(1);
  });

  it("projects a relevance score that is higher for stronger matches", () => {
    const rows = executeSelect(
      dbClient,
      schema,
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
    // bm25 is lower-is-better; negated so doc 1 (stronger) scores higher than doc 3.
    expect(byId.get(1)!).to.be.greaterThan(byId.get(3)!);
  });
});
