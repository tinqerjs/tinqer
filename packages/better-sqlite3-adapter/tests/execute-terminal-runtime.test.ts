/**
 * Runtime behavior tests for executeSelect terminal operations
 * Uses a mock better-sqlite3 db to avoid requiring a real database.
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { executeSelect } from "../dist/index.js";
import { schema } from "./test-schema.js";

describe("executeSelect terminal runtime behavior (better-sqlite3)", () => {
  it("firstOrDefault() should return null when no rows are returned", () => {
    const db = {
      prepare(_sql: string) {
        return {
          all(_params?: Record<string, unknown>): unknown[] {
            return [];
          },
          get(_params?: Record<string, unknown>): unknown {
            return undefined;
          },
          run(_params?: Record<string, unknown>): { changes: number } {
            return { changes: 0 };
          },
        };
      },
    };

    const result = executeSelect(
      db as unknown as Parameters<typeof executeSelect>[0],
      schema,
      (q) => q.from("users").firstOrDefault(),
      {},
    );

    expect(result).to.equal(null);
  });

  it("contains() should return boolean based on EXISTS result", () => {
    let capturedSql: string | undefined;
    let capturedParams: unknown;

    const db = {
      prepare(sql: string) {
        capturedSql = sql;
        return {
          all(_params?: Record<string, unknown>): unknown[] {
            throw new Error("Unexpected stmt.all() for contains()");
          },
          get(params?: Record<string, unknown>): unknown {
            capturedParams = params;
            return { ok: 1 };
          },
          run(_params?: Record<string, unknown>): { changes: number } {
            return { changes: 0 };
          },
        };
      },
    };

    const result = executeSelect(
      db as unknown as Parameters<typeof executeSelect>[0],
      schema,
      (q) =>
        q
          .from("users")
          .select((u) => u.id)
          .contains(123),
      {},
    );

    expect(result).to.equal(true);
    expect(capturedSql).to.contain("SELECT CASE WHEN EXISTS");
    expect(capturedParams).to.deep.equal({ __p1: 123 });
  });
});
