/**
 * ALL operation visitor
 */

import type { AllOperation, QueryOperation } from "../../query-tree/operations.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { getParameterName, getReturnExpression } from "../visitor-utils.js";
import { visitPredicate } from "../shared/predicate-visitor.js";

export function visitAllOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  _methodName: string,
  visitorContext: VisitorContext,
): { operation: AllOperation; autoParams: Record<string, unknown> } | null {
  // all() requires a predicate
  if (!ast.arguments || ast.arguments.length !== 1) {
    return null;
  }

  const lambdaAst = ast.arguments[0];

  if (lambdaAst && lambdaAst.type === "ArrowFunctionExpression") {
    const arrowFunc = lambdaAst as ArrowFunctionExpression;
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
      const result = visitPredicate(
        bodyExpr,
        localTableParams,
        localQueryParams,
        visitorContext.autoParams,
        visitorContext.autoParamCounter,
      );

      if (result.predicate) {
        const predicate = result.predicate;
        visitorContext.autoParamCounter = result.counter;

        return {
          operation: {
            type: "queryOperation",
            operationType: "all",
            source,
            predicate,
          },
          autoParams: result.autoParams,
        };
      }
    }
  }

  return null;
}
