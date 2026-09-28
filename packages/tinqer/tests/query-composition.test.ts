import { describe, it } from "mocha";
import { expect } from "chai";
import { defineSelect } from "../dist/plans/select-plan.js";
import { defineInsert } from "../dist/plans/insert-plan.js";
import { defineUpdate } from "../dist/plans/update-plan.js";
import { defineDelete } from "../dist/plans/delete-plan.js";
import { createSchema } from "../dist/linq/database-context.js";
import type { QueryBuilder } from "../dist/linq/query-builder.js";
import type { SelectOperation } from "../dist/query-tree/operations.js";

// Test schema
interface TestSchema {
  users: {
    id: number;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    departmentId: number;
  };
  posts: {
    id: number;
    userId: number;
    title: string;
    content: string;
    isPublished: boolean;
    viewCount: number;
    categoryId: number;
  };
  departments: {
    id: number;
    name: string;
    budget: number;
  };
  categories: {
    id: number;
    name: string;
    isActive: boolean;
  };
}

const testSchema = createSchema<TestSchema>();

describe("Query Composition", () => {
  describe("SELECT Composition", () => {
    describe("Parameter accumulation", () => {
      it("should accumulate params through multiple where clauses", () => {
        type Params1 = { minAge: number };
        type Params2 = { maxAge: number };
        type Params3 = { isActive: boolean };

        const plan = defineSelect(testSchema, (q) => q.from("users"))
          .where<Params1>((u: TestSchema["users"], p: Params1) => u.age >= p.minAge)
          .where<Params2>((u: TestSchema["users"], p: Params2) => u.age <= p.maxAge)
          .where<Params3>((u: TestSchema["users"], p: Params3) => u.isActive === p.isActive);

        const sql = plan.finalize({
          minAge: 18,
          maxAge: 65,
          isActive: true,
        });

        expect(sql.params.minAge).to.equal(18);
        expect(sql.params.maxAge).to.equal(65);
        expect(sql.params.isActive).to.equal(true);
      });

      it("should mix auto-params with external params", () => {
        type Params = { departmentId: number };

        const plan = defineSelect(testSchema, (q) => q.from("users"))
          .where((u) => u.age > 21) // auto-param
          .where<Params>((u, p) => u.departmentId === p.departmentId) // external
          .where((u) => u.name !== "Admin"); // auto-param

        const sql = plan.finalize({ departmentId: 5 });

        expect(sql.params.__p1).to.equal(21);
        expect(sql.params.departmentId).to.equal(5);
        expect(sql.params.__p2).to.equal("Admin");
      });

      it("should handle params in where with orderBy", () => {
        type Params = { filterName: string };

        const plan = defineSelect(testSchema, (q) => q.from("users"))
          .where<Params>((u: TestSchema["users"], p: Params) => u.name !== p.filterName)
          .orderBy((u: TestSchema["users"]) => u.age)
          .thenBy((u: TestSchema["users"]) => u.name);

        const sql = plan.finalize({
          filterName: "Test",
        });

        expect(sql.params.filterName).to.equal("Test");
      });
    });

    describe("Builder function composition", () => {
      it("should compose with builder function and chained methods", () => {
        type BuilderParams = { baseAge: number };
        type ChainParams = { maxAge: number };

        const plan = defineSelect(testSchema, (q, p: BuilderParams) =>
          q.from("users").where((u) => u.age > p.baseAge),
        ).where<ChainParams>((u, p) => u.age < p.maxAge);

        const sql = plan.finalize({
          baseAge: 18,
          maxAge: 65,
        });

        expect(sql.params.baseAge).to.equal(18);
        expect(sql.params.maxAge).to.equal(65);
      });

      it("should handle complex builder with multiple operations", () => {
        type Params = {
          minAge: number;
          maxAge: number;
          dept: number;
          limit: number;
        };

        const plan = defineSelect(testSchema, (q, p: Params) =>
          q
            .from("users")
            .where((u) => u.age >= p.minAge && u.age <= p.maxAge)
            .where((u) => u.departmentId === p.dept)
            .orderBy((u) => u.age)
            .take(p.limit),
        );

        const sql = plan.finalize({
          minAge: 25,
          maxAge: 50,
          dept: 3,
          limit: 10,
        });

        expect(sql.params.minAge).to.equal(25);
        expect(sql.params.maxAge).to.equal(50);
        expect(sql.params.dept).to.equal(3);
        expect(sql.params.limit).to.equal(10);
      });
    });

    describe("Immutability and reusability", () => {
      it("should maintain immutability when composing queries", () => {
        const base = defineSelect(testSchema, (q) => q.from("users"));
        const with1Where = base.where((u) => u.age > 18);
        const with2Wheres = with1Where.where((u) => u.isActive === true);

        // All should be different instances
        expect(base).to.not.equal(with1Where);
        expect(with1Where).to.not.equal(with2Wheres);

        // Each should have different operations
        const basePlan = base.toPlan();
        const with1Plan = with1Where.toPlan();
        const with2Plan = with2Wheres.toPlan();

        const baseOp = basePlan.operation as SelectOperation;
        const with1Op = with1Plan.operation as SelectOperation;
        const with2Op = with2Plan.operation as SelectOperation;

        // Just verify they are different operation instances
        expect(baseOp).to.not.equal(with1Op);
        expect(with1Op).to.not.equal(with2Op);
      });

      it("should allow creating multiple branches from same base", () => {
        type BaseParams = { dept: number };

        const base = defineSelect(testSchema, (q, p: BaseParams) =>
          q.from("users").where((u) => u.departmentId === p.dept),
        );

        // Branch 1: active users
        type Branch1Params = { minAge: number };
        const activeBranch = base
          .where((u) => u.isActive === true)
          .where<Branch1Params>((u, p) => u.age >= p.minAge);

        // Branch 2: inactive users
        type Branch2Params = { maxAge: number };
        const inactiveBranch = base
          .where((u) => u.isActive === false)
          .where<Branch2Params>((u, p) => u.age <= p.maxAge);

        // Execute both branches with different params
        const activeSql = activeBranch.finalize({ dept: 1, minAge: 25 });
        const inactiveSql = inactiveBranch.finalize({ dept: 1, maxAge: 65 });

        expect(activeSql.params.dept).to.equal(1);
        expect(activeSql.params.minAge).to.equal(25);
        expect(activeSql.params.__p1).to.equal(true);

        expect(inactiveSql.params.dept).to.equal(1);
        expect(inactiveSql.params.maxAge).to.equal(65);
        expect(inactiveSql.params.__p1).to.equal(false);
      });
    });

    describe("Complex composition scenarios", () => {
      it("should handle subqueries with params", () => {
        type OuterParams = { minViewCount: number };
        type InnerParams = { userId: number };

        // Note: Actual subquery implementation would need visitor support
        // This tests the parameter composition pattern
        const plan = defineSelect(testSchema, (q) => q.from("posts"))
          .where<OuterParams>((p, params) => p.viewCount > params.minViewCount)
          .where<InnerParams>((p, params) => p.userId === params.userId);

        const sql = plan.finalize({
          minViewCount: 100,
          userId: 42,
        });

        expect(sql.params.minViewCount).to.equal(100);
        expect(sql.params.userId).to.equal(42);
      });

      it("should compose with all query operations", () => {
        type Params = {
          minAge: number;
          dept: number;
          sortField: string;
          pageSize: number;
          pageNumber: number;
        };

        const plan = defineSelect(testSchema, (q, p: Params) =>
          q
            .from("users")
            .where((u) => u.age >= p.minAge)
            .where((u) => u.departmentId === p.dept)
            .orderBy((u) => u.age)
            .skip((p.pageNumber - 1) * p.pageSize)
            .take(p.pageSize)
            .select((u) => ({
              id: u.id,
              name: u.name,
              age: u.age,
            })),
        );

        const sql = plan.finalize({
          minAge: 21,
          dept: 3,
          sortField: "age",
          pageSize: 20,
          pageNumber: 2,
        });

        expect(sql.params.minAge).to.equal(21);
        expect(sql.params.dept).to.equal(3);
        expect(sql.params.pageSize).to.equal(20);
        expect(sql.params.pageNumber).to.equal(2);
      });
    });
  });

  describe("INSERT Composition", () => {
    describe("Parameter handling in values", () => {
      it("should handle values with auto-params", () => {
        const plan = defineInsert(testSchema, (qb: QueryBuilder<TestSchema>) =>
          qb.insertInto("users"),
        ).values({
          name: "Alice",
          email: "alice@example.com",
          age: 30,
          isActive: true,
          departmentId: 1,
        });

        const sql = plan.finalize({});

        expect(sql.params.__p1).to.equal("Alice");
        expect(sql.params.__p2).to.equal("alice@example.com");
        expect(sql.params.__p3).to.equal(30);
        expect(sql.params.__p4).to.equal(true);
        expect(sql.params.__p5).to.equal(1);
      });

      it("should compose values with returning", () => {
        const plan = defineInsert(testSchema, (qb: QueryBuilder<TestSchema>) =>
          qb.insertInto("posts"),
        )
          .values({
            userId: 1,
            title: "New Post",
            content: "Post content here",
            isPublished: false,
            viewCount: 0,
            categoryId: 1,
          })
          .returning((p: TestSchema["posts"]) => ({ id: p.id, title: p.title }));

        const sql = plan.finalize({});

        expect(sql.params.__p1).to.equal(1);
        expect(sql.params.__p2).to.equal("New Post");
        expect(sql.params.__p3).to.equal("Post content here");
        expect(sql.params.__p4).to.equal(false);
        expect(sql.params.__p5).to.equal(0);
        expect(sql.params.__p6).to.equal(1);
      });
    });

    describe("Builder vs chained composition", () => {
      it("should handle chained values", () => {
        const plan = defineInsert(testSchema, (qb: QueryBuilder<TestSchema>) =>
          qb.insertInto("users"),
        ).values({
          name: "Bob",
          email: "bob@example.com",
          age: 25,
          isActive: true,
          departmentId: 1,
        });

        const sql = plan.finalize({});

        expect(sql.params.__p1).to.equal("Bob");
        expect(sql.params.__p2).to.equal("bob@example.com");
        expect(sql.params.__p3).to.equal(25);
        expect(sql.params.__p4).to.equal(true);
        expect(sql.params.__p5).to.equal(1);
      });

      it("should compose chained values and returning", () => {
        const plan = defineInsert(testSchema, (qb: QueryBuilder<TestSchema>) =>
          qb.insertInto("posts"),
        )
          .values({
            userId: 1,
            title: "Test",
            content: "Content",
            isPublished: true,
            viewCount: 0,
            categoryId: 1,
          })
          .returning((p) => p); // Changed from "*" to lambda

        const sql = plan.finalize({});

        expect(sql.params.__p1).to.equal(1);
        expect(sql.params.__p2).to.equal("Test");
        expect(sql.params.__p3).to.equal("Content");
        expect(sql.params.__p4).to.equal(true);
        expect(sql.params.__p5).to.equal(0);
        expect(sql.params.__p6).to.equal(1);
      });
    });
  });

  describe("UPDATE Composition", () => {
    describe("Parameter accumulation in set and where", () => {
      it("should mix auto-params and external params", () => {
        type WhereParams = { threshold: number };

        const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("posts"))
          .set({
            isPublished: true, // auto-param
            viewCount: 0, // auto-param
          })
          .where<WhereParams>((p, params) => p.viewCount > params.threshold);

        const sql = plan.finalize({ threshold: 1000 });

        expect(sql.params.__p1).to.equal(true);
        expect(sql.params.__p2).to.equal(0);
        expect(sql.params.threshold).to.equal(1000);
      });
    });
  });

  describe("DELETE Composition", () => {
    describe("Parameter handling in where", () => {
      it("should handle external params in where", () => {
        type Params = { minAge: number; isActive: boolean };

        const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
          qb.deleteFrom("users"),
        ).where<Params>((u, p) => u.age < p.minAge && u.isActive === p.isActive);

        const sql = plan.finalize({
          minAge: 18,
          isActive: false,
        });

        expect(sql.params.minAge).to.equal(18);
        expect(sql.params.isActive).to.equal(false);
      });

      it("should compose with builder function", () => {
        type Params = { userId: number; minViews: number };

        const plan = defineDelete(testSchema, (q: QueryBuilder<TestSchema>, p: Params) =>
          q
            .deleteFrom("posts")
            .where(
              (post: TestSchema["posts"]) =>
                post.userId === p.userId && post.viewCount < p.minViews,
            ),
        );

        const sql = plan.finalize({
          userId: 42,
          minViews: 10,
        });

        expect(sql.params.userId).to.equal(42);
        expect(sql.params.minViews).to.equal(10);
      });
    });

    describe("Complex delete composition", () => {
      it("should handle multiple conditions", () => {
        const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
          qb.deleteFrom("users"),
        ).where((u: TestSchema["users"]) => u.isActive === false && u.departmentId === 3);

        const sql = plan.finalize({});

        expect(sql.params.__p1).to.equal(false);
        expect(sql.params.__p2).to.equal(3);
      });
    });
  });

  describe("Type Safety and Compile-Time Checks", () => {
    it("should enforce parameter types at compile time", () => {
      type RequiredParams = {
        userId: number;
        minAge: number;
        isActive: boolean;
      };

      const plan = defineSelect(testSchema, (q, p: RequiredParams) =>
        q
          .from("users")
          .where((u) => u.id === p.userId)
          .where((u) => u.age >= p.minAge)
          .where((u) => u.isActive === p.isActive),
      );

      // TypeScript should enforce all required params
      const sql = plan.finalize({
        userId: 1,
        minAge: 18,
        isActive: true,
      });

      expect(sql.params.userId).to.equal(1);
      expect(sql.params.minAge).to.equal(18);
      expect(sql.params.isActive).to.equal(true);

      // This would cause TypeScript error:
      // plan.finalize({ userId: 1 }); // Missing minAge and isActive
    });

    it("should accumulate parameter types through chaining", () => {
      type Params1 = { param1: string };
      type Params2 = { param2: number };
      type Params3 = { param3: boolean };

      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .where<Params1>((u: TestSchema["users"], p: Params1) => u.name === p.param1)
        .where<Params2>((u: TestSchema["users"], p: Params2) => u.age === p.param2)
        .where<Params3>((u: TestSchema["users"], p: Params3) => u.isActive === p.param3);

      // TypeScript enforces all accumulated params
      const sql = plan.finalize({
        param1: "Test",
        param2: 30,
        param3: true,
      });

      expect(sql.params.param1).to.equal("Test");
      expect(sql.params.param2).to.equal(30);
      expect(sql.params.param3).to.equal(true);
    });
  });

  describe("Cross-Operation Patterns", () => {
    it("should use consistent parameter naming across operations", () => {
      type UserParams = { userId: number };

      // SELECT with userId
      const selectPlan = defineSelect(testSchema, (q: QueryBuilder<TestSchema>, p: UserParams) =>
        q.from("posts").where((post: TestSchema["posts"]) => post.userId === p.userId),
      );

      // UPDATE with userId
      const updatePlan = defineUpdate(testSchema, (q: QueryBuilder<TestSchema>, p: UserParams) =>
        q
          .update("posts")
          .set({ viewCount: 0 })
          .where((post: TestSchema["posts"]) => post.userId === p.userId),
      );

      // DELETE with userId
      const deletePlan = defineDelete(testSchema, (q: QueryBuilder<TestSchema>, p: UserParams) =>
        q.deleteFrom("posts").where((post: TestSchema["posts"]) => post.userId === p.userId),
      );

      // All should accept the same param structure
      const params = { userId: 42 };

      const selectSql = selectPlan.finalize(params);
      const updateSql = updatePlan.finalize(params);
      const deleteSql = deletePlan.finalize(params);

      expect(selectSql.params.userId).to.equal(42);
      expect(updateSql.params.userId).to.equal(42);
      expect(deleteSql.params.userId).to.equal(42);
    });
  });
});
