/**
 * SELECT projection visitor
 * Converts AST expressions to projection expressions (columns, objects, values)
 */

import type {
  Expression,
  ObjectExpression,
  ValueExpression,
  ColumnExpression,
  ArithmeticExpression,
  ConcatExpression,
  BooleanExpression,
  CaseExpression,
  ComparisonExpression,
  LogicalExpression,
  NotExpression,
  IsNullExpression,
  ReferenceExpression,
} from "../../expressions/expression.js";

import type {
  Expression as ASTExpression,
  ObjectExpression as ASTObjectExpression,
  MemberExpression,
  Identifier,
  Literal,
  BinaryExpression,
  CallExpression,
  UnaryExpression,
  ArrowFunctionExpression,
} from "../../parser/ast-types.js";

import type { SelectContext } from "./context.js";
import { createAutoParam } from "./context.js";
import { isWindowFunctionCall, visitWindowFunction } from "../window/index.js";
import { isBooleanExpression, isValueExpression } from "../utils.js";

/**
 * Visit a projection expression in SELECT context
 * Returns Expression (ValueExpression or ObjectExpression)
 */
export function visitProjection(node: ASTExpression, context: SelectContext): Expression | null {
  if (!node) return null;

  switch (node.type) {
    case "ObjectExpression": {
      // Object projection: { id: x.id, name: x.name }
      return visitObjectProjection(node as ASTObjectExpression, context);
    }

    case "MemberExpression": {
      // Column projection: x.name
      return visitColumnProjection(node as MemberExpression, context);
    }

    case "Identifier": {
      // Direct identifier (could be table param or query param)
      return visitIdentifierProjection(node as Identifier, context);
    }

    case "Literal":
    case "NumericLiteral":
    case "StringLiteral":
    case "BooleanLiteral":
    case "NullLiteral": {
      // Literal value projection
      return visitLiteralProjection(node as Literal, context);
    }

    case "BinaryExpression": {
      // Arithmetic, concatenation, or comparison
      return visitBinaryProjection(node as BinaryExpression, context);
    }

    case "CallExpression": {
      // Method calls (string methods, etc.)
      return visitMethodProjection(node as CallExpression, context);
    }

    case "UnaryExpression": {
      // Unary operations (negation, etc.)
      return visitUnaryProjection(node as UnaryExpression, context);
    }

    case "ConditionalExpression": {
      // Ternary operator (CASE WHEN)
      return visitConditionalProjection(node, context);
    }

    case "LogicalExpression": {
      // Null coalescing operator (??) and value-defaulting (||)
      const logical = node as { operator: string; left: ASTExpression; right: ASTExpression };
      const left = visitProjection(logical.left, context);
      const right = visitProjection(logical.right, context);

      if (!left || !right) {
        return null;
      }

      if (logical.operator === "??") {
        if (isValueExpression(left) && isValueExpression(right)) {
          return {
            type: "coalesce",
            expressions: [left, right],
          } as ValueExpression;
        }
        return null;
      }

      if (logical.operator === "||") {
        // Treat || as COALESCE when used in value context (common for defaults)
        if (isValueExpression(left) && isValueExpression(right)) {
          return {
            type: "coalesce",
            expressions: [left, right],
          } as ValueExpression;
        }

        // Otherwise, allow boolean OR
        if (isBooleanExpression(left) && isBooleanExpression(right)) {
          return {
            type: "logical",
            operator: "or",
            left: left as BooleanExpression,
            right: right as BooleanExpression,
          } as LogicalExpression;
        }
      }
      return null;
    }

    case "ParenthesizedExpression": {
      // Unwrap parentheses
      const paren = node as { expression: ASTExpression };
      return visitProjection(paren.expression, context);
    }

    default:
      return null;
  }
}

/**
 * Visit object projection
 */
function visitObjectProjection(
  node: ASTObjectExpression,
  context: SelectContext,
): ObjectExpression | null {
  const properties: Record<string, Expression> = {};

  for (const prop of node.properties) {
    // Handle spread operator
    if ("type" in prop && (prop as { type: string }).type === "SpreadElement") {
      // Spread operator expands to all columns from the source
      // Use a special key that will be detected by the SQL generator
      properties["__spread__"] = {
        type: "allColumns",
      };
      continue;
    }

    // Extract property key
    let key: string | null = null;
    if (prop.key?.type === "Identifier") {
      key = (prop.key as Identifier).name;
    } else if (prop.key?.type === "Literal" || prop.key?.type === "StringLiteral") {
      key = String((prop.key as Literal).value);
    }

    if (key && prop.value) {
      const value = visitProjection(prop.value, context);
      if (value) {
        properties[key] = value;
      }
    }
  }

  return {
    type: "object",
    properties,
  };
}

/**
 * Visit column projection
 */
function visitColumnProjection(node: MemberExpression, context: SelectContext): Expression | null {
  if (!node.computed && node.property.type === "Identifier") {
    const propertyName = (node.property as Identifier).name;

    // Simple member access: x.name
    if (node.object.type === "Identifier") {
      const objectName = (node.object as Identifier).name;

      // Check if this is accessing JOIN result shape (e.g., result.joined or joined.u)
      if (context.tableParams.has(objectName) && context.currentResultShape) {
        // Look up the property in the result shape
        const shapeProp = context.currentResultShape.properties.get(propertyName);

        if (shapeProp) {
          if (shapeProp.type === "reference") {
            // It's a table reference - return a reference expression
            const refShape = shapeProp as { type: "reference"; sourceTable: number };
            return {
              type: "reference",
              source: { type: "joinParam", paramIndex: refShape.sourceTable },
            };
          } else if (shapeProp.type === "column") {
            // It's a column from the JOIN result
            const colShape = shapeProp as {
              type: "column";
              sourceTable: number;
              columnName: string;
            };
            return {
              type: "column",
              name: colShape.columnName,
              source: { type: "joinParam", paramIndex: colShape.sourceTable },
            };
          } else if (shapeProp.type === "object") {
            // It's a nested object from the JOIN result
            // We need to return this as a placeholder that will be resolved further
            // when accessing properties on it
            return {
              type: "column",
              name: propertyName, // Keep the property name for now
              table: objectName, // Mark that this is from the joined result
            };
          }
        }
      }

      // Grouping parameter access (g.key, g.count(), etc.)
      if (context.groupingParams.has(objectName)) {
        if (propertyName === "key") {
          // g.key refers to the GROUP BY key expression
          return (context.groupKeyExpression as Expression) || null;
        }
        // Other properties on grouping params will be handled by method calls
        return null;
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

    // Nested member access: x.address.city or g.key.category or joined.u.name
    if (node.object.type === "MemberExpression") {
      const innerMember = node.object as MemberExpression;

      // Special case for JOIN result shape: joined.u.name or result.joined.user.name
      // We need to handle deeper nesting
      if (
        innerMember.object.type === "Identifier" &&
        innerMember.property.type === "Identifier" &&
        !innerMember.computed
      ) {
        const outerName = (innerMember.object as Identifier).name;
        const middleName = (innerMember.property as Identifier).name;

        // Check if this is accessing JOIN result shape
        if (context.tableParams.has(outerName) && context.currentResultShape) {
          // Look up the middle property in the result shape
          const shapeProp = context.currentResultShape.properties.get(middleName);

          if (shapeProp && shapeProp.type === "reference") {
            // It's a table reference - return column with table marker
            const refShape = shapeProp as { type: "reference"; sourceTable: number };
            return {
              type: "column",
              name: propertyName,
              source: { type: "joinParam", paramIndex: refShape.sourceTable },
            };
          } else if (shapeProp && shapeProp.type === "object") {
            // It's a nested object - look deeper
            const nestedShape = shapeProp as {
              type: "object";
              properties: Map<string, { type: string; sourceTable?: number }>;
            };
            const deepProp = nestedShape.properties.get(propertyName);

            if (deepProp && deepProp.type === "reference") {
              // Found a table reference at the deeper level
              const refShape = deepProp as { type: "reference"; sourceTable: number };
              // We're accessing a property on this reference, so return just the table marker
              // The actual column name will be added by the outer expression
              return {
                type: "reference",
                source: { type: "joinParam", paramIndex: refShape.sourceTable },
              };
            }
          }
        }
      } else if (innerMember.object.type === "MemberExpression") {
        // Even deeper nesting: result.joined.user accessing .name
        // First resolve the inner member expression
        const innerResult = visitColumnProjection(innerMember, context);

        if (innerResult && innerResult.type === "reference") {
          // We got a reference back, now access the property on it
          const refExpr = innerResult as ReferenceExpression;
          return {
            type: "column",
            name: propertyName,
            source: refExpr.source, // Use the same source as the reference
          };
        }
      }

      const innerExpr = visitColumnProjection(innerMember, context);

      // If inner expression is an object (like g.key returning a composite key)
      if (innerExpr && innerExpr.type === "object") {
        const objExpr = innerExpr as ObjectExpression;
        // Extract the specific property from the object
        if (objExpr.properties[propertyName]) {
          return objExpr.properties[propertyName];
        }
      }

      // If inner expression is a reference, convert to column access
      if (innerExpr && innerExpr.type === "reference") {
        const refExpr = innerExpr as ReferenceExpression;
        return {
          type: "column",
          name: propertyName,
          source: refExpr.source, // Use the same source as the reference
        };
      }

      // Regular nested column access
      if (innerExpr && innerExpr.type === "column") {
        const innerCol = innerExpr as ColumnExpression;
        // If the inner column has a table, use it
        if (innerCol.table) {
          return {
            type: "column",
            name: propertyName,
            table: innerCol.name, // The inner column's name becomes the table reference
          };
        }
        // Otherwise concatenate for nested property access
        return {
          type: "column",
          name: `${innerCol.name}.${propertyName}`,
        };
      }
    }
  }

  return null;
}

/**
 * Visit identifier projection
 */
function visitIdentifierProjection(node: Identifier, context: SelectContext): Expression | null {
  const name = node.name;

  // Table parameter (entire row)
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
 * Visit literal projection
 */
function visitLiteralProjection(node: Literal, context: SelectContext): ValueExpression {
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
 * Visit binary expression in projection
 */
function visitBinaryProjection(node: BinaryExpression, context: SelectContext): Expression | null {
  // Comparison operators - return as boolean expressions
  if (["==", "===", "!=", "!==", ">", ">=", "<", "<="].includes(node.operator)) {
    const left = visitProjection(node.left, context);
    const right = visitProjection(node.right, context);

    if (!left || !right) return null;

    const op = node.operator === "===" ? "==" : node.operator === "!==" ? "!=" : node.operator;
    return {
      type: "comparison",
      operator: op as "==" | "!=" | ">" | ">=" | "<" | "<=",
      left: left as ValueExpression,
      right: right as ValueExpression,
    } as ComparisonExpression;
  }

  // Arithmetic operators
  if (["+", "-", "*", "/", "%"].includes(node.operator)) {
    const left = visitProjection(node.left, context);
    const right = visitProjection(node.right, context);

    if (!left || !right) return null;

    // Check for string concatenation (+)
    if (node.operator === "+" && (isStringExpression(left) || isStringExpression(right))) {
      return {
        type: "concat",
        left: left as ValueExpression,
        right: right as ValueExpression,
      } as ConcatExpression;
    }

    // Regular arithmetic
    return {
      type: "arithmetic",
      operator: node.operator as "+" | "-" | "*" | "/" | "%",
      left: left as ValueExpression,
      right: right as ValueExpression,
    } as ArithmeticExpression;
  }

  return null;
}

/**
 * Visit method call in projection
 */
function visitMethodProjection(node: CallExpression, context: SelectContext): Expression | null {
  // Check for window function calls first
  const windowFunctionType = isWindowFunctionCall(node, context);
  if (windowFunctionType) {
    // Create a wrapper that adapts visitProjection to the expected signature
    const expressionVisitor = (node: ASTExpression, ctx: unknown) =>
      visitProjection(node, ctx as SelectContext);
    return visitWindowFunction(node, windowFunctionType, context, expressionVisitor);
  }

  if (node.callee.type !== "MemberExpression") return null;

  const memberCallee = node.callee as MemberExpression;
  if (memberCallee.property.type !== "Identifier") return null;

  const methodName = (memberCallee.property as Identifier).name;

  // Check if this is a method call on a grouping parameter (e.g., g.count())
  if (memberCallee.object.type === "Identifier") {
    const objectName = (memberCallee.object as Identifier).name;

    if (context.groupingParams.has(objectName)) {
      // Handle aggregate methods on grouping parameter
      if (methodName === "count") {
        return {
          type: "aggregate",
          function: "count",
        } as Expression;
      } else if (methodName === "sum") {
        // sum() requires a selector argument
        if (node.arguments && node.arguments.length > 0) {
          const arg = node.arguments[0];
          if (arg && arg.type === "ArrowFunctionExpression") {
            const lambda = arg as ArrowFunctionExpression;
            // Parse the selector lambda
            const selector = parseSelectorLambda(lambda, context);
            if (selector) {
              // Accept any value expression, not just columns
              return {
                type: "aggregate",
                function: "sum",
                expression: selector,
              } as Expression;
            }
          }
        }
      } else if (["avg", "average", "min", "max"].includes(methodName)) {
        // Similar handling for other aggregates
        if (node.arguments && node.arguments.length > 0) {
          const arg = node.arguments[0];
          if (arg && arg.type === "ArrowFunctionExpression") {
            const lambda = arg as ArrowFunctionExpression;
            const selector = parseSelectorLambda(lambda, context);
            if (selector) {
              // Accept any value expression, not just columns
              // Map "average" to "avg" for SQL
              const functionName = methodName === "average" ? "avg" : methodName;
              return {
                type: "aggregate",
                function: functionName,
                expression: selector,
              } as Expression;
            }
          }
        }
      }
    }
  }

  // String methods
  if (["toLowerCase", "toUpperCase"].includes(methodName)) {
    const obj = visitProjection(memberCallee.object, context);
    if (!obj) return null;

    return {
      type: "stringMethod",
      object: obj as ValueExpression,
      method: methodName as "toLowerCase" | "toUpperCase",
    };
  }

  // Check for unsupported Date methods
  if (methodName === "getTime") {
    throw new Error(`Unsupported method: ${methodName}(). Date arithmetic is not supported.`);
  }

  // Check for Date.now() static call
  if (
    memberCallee.object.type === "Identifier" &&
    (memberCallee.object as Identifier).name === "Date" &&
    methodName === "now"
  ) {
    throw new Error(
      "Unsupported call expression: Date.now(). External functions are not supported.",
    );
  }

  return null;
}

/**
 * Helper to parse selector lambda in aggregate functions
 */
function parseSelectorLambda(
  lambda: ArrowFunctionExpression,
  context: SelectContext,
): Expression | null {
  // Get the lambda body
  let bodyExpr: ASTExpression | null = null;
  if (lambda.body.type === "BlockStatement") {
    const returnStmt = lambda.body.body.find(
      (stmt: unknown) => (stmt as { type?: string }).type === "ReturnStatement",
    );
    if (returnStmt) {
      bodyExpr = (returnStmt as { argument?: ASTExpression }).argument || null;
    }
  } else {
    bodyExpr = lambda.body;
  }

  if (!bodyExpr) return null;

  // Add lambda parameter to table params temporarily
  const tempContext = { ...context };
  tempContext.tableParams = new Set(context.tableParams);

  if (lambda.params && lambda.params.length > 0) {
    const firstParam = lambda.params[0];
    if (firstParam && firstParam.type === "Identifier") {
      tempContext.tableParams.add((firstParam as Identifier).name);
    }
  }

  return visitProjection(bodyExpr, tempContext);
}

/**
 * Visit unary expression in projection
 */
function visitUnaryProjection(node: UnaryExpression, context: SelectContext): Expression | null {
  // Unary minus
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
    const arg = visitProjection(node.argument, context);
    if (arg) {
      return {
        type: "arithmetic",
        operator: "*",
        left: { type: "constant", value: -1 },
        right: arg as ValueExpression,
      } as ArithmeticExpression;
    }
  }

  // Unary plus (pass through)
  if (node.operator === "+") {
    return visitProjection(node.argument, context);
  }

  return null;
}

/**
 * Visit conditional (ternary) expression
 */
function visitConditionalProjection(
  node: { test: ASTExpression; consequent: ASTExpression; alternate: ASTExpression },
  context: SelectContext,
): Expression | null {
  // Ternary operator: condition ? thenExpr : elseExpr
  // Converts to SQL: CASE WHEN condition THEN thenExpr ELSE elseExpr END

  if (!node.test || !node.consequent || !node.alternate) {
    return null;
  }

  // Parse the condition (this should produce a boolean expression)
  // We need to convert it from AST to our expression format
  // For now, we'll handle simple comparisons
  const condition = visitBooleanCondition(node.test, context);
  if (!condition) {
    return null;
  }

  // Parse the then branch
  const thenExpr = visitProjection(node.consequent, context);
  if (!thenExpr) {
    return null;
  }

  // Parse the else branch
  const elseExpr = visitProjection(node.alternate, context);
  if (!elseExpr) {
    return null;
  }

  return {
    type: "case",
    conditions: [
      {
        when: condition as BooleanExpression,
        then: thenExpr as ValueExpression,
      },
    ],
    else: elseExpr as ValueExpression,
  } as CaseExpression;
}

/**
 * Helper to convert AST boolean expressions for CASE WHEN
 */
function visitBooleanCondition(
  node: ASTExpression,
  context: SelectContext,
): BooleanExpression | null {
  if (!node) return null;

  switch (node.type) {
    case "BinaryExpression": {
      // Comparison operators
      if (["==", "===", "!=", "!==", ">", ">=", "<", "<="].includes(node.operator)) {
        const left = visitProjection(node.left, context);
        const right = visitProjection(node.right, context);

        if (left && right) {
          const op =
            node.operator === "===" ? "==" : node.operator === "!==" ? "!=" : node.operator;
          return {
            type: "comparison",
            operator: op as "==" | "!=" | ">" | ">=" | "<" | "<=",
            left: left as ValueExpression,
            right: right as ValueExpression,
          } as ComparisonExpression;
        }
      }
      break;
    }

    case "LogicalExpression": {
      // AND/OR operators
      if (["&&", "||"].includes(node.operator)) {
        const left = visitBooleanCondition(node.left, context);
        const right = visitBooleanCondition(node.right, context);

        if (left && right) {
          return {
            type: "logical",
            operator: node.operator === "&&" ? "and" : "or",
            left: left as BooleanExpression,
            right: right as BooleanExpression,
          } as LogicalExpression;
        }
      }
      break;
    }

    case "UnaryExpression": {
      // NOT operator
      if (node.operator === "!") {
        const inner = visitBooleanCondition(node.argument, context);
        if (inner) {
          return {
            type: "not",
            expression: inner as BooleanExpression,
          } as NotExpression;
        }
      }
      break;
    }

    case "Identifier": {
      // Direct boolean column or parameter
      const expr = visitProjection(node, context);
      if (expr && expr.type === "column") {
        // Convert column to IS NOT NULL check
        return {
          type: "isNull",
          expression: expr as ValueExpression,
          negated: true,
        } as IsNullExpression;
      }
      return expr as BooleanExpression;
    }

    case "MemberExpression": {
      // Boolean property access
      const expr = visitProjection(node, context);
      if (expr && expr.type === "column") {
        // Convert column to IS NOT NULL check
        return {
          type: "isNull",
          expression: expr as ValueExpression,
          negated: true,
        } as IsNullExpression;
      }
      return expr as BooleanExpression;
    }
  }

  return null;
}

/**
 * Check if expression is likely a string
 */
function isStringExpression(expr: Expression): boolean {
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
