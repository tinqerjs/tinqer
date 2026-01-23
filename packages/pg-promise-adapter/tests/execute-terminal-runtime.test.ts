/**
 * Runtime behavior tests for executeSelect terminal operations
 * Uses a mock pg-promise db to avoid requiring a real database.
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { executeSelect } from "../dist/index.js";
import { schema } from "./test-schema.js";

describe("executeSelect terminal runtime behavior (pg-promise)", () => {
  it("firstOrDefault() should return null when no rows are returned", async () => {
    const db = {
      async any(_sql: string, _params: unknown): Promise<unknown[]> {
        return [];
      },
      async one(_sql: string, _params: unknown): Promise<unknown> {
        return {};
      },
      async result(_sql: string, _params: unknown): Promise<{ rowCount: number }> {
        return { rowCount: 0 };
      },
    };

    const result = await executeSelect(
      db as unknown as Parameters<typeof executeSelect>[0],
      schema,
      (q) => q.from("users").firstOrDefault(),
      {},
    );

    expect(result).to.equal(null);
  });

  it("contains() should return boolean based on EXISTS result", async () => {
    let capturedSql: string | undefined;
    let capturedParams: unknown;

    const db = {
      async any(_sql: string, _params: unknown): Promise<unknown[]> {
        throw new Error("Unexpected db.any() for contains()");
      },
      async one(sql: string, params: unknown): Promise<unknown> {
        capturedSql = sql;
        capturedParams = params;
        return { ok: 1 };
      },
      async result(_sql: string, _params: unknown): Promise<{ rowCount: number }> {
        return { rowCount: 0 };
      },
    };

    const result = await executeSelect(
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
