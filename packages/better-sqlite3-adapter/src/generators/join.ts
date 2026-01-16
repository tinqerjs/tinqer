/**
 * JOIN operation generator
 */

import type {
  JoinOperation,
  FromOperation,
  Expression,
  ObjectExpression,
  ColumnExpression,
  ResultShape,
  ShapeNode,
  ColumnShapeNode,
  ObjectShapeNode,
  ReferenceShapeNode,
} from "@tinqerjs/tinqer";
import type { SqlContext, SymbolTable, SourceReference } from "../types.js";
import { generateSql } from "../sql-generator.js";

/**
 * Build symbol table from ResultShape (new approach with full fidelity)
 */
function buildSymbolTableFromShape(
  resultShape: ResultShape | undefined,
  outerAlias: string,
  innerAlias: string,
  context: SqlContext,
): void {
  if (!resultShape) {
    return;
  }

  // Initialize symbol table if not exists
  if (!context.symbolTable) {
    context.symbolTable = {
      entries: new Map<string, SourceReference>(),
    };
  }

  // Process each property in the result shape
  for (const [propName, shapeNode] of resultShape.properties) {
    processShapeNode(propName, shapeNode, outerAlias, innerAlias, context.symbolTable, "");
  }
}

/**
 * Build symbol table for chained JOINs, preserving table references
 */
function buildSymbolTableFromShapeForChain(
  resultShape: ResultShape | undefined,
  existingAliases: string[],
  newInnerAlias: string,
  context: SqlContext,
): void {
  if (!resultShape) {
    return;
  }

  // Initialize symbol table if not exists
  if (!context.symbolTable) {
    context.symbolTable = {
      entries: new Map<string, SourceReference>(),
    };
  }

  // For chained JOINs, we need to map sourceTable indices correctly:
  // - sourceTable indices in the shape refer to the tables at the time the shape was created
  // - We need to preserve those original table references

  for (const [propName, shapeNode] of resultShape.properties) {
    processShapeNodeForChain(
      propName,
      shapeNode,
      existingAliases,
      newInnerAlias,
      context.symbolTable,
      "",
    );
  }
}

/**
 * Recursively process shape nodes to build symbol table entries
 */
function processShapeNode(
  propName: string,
  node: ShapeNode,
  outerAlias: string,
  innerAlias: string,
  symbolTable: SymbolTable,
  parentPath: string,
): void {
  const fullPath = parentPath ? `${parentPath}.${propName}` : propName;

  switch (node.type) {
    case "column": {
      const colNode = node as ColumnShapeNode;
      const tableAlias = colNode.sourceTable === 0 ? outerAlias : innerAlias;

      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: colNode.columnName,
      });
      break;
    }

    case "object": {
      // Nested object - recurse
      const objNode = node as ObjectShapeNode;
      for (const [nestedProp, nestedNode] of objNode.properties) {
        processShapeNode(nestedProp, nestedNode, outerAlias, innerAlias, symbolTable, fullPath);
      }
      break;
    }

    case "reference": {
      // Reference to entire table - we can't map individual columns yet
      // but we can store that this path references a specific table
      const refNode = node as ReferenceShapeNode;
      const tableAlias = refNode.sourceTable === 0 ? outerAlias : innerAlias;

      // Store a special marker for reference nodes
      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: "*", // Special marker for "all columns from this table"
      });
      break;
    }
  }
}

/**
 * Process shape nodes for chained JOINs, preserving original table references
 */
function processShapeNodeForChain(
  propName: string,
  node: ShapeNode,
  existingAliases: string[],
  newInnerAlias: string,
  symbolTable: SymbolTable,
  parentPath: string,
): void {
  const fullPath = parentPath ? `${parentPath}.${propName}` : propName;

  switch (node.type) {
    case "column": {
      const colNode = node as ColumnShapeNode;
      // For chained JOINs, sourceTable refers to the original table indices
      // If sourceTable < existingAliases.length, use the existing alias
      // Otherwise, it's the new inner table
      const tableAlias =
        colNode.sourceTable < existingAliases.length
          ? existingAliases[colNode.sourceTable]!
          : newInnerAlias;

      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: colNode.columnName,
      });
      break;
    }

    case "object": {
      // Nested object - recurse
      const objNode = node as ObjectShapeNode;
      for (const [nestedProp, nestedNode] of objNode.properties) {
        processShapeNodeForChain(
          nestedProp,
          nestedNode,
          existingAliases,
          newInnerAlias,
          symbolTable,
          fullPath,
        );
      }
      break;
    }

    case "reference": {
      const refNode = node as ReferenceShapeNode;
      const tableAlias =
        refNode.sourceTable < existingAliases.length
          ? existingAliases[refNode.sourceTable]!
          : newInnerAlias;

      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: "*",
      });
      break;
    }
  }
}

/**
 * Build symbol table from JOIN result selector (legacy approach)
 */
function buildSymbolTable(
  resultSelector: Expression | undefined,
  outerAlias: string,
  innerAlias: string,
  context: SqlContext,
): void {
  if (!resultSelector || resultSelector.type !== "object") {
    return;
  }

  // Initialize symbol table if not exists
  if (!context.symbolTable) {
    context.symbolTable = {
      entries: new Map<string, SourceReference>(),
    };
  }

  const objExpr = resultSelector as ObjectExpression;

  // Process each property in the result selector
  for (const [propName, expr] of Object.entries(objExpr.properties)) {
    processExpression(propName, expr, outerAlias, innerAlias, context.symbolTable, "");
  }
}

/**
 * Recursively process expressions to build symbol table entries
 */
function processExpression(
  propName: string,
  expr: Expression,
  outerAlias: string,
  innerAlias: string,
  symbolTable: SymbolTable,
  parentPath: string,
): void {
  const fullPath = parentPath ? `${parentPath}.${propName}` : propName;

  if (expr.type === "column") {
    const colExpr = expr as ColumnExpression;

    // Check if this references a JOIN parameter ($param0, $param1)
    if (colExpr.table && colExpr.table.startsWith("$param")) {
      const paramIndex = parseInt(colExpr.table.substring(6), 10);
      const tableAlias = paramIndex === 0 ? outerAlias : innerAlias;

      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: colExpr.name,
      });
    } else {
      // Regular column without parameter reference
      symbolTable.entries.set(fullPath, {
        tableAlias: colExpr.table || outerAlias,
        columnName: colExpr.name,
      });
    }
  } else if (expr.type === "object") {
    // Nested object - recurse
    const nestedObj = expr as ObjectExpression;
    for (const [nestedProp, nestedExpr] of Object.entries(nestedObj.properties)) {
      processExpression(nestedProp, nestedExpr, outerAlias, innerAlias, symbolTable, fullPath);
    }
  }
  // TODO: Handle other expression types (arithmetic, concat, etc.)
}

/**
 * Generate JOIN clause
 */
export function generateJoin(operation: JoinOperation, context: SqlContext): string {
  // Get table aliases - for chained JOINs, we need all existing aliases
  const allAliases = Array.from(context.tableAliases.values());
  const outerAlias = allAliases[0] || "t0";
  const innerAlias = `t${context.aliasCounter++}`;

  // Add the inner table alias to the context so it can be resolved later
  // Store it with a key that indicates it's the second table (index 1)
  context.tableAliases.set(`join_${context.aliasCounter - 1}`, innerAlias);

  // Build symbol table from result shape (preferred) or result selector (fallback)
  if (operation.resultShape) {
    // For chained JOINs, pass all existing aliases so we can map sourceTable indices correctly
    if (allAliases.length > 1) {
      // This is a chained JOIN - use the special handler
      buildSymbolTableFromShapeForChain(operation.resultShape, allAliases, innerAlias, context);
    } else {
      // First JOIN - use the regular handler
      buildSymbolTableFromShape(operation.resultShape, outerAlias, innerAlias, context);
    }
  } else if (operation.resultSelector) {
    buildSymbolTable(operation.resultSelector, outerAlias, innerAlias, context);
  }

  // Store the result selector for SELECT generation
  if (operation.resultSelector) {
    context.currentShape = operation.resultSelector;
  }

  // Check if inner is just a simple FROM operation
  let joinClause: string;
  const joinKeyword = (() => {
    switch (operation.joinType) {
      case "left":
        return "LEFT OUTER JOIN";
      case "right":
        return "RIGHT OUTER JOIN";
      case "full":
        return "FULL OUTER JOIN";
      case "cross":
        return "CROSS JOIN";
      default:
        return "INNER JOIN";
    }
  })();

  if (operation.inner.operationType === "from") {
    const fromOp = operation.inner as FromOperation;
    if (fromOp.subquery) {
      const innerSql = generateSql(fromOp.subquery, context.params);
      joinClause = `${joinKeyword} (${innerSql}) AS "${innerAlias}"`;
    } else {
      const tableName = fromOp.schema
        ? `"${fromOp.schema}"."${fromOp.table}"`
        : `"${fromOp.table}"`;
      joinClause = `${joinKeyword} ${tableName} AS "${innerAlias}"`;
    }
  } else {
    // Complex inner query - need subquery
    const innerSql = generateSql(operation.inner, context.params);
    joinClause = `${joinKeyword} (${innerSql}) AS "${innerAlias}"`;
  }

  if (joinKeyword === "CROSS JOIN") {
    return joinClause;
  }

  // Build ON clause - resolve keys through symbol table if available
  let resolvedOuterKey = operation.outerKey;
  let resolvedOuterAlias = outerAlias;

  // Check if outerKey needs resolution through symbol table
  if (context.symbolTable) {
    const sourceRef = context.symbolTable.entries.get(operation.outerKey);
    if (sourceRef) {
      resolvedOuterKey = sourceRef.columnName;
      resolvedOuterAlias = sourceRef.tableAlias;
    }
  }

  const onClause = `ON "${resolvedOuterAlias}"."${resolvedOuterKey}" = "${innerAlias}"."${operation.innerKey}"`;

  return `${joinClause} ${onClause}`;
}
