/**
 * Tests for full-text-search parsing (helpers.fts.match / helpers.fts.rank)
 *
 * parseQuery does not run the finalize-time resolution policy, so these assert the raw parsed
 * nodes: columns/query/mode are present; `index` is attached later from the schema configuration.
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { parseQuery } from "../dist/parser/parse-query.js";
import type { QueryBuilder } from "../dist/index.js";
import { createQueryHelpers } from "../dist/linq/functions.js";
import type {
  WhereOperation,
  SelectOperation,
  OrderByOperation,
} from "../dist/query-tree/operations.js";
import type {
  FtsMatchExpression,
  FtsRankExpression,
  ObjectExpression,
} from "../dist/expressions/expression.js";

interface TestSchema {
  articles: {
    id: number;
    title: string;
    content: string;
  };
}

type Helpers = ReturnType<typeof createQueryHelpers>;

describe("Full-Text Search - Parser", () => {
  describe("match", () => {
    it("parses h.fts.match over the whole row (no declared columns)", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, p: { term: string }, h: Helpers) =>
        q.from("articles").where((a) => h.fts.match(a, p.term)),
      );

      const whereOp = result?.operation as WhereOperation;
      expect(whereOp.operationType).to.equal("where");
      expect(whereOp.predicate.type).to.equal("ftsMatch");

      const match = whereOp.predicate as FtsMatchExpression;
      expect(match.columns).to.deep.equal([]);
      expect(match.mode).to.equal("websearch");
      expect(match.query.type).to.equal("param");
      expect(match.index).to.equal(undefined);
    });

    it("parses a single declared column", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, p: { term: string }, h: Helpers) =>
        q.from("articles").where((a) => h.fts.match(a.title, p.term)),
      );

      const match = (result?.operation as WhereOperation).predicate as FtsMatchExpression;
      expect(match.columns).to.deep.equal(["title"]);
    });

    it("parses an array of declared columns", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, p: { term: string }, h: Helpers) =>
        q.from("articles").where((a) => h.fts.match([a.title, a.content], p.term)),
      );

      const match = (result?.operation as WhereOperation).predicate as FtsMatchExpression;
      expect(match.columns).to.deep.equal(["title", "content"]);
    });

    it("parses mode and config options", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, p: { term: string }, h: Helpers) =>
        q
          .from("articles")
          .where((a) => h.fts.match(a, p.term, { mode: "phrase", config: "english" })),
      );

      const match = (result?.operation as WhereOperation).predicate as FtsMatchExpression;
      expect(match.mode).to.equal("phrase");
      expect(match.config).to.equal("english");
    });

    it("defaults mode to websearch when options are omitted", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, p: { term: string }, h: Helpers) =>
        q.from("articles").where((a) => h.fts.match(a, p.term, { config: "english" })),
      );

      const match = (result?.operation as WhereOperation).predicate as FtsMatchExpression;
      expect(match.mode).to.equal("websearch");
      expect(match.config).to.equal("english");
    });
  });

  describe("rank", () => {
    it("parses h.fts.rank in a SELECT projection", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, p: { term: string }, h: Helpers) =>
        q.from("articles").select((a) => ({ id: a.id, score: h.fts.rank(a, p.term) })),
      );

      const selectOp = result?.operation as SelectOperation;
      expect(selectOp.operationType).to.equal("select");
      const projection = selectOp.selector as ObjectExpression;
      const score = projection.properties.score as FtsRankExpression;
      expect(score.type).to.equal("ftsRank");
      expect(score.columns).to.deep.equal([]);
      expect(score.mode).to.equal("websearch");
      expect(score.query.type).to.equal("param");
    });

    it("parses h.fts.rank in ORDER BY", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, p: { term: string }, h: Helpers) =>
        q.from("articles").orderByDescending((a) => h.fts.rank(a.title, p.term)),
      );

      const orderOp = result?.operation as OrderByOperation;
      expect(orderOp.operationType).to.equal("orderBy");
      const key = orderOp.keySelector as FtsRankExpression;
      expect(key.type).to.equal("ftsRank");
      expect(key.columns).to.deep.equal(["title"]);
    });
  });
});
