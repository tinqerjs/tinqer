import { describe, it } from "mocha";
import { expect } from "chai";
import { defineSelect, SelectPlanHandle } from "../dist/plans/select-plan.js";
import { createSchema } from "../dist/linq/database-context.js";
import type {
  QueryOperation,
  FromOperation,
  WhereOperation,
  SelectOperation,
  OrderByOperation,
  ThenByOperation,
  TakeOperation,
  SkipOperation,
  GroupByOperation,
  DistinctOperation,
} from "../dist/query-tree/operations.js";

// Test schema
interface TestSchema {
  users: {
    id: number;
    name: string;
    age: number;
    email: string;
  };
  posts: {
    id: number;
    userId: number;
    title: string;
    content: string;
  };
}

const testSchema = createSchema<TestSchema>();

describe("SelectPlanHandle", () => {
  describe("Basic plan creation", () => {
    it("should create a plan with defineSelect", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"));

      expect(plan).to.be.instanceOf(SelectPlanHandle);

      const planData = plan.toPlan();
      expect(planData).to.have.property("operation");
      expect(planData.operation.operationType).to.equal("from");
      const fromOp = planData.operation as FromOperation;
      expect(fromOp.table).to.equal("users");
    });

    it("should maintain immutability when chaining", () => {
      const plan1 = defineSelect(testSchema, (q) => q.from("users"));

      const plan2 = plan1.where((u) => u.age > 18);
      const plan3 = plan2.select((u) => ({ name: u.name, age: u.age }));

      // All should be different instances
      expect(plan1).to.not.equal(plan2);
      expect(plan2).to.not.equal(plan3);

      // Original plan should still just have from
      const plan1Data = plan1.toPlan();
      expect(plan1Data.operation.operationType).to.equal("from");

      // plan2 should have where
      const plan2Data = plan2.toPlan();
      expect(plan2Data.operation.operationType).to.equal("where");

      // plan3 should have select
      const plan3Data = plan3.toPlan();
      expect(plan3Data.operation.operationType).to.equal("select");
    });
  });

  describe("WHERE operations", () => {
    it("should add where clause with auto-parameterization", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).where((u) => u.age > 21);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("where");
      expect(planData.autoParams).to.have.property("__p1");
      expect(planData.autoParams.__p1).to.equal(21);
    });

    it("should support where with external parameters", () => {
      type Params = { minAge: number };

      const plan = defineSelect(testSchema, (q) => q.from("users")).where<Params>(
        (u, p) => u.age > p.minAge,
      );

      const sql = plan.finalize({ minAge: 25 });
      expect(sql.params).to.have.property("minAge");
      expect(sql.params.minAge).to.equal(25);
    });

    it("should support multiple where clauses", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .where((u) => u.age > 18)
        .where((u) => u.name !== "Admin");

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("where");

      // Should have auto-parameterized both constants
      expect(planData.autoParams).to.have.property("__p1");
      expect(planData.autoParams.__p1).to.equal(18);
      expect(planData.autoParams).to.have.property("__p2");
      expect(planData.autoParams.__p2).to.equal("Admin");
    });
  });

  describe("SELECT projection", () => {
    it("should project specific fields", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).select((u) => ({
        userName: u.name,
        userAge: u.age,
      }));

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("select");

      // Check that the source is the FROM operation
      const selectOp = planData.operation as SelectOperation;
      expect(selectOp.source?.operationType).to.equal("from");
    });

    it("should handle nested select operations", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .select((u) => ({ name: u.name, age: u.age }))
        .select((x) => ({ userName: x.name }));

      const planData = plan.toPlan();

      // Top level should be the second select
      expect(planData.operation.operationType).to.equal("select");

      // Its source should be the first select
      const topSelect = planData.operation as SelectOperation;
      expect(topSelect.source?.operationType).to.equal("select");

      // And that source's source should be FROM
      const innerSelect = topSelect.source as SelectOperation;
      expect(innerSelect.source?.operationType).to.equal("from");
    });
  });

  describe("ORDER BY operations", () => {
    it("should add orderBy clause", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).orderBy((u) => u.age);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("orderBy");
    });

    it("should support orderByDescending", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).orderByDescending(
        (u) => u.name,
      );

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("orderBy");
      expect((planData.operation as OrderByOperation).descending).to.equal(true);
    });

    it("should support thenBy after orderBy", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .orderBy((u) => u.age)
        .thenBy((u) => u.name);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("thenBy");

      // Source should be orderBy
      const thenByOp = planData.operation as ThenByOperation;
      expect(thenByOp.source?.operationType).to.equal("orderBy");
    });

    it("should support thenByDescending", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .orderBy((u) => u.age)
        .thenByDescending((u) => u.name);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("thenBy");
      expect((planData.operation as ThenByOperation).descending).to.equal(true);
    });
  });

  describe("Pagination operations", () => {
    it("should add take operation", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).take(10);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("take");

      // Should auto-parameterize the count
      expect(planData.autoParams).to.have.property("__p1");
      expect(planData.autoParams.__p1).to.equal(10);
    });

    it("should add skip operation", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).skip(20);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("skip");

      // Should auto-parameterize the count
      expect(planData.autoParams).to.have.property("__p1");
      expect(planData.autoParams.__p1).to.equal(20);
    });

    it("should combine skip and take for pagination", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .skip(20)
        .take(10);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("take");

      const takeOp = planData.operation as TakeOperation;
      expect(takeOp.source?.operationType).to.equal("skip");

      // Should have both parameters
      expect(planData.autoParams.__p1).to.equal(20); // skip amount
      expect(planData.autoParams.__p2).to.equal(10); // take amount
    });
  });

  describe("Set operations", () => {
    it("should add distinct operation", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).distinct();

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("distinct");
    });

    it("should add reverse operation", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).reverse();

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("reverse");
    });
  });

  describe("GroupBy operation", () => {
    it("should add groupBy clause", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).groupBy((u) => u.age);

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("groupBy");
    });

    it("should handle composite groupBy keys", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users")).groupBy((u) => ({
        age: u.age,
        name: u.name,
      }));

      const planData = plan.toPlan();
      expect(planData.operation.operationType).to.equal("groupBy");

      // The key selector should be an object expression
      const groupByOp = planData.operation as GroupByOperation;
      expect(groupByOp.keySelector).to.exist;
    });
  });

  describe("Complex query chains", () => {
    it("should handle a complex query with multiple operations", () => {
      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .where((u) => u.age > 18)
        .select((u) => ({ name: u.name, age: u.age }))
        .orderBy((u) => u.age)
        .thenBy((u) => u.name)
        .skip(10)
        .take(5)
        .distinct();

      const planData = plan.toPlan();

      // Top level should be distinct
      expect(planData.operation.operationType).to.equal("distinct");

      // Walk the chain to verify structure
      let op: QueryOperation | undefined = planData.operation;
      const operations: string[] = [];

      while (op) {
        operations.push(op.operationType);
        op = (
          op as
            | DistinctOperation
            | TakeOperation
            | SkipOperation
            | ThenByOperation
            | OrderByOperation
            | SelectOperation
            | WhereOperation
        ).source;
      }

      expect(operations).to.deep.equal([
        "distinct",
        "take",
        "skip",
        "thenBy",
        "orderBy",
        "select",
        "where",
        "from",
      ]);

      // Check auto parameters were collected
      expect(planData.autoParams.__p1).to.equal(18); // age > 18
      expect(planData.autoParams.__p2).to.equal(10); // skip 10
      expect(planData.autoParams.__p3).to.equal(5); // take 5
    });
  });

  describe("finalize method", () => {
    it("should merge auto-params with provided params", () => {
      type Params = { maxAge: number };

      const plan = defineSelect(testSchema, (q) => q.from("users"))
        .where((u) => u.age > 18)
        .where<Params>((u, p) => u.age < p.maxAge)
        .take(10);

      const sql = plan.finalize({ maxAge: 65 });

      // Should have both auto params and provided params
      expect(sql.params.__p1).to.equal(18); // auto param for age > 18
      expect(sql.params.maxAge).to.equal(65); // provided param
      expect(sql.params.__p2).to.equal(10); // auto param for take(10)

      // Operation should be the full chain
      expect(sql.operation.operationType).to.equal("take");
    });
  });

  // NOTE: join, groupJoin, and selectMany are not supported on plan handles.
  // These operations must be composed inside the defineSelect builder:
  //   const plan = defineSelect(schema, (q) => q.from("users").join(q.from("orders"), ...));
  // See packages/tinqer/tests/cross-join-normalization.test.ts for working selectMany example
});
