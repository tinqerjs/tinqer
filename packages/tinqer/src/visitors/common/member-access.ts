/**
 * Visitor for member access expressions (e.g., x.name, p.minAge, arr[0])
 * Handles column references, parameter properties, and array indexing
 */

import type {
  Expression,
  ColumnExpression,
  ExcludedColumnExpression,
  ParameterExpression,
} from "../../expressions/expression.js";

import type {
  MemberExpression as ASTMemberExpression,
  Identifier,
  NumericLiteral,
} from "../../parser/ast-types.js";

import type { VisitorContext } from "../types.js";
import { createAutoParam } from "../types.js";

/**
 * Convert member access to expression
 * Handles both property access and array indexing
 *
 * @param visitExpression - Callback to recursively visit expressions
 */
export function visitMemberAccess(
  node: ASTMemberExpression,
  context: VisitorContext,
  visitExpression: (n: unknown, ctx: VisitorContext) => Expression | null,
): Expression | null {
  // Handle array indexing (e.g., params.roles[0])
  if (node.computed && node.object.type === "Identifier") {
    const objectName = (node.object as Identifier).name;

    // Get numeric index value
    const index = extractNumericIndex(node.property);
    if (index !== null && context.queryParams.has(objectName)) {
      return {
        type: "param",
        param: objectName,
        index: index,
      } as ParameterExpression;
    }
  }

  // Handle nested array indexing (e.g., params.data.roles[0])
  if (node.computed && node.object.type === "MemberExpression") {
    const memberObj = visitExpression(node.object as ASTMemberExpression, context);
    const index = extractNumericIndex(node.property);

    if (index !== null && memberObj && memberObj.type === "param") {
      const paramExpr = memberObj as ParameterExpression;
      return {
        type: "param",
        param: paramExpr.param,
        property: paramExpr.property,
        index: index,
      } as ParameterExpression;
    }
  }

  // Handle nested member access (e.g., joined.orderItem.product_id)
  if (
    node.object.type === "MemberExpression" &&
    node.property.type === "Identifier" &&
    !node.computed
  ) {
    const innerMember = visitExpression(node.object as ASTMemberExpression, context);
    const propertyName = (node.property as Identifier).name;

    if (innerMember && innerMember.type === "column") {
      const innerCol = innerMember as ColumnExpression;

      // Check if accessing through JOIN result shape
      if (context.currentResultShape && innerCol.table === context.joinResultParam) {
        const shapeProp = context.currentResultShape.properties.get(innerCol.name);
        if (shapeProp) {
          if (shapeProp.type === "object") {
            // Nested object - look for property within
            const nestedProp = shapeProp.properties.get(propertyName);
            if (nestedProp && nestedProp.type === "column") {
              return {
                type: "column",
                name: nestedProp.columnName,
                source: { type: "joinResult", tableIndex: nestedProp.sourceTable || 0 },
              } as ColumnExpression;
            }
          } else if (shapeProp.type === "reference") {
            // Reference to entire table
            return {
              type: "column",
              name: propertyName,
              source: { type: "joinResult", tableIndex: shapeProp.sourceTable || 0 },
            } as ColumnExpression;
          }
        }
      }

      // Default nested member access
      return {
        type: "column",
        name: propertyName,
        table: innerCol.name,
      } as ColumnExpression;
    }
  }

  // Simple property access
  if (node.object.type === "Identifier" && node.property.type === "Identifier" && !node.computed) {
    const objectName = (node.object as Identifier).name;
    const propertyName = (node.property as Identifier).name;

    if (context.upsertExcludedParam && objectName === context.upsertExcludedParam) {
      return {
        type: "excludedColumn",
        name: propertyName,
      } as ExcludedColumnExpression;
    }

    // Handle JavaScript built-in constants
    if (objectName === "Number") {
      const value = getNumberConstant(propertyName);
      if (value !== undefined) {
        const paramName = createAutoParam(context, value);
        return {
          type: "param",
          param: paramName,
        } as ParameterExpression;
      }
    }

    // Handle JOIN result parameter access
    if (context.joinResultParam === objectName && context.currentResultShape) {
      const shapeProp = context.currentResultShape.properties.get(propertyName);
      if (shapeProp) {
        if (shapeProp.type === "reference" || shapeProp.type === "object") {
          // Preserve path for further resolution
          return {
            type: "column",
            name: propertyName,
            table: objectName,
          } as ColumnExpression;
        } else if (shapeProp.type === "column") {
          // Direct column reference
          return {
            type: "column",
            name: shapeProp.columnName,
            source: { type: "joinResult", tableIndex: shapeProp.sourceTable || 0 },
          } as ColumnExpression;
        }
      }
    }

    // Table parameter property access (e.g., x.name)
    if (context.tableParams.has(objectName)) {
      // JOIN parameter with table mapping
      if (context.joinParams && context.joinParams.has(objectName)) {
        return {
          type: "column",
          name: propertyName,
          source: { type: "joinParam", paramIndex: context.joinParams.get(objectName) || 0 },
        } as ColumnExpression;
      }
      // Regular table parameter
      return {
        type: "column",
        name: propertyName,
      } as ColumnExpression;
    }

    // Query parameter property access (e.g., p.minAge)
    if (context.queryParams.has(objectName)) {
      return {
        type: "param",
        param: objectName,
        property: propertyName,
      } as ParameterExpression;
    }
  }

  // Fallback: nested column access
  const obj = visitExpression(node.object, context);
  if (obj && obj.type === "column" && node.property.type === "Identifier") {
    const propertyName = (node.property as Identifier).name;
    return {
      type: "column",
      name: `${(obj as ColumnExpression).name}.${propertyName}`,
    } as ColumnExpression;
  }

  return null;
}

/**
 * Extract numeric index from property node
 */
function extractNumericIndex(property: unknown): number | null {
  if (!property) return null;

  const prop = property as { type?: string; value?: unknown };

  if (prop.type === "NumericLiteral") {
    return (prop as NumericLiteral).value;
  }
  if (prop.type === "Literal" && typeof prop.value === "number") {
    return prop.value as number;
  }
  return null;
}

/**
 * Get JavaScript Number constant value
 */
function getNumberConstant(name: string): number | undefined {
  switch (name) {
    case "MAX_SAFE_INTEGER":
      return Number.MAX_SAFE_INTEGER;
    case "MIN_SAFE_INTEGER":
      return Number.MIN_SAFE_INTEGER;
    case "MAX_VALUE":
      return Number.MAX_VALUE;
    case "MIN_VALUE":
      return Number.MIN_VALUE;
    case "POSITIVE_INFINITY":
      return Number.POSITIVE_INFINITY;
    case "NEGATIVE_INFINITY":
      return Number.NEGATIVE_INFINITY;
    case "NaN":
      return Number.NaN;
    default:
      return undefined;
  }
}
