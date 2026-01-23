import { expect } from "chai";
import {
  clearParseCache,
  setParseCacheConfig,
  getParseCacheConfig,
  type QueryBuilder,
} from "@tinqerjs/tinqer";
import {
  executeSelect,
  executeSelectSimple,
  executeInsert,
  executeUpdate,
  executeDelete,
} from "@tinqerjs/pg-promise-adapter";
import { parseCache } from "@tinqerjs/tinqer/dist/parser/parse-cache.js";
import { setupTestDatabase } from "./test-setup.js";
import { db as dbClient } from "./shared-db.js";
import { schema, type TestDatabaseSchema } from "./database-schema.js";

describe("Parse Cache Integration Tests (PostgreSQL)", () => {
  let originalConfig: ReturnType<typeof getParseCacheConfig>;

  before(() => {
    originalConfig = getParseCacheConfig();
  });

  after(() => {
    setParseCacheConfig(originalConfig);
  });

  beforeEach(async () => {
    // Reset database to clean state before EACH test
    await setupTestDatabase(dbClient);
    // Reset parse cache
    clearParseCache();
    setParseCacheConfig({ enabled: true, capacity: 1024 });
  });

  describe("SELECT query caching", () => {
    it("should cache repeated SELECT queries", async () => {
      // First execution - should parse
      const result1 = await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );
      expect(parseCache.size()).to.equal(1);

      // Second execution - should hit cache (same function code)
      const result2 = await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );
      expect(parseCache.size()).to.equal(1);

      // Results should be identical
      expect(result1).to.deep.equal(result2);
    });

    it("should cache queries with parameters", async () => {
      // First execution
      await executeSelect(
        dbClient,
        schema,
        (q, p) => q.from("users").where((u) => u.age !== null && u.age >= p.minAge),
        { minAge: 21 },
      );
      expect(parseCache.size()).to.equal(1);

      // Second execution with different params (same query function code)
      await executeSelect(
        dbClient,
        schema,
        (q, p) => q.from("users").where((u) => u.age !== null && u.age >= p.minAge),
        { minAge: 30 },
      );
      expect(parseCache.size()).to.equal(1);
    });

    it("should bypass cache when cache option is false", async () => {
      // First execution with cache
      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );

      // Second execution with cache: false
      await executeSelectSimple(
        dbClient,
        schema,
        (q) => q.from("users").where((u) => u.age !== null && u.age >= 18),
        { cache: false },
      );

      // Cache size should not increase (still 0 or 1)
      expect(parseCache.size()).to.be.at.most(1);
    });

    it("should cache different queries separately", async () => {
      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );
      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 21),
      );

      expect(parseCache.size()).to.equal(2);
    });

    it("should cache complex queries with joins", async () => {
      await executeSelectSimple(dbClient, schema, (q) =>
        q
          .from("users")
          .join(
            q.from("departments"),
            (u) => u.department_id,
            (d) => d.id,
            (u, d) => ({ u, d }),
          )
          .select((r) => ({
            userName: r.u.name,
            deptName: r.d.name,
          })),
      );
      expect(parseCache.size()).to.equal(1);

      await executeSelectSimple(dbClient, schema, (q) =>
        q
          .from("users")
          .join(
            q.from("departments"),
            (u) => u.department_id,
            (d) => d.id,
            (u, d) => ({ u, d }),
          )
          .select((r) => ({
            userName: r.u.name,
            deptName: r.d.name,
          })),
      );
      expect(parseCache.size()).to.equal(1);
    });

    it("should cache terminal operations (count, sum, etc.)", async () => {
      await executeSelectSimple(dbClient, schema, (q) => q.from("users").count());
      await executeSelectSimple(dbClient, schema, (q) =>
        q
          .from("users")
          .where((u) => u.age !== null)
          .sum((u) => u.age!),
      );

      expect(parseCache.size()).to.equal(2);

      // Re-execute should hit cache
      await executeSelectSimple(dbClient, schema, (q) => q.from("users").count());
      await executeSelectSimple(dbClient, schema, (q) =>
        q
          .from("users")
          .where((u) => u.age !== null)
          .sum((u) => u.age!),
      );

      expect(parseCache.size()).to.equal(2);
    });
  });

  describe("INSERT statement caching", () => {
    it("should cache repeated INSERT statements", async () => {
      await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q.insertInto("users").values({
            name: p.name,
            age: p.age,
            email: p.email,
          }),
        {
          name: "Alice Cache Test",
          age: 25,
          email: "alice-cache-test@example.com",
        },
      );
      expect(parseCache.size()).to.equal(1);

      await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q.insertInto("users").values({
            name: p.name,
            age: p.age,
            email: p.email,
          }),
        {
          name: "Bob Cache Test",
          age: 30,
          email: "bob-cache-test@example.com",
        },
      );
      expect(parseCache.size()).to.equal(1);
    });

    it("should bypass INSERT cache when cache option is false", async () => {
      await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q.insertInto("users").values({
            name: p.name,
            age: 25,
            email: p.name + "-" + p.suffix + "@example.com",
          }),
        { name: "Alice", suffix: "bypass1" },
      );
      await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q.insertInto("users").values({
            name: p.name,
            age: 25,
            email: p.name + "-" + p.suffix + "@example.com",
          }),
        { name: "Bob", suffix: "bypass2" },
        { cache: false },
      );

      expect(parseCache.size()).to.be.at.most(1);
    });
  });

  describe("UPDATE statement caching", () => {
    it("should cache repeated UPDATE statements", async () => {
      // Use existing user IDs - 5 and 6 are employees with no one reporting to them
      await executeUpdate(
        dbClient,
        schema,
        (q, p) =>
          q
            .update("users")
            .set({ age: p.newAge })
            .where((u) => u.id === p.userId),
        { newAge: 26, userId: 5 },
      );
      expect(parseCache.size()).to.equal(1);

      await executeUpdate(
        dbClient,
        schema,
        (q, p) =>
          q
            .update("users")
            .set({ age: p.newAge })
            .where((u) => u.id === p.userId),
        { newAge: 27, userId: 6 },
      );
      expect(parseCache.size()).to.equal(1);
    });

    it("should bypass UPDATE cache when cache option is false", async () => {
      await executeUpdate(
        dbClient,
        schema,
        (q, p) =>
          q
            .update("users")
            .set({ age: p.newAge })
            .where((u) => u.id === p.userId),
        { newAge: 26, userId: 7 },
      );
      await executeUpdate(
        dbClient,
        schema,
        (q, p) =>
          q
            .update("users")
            .set({ age: p.newAge })
            .where((u) => u.id === p.userId),
        { newAge: 27, userId: 8 },
        { cache: false },
      );

      expect(parseCache.size()).to.be.at.most(1);
    });
  });

  describe("DELETE statement caching", () => {
    it("should cache repeated DELETE statements", async () => {
      // Insert temporary users for deletion testing
      const result1 = await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q
            .insertInto("users")
            .values({
              name: "Temp Delete Test",
              age: 30,
              email: p.email,
            })
            .returning((u) => ({ id: u.id })),
        { email: "delete-test-1@example.com" },
      );
      expect(result1[0]).to.exist;
      const userId1 = result1[0]!.id;

      const result2 = await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q
            .insertInto("users")
            .values({
              name: "Temp Delete Test",
              age: 30,
              email: p.email,
            })
            .returning((u) => ({ id: u.id })),
        { email: "delete-test-2@example.com" },
      );
      expect(result2[0]).to.exist;
      const userId2 = result2[0]!.id;

      // Delete the temporary users
      await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("users").where((u) => u.id === p.userId),
        { userId: userId1 },
      );
      expect(parseCache.size()).to.equal(2); // INSERT + DELETE queries cached

      await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("users").where((u) => u.id === p.userId),
        { userId: userId2 },
      );
      expect(parseCache.size()).to.equal(2); // Same two queries still cached

      // Verify deletions were successful
      const remaining1 = await dbClient.oneOrNone(
        "SELECT COUNT(*) as count FROM users WHERE id = $1",
        [userId1],
      );
      const remaining2 = await dbClient.oneOrNone(
        "SELECT COUNT(*) as count FROM users WHERE id = $1",
        [userId2],
      );
      expect(parseInt(remaining1?.count || "0")).to.equal(0);
      expect(parseInt(remaining2?.count || "0")).to.equal(0);
    });

    it("should bypass DELETE cache when cache option is false", async () => {
      // Insert temporary users for deletion testing
      const result1 = await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q
            .insertInto("users")
            .values({
              name: "Temp Delete Test",
              age: 30,
              email: p.email,
            })
            .returning((u) => ({ id: u.id })),
        { email: "delete-bypass-1@example.com" },
      );
      expect(result1[0]).to.exist;
      const userId1 = result1[0]!.id;

      const result2 = await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q
            .insertInto("users")
            .values({
              name: "Temp Delete Test",
              age: 30,
              email: p.email,
            })
            .returning((u) => ({ id: u.id })),
        { email: "delete-bypass-2@example.com" },
      );
      expect(result2[0]).to.exist;
      const userId2 = result2[0]!.id;

      await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("users").where((u) => u.id === p.userId),
        { userId: userId1 },
      );
      await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("users").where((u) => u.id === p.userId),
        { userId: userId2 },
        { cache: false },
      );

      expect(parseCache.size()).to.equal(2); // INSERT + DELETE queries cached (cache:false still uses cache)

      // Verify deletions were successful
      const remaining1 = await dbClient.oneOrNone(
        "SELECT COUNT(*) as count FROM users WHERE id = $1",
        [userId1],
      );
      const remaining2 = await dbClient.oneOrNone(
        "SELECT COUNT(*) as count FROM users WHERE id = $1",
        [userId2],
      );
      expect(parseInt(remaining1?.count || "0")).to.equal(0);
      expect(parseInt(remaining2?.count || "0")).to.equal(0);
    });
  });

  describe("Cache configuration integration", () => {
    it("should respect disabled cache in real queries", async () => {
      setParseCacheConfig({ enabled: false });

      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );
      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );

      expect(parseCache.size()).to.equal(0);
    });

    it("should respect capacity limit in real queries", async () => {
      setParseCacheConfig({ capacity: 2 });

      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );
      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 21),
      );
      expect(parseCache.size()).to.equal(2);

      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 25),
      );
      expect(parseCache.size()).to.equal(2); // Should evict oldest
    });
  });

  describe("Mixed operation caching", () => {
    it("should cache different operation types separately", async () => {
      await executeSelectSimple(dbClient, schema, (q) =>
        q.from("users").where((u) => u.age !== null && u.age >= 18),
      );
      await executeInsert(
        dbClient,
        schema,
        (q, p) =>
          q.insertInto("users").values({
            name: p.name,
            age: 25,
            email: p.name + "-" + p.suffix + "@example.com",
          }),
        { name: "Test", suffix: "mixed" },
      );
      await executeUpdate(
        dbClient,
        schema,
        (q, p) =>
          q
            .update("users")
            .set({ age: 26 })
            .where((u) => u.id === p.userId),
        { userId: 9 },
      );

      expect(parseCache.size()).to.equal(3);
    });
  });

  describe("Performance verification", () => {
    it("should demonstrate cache performance benefit", async () => {
      // Define query once so all uses have identical code
      const testQuery = (q: QueryBuilder<TestDatabaseSchema>) =>
        q
          .from("users")
          .where((u) => u.age !== null && u.age >= 18)
          .select((u) => ({ id: u.id, name: u.name }))
          .orderBy((u) => u.name)
          .take(10);

      // A deterministic "performance" check: verify we avoid re-parsing by hitting the cache,
      // rather than relying on wall-clock timing (which is flaky under parallel test load).
      const cache = parseCache as unknown as {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
      };

      const originalGet = cache.get;
      const originalSet = cache.set;

      let getHits = 0;
      let getMisses = 0;
      let setCount = 0;

      cache.get = (key) => {
        const cached = originalGet.call(parseCache, key);
        if (cached) {
          getHits += 1;
        } else {
          getMisses += 1;
        }
        return cached;
      };

      cache.set = (key, value) => {
        setCount += 1;
        originalSet.call(parseCache, key, value);
      };

      try {
        clearParseCache();
        await executeSelectSimple(dbClient, schema, testQuery);

        expect(parseCache.size()).to.equal(1);
        expect(getMisses).to.equal(1);
        expect(setCount).to.equal(1);

        const runs = 50;
        for (let i = 0; i < runs; i++) {
          await executeSelectSimple(dbClient, schema, testQuery);
        }

        expect(parseCache.size()).to.equal(1);
        expect(getHits).to.equal(runs);
        expect(getMisses).to.equal(1);
        expect(setCount).to.equal(1);

        // Now verify cache bypass via option
        getHits = 0;
        getMisses = 0;
        setCount = 0;
        clearParseCache();

        for (let i = 0; i < runs; i++) {
          await executeSelectSimple(dbClient, schema, testQuery, { cache: false });
        }

        expect(parseCache.size()).to.equal(0);
        expect(getHits).to.equal(0);
        expect(getMisses).to.equal(0);
        expect(setCount).to.equal(0);
      } finally {
        cache.get = originalGet;
        cache.set = originalSet;
      }
    });
  });
});
