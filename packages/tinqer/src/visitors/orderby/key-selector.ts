/**
 * ORDER BY key selector visitor
 * Extracts the sorting key from lambda expressions
 */

import type {
  ValueExpression,
  ColumnExpression,
  ParameterExpression,
  ArithmeticExpression,
  ConcatExpression,
} from "../../expressions/expression.js";

import type {
  Expression as ASTExpression,
  MemberExpression,
  Identifier,
  Literal,
  BinaryExpression,
  CallExpression,
  UnaryExpression,
} from "../../parser/ast-types.js";

import type { OrderByContext } from "./context.js";
import { createAutoParam } from "./context.js";
import { matchesFtsCallee, buildFtsRankExpression } from "../fts/index.js";

/**
 * Visit key selector expression for ORDER BY
 * Returns ValueExpression that can be used as sort key
 */
export function visitKeySelector(
  node: ASTExpression,
  context: OrderByContext,
): ValueExpression | null {
  if (!node) return null;

  switch (node.type) {
    case "MemberExpression":
      return visitMemberAccess(node as MemberExpression, context);

    case "Identifier":
      return visitIdentifier(node as Identifier, context);

    case "Literal":
    case "NumericLiteral":
    case "StringLiteral":
    case "BooleanLiteral":
    case "NullLiteral":
      return visitLiteral(node as Literal, context);

    case "BinaryExpression":
      return visitBinaryExpression(node as BinaryExpression, context);

    case "CallExpression":
      return visitMethodCall(node as CallExpression, context);

    case "UnaryExpression":
      return visitUnaryExpression(node as UnaryExpression, context);

    case "ConditionalExpression":
      // TODO: Support CASE WHEN for complex sorting
      return null;

    case "ParenthesizedExpression": {
      // Unwrap parentheses
      const paren = node as { expression: ASTExpression };
      return visitKeySelector(paren.expression, context);
    }

    default:
      return null;
  }
}

/**
 * Visit member access (e.g., x.name, x.address.city)
 */
function visitMemberAccess(
  node: MemberExpression,
  context: OrderByContext,
): ColumnExpression | ParameterExpression | null {
  if (!node.computed && node.property.type === "Identifier") {
    const propertyName = (node.property as Identifier).name;

    // Simple member access: x.name
    if (node.object.type === "Identifier") {
      const objectName = (node.object as Identifier).name;

      // Check if this is accessing a JOIN result property
      const extContext = context as OrderByContext & {
        joinResultParam?: string;
        currentResultShape?: {
          properties: Map<string, { type: string; columnName?: string; sourceTable?: number }>;
        };
      };
      if (extContext.joinResultParam === objectName && extContext.currentResultShape) {
        const shapeProp = extContext.currentResultShape.properties.get(propertyName);
        if (shapeProp) {
          if (shapeProp.type === "column") {
            // Direct column from JOIN result
            return {
              type: "column",
              name: shapeProp.columnName || propertyName,
              source: { type: "joinResult", tableIndex: shapeProp.sourceTable || 0 },
            };
          }
        }
      }

      // Table parameter column
      if (context.tableParams.has(objectName)) {
        return {
          type: "column",
          name: propertyName,
        };
      }

      // Query parameter property
      if (context.queryParams.has(objectName)) {
        return {
          type: "param",
          param: objectName,
          property: propertyName,
        };
      }
    }

    // Nested member access: x.address.city
    if (node.object.type === "MemberExpression") {
      const innerColumn = visitMemberAccess(node.object as MemberExpression, context);
      if (innerColumn && innerColumn.type === "column") {
        return {
          type: "column",
          name: `${innerColumn.name}.${propertyName}`,
        };
      }
    }
  }

  return null;
}

/**
 * Visit identifier
 */
function visitIdentifier(node: Identifier, context: OrderByContext): ValueExpression | null {
  const name = node.name;

  // Table parameter (entire row - unusual for ORDER BY)
  if (context.tableParams.has(name)) {
    return {
      type: "column",
      name,
    };
  }

  // Query parameter
  if (context.queryParams.has(name)) {
    return {
      type: "param",
      param: name,
    };
  }

  return null;
}

/**
 * Visit literal value
 */
function visitLiteral(node: Literal, context: OrderByContext): ValueExpression {
  // NULL is special - not parameterized
  if (node.value === null) {
    return {
      type: "constant",
      value: null,
      valueType: "null",
    };
  }

  // Auto-parameterize other literals
  const paramName = createAutoParam(context, node.value);
  return {
    type: "param",
    param: paramName,
  };
}

/**
 * Visit binary expression (arithmetic for computed sort keys)
 */
function visitBinaryExpression(
  node: BinaryExpression,
  context: OrderByContext,
): ValueExpression | null {
  // Only handle arithmetic operators for ORDER BY
  if (!["+", "-", "*", "/", "%"].includes(node.operator)) {
    return null;
  }

  const left = visitKeySelector(node.left, context);
  const right = visitKeySelector(node.right, context);

  if (!left || !right) return null;

  // Check for string concatenation
  if (node.operator === "+" && (isStringExpression(left) || isStringExpression(right))) {
    return {
      type: "concat",
      left,
      right,
    } as ConcatExpression;
  }

  // Regular arithmetic
  return {
    type: "arithmetic",
    operator: node.operator as "+" | "-" | "*" | "/" | "%",
    left,
    right,
  } as ArithmeticExpression;
}

/**
 * Visit method call (e.g., x.name.toLowerCase())
 */
function visitMethodCall(node: CallExpression, context: OrderByContext): ValueExpression | null {
  // Full-text-search rank (h.fts.rank) as a sort key
  if (matchesFtsCallee(node, context.helpersParam, "rank")) {
    return buildFtsRankExpression(node, (arg) => visitKeySelector(arg, context));
  }

  if (node.callee.type !== "MemberExpression") return null;

  const memberCallee = node.callee as MemberExpression;
  if (memberCallee.property.type !== "Identifier") return null;

  const methodName = (memberCallee.property as Identifier).name;

  // String methods for sorting
  if (["toLowerCase", "toUpperCase"].includes(methodName)) {
    const obj = visitKeySelector(memberCallee.object, context);
    if (!obj) return null;

    return {
      type: "stringMethod",
      object: obj,
      method: methodName as "toLowerCase" | "toUpperCase",
    };
  }

  return null;
}

/**
 * Visit unary expression
 */
function visitUnaryExpression(
  node: UnaryExpression,
  context: OrderByContext,
): ValueExpression | null {
  // Unary minus for negative sorting
  if (node.operator === "-") {
    if (node.argument.type === "NumericLiteral" || node.argument.type === "Literal") {
      const lit = node.argument as Literal;
      if (typeof lit.value === "number") {
        const value = -lit.value;
        const paramName = createAutoParam(context, value);
        return {
          type: "param",
          param: paramName,
        };
      }
    }

    // Negate other expressions
    const arg = visitKeySelector(node.argument, context);
    if (arg) {
      return {
        type: "arithmetic",
        operator: "*",
        left: { type: "constant", value: -1 },
        right: arg,
      } as ArithmeticExpression;
    }
  }

  // Unary plus (pass through)
  if (node.operator === "+") {
    return visitKeySelector(node.argument, context);
  }

  return null;
}

/**
 * Check if expression is likely a string
 */
function isStringExpression(expr: ValueExpression): boolean {
  if (expr.type === "constant") {
    return typeof (expr as { value: unknown }).value === "string";
  }
  if (expr.type === "concat") {
    return true;
  }
  if (expr.type === "column") {
    const name = (expr as ColumnExpression).name.toLowerCase();
    return name.includes("name") || name.includes("title") || name.includes("description");
  }
  return false;
}
