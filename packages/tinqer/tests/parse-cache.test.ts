import { expect } from "chai";
import {
  parseQuery,
  setParseCacheConfig,
  getParseCacheConfig,
  clearParseCache,
} from "../dist/index.js";
import type { QueryBuilder } from "../dist/index.js";
import { parseCache } from "../dist/parser/parse-cache.js";

// Test types
type User = {
  id: number;
  name: string;
  age: number;
};

interface TestSchema {
  users: User;
}

describe("Parse Cache", () => {
  // Save original config
  let originalConfig: ReturnType<typeof getParseCacheConfig>;

  beforeEach(() => {
    // Save original config
    originalConfig = getParseCacheConfig();
    // Reset to default config
    setParseCacheConfig({ enabled: true, capacity: 1024 });
    // Clear cache
    clearParseCache();
  });

  afterEach(() => {
    // Restore original config
    setParseCacheConfig(originalConfig);
    clearParseCache();
  });

  describe("Basic caching behavior", () => {
    it("should cache parse results on second call", () => {
      const queryBuilder = (q: QueryBuilder<TestSchema>, p: { id: number }) =>
        q.from("users").where((u) => u.id === p.id);

      // First call - should parse
      const result1 = parseQuery(queryBuilder);
      expect(result1).to.not.be.null;

      // Check cache has entry
      expect(parseCache.size()).to.equal(1);

      // Second call - should hit cache
      const result2 = parseQuery(queryBuilder);
      expect(result2).to.not.be.null;

      // Results should have same operation (frozen, shared)
      expect(result1?.operation).to.equal(result2?.operation);

      // But autoParams should be different objects (cloned)
      expect(result1?.autoParams).to.not.equal(result2?.autoParams);
      expect(result1?.autoParams).to.deep.equal(result2?.autoParams);
    });

    it("should return cloned autoParams", () => {
      const queryBuilder = (q: QueryBuilder<TestSchema>) =>
        q.from("users").where((u) => u.age >= 18);

      const result1 = parseQuery(queryBuilder);
      const result2 = parseQuery(queryBuilder);

      // Mutate one result's autoParams
      if (result1 && result2) {
        (result1.autoParams as Record<string, unknown>).test = "mutated";

        // Other result should not be affected
        expect(result2.autoParams).to.not.have.property("test");
      }
    });

    it("should cache different queries separately", () => {
      const query1 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 18);
      const query2 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 21);

      parseQuery(query1);
      parseQuery(query2);

      expect(parseCache.size()).to.equal(2);
    });
  });

  describe("Cache bypass with options", () => {
    it("should bypass cache when cache option is false", () => {
      const queryBuilder = (q: QueryBuilder<TestSchema>) =>
        q.from("users").where((u) => u.age >= 18);

      // First call
      parseQuery(queryBuilder);
      const cacheSize = parseCache.size();
      expect(cacheSize).to.equal(1);

      // Second call with cache: false should not use cache
      // (but still adds to cache)
      parseQuery(queryBuilder, { cache: false });

      // Cache size should still be 1 (same query)
      expect(parseCache.size()).to.equal(1);
    });

    it("should not add to cache when cache option is false", () => {
      const queryBuilder = (q: QueryBuilder<TestSchema>) =>
        q.from("users").where((u) => u.age >= 18);

      clearParseCache();
      parseQuery(queryBuilder, { cache: false });

      // Should NOT cache when cache: false
      expect(parseCache.size()).to.equal(0);
    });
  });

  describe("Cache configuration", () => {
    it("should disable caching when enabled is false", () => {
      setParseCacheConfig({ enabled: false });

      const queryBuilder = (q: QueryBuilder<TestSchema>) =>
        q.from("users").where((u) => u.age >= 18);

      parseQuery(queryBuilder);

      // Should not cache
      expect(parseCache.size()).to.equal(0);
    });

    it("should disable caching when capacity is 0", () => {
      setParseCacheConfig({ capacity: 0 });

      const queryBuilder = (q: QueryBuilder<TestSchema>) =>
        q.from("users").where((u) => u.age >= 18);

      parseQuery(queryBuilder);

      // Should not cache
      expect(parseCache.size()).to.equal(0);
    });

    it("should respect capacity limit", () => {
      setParseCacheConfig({ capacity: 2 });

      const query1 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 18);
      const query2 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 21);
      const query3 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 25);

      parseQuery(query1);
      parseQuery(query2);
      expect(parseCache.size()).to.equal(2);

      // Third query should evict oldest (query1)
      parseQuery(query3);
      expect(parseCache.size()).to.equal(2);
    });

    it("should update capacity dynamically", () => {
      const query1 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 18);
      const query2 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 21);
      const query3 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 25);

      parseQuery(query1);
      parseQuery(query2);
      parseQuery(query3);
      expect(parseCache.size()).to.equal(3);

      // Reduce capacity
      setParseCacheConfig({ capacity: 2 });

      // Should evict oldest entry
      expect(parseCache.size()).to.equal(2);
    });

    it("should clear all cached entries", () => {
      const query1 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 18);
      const query2 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 21);

      parseQuery(query1);
      parseQuery(query2);
      expect(parseCache.size()).to.equal(2);

      clearParseCache();
      expect(parseCache.size()).to.equal(0);
    });
  });

  describe("LRU eviction", () => {
    it("should evict least recently used entry when capacity exceeded", () => {
      setParseCacheConfig({ capacity: 2 });

      const query1 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 18);
      const query2 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 21);
      const query3 = (q: QueryBuilder<TestSchema>) => q.from("users").where((u) => u.age >= 25);

      parseQuery(query1);
      parseQuery(query2);

      // Access query1 again to make it more recently used
      parseQuery(query1);

      // Add query3 - should evict query2 (least recently used)
      parseQuery(query3);

      expect(parseCache.size()).to.equal(2);

      // query1 and query3 should still be cached
      const result1 = parseQuery(query1);
      const result3 = parseQuery(query3);

      expect(result1).to.not.be.null;
      expect(result3).to.not.be.null;
    });
  });

  describe("Config API", () => {
    it("should get current config", () => {
      const config = getParseCacheConfig();

      expect(config).to.have.property("enabled");
      expect(config).to.have.property("capacity");
    });

    it("should update config partially", () => {
      setParseCacheConfig({ enabled: false });

      const config = getParseCacheConfig();

      expect(config.enabled).to.be.false;
      expect(config.capacity).to.equal(1024); // Should retain default
    });

    it("should update both config values", () => {
      setParseCacheConfig({ enabled: false, capacity: 512 });

      const config = getParseCacheConfig();

      expect(config.enabled).to.be.false;
      expect(config.capacity).to.equal(512);
    });
  });

  describe("Frozen operation tree", () => {
    it("should freeze operation tree to prevent mutations", () => {
      const queryBuilder = (q: QueryBuilder<TestSchema>) =>
        q.from("users").where((u) => u.age >= 18);

      const result = parseQuery(queryBuilder);

      // Try to mutate the operation
      expect(() => {
        if (result) {
          (result.operation as { operationType: string }).operationType = "invalid";
        }
      }).to.throw();
    });
  });
});
