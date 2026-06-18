/**
 * JOIN operation visitor
 * Handles JOIN operations with various forms
 */

import type {
  JoinOperation,
  QueryOperation,
  ShapeNode,
  ReferenceShapeNode,
  ColumnShapeNode,
  ObjectShapeNode,
} from "../../query-tree/operations.js";
import type {
  ColumnExpression,
  Expression,
  ComparisonExpression,
} from "../../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
  Identifier,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import type { JoinContext } from "./context.js";
import { getParameterName, getReturnExpression } from "../visitor-utils.js";
import { visitGenericExpression } from "../shared/generic-visitor.js";
import { visitAstToQueryOperation } from "../ast-visitor.js";
import { visitJoinResultSelector } from "./result-selector.js";
import { buildResultShape } from "./shape.js";

export function visitJoinOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  _methodName: string,
  visitorContext: VisitorContext,
): { operation: JoinOperation; autoParams: Record<string, unknown> } | null {
  // Handle 2-argument form: join(inner, predicate)
  if (ast.arguments && ast.arguments.length === 2) {
    const firstArg = ast.arguments[0];
    const predicateArg = ast.arguments[1];

    // Parse inner source
    const innerSourceResult = firstArg
      ? visitAstToQueryOperation(
          firstArg as ASTExpression,
          visitorContext.tableParams,
          visitorContext.queryParams,
          visitorContext,
        )
      : null;
    const innerSource = innerSourceResult?.operation || null;

    // Update visitor context with inner source's auto-params and counter
    if (innerSourceResult?.autoParams) {
      // Find the highest param number used
      let maxParamNum = visitorContext.autoParamCounter;
      for (const key of Object.keys(innerSourceResult.autoParams)) {
        if (key.startsWith("__p")) {
          const num = parseInt(key.substring(3), 10);
          if (!isNaN(num) && num > maxParamNum) {
            maxParamNum = num;
          }
        }
      }
      // Update the counter to be the next available number
      visitorContext.autoParamCounter = maxParamNum;
    }

    if (innerSource && predicateArg && predicateArg.type === "ArrowFunctionExpression") {
      const predicateArrow = predicateArg as ArrowFunctionExpression;
      const params = predicateArrow.params;

      // Get the two parameters (outer, inner)
      const outerParam =
        params && params[0]
          ? getParameterName({
              params: [params[0]],
              body: predicateArrow.body,
            } as ArrowFunctionExpression)
          : null;
      const innerParam =
        params && params[1]
          ? getParameterName({
              params: [params[1]],
              body: predicateArrow.body,
            } as ArrowFunctionExpression)
          : null;

      if (outerParam && innerParam) {
        // Create context for predicate evaluation
        const predicateContext = new Set(visitorContext.tableParams);
        predicateContext.add(outerParam);
        predicateContext.add(innerParam);

        // Get predicate body
        let bodyExpr: ASTExpression | null;
        if (predicateArrow.body.type === "BlockStatement") {
          bodyExpr = getReturnExpression(predicateArrow.body.body);
        } else {
          bodyExpr = predicateArrow.body;
        }

        if (bodyExpr) {
          const result = visitGenericExpression(
            bodyExpr,
            predicateContext,
            visitorContext.queryParams,
            visitorContext.autoParams,
            visitorContext.autoParamCounter,
          );

          if (result && result.expression) {
            // Update the counter after this expression
            visitorContext.autoParamCounter = result.counter;

            // Merge autoParams back to context
            for (const [key, value] of Object.entries(result.autoParams)) {
              visitorContext.autoParams.set(key, value);
            }
            const expr = result.expression;

            // Extract join keys from equality comparison (u.id === ud.userId)
            if (expr.type === "comparison" && (expr as ComparisonExpression).operator === "==") {
              const comparisonExpr = expr as ComparisonExpression;
              const leftCol = comparisonExpr.left;
              const rightCol = comparisonExpr.right;

              let outerKey: string | null = null;
              let innerKey: string | null = null;

              // Determine which side is outer and which is inner based on table reference
              if (leftCol?.type === "column" && rightCol?.type === "column") {
                // Check if left column references outer param
                if (leftCol.table === outerParam || !leftCol.table) {
                  outerKey = leftCol.name;
                  innerKey = rightCol.name;
                } else if (leftCol.table === innerParam) {
                  innerKey = leftCol.name;
                  outerKey = rightCol.name;
                }
              }

              if (outerKey && innerKey) {
                const autoParams: Record<string, unknown> = {};

                // Merge auto params from inner source
                if (innerSourceResult?.autoParams) {
                  Object.assign(autoParams, innerSourceResult.autoParams);
                }

                // Merge auto params from predicate
                if (result.autoParams) {
                  Object.assign(autoParams, result.autoParams);
                }

                return {
                  operation: {
                    type: "queryOperation",
                    operationType: "join",
                    source,
                    inner: innerSource,
                    outerKey,
                    innerKey,
                  },
                  autoParams,
                };
              }
            }
          }
        }
      }
    }
  }

  // Handle 4-argument form: join(inner, outerKeySelector, innerKeySelector, resultSelector)
  if (ast.arguments && ast.arguments.length >= 4) {
    // join(inner, outerKeySelector, innerKeySelector, resultSelector)
    const firstArg = ast.arguments[0];
    const innerSourceResult = firstArg
      ? visitAstToQueryOperation(
          firstArg as ASTExpression,
          visitorContext.tableParams,
          visitorContext.queryParams,
          visitorContext,
        )
      : null;
    const innerSource = innerSourceResult?.operation || null;

    // Update visitor context with inner source's auto-params and counter
    if (innerSourceResult?.autoParams) {
      // Find the highest param number used
      let maxParamNum = visitorContext.autoParamCounter;
      for (const key of Object.keys(innerSourceResult.autoParams)) {
        if (key.startsWith("__p")) {
          const num = parseInt(key.substring(3), 10);
          if (!isNaN(num) && num > maxParamNum) {
            maxParamNum = num;
          }
        }
      }
      // Update the counter to be the next available number
      visitorContext.autoParamCounter = maxParamNum;
    }

    const outerKeySelectorAst = ast.arguments[1];
    const innerKeySelectorAst = ast.arguments[2];
    const resultSelectorAst = ast.arguments[3]; // Capture the result selector

    let outerKey: string | null = null;
    let innerKey: string | null = null;
    let outerKeySource: number | undefined = undefined;
    let outerParam: string | null = null;
    let innerParam: string | null = null;
    const autoParams: Record<string, unknown> = {};

    // Check if source operation is a JOIN with a result shape
    const sourceJoin = source.operationType === "join" ? (source as JoinOperation) : null;
    const previousResultShape = sourceJoin?.resultShape;

    // Process outer key selector
    if (outerKeySelectorAst && outerKeySelectorAst.type === "ArrowFunctionExpression") {
      const outerArrow = outerKeySelectorAst as ArrowFunctionExpression;
      const paramName = getParameterName(outerArrow);

      // Create a context with the result shape if we're chaining JOINs
      const outerContext: JoinContext = {
        tableParams: new Set(visitorContext.tableParams),
        queryParams: new Set(visitorContext.queryParams),
      };
      if (paramName) {
        outerContext.tableParams.add(paramName);
        if (previousResultShape) {
          outerContext.currentResultShape = previousResultShape;
          outerContext.joinResultParam = paramName;
        }
      }

      // Handle both Expression body and BlockStatement body
      let bodyExpr: ASTExpression | null;
      if (outerArrow.body.type === "BlockStatement") {
        // For block statements, look for a return statement
        bodyExpr = getReturnExpression(outerArrow.body.body);
      } else {
        bodyExpr = outerArrow.body;
      }

      if (bodyExpr) {
        const result = visitGenericExpression(
          bodyExpr,
          outerContext.tableParams,
          outerContext.queryParams,
          visitorContext.autoParams,
          visitorContext.autoParamCounter,
        );
        if (result) {
          const expr = result.expression;
          Object.assign(autoParams, result.autoParams);
          // Update the counter
          visitorContext.autoParamCounter = result.counter;

          // Merge autoParams back to context
          for (const [key, value] of Object.entries(result.autoParams)) {
            visitorContext.autoParams.set(key, value);
          }
          if (expr && expr.type === "column") {
            const colExpr = expr as ColumnExpression;
            // For nested paths like orderItem.product_id, we get the final column name
            outerKey = colExpr.name;

            // Track which source table this key comes from
            if (colExpr.source && colExpr.source.type === "joinResult") {
              outerKeySource = colExpr.source.tableIndex;
            }
          }
        }
      }
    }

    if (innerKeySelectorAst && innerKeySelectorAst.type === "ArrowFunctionExpression") {
      const innerArrow = innerKeySelectorAst as ArrowFunctionExpression;
      const paramName = getParameterName(innerArrow);
      const innerContext: JoinContext = {
        tableParams: new Set(visitorContext.tableParams),
        queryParams: new Set(visitorContext.queryParams),
      };
      if (paramName) {
        innerContext.tableParams.add(paramName);
      }

      // Handle both Expression body and BlockStatement body
      let bodyExpr: ASTExpression | null;
      if (innerArrow.body.type === "BlockStatement") {
        // For block statements, look for a return statement
        bodyExpr = getReturnExpression(innerArrow.body.body);
      } else {
        bodyExpr = innerArrow.body;
      }

      if (bodyExpr) {
        const result = visitGenericExpression(
          bodyExpr,
          innerContext.tableParams,
          innerContext.queryParams,
          visitorContext.autoParams,
          visitorContext.autoParamCounter,
        );
        if (result) {
          const expr = result.expression;
          Object.assign(autoParams, result.autoParams);
          // Update the counter
          visitorContext.autoParamCounter = result.counter;

          // Merge autoParams back to context
          for (const [key, value] of Object.entries(result.autoParams)) {
            visitorContext.autoParams.set(key, value);
          }
          if (expr && expr.type === "column") {
            innerKey = (expr as ColumnExpression).name;
          }
        }
      }
    }

    // Process the result selector
    let resultSelector: Expression | undefined = undefined;
    if (resultSelectorAst && resultSelectorAst.type === "ArrowFunctionExpression") {
      const resultArrow = resultSelectorAst as ArrowFunctionExpression;

      // Store the parameter names for the result selector
      // These will be needed to map properties back to their source tables
      const params = resultArrow.params;
      outerParam =
        params && params[0] && params[0].type === "Identifier"
          ? (params[0] as Identifier).name
          : null;
      innerParam =
        params && params[1] && params[1].type === "Identifier"
          ? (params[1] as Identifier).name
          : null;

      // Create a special context that tracks which parameter maps to which table
      const resultContext: JoinContext = {
        tableParams: new Set(visitorContext.tableParams),
        queryParams: new Set(visitorContext.queryParams),
        joinParams: new Map<string, number>(), // parameter name -> table index (0 for outer, 1+ for inner)
      };

      // If we're chaining JOINs and the outer param comes from a previous JOIN result,
      // pass through its shape information
      if (outerParam && previousResultShape) {
        resultContext.currentResultShape = previousResultShape;
        resultContext.joinResultParam = outerParam;
      }

      // For chained JOINs, we need to determine the correct table index for the inner param
      let innerTableIndex = 1;
      if (previousResultShape) {
        // Count the number of tables already in the result shape
        // This tells us what index the new inner table should have
        let maxTableIndex = 0;
        for (const [, node] of previousResultShape.properties) {
          const findMaxIndex = (n: ShapeNode): number => {
            if (n.type === "reference" || n.type === "column") {
              return (n as ReferenceShapeNode | ColumnShapeNode).sourceTable || 0;
            } else if (n.type === "object") {
              const objNode = n as ObjectShapeNode;
              let max = 0;
              for (const [, child] of objNode.properties) {
                max = Math.max(max, findMaxIndex(child));
              }
              return max;
            }
            return 0;
          };
          maxTableIndex = Math.max(maxTableIndex, findMaxIndex(node));
        }
        innerTableIndex = maxTableIndex + 1;
      }

      if (outerParam) {
        // Note: outerParam doesn't get a single index for chained JOINs
        // It represents the entire previous JOIN result, not a single table
        // We don't add it to joinParams for chained JOINs, it's handled differently
        if (!previousResultShape) {
          resultContext.joinParams?.set(outerParam, 0);
        }
        resultContext.tableParams.add(outerParam); // Also add to tableParams for validation
      }
      if (innerParam) {
        resultContext.joinParams?.set(innerParam, innerTableIndex);
        resultContext.tableParams.add(innerParam); // Also add to tableParams for validation
      }

      // Convert the result selector body to an expression
      let bodyExpr: ASTExpression | null;
      if (resultArrow.body.type === "BlockStatement") {
        bodyExpr = getReturnExpression(resultArrow.body.body);
      } else {
        bodyExpr = resultArrow.body;
      }

      if (bodyExpr) {
        // Use a custom visitor that tracks JOIN parameters
        const result = visitJoinResultSelector(
          bodyExpr,
          resultContext,
          visitorContext.autoParamCounter,
        );
        if (result) {
          resultSelector = result.expression || undefined;
          Object.assign(autoParams, result.autoParams);
          visitorContext.autoParamCounter = result.counter;
        }
      }
    }

    if (innerSource && outerKey && innerKey) {
      // Build the result shape from the result selector
      const resultShape = buildResultShape(
        resultSelector,
        outerParam,
        innerParam,
        previousResultShape,
      );

      // Merge auto params from inner source if present
      if (innerSourceResult?.autoParams) {
        Object.assign(autoParams, innerSourceResult.autoParams);
      }

      return {
        operation: {
          type: "queryOperation",
          operationType: "join",
          source,
          inner: innerSource,
          outerKey,
          innerKey,
          outerKeySource, // Track which source table the key comes from
          resultSelector, // Include the result selector
          resultShape, // Include the result shape
        },
        autoParams,
      };
    }
  }
  return null;
}
