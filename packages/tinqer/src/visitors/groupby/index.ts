/**
 * GROUP BY operation visitor
 */

import type { GroupByOperation, QueryOperation } from "../../query-tree/operations.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { getParameterName, getReturnExpression } from "../visitor-utils.js";
import { visitGenericExpression } from "../shared/generic-visitor.js";

export function visitGroupByOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  _methodName: string,
  visitorContext: VisitorContext,
): { operation: GroupByOperation; autoParams: Record<string, unknown> } | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const keySelectorAst = ast.arguments[0];

    if (keySelectorAst && keySelectorAst.type === "ArrowFunctionExpression") {
      const arrowFunc = keySelectorAst as ArrowFunctionExpression;
      const paramName = getParameterName(arrowFunc);

      // Create a new context for this visitor
      const localTableParams = new Set(visitorContext.tableParams);
      const localQueryParams = new Set(visitorContext.queryParams);

      if (paramName) {
        localTableParams.add(paramName);
      }

      // Handle both Expression body and BlockStatement body
      let bodyExpr: ASTExpression | null;
      if (arrowFunc.body.type === "BlockStatement") {
        // For block statements, look for a return statement
        bodyExpr = getReturnExpression(arrowFunc.body.body);
      } else {
        bodyExpr = arrowFunc.body;
      }

      if (bodyExpr) {
        const result = visitGenericExpression(
          bodyExpr,
          localTableParams,
          localQueryParams,
          visitorContext.autoParams,
          visitorContext.autoParamCounter,
        );

        // Support any expression as key selector, including:
        // - Simple columns: u => u.name
        // - Object literals (composite keys): u => ({ name: u.name, dept: u.dept })
        // - Method calls: p => p.name.includes("e")
        // - Nested property access: joined => joined.user.name
        if (result.expression) {
          visitorContext.autoParamCounter = result.counter;
          return {
            operation: {
              type: "queryOperation",
              operationType: "groupBy",
              source,
              keySelector: result.expression,
            },
            autoParams: result.autoParams || {},
          };
        }
      }
    }
  }
  return null;
}
