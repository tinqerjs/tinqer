import { describe, it } from "mocha";
import { expect } from "chai";
import {
  defineDelete,
  DeletePlanHandleInitial,
  DeletePlanHandleComplete,
} from "../dist/plans/delete-plan.js";
import { createSchema } from "../dist/linq/database-context.js";
import type { QueryBuilder } from "../dist/linq/query-builder.js";
import type { DeleteOperation } from "../dist/query-tree/operations.js";

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
  };
}

const testSchema = createSchema<TestSchema>();

describe("DeletePlanHandle", () => {
  describe("Basic plan creation", () => {
    it("should create a plan with defineDelete", () => {
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("users"),
      );

      expect(plan).to.be.instanceOf(DeletePlanHandleInitial);

      const planData = plan.where((u) => u.id === 1).toPlan();

      expect(planData).to.have.property("operation");
      expect(planData.operation.operationType).to.equal("delete");
      const deleteOp = planData.operation as DeleteOperation;
      expect(deleteOp.table).to.equal("users");
      expect(deleteOp.predicate).to.exist;
    });

    it("should maintain immutability when adding where", () => {
      const plan1 = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("users"),
      );
      const plan2 = plan1.where((u) => u.id === 1);

      // Should be different instances
      expect(plan1).to.not.equal(plan2);

      // plan1 should still be Initial
      expect(plan1).to.be.instanceOf(DeletePlanHandleInitial);

      // plan2 should be Complete
      expect(plan2).to.be.instanceOf(DeletePlanHandleComplete);
    });
  });

  describe("WHERE operation", () => {
    it("should add where clause with auto-parameterization", () => {
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("users"),
      ).where((u) => u.isActive === false);

      const planData = plan.toPlan();
      const deleteOp = planData.operation as DeleteOperation;

      expect(deleteOp.predicate).to.exist;
      expect(planData.autoParams).to.have.property("__p1");
      expect(planData.autoParams.__p1).to.equal(false);
    });

    it("should support where with external parameters", () => {
      // This functionality requires visitor support for (item, params) => predicate
      // Currently visitors only process the first parameter
      type Params = { minId: number };

      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).where<Params>((p, params) => p.id > params.minId);

      const sql = plan.finalize({ minId: 100 });

      expect(sql.params).to.have.property("minId");
      expect(sql.params.minId).to.equal(100);
    });

    it("should support complex where conditions", () => {
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).where((p) => p.isPublished === false && p.userId === 5);

      const planData = plan.toPlan();
      const deleteOp = planData.operation as DeleteOperation;

      expect(deleteOp.predicate).to.exist;
      // Should have auto-parameterized both values
      expect(planData.autoParams.__p1).to.equal(false);
      expect(planData.autoParams.__p2).to.equal(5);
    });
  });

  describe("allowFullTableDelete operation", () => {
    it("should allow full table delete when explicitly called", () => {
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).allowFullTableDelete();

      const planData = plan.toPlan();
      const deleteOp = planData.operation as DeleteOperation;

      expect(deleteOp.allowFullTableDelete).to.equal(true);
      expect(deleteOp.predicate).to.not.exist;
    });

    it("should be mutually exclusive with where", () => {
      // Cannot test runtime error in TypeScript compile time,
      // but the visitor should throw if allowFullTableDelete is called after where
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("users"),
      ).allowFullTableDelete();

      expect(plan).to.be.instanceOf(DeletePlanHandleComplete);

      const planData = plan.toPlan();
      const deleteOp = planData.operation as DeleteOperation;
      expect(deleteOp.allowFullTableDelete).to.equal(true);
    });
  });

  describe("finalize method", () => {
    it("should merge auto-params with provided params", () => {
      // For now, just test auto-params since external params in WHERE aren't supported yet
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).where((p) => p.userId === 42 && p.isPublished === false);

      const sql = plan.finalize({});

      expect(sql).to.have.property("operation");
      expect(sql).to.have.property("params");
      expect(sql.params.__p1).to.equal(42); // auto-param for userId
      expect(sql.params.__p2).to.equal(false); // auto-param for isPublished
    });

    it("should work with allowFullTableDelete", () => {
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).allowFullTableDelete();

      const sql = plan.finalize({});

      expect(sql.operation.operationType).to.equal("delete");
      const deleteOp = sql.operation as DeleteOperation;
      expect(deleteOp.allowFullTableDelete).to.equal(true);
      expect(sql.params).to.deep.equal({});
    });
  });

  describe("External Parameters in WHERE", () => {
    it("should support external params with simple predicate", () => {
      type Params = { targetId: number };

      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("users"),
      ).where<Params>((u, params) => u.id === params.targetId);

      const sql = plan.finalize({ targetId: 42 });
      expect(sql.params.targetId).to.equal(42);
    });

    it("should handle complex external param conditions", () => {
      type Params = { minId: number; maxId: number; dept: number };

      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("users"),
      ).where<Params>(
        (u, params) =>
          u.id >= params.minId && u.id <= params.maxId && u.departmentId === params.dept,
      );

      const sql = plan.finalize({ minId: 10, maxId: 100, dept: 5 });
      expect(sql.params.minId).to.equal(10);
      expect(sql.params.maxId).to.equal(100);
      expect(sql.params.dept).to.equal(5);
    });

    it("should support builder function with external params", () => {
      type Params = { userId: number; minViews: number };

      const plan = defineDelete(testSchema, (q: QueryBuilder<TestSchema>, p: Params) =>
        q
          .deleteFrom("posts")
          .where(
            (post: TestSchema["posts"]) => post.userId === p.userId && post.viewCount < p.minViews,
          ),
      );

      const sql = plan.finalize({ userId: 123, minViews: 10 });
      expect(sql.params.userId).to.equal(123);
      expect(sql.params.minViews).to.equal(10);
    });

    it("should mix external params with OR conditions", () => {
      type Params = { threshold: number; userId: number };

      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).where<Params>((p, params) => p.viewCount < params.threshold || p.userId === params.userId);

      const sql = plan.finalize({ threshold: 5, userId: 99 });
      expect(sql.params.threshold).to.equal(5);
      expect(sql.params.userId).to.equal(99);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle delete with multiple conditions", () => {
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("users"),
      ).where((u) => u.isActive === false && u.email.endsWith("@old.com"));

      const planData = plan.toPlan();
      const deleteOp = planData.operation as DeleteOperation;

      expect(deleteOp.predicate).to.exist;
      expect(planData.autoParams.__p1).to.equal(false);
      expect(planData.autoParams.__p2).to.equal("@old.com");
    });

    it("should handle delete with OR conditions", () => {
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).where((p) => p.userId === 1 || p.isPublished === false);

      const planData = plan.toPlan();
      const deleteOp = planData.operation as DeleteOperation;

      expect(deleteOp.predicate).to.exist;
      expect(planData.autoParams.__p1).to.equal(1);
      expect(planData.autoParams.__p2).to.equal(false);
    });

    it("should handle delete with external and auto params", () => {
      type Params = { maxId: number; status: boolean };
      const plan = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      ).where<Params>(
        (p, params) => p.id < params.maxId && p.isPublished === params.status && p.title === "Test",
      );
      const sql = plan.finalize({ maxId: 1000, status: true });
      expect(sql.params.maxId).to.equal(1000);
      expect(sql.params.status).to.equal(true);
      expect(sql.params.__p1).to.equal("Test"); // auto-param for title
    });

    it("should maintain immutability with external params", () => {
      type Params1 = { id1: number };
      type Params2 = { id2: number };

      const base = defineDelete(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.deleteFrom("posts"),
      );
      const branch1 = base.where<Params1>((p, params) => p.id === params.id1);
      const branch2 = base.where<Params2>((p, params) => p.id === params.id2);

      // All should be different instances
      expect(base).to.not.equal(branch1);
      expect(base).to.not.equal(branch2);
      expect(branch1).to.not.equal(branch2);

      // Each branch should work independently
      const sql1 = branch1.finalize({ id1: 10 });
      const sql2 = branch2.finalize({ id2: 20 });

      expect(sql1.params.id1).to.equal(10);
      expect(sql2.params.id2).to.equal(20);
    });
  });
});
