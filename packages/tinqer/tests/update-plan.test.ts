import { describe, it } from "mocha";
import { expect } from "chai";
import {
  defineUpdate,
  UpdatePlanHandleInitial,
  UpdatePlanHandleWithSet,
  UpdatePlanHandleComplete,
} from "../dist/plans/update-plan.js";
import { createSchema } from "../dist/linq/database-context.js";
import type { QueryBuilder } from "../dist/linq/query-builder.js";
import type { UpdateOperation } from "../dist/query-tree/operations.js";

// Test schema
interface TestSchema {
  users: {
    id: number;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    lastLogin: Date | null;
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

describe("UpdatePlanHandle", () => {
  describe("Basic plan creation", () => {
    it("should create a plan with defineUpdate", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("users"));

      expect(plan).to.be.instanceOf(UpdatePlanHandleInitial);

      const planData = plan
        .set({ name: "John", age: 30 })
        .where((u) => u.id === 1)
        .toPlan();

      expect(planData).to.have.property("operation");
      expect(planData.operation.operationType).to.equal("update");
      const updateOp = planData.operation as UpdateOperation;
      expect(updateOp.table).to.equal("users");
      expect(updateOp.predicate).to.exist;
      expect(updateOp.assignments).to.exist;
    });

    it("should maintain immutability when adding set", () => {
      const plan1 = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("users"));
      const plan2 = plan1.set({ name: "Jane" });

      // Should be different instances
      expect(plan1).to.not.equal(plan2);

      // plan1 should still be Initial
      expect(plan1).to.be.instanceOf(UpdatePlanHandleInitial);

      // plan2 should be WithSet
      expect(plan2).to.be.instanceOf(UpdatePlanHandleWithSet);
    });

    it("should maintain immutability when adding where", () => {
      const plan1 = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.update("users"),
      ).set({ name: "Jane" });
      const plan2 = plan1.where((u) => u.id === 1);

      // Should be different instances
      expect(plan1).to.not.equal(plan2);

      // plan1 should still be WithSet
      expect(plan1).to.be.instanceOf(UpdatePlanHandleWithSet);

      // plan2 should be Complete
      expect(plan2).to.be.instanceOf(UpdatePlanHandleComplete);
    });
  });

  describe("SET operation", () => {
    it("should add set clause with auto-parameterization", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.update("users"),
      ).set({
        name: "Alice",
        age: 25,
        isActive: true,
      });

      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;

      expect(updateOp.assignments).to.exist;
      expect(planData.autoParams).to.have.property("__p1");
      expect(planData.autoParams.__p1).to.equal("Alice");
      expect(planData.autoParams.__p2).to.equal(25);
      expect(planData.autoParams.__p3).to.equal(true);
    });

    it("should handle null values in set", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.update("users"),
      ).set({
        lastLogin: null,
      });

      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;

      expect(updateOp.assignments).to.exist;
      // null should not be auto-parameterized
      expect(Object.keys(planData.autoParams)).to.have.length(0);
    });
  });

  describe("WHERE operation", () => {
    it("should add where clause with auto-parameterization", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("users"))
        .set({ isActive: false })
        .where((u) => u.age > 65);

      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;

      expect(updateOp.predicate).to.exist;
      expect(planData.autoParams.__p1).to.equal(false); // from set
      expect(planData.autoParams.__p2).to.equal(65); // from where
    });

    it("should support where without external parameters", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("posts"))
        .set({ isPublished: false })
        .where((p) => p.viewCount < 10);

      const sql = plan.finalize({});

      expect(sql.params).to.have.property("__p1");
      expect(sql.params.__p1).to.equal(false);
      expect(sql.params.__p2).to.equal(10);
    });

    it("should support where with external parameters", () => {
      type Params = { minAge: number; status: boolean };

      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("users"))
        .set({ isActive: true })
        .where<Params>((u, params) => u.age >= params.minAge && u.isActive === params.status);

      const sql = plan.finalize({ minAge: 18, status: false });

      expect(sql.params).to.have.property("minAge");
      expect(sql.params.minAge).to.equal(18);
      expect(sql.params.status).to.equal(false);
      expect(sql.params.__p1).to.equal(true); // from set
    });

    it("should support complex where conditions", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("posts"))
        .set({ isPublished: true })
        .where((p) => p.viewCount > 100 && p.userId === 5);

      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;

      expect(updateOp.predicate).to.exist;
      expect(planData.autoParams.__p1).to.equal(true); // from set
      expect(planData.autoParams.__p2).to.equal(100); // from where
      expect(planData.autoParams.__p3).to.equal(5); // from where
    });

    it("should support OR conditions in where", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("users"))
        .set({ isActive: false })
        .where((u) => u.age < 18 || u.age > 65);

      const planData = plan.toPlan();
      expect(planData.autoParams.__p1).to.equal(false); // from set
      expect(planData.autoParams.__p2).to.equal(18);
      expect(planData.autoParams.__p3).to.equal(65);
    });
  });

  describe("allowFullTableUpdate operation", () => {
    it("should allow full table update when explicitly called", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("posts"))
        .set({ viewCount: 0 })
        .allowFullTableUpdate();

      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;

      expect(updateOp.allowFullTableUpdate).to.equal(true);
      expect(updateOp.predicate).to.not.exist;
    });

    it("should be mutually exclusive with where", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("users"))
        .set({ isActive: false })
        .allowFullTableUpdate();

      expect(plan).to.be.instanceOf(UpdatePlanHandleComplete);

      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;
      expect(updateOp.allowFullTableUpdate).to.equal(true);
      expect(updateOp.predicate).to.not.exist;
    });
  });

  describe("finalize method", () => {
    it("should merge auto-params with provided params", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("posts"))
        .set({ isPublished: true, viewCount: 0 })
        .where((p) => p.userId === 42);

      const sql = plan.finalize({});

      expect(sql).to.have.property("operation");
      expect(sql).to.have.property("params");
      expect(sql.params.__p1).to.equal(true); // isPublished
      expect(sql.params.__p2).to.equal(0); // viewCount
      expect(sql.params.__p3).to.equal(42); // userId in where
    });

    it("should work with allowFullTableUpdate", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("posts"))
        .set({ isPublished: false })
        .allowFullTableUpdate();

      const sql = plan.finalize({});

      expect(sql.operation.operationType).to.equal("update");
      const updateOp = sql.operation as UpdateOperation;
      expect(updateOp.allowFullTableUpdate).to.equal(true);
      expect(sql.params.__p1).to.equal(false);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle update with multiple set fields and conditions", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) => qb.update("users"))
        .set({
          name: "Anonymous",
          email: "deleted@example.com",
          isActive: false,
        })
        .where((u) => u.isActive === false && u.lastLogin === null);

      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;

      expect(updateOp.assignments).to.exist;
      expect(updateOp.predicate).to.exist;
      expect(planData.autoParams.__p1).to.equal("Anonymous");
      expect(planData.autoParams.__p2).to.equal("deleted@example.com");
      expect(planData.autoParams.__p3).to.equal(false);
      expect(planData.autoParams.__p4).to.equal(false);
      // null is not auto-parameterized
    });

    it("should handle update with builder function", () => {
      type Params = { userId: number; newTitle: string };

      const plan = defineUpdate(testSchema, (q: QueryBuilder<TestSchema>, params: Params) =>
        q
          .update("posts")
          .set({ title: params.newTitle })
          .where((p: TestSchema["posts"]) => p.userId === params.userId),
      );

      const sql = plan.finalize({ userId: 5, newTitle: "Updated Title" });

      expect(sql.params.userId).to.equal(5);
      expect(sql.params.newTitle).to.equal("Updated Title");
    });
  });

  describe("Type safety", () => {
    it("should enforce correct table types", () => {
      const plan = defineUpdate(testSchema, (qb: QueryBuilder<TestSchema>) =>
        qb.update("users"),
      ).set({
        name: "Test",
        age: 30,
      });

      // TypeScript should enforce that these fields exist on users table
      const planData = plan.toPlan();
      const updateOp = planData.operation as UpdateOperation;
      expect(updateOp.table).to.equal("users");
    });
  });
});
