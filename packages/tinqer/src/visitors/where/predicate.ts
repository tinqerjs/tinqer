/**
 * WHERE predicate visitor
 * Converts AST expressions to BooleanExpression for WHERE clauses
 */

import type { BooleanExpression } from "../../expressions/expression.js";

import type {
  Expression as ASTExpression,
  BinaryExpression,
  LogicalExpression as ASTLogicalExpression,
  UnaryExpression,
  MemberExpression,
  Identifier,
  Literal,
  CallExpression,
} from "../../parser/ast-types.js";

import type { WhereContext, VisitorResult } from "./context.js";
import { visitComparison } from "./comparison.js";
import { visitLogical } from "./logical.js";
import { visitColumnAccess } from "./column.js";
import { visitBooleanMethod } from "./boolean-method.js";
import { visitCaseInsensitiveFunction } from "./case-insensitive-functions.js";
import { visitFtsMatch } from "./fts.js";

/**
 * Visit a predicate expression in WHERE context
 * Returns BooleanExpression or null
 */
export function visitPredicate(
  node: ASTExpression,
  context: WhereContext,
): VisitorResult<BooleanExpression | null> {
  const currentCounter = context.autoParamCounter;

  if (!node) return { value: null, counter: currentCounter };

  switch (node.type) {
    case "BinaryExpression": {
      const binary = node as BinaryExpression;
      // Check if it's a comparison
      if (["==", "===", "!=", "!==", ">", ">=", "<", "<="].includes(binary.operator)) {
        return visitComparison(binary, context);
      }
      return { value: null, counter: currentCounter };
    }

    case "LogicalExpression": {
      return visitLogical(node as ASTLogicalExpression, context);
    }

    case "UnaryExpression": {
      const unary = node as UnaryExpression;
      if (unary.operator === "!") {
        const innerResult = visitPredicate(unary.argument, {
          ...context,
          autoParamCounter: currentCounter,
        });
        if (innerResult.value) {
          return {
            value: {
              type: "not",
              expression: innerResult.value,
            },
            counter: innerResult.counter,
          };
        }
      }
      return { value: null, counter: currentCounter };
    }

    case "MemberExpression": {
      // Boolean column (e.g., x.isActive)
      const column = visitColumnAccess(node as MemberExpression, context);
      if (column) {
        return {
          value: {
            type: "booleanColumn",
            name: column.name,
            ...(column.table && { table: column.table }),
          },
          counter: currentCounter,
        };
      }
      return { value: null, counter: currentCounter };
    }

    case "ChainExpression": {
      // Optional chaining: u.bio?.includes("text")
      const chain = node as { expression?: ASTExpression };
      if (chain.expression) {
        // Unwrap and visit the inner expression
        return visitPredicate(chain.expression, {
          ...context,
          autoParamCounter: currentCounter,
        });
      }
      return { value: null, counter: currentCounter };
    }

    case "CallExpression": {
      // Try full-text-search match first (h.fts.match)
      const ftsResult = visitFtsMatch(node as CallExpression, {
        ...context,
        autoParamCounter: currentCounter,
      });

      if (ftsResult.value) {
        return ftsResult;
      }

      // Try case-insensitive functions first (h.functions.iequals)
      const caseInsensitiveResult = visitCaseInsensitiveFunction(node as CallExpression, {
        ...context,
        autoParamCounter: currentCounter,
      });

      if (caseInsensitiveResult.value) {
        return caseInsensitiveResult;
      }

      // Otherwise try regular boolean methods like x.name.startsWith("John")
      const result = visitBooleanMethod(node as CallExpression, {
        ...context,
        autoParamCounter: currentCounter,
      });
      return result;
    }

    case "Identifier": {
      // Direct boolean column reference
      const id = node as Identifier;
      if (context.tableParams.has(id.name)) {
        // This is a table parameter used as boolean
        return {
          value: {
            type: "booleanColumn",
            name: id.name,
          },
          counter: currentCounter,
        };
      }
      return { value: null, counter: currentCounter };
    }

    case "Literal":
    case "BooleanLiteral": {
      // Boolean constant
      const lit = node as Literal;
      if (typeof lit.value === "boolean") {
        return {
          value: {
            type: "booleanConstant",
            value: lit.value,
          },
          counter: currentCounter,
        };
      }
      return { value: null, counter: currentCounter };
    }

    case "ParenthesizedExpression": {
      // Unwrap parentheses
      const paren = node as { expression: ASTExpression };
      return visitPredicate(paren.expression, context);
    }

    default:
      return { value: null, counter: currentCounter };
  }
}
