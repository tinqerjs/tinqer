/**
 * LAST and LAST OR DEFAULT operation visitors
 */

import type {
  LastOperation,
  LastOrDefaultOperation,
  QueryOperation,
} from "../../query-tree/operations.js";
import type { BooleanExpression } from "../../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
} from "../../parser/ast-types.js";
import type { VisitorContext } from "../types.js";
import { getParameterName, getReturnExpression } from "../visitor-utils.js";
import { visitPredicate } from "../shared/predicate-visitor.js";

export function visitLastOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  methodName: string,
  visitorContext: VisitorContext,
): {
  operation: LastOperation | LastOrDefaultOperation;
  autoParams: Record<string, unknown>;
} | null {
  let predicate: BooleanExpression | undefined;
  const autoParams: Record<string, unknown> = {};

  if (ast.arguments && ast.arguments.length > 0) {
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
        predicate = result.predicate;
        Object.assign(autoParams, result.autoParams);
        visitorContext.autoParamCounter = result.counter;
      }
    }
  }

  const operation: LastOperation | LastOrDefaultOperation = {
    type: "queryOperation",
    operationType: methodName === "lastOrDefault" ? "lastOrDefault" : "last",
    source,
    predicate,
  };
  return {
    operation,
    autoParams,
  };
}
