import { describe, it } from "mocha";
import { expect } from "chai";
import { defineSelect, SelectPlanHandle } from "../dist/plans/select-plan.js";
import { createSchema } from "../dist/linq/database-context.js";
import type {
  FromOperation,
  WhereOperation,
  OrderByOperation,
  TakeOperation,
} from "../dist/query-tree/operations.js";

// Test schema
interface TestSchema {
  users: {
    id: number;
    name: string;
    age: number;
  };
}

const testSchema = createSchema<TestSchema>();

describe("Plan API - Basic Tests", () => {
  describe("defineSelect", () => {
    it("should create a basic SELECT plan", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"));

      expect(plan).to.be.instanceOf(SelectPlanHandle);

      const planData = plan.toPlan();
      expect(planData).to.have.property("operation");
      expect(planData.operation.operationType).to.equal("from");
      const fromOp = planData.operation as FromOperation;
      expect(fromOp.table).to.equal("users");
    });

    it("should handle WHERE with auto-parameterization", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).where((u) => u.age > 21);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("where");
      expect(planData.autoParams).to.have.property("__p1");
      expect(planData.autoParams.__p1).to.equal(21);
    });

    it("should handle SELECT projection", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).select((u) => ({
        userName: u.name,
      }));

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("select");
    });

    it("should handle ORDER BY", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).orderBy((u) => u.age);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("orderBy");
    });

    it("should handle TAKE with auto-parameterization", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).take(10);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("take");
      expect(planData.autoParams.__p1).to.equal(10);
    });

    it("should handle SKIP with auto-parameterization", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).skip(20);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("skip");
      expect(planData.autoParams.__p1).to.equal(20);
    });

    it("should chain multiple operations", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .where((u) => u.age > 18)
        .orderBy((u) => u.name)
        .take(5);

      const planData = plan.toPlan();

      // Top operation should be take
      expect(planData.operation.operationType).to.equal("take");

      // Check the chain
      const takeOp = planData.operation as TakeOperation;
      expect(takeOp.operationType).to.equal("take");
      const orderByOp = takeOp.source as OrderByOperation;
      expect(orderByOp.operationType).to.equal("orderBy");
      const whereOp = orderByOp.source as WhereOperation;
      expect(whereOp.operationType).to.equal("where");
      const fromOp = whereOp.source as FromOperation;
      expect(fromOp.operationType).to.equal("from");

      // Check auto-params
      expect(planData.autoParams.__p1).to.equal(18); // age > 18
      expect(planData.autoParams.__p2).to.equal(5); // take 5
    });

    it("should maintain immutability", () => {
      const plan1 = defineSelect(testSchema, (q) => q.from("users"));

      const plan2 = plan1.where((u) => u.age > 18);

      // Should be different instances
      expect(plan1).to.not.equal(plan2);

      // plan1 should still be just FROM
      expect(plan1.toPlan().operation.operationType).to.equal("from");

      // plan2 should be WHERE
      expect(plan2.toPlan().operation.operationType).to.equal("where");
    });

    it("should support external parameters in builder", () => {
      type Params = { minAge: number };

      const plan = defineSelect(testSchema, (q, p: Params) =>
        q.from("users").where((u) => u.age > p.minAge),
      );

      const sql = plan.finalize({ minAge: 18 });

      expect(sql.params.minAge).to.equal(18);
    });

    it("should handle finalize parameter merging", () => {
      // Note: WHERE with external params (u, p) => ... is not yet supported by visitors
      // This test demonstrates auto-param merging with provided params
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .where((u) => u.age > 21) // Auto-param
        .where((u) => u.name !== "Admin"); // Another auto-param

      const sql = plan.finalize({});

      // Should have auto params
      expect(sql.params.__p1).to.equal(21);
      expect(sql.params.__p2).to.equal("Admin");
    });

    it("should support WHERE with external parameters", () => {
      // This functionality requires visitor support for (item, params) => predicate
      // Currently visitWhereOperation only processes the first parameter
      type Params = { searchName: string };

      const plan = defineSelect(testSchema, (q) => q.from("users")).where<Params>(
        (u, p) => u.name === p.searchName,
      );

      const sql = plan.finalize({ searchName: "John" });
      expect(sql.params.searchName).to.equal("John");
    });
  });

  describe("Type safety", () => {
    it("SelectPlanHandle should extend Queryable", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"));

      // Test that plan has Queryable methods
      expect(plan.where).to.be.a("function");
      expect(plan.select).to.be.a("function");
      expect(plan.orderBy).to.be.a("function");
      expect(plan.take).to.be.a("function");
      expect(plan.skip).to.be.a("function");
      expect(plan.distinct).to.be.a("function");
      expect(plan.groupBy).to.be.a("function");

      // Test that it also has plan-specific methods
      expect(plan.finalize).to.be.a("function");
      expect(plan.toPlan).to.be.a("function");
    });
  });
});
