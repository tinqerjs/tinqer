/**
 * Test direct object syntax for CRUD operations
 */

import { describe, it } from "mocha";
import { strict as assert } from "node:assert";
import { parseQuery } from "../dist/parser/parse-query.js";
import type { QueryBuilder } from "../dist/index.js";
import type { InsertOperation, UpdateOperation, ParamRef } from "../dist/query-tree/operations.js";
import type { ComparisonExpression, ConstantExpression } from "../dist/expressions/expression.js";

describe("CRUD Syntax - Direct Objects", () => {
  // Test schema
  interface TestSchema {
    users: {
      id: number;
      name: string;
      age: number;
      email?: string | null;
    };
  }

  describe("INSERT values()", () => {
    it("should accept direct object syntax", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>) =>
        q.insertInto("users").values({
          name: "Alice",
          age: 30,
          email: "alice@example.com",
        }),
      );

      assert(result);
      assert.equal(result.operation.operationType, "insert");
      const op = result.operation as InsertOperation;
      assert.equal(op.table, "users");
      assert.equal(op.values.type, "object");
      // The values are auto-parameterized
      const nameParam = op.values.properties.name as ParamRef;
      assert.equal(nameParam.type, "param");
      assert.equal(nameParam.param, "__p1");
      const ageParam = op.values.properties.age as ParamRef;
      assert.equal(ageParam.type, "param");
      assert.equal(ageParam.param, "__p2");
      const emailParam = op.values.properties.email as ParamRef;
      assert.equal(emailParam.type, "param");
      assert.equal(emailParam.param, "__p3");
    });

    it("should work with parameters in direct object syntax", () => {
      const result = parseQuery(
        (q: QueryBuilder<TestSchema>, params: { userName: string; userAge: number }) =>
          q.insertInto("users").values({
            name: params.userName,
            age: params.userAge,
          }),
      );

      assert(result);
      assert.equal(result.operation.operationType, "insert");
      const op = result.operation as InsertOperation;
      // When using actual parameters, we get params with properties
      const nameParam = op.values.properties.name as ParamRef;
      assert.equal(nameParam.type, "param");
      assert.equal(nameParam.param, "params");
      assert.equal(nameParam.property, "userName");
      const ageParam = op.values.properties.age as ParamRef;
      assert.equal(ageParam.type, "param");
      assert.equal(ageParam.param, "params");
      assert.equal(ageParam.property, "userAge");
    });
  });

  describe("UPDATE set()", () => {
    it("should accept direct object syntax", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>) =>
        q
          .update("users")
          .set({ age: 31, email: "newemail@example.com" })
          .where((u) => u.id === 1),
      );

      assert(result);
      assert.equal(result.operation.operationType, "update");
      const op = result.operation as UpdateOperation;
      assert.equal(op.table, "users");
      assert.equal(op.assignments.type, "object");
      // Direct object values are auto-parameterized
      const ageParam = op.assignments.properties.age as ParamRef;
      assert.equal(ageParam.type, "param");
      assert.equal(ageParam.param, "__p1");
      const emailParam = op.assignments.properties.email as ParamRef;
      assert.equal(emailParam.type, "param");
      assert.equal(emailParam.param, "__p2");
    });

    it("should work with parameters in direct object syntax", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, params: { newAge: number }) =>
        q
          .update("users")
          .set({ age: params.newAge })
          .where((u) => u.id === 3),
      );

      assert(result);
      assert.equal(result.operation.operationType, "update");
      const op = result.operation as UpdateOperation;
      // When using actual parameters, we get params with properties
      const ageParam = op.assignments.properties.age as ParamRef;
      assert.equal(ageParam.type, "param");
      assert.equal(ageParam.param, "params");
      assert.equal(ageParam.property, "newAge");
    });

    it("should capture undefined literals as constant expressions", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>) =>
        q
          .update("users")
          .set({ email: undefined, age: 42 })
          .where((u) => u.id === 4),
      );

      assert(result);
      const op = result.operation as UpdateOperation;
      const emailConst = op.assignments.properties.email as ConstantExpression;
      assert.equal(emailConst.type, "constant");
      assert.strictEqual(emailConst.value, undefined);

      const ageParam = op.assignments.properties.age as ParamRef;
      assert.equal(ageParam.type, "param");
      assert.equal(ageParam.param, "__p1");
    });
  });

  describe("Mixed syntax scenarios", () => {
    it("should handle complex INSERT with direct object", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>) =>
        q
          .insertInto("users")
          .values({
            name: "Complex User",
            age: 40,
            email: null,
          })
          .returning((u) => ({ id: u.id, name: u.name })),
      );

      assert(result);
      assert.equal(result.operation.operationType, "insert");
      const op = result.operation as InsertOperation;
      // Null is stored as a constant
      const emailConst = op.values.properties.email as ConstantExpression;
      assert.equal(emailConst.type, "constant");
      assert.equal(emailConst.value, null);
      assert(op.returning);
    });

    it("should handle UPDATE with mixed values", () => {
      const result = parseQuery((q: QueryBuilder<TestSchema>, params: { userId: number }) =>
        q
          .update("users")
          .set({
            age: 50,
            email: "static@example.com",
          })
          .where((u) => u.id === params.userId),
      );

      assert(result);
      assert.equal(result.operation.operationType, "update");
      const op = result.operation as UpdateOperation;
      // Direct object values are auto-parameterized
      const ageParam = op.assignments.properties.age as ParamRef;
      assert.equal(ageParam.type, "param");
      assert.equal(ageParam.param, "__p1");
      // WHERE clause (predicate) uses actual parameter with property
      assert(op.predicate);
      const pred = op.predicate as ComparisonExpression;
      const rightParam = pred.right as ParamRef;
      assert.equal(rightParam.type, "param");
      assert.equal(rightParam.param, "params");
      assert.equal(rightParam.property, "userId");
    });
  });
});
