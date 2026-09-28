import type {
  ValueExpression,
  BooleanExpression,
  ComparisonExpression,
  ColumnExpression,
  ConstantExpression,
  MemberAccessExpression,
  ParameterExpression,
  LogicalExpression,
  NotExpression,
  ArithmeticExpression,
  BooleanColumnExpression,
} from "../../dist/expressions/expression.js";

export const expr = {
  // Basic value expressions
  column(name: string): ColumnExpression {
    return { type: "column", name };
  },

  constant(value: string | number | boolean | null | undefined): ConstantExpression {
    const valueType =
      typeof value === "number"
        ? "number"
        : typeof value === "string"
          ? "string"
          : typeof value === "boolean"
            ? "boolean"
            : value === null
              ? "null"
              : value === undefined
                ? "undefined"
                : undefined;
    return valueType ? { type: "constant", value, valueType } : { type: "constant", value };
  },

  parameter(param: string, property?: string): ParameterExpression {
    return property ? { type: "param", param, property } : { type: "param", param };
  },

  // Member access
  member(object: ValueExpression, member: string): MemberAccessExpression {
    return { type: "memberAccess", object: object as ValueExpression, member };
  },

  // Boolean column
  booleanColumn(name: string): BooleanColumnExpression {
    return { type: "booleanColumn", name };
  },

  // Comparison operators (take ValueExpression, return BooleanExpression)
  eq(left: ValueExpression, right: ValueExpression): ComparisonExpression {
    return { type: "comparison", operator: "==", left, right };
  },

  ne(left: ValueExpression, right: ValueExpression): ComparisonExpression {
    return { type: "comparison", operator: "!=", left, right };
  },

  gt(left: ValueExpression, right: ValueExpression): ComparisonExpression {
    return { type: "comparison", operator: ">", left, right };
  },

  gte(left: ValueExpression, right: ValueExpression): ComparisonExpression {
    return { type: "comparison", operator: ">=", left, right };
  },

  lt(left: ValueExpression, right: ValueExpression): ComparisonExpression {
    return { type: "comparison", operator: "<", left, right };
  },

  lte(left: ValueExpression, right: ValueExpression): ComparisonExpression {
    return { type: "comparison", operator: "<=", left, right };
  },

  // Logical operators (take BooleanExpression, return BooleanExpression)
  and(left: BooleanExpression, right: BooleanExpression): LogicalExpression {
    return { type: "logical", operator: "and", left, right };
  },

  or(left: BooleanExpression, right: BooleanExpression): LogicalExpression {
    return { type: "logical", operator: "or", left, right };
  },

  not(expression: BooleanExpression): NotExpression {
    return { type: "not", expression };
  },

  // Arithmetic operators (take ValueExpression, return ValueExpression)
  add(left: ValueExpression, right: ValueExpression): ArithmeticExpression {
    return { type: "arithmetic", operator: "+", left, right };
  },

  subtract(left: ValueExpression, right: ValueExpression): ArithmeticExpression {
    return { type: "arithmetic", operator: "-", left, right };
  },

  multiply(left: ValueExpression, right: ValueExpression): ArithmeticExpression {
    return { type: "arithmetic", operator: "*", left, right };
  },

  divide(left: ValueExpression, right: ValueExpression): ArithmeticExpression {
    return { type: "arithmetic", operator: "/", left, right };
  },

  modulo(left: ValueExpression, right: ValueExpression): ArithmeticExpression {
    return { type: "arithmetic", operator: "%", left, right };
  },
};
