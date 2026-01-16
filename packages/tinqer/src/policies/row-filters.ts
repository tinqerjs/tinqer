import type {
  ArrayExpression,
  BooleanExpression,
  ColumnExpression,
  ConstantExpression,
  Expression,
  ObjectExpression,
  ParameterExpression,
  ValueExpression,
} from "../expressions/expression.js";
import { isValueExpression } from "../expressions/expression.js";
import type {
  AnyOperation,
  AverageOperation,
  ContainsOperation,
  CountOperation,
  DeleteOperation,
  DefaultIfEmptyOperation,
  DistinctOperation,
  FirstOperation,
  FirstOrDefaultOperation,
  FromOperation,
  GroupByOperation,
  GroupJoinOperation,
  JoinOperation,
  LastOperation,
  LastOrDefaultOperation,
  LongCountOperation,
  MaxOperation,
  MinOperation,
  OrderByOperation,
  QueryOperation,
  ReverseOperation,
  SelectManyOperation,
  SelectOperation,
  SingleOperation,
  SingleOrDefaultOperation,
  SkipOperation,
  SumOperation,
  TakeOperation,
  ThenByOperation,
  ToDictionaryOperation,
  ToLookupOperation,
  UpdateOperation,
  WhereOperation,
} from "../query-tree/operations.js";
import type {
  TableRowFilters,
  RowFilterOperation,
  RowFilterState,
} from "../linq/database-context.js";
import type {
  ArrowFunctionExpression,
  CallExpression as ASTCallExpression,
  Expression as ASTExpression,
  Identifier,
  Program,
} from "../parser/ast-types.js";
import { parseJavaScript } from "../parser/oxc-parser.js";
import type { VisitorContext } from "../visitors/types.js";
import { createBaseContext } from "../visitors/types.js";
import { visitWhereOperation } from "../visitors/where/index.js";

const ROW_FILTER_CONTEXT_PARAM_PREFIX = "__tinqer_row_filter_ctx__";

type RowFilterPredicateFn = (...args: unknown[]) => boolean;

type ParsedRowFilter = {
  predicate: BooleanExpression;
  autoParams: Record<string, unknown>;
  contextKeys: Set<string>;
  autoParamCounter: number;
};

export function applyRowFiltersToSelectOperation(
  operation: QueryOperation,
  rowFilters: RowFilterState | undefined,
  params: Record<string, unknown>,
  autoParamCounterStart: number,
): { operation: QueryOperation; params: Record<string, unknown> } {
  if (!rowFilters) {
    return { operation, params };
  }

  const filters = rowFilters.filters;
  const context = rowFilters.context;
  if (!context) {
    throw new Error("Row filters require context binding. Call schema.withContext(context).");
  }

  let autoParamCounter = autoParamCounterStart;
  const filterCache = new Map<string, ParsedRowFilter | null>();
  const filterAutoParams: Record<string, unknown> = {};
  const requiredContextKeys = new Set<string>();

  function getParsedFilter(
    table: string,
    schema: string | undefined,
    kind: RowFilterOperation,
  ): ParsedRowFilter | null {
    const resolved = resolveTableConfig(filters, table, schema);
    const cacheKey = `${resolved.key}|${kind}`;

    const cached = filterCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const predicateFn = resolvePredicateForOperation(resolved.config, kind);
    if (!predicateFn) {
      filterCache.set(cacheKey, null);
      return null;
    }

    const parsed = parseRowFilter(predicateFn, resolved.key, kind, autoParamCounter);
    autoParamCounter = parsed.autoParamCounter;

    Object.assign(filterAutoParams, parsed.autoParams);
    for (const key of parsed.contextKeys) {
      requiredContextKeys.add(key);
    }

    filterCache.set(cacheKey, parsed);
    return parsed;
  }

  function transform(current: QueryOperation): QueryOperation {
    switch (current.operationType) {
      case "from": {
        const fromOp = current as FromOperation;
        if (fromOp.subquery) {
          const nextSubquery = transform(fromOp.subquery);
          if (nextSubquery === fromOp.subquery) {
            return fromOp;
          }
          const nextFrom: FromOperation = { ...fromOp, subquery: nextSubquery };
          return nextFrom;
        }

        if (!fromOp.table) {
          return fromOp;
        }

        const parsed = getParsedFilter(fromOp.table, fromOp.schema, "select");
        if (!parsed) {
          return fromOp;
        }

        const baseFrom: FromOperation = {
          type: "queryOperation",
          operationType: "from",
          table: fromOp.table,
          ...(fromOp.schema ? { schema: fromOp.schema } : {}),
        };

        const whereOp: WhereOperation = {
          type: "queryOperation",
          operationType: "where",
          source: baseFrom,
          predicate: parsed.predicate,
        };

        const wrappedFrom: FromOperation = {
          type: "queryOperation",
          operationType: "from",
          subquery: whereOp,
          aliasHint: fromOp.aliasHint ?? fromOp.table,
        };
        return wrappedFrom;
      }

      case "where": {
        const whereOp = current as WhereOperation;
        const nextSource = transform(whereOp.source);
        if (nextSource === whereOp.source) {
          return whereOp;
        }
        const nextWhere: WhereOperation = { ...whereOp, source: nextSource };
        return nextWhere;
      }

      case "select": {
        const selectOp = current as SelectOperation;
        const nextSource = transform(selectOp.source);
        if (nextSource === selectOp.source) {
          return selectOp;
        }
        const nextSelect: SelectOperation = { ...selectOp, source: nextSource };
        return nextSelect;
      }

      case "join": {
        const joinOp = current as JoinOperation;
        const nextSource = transform(joinOp.source);
        const nextInner = transform(joinOp.inner);
        if (nextSource === joinOp.source && nextInner === joinOp.inner) {
          return joinOp;
        }
        const nextJoin: JoinOperation = { ...joinOp, source: nextSource, inner: nextInner };
        return nextJoin;
      }

      case "groupJoin": {
        const groupJoinOp = current as GroupJoinOperation;
        const nextSource = transform(groupJoinOp.source);
        const nextInner = transform(groupJoinOp.inner);
        if (nextSource === groupJoinOp.source && nextInner === groupJoinOp.inner) {
          return groupJoinOp;
        }
        const nextGroupJoin: GroupJoinOperation = {
          ...groupJoinOp,
          source: nextSource,
          inner: nextInner,
        };
        return nextGroupJoin;
      }

      case "selectMany": {
        const selectManyOp = current as SelectManyOperation;
        const nextSource = transform(selectManyOp.source);
        const nextCollection =
          typeof selectManyOp.collection === "object" &&
          selectManyOp.collection !== null &&
          "operationType" in selectManyOp.collection
            ? transform(selectManyOp.collection as QueryOperation)
            : selectManyOp.collection;

        if (nextSource === selectManyOp.source && nextCollection === selectManyOp.collection) {
          return selectManyOp;
        }

        const nextSelectMany: SelectManyOperation = {
          ...selectManyOp,
          source: nextSource,
          collection: nextCollection,
        };
        return nextSelectMany;
      }

      case "defaultIfEmpty": {
        const defaultIfEmptyOp = current as DefaultIfEmptyOperation;
        const nextSource = transform(defaultIfEmptyOp.source);
        if (nextSource === defaultIfEmptyOp.source) {
          return defaultIfEmptyOp;
        }
        const nextDefaultIfEmpty: DefaultIfEmptyOperation = {
          ...defaultIfEmptyOp,
          source: nextSource,
        };
        return nextDefaultIfEmpty;
      }

      case "groupBy": {
        const groupByOp = current as GroupByOperation;
        const nextSource = transform(groupByOp.source);
        if (nextSource === groupByOp.source) {
          return groupByOp;
        }
        const nextGroupBy: GroupByOperation = { ...groupByOp, source: nextSource };
        return nextGroupBy;
      }

      case "orderBy": {
        const orderByOp = current as OrderByOperation;
        const nextSource = transform(orderByOp.source);
        if (nextSource === orderByOp.source) {
          return orderByOp;
        }
        const nextOrderBy: OrderByOperation = { ...orderByOp, source: nextSource };
        return nextOrderBy;
      }

      case "thenBy": {
        const thenByOp = current as ThenByOperation;
        const nextSource = transform(thenByOp.source);
        if (nextSource === thenByOp.source) {
          return thenByOp;
        }
        const nextThenBy: ThenByOperation = { ...thenByOp, source: nextSource };
        return nextThenBy;
      }

      case "distinct": {
        const distinctOp = current as DistinctOperation;
        const nextSource = transform(distinctOp.source);
        if (nextSource === distinctOp.source) {
          return distinctOp;
        }
        const nextDistinct: DistinctOperation = { ...distinctOp, source: nextSource };
        return nextDistinct;
      }

      case "take": {
        const takeOp = current as TakeOperation;
        const nextSource = transform(takeOp.source);
        if (nextSource === takeOp.source) {
          return takeOp;
        }
        const nextTake: TakeOperation = { ...takeOp, source: nextSource };
        return nextTake;
      }

      case "skip": {
        const skipOp = current as SkipOperation;
        const nextSource = transform(skipOp.source);
        if (nextSource === skipOp.source) {
          return skipOp;
        }
        const nextSkip: SkipOperation = { ...skipOp, source: nextSource };
        return nextSkip;
      }

      case "reverse": {
        const reverseOp = current as ReverseOperation;
        const nextSource = transform(reverseOp.source);
        if (nextSource === reverseOp.source) {
          return reverseOp;
        }
        const nextReverse: ReverseOperation = { ...reverseOp, source: nextSource };
        return nextReverse;
      }

      case "first":
      case "firstOrDefault": {
        const op = current as FirstOperation | FirstOrDefaultOperation;
        const nextSource = transform(op.source);
        if (nextSource === op.source) {
          return op;
        }
        const nextOp: FirstOperation | FirstOrDefaultOperation = { ...op, source: nextSource };
        return nextOp;
      }

      case "single":
      case "singleOrDefault": {
        const op = current as SingleOperation | SingleOrDefaultOperation;
        const nextSource = transform(op.source);
        if (nextSource === op.source) {
          return op;
        }
        const nextOp: SingleOperation | SingleOrDefaultOperation = { ...op, source: nextSource };
        return nextOp;
      }

      case "last":
      case "lastOrDefault": {
        const op = current as LastOperation | LastOrDefaultOperation;
        const nextSource = transform(op.source);
        if (nextSource === op.source) {
          return op;
        }
        const nextOp: LastOperation | LastOrDefaultOperation = { ...op, source: nextSource };
        return nextOp;
      }

      case "contains": {
        const containsOp = current as ContainsOperation;
        const nextSource = transform(containsOp.source);
        if (nextSource === containsOp.source) {
          return containsOp;
        }
        const nextContains: ContainsOperation = { ...containsOp, source: nextSource };
        return nextContains;
      }

      case "any": {
        const anyOp = current as AnyOperation;
        const nextSource = transform(anyOp.source);
        if (nextSource === anyOp.source) {
          return anyOp;
        }
        const nextAny: AnyOperation = { ...anyOp, source: nextSource };
        return nextAny;
      }

      case "all": {
        const allOp = current as QueryOperation & { source: QueryOperation };
        const nextSource = transform(allOp.source);
        if (nextSource === allOp.source) {
          return allOp;
        }
        const nextAll = { ...allOp, source: nextSource } as unknown as QueryOperation;
        return nextAll;
      }

      case "count":
      case "longCount": {
        const op = current as CountOperation | LongCountOperation;
        const nextSource = transform(op.source);
        if (nextSource === op.source) {
          return op;
        }
        const nextOp: CountOperation | LongCountOperation = { ...op, source: nextSource };
        return nextOp;
      }

      case "sum": {
        const sumOp = current as SumOperation;
        const nextSource = transform(sumOp.source);
        if (nextSource === sumOp.source) {
          return sumOp;
        }
        const nextSum: SumOperation = { ...sumOp, source: nextSource };
        return nextSum;
      }

      case "average": {
        const averageOp = current as AverageOperation;
        const nextSource = transform(averageOp.source);
        if (nextSource === averageOp.source) {
          return averageOp;
        }
        const nextAverage: AverageOperation = { ...averageOp, source: nextSource };
        return nextAverage;
      }

      case "min": {
        const minOp = current as MinOperation;
        const nextSource = transform(minOp.source);
        if (nextSource === minOp.source) {
          return minOp;
        }
        const nextMin: MinOperation = { ...minOp, source: nextSource };
        return nextMin;
      }

      case "max": {
        const maxOp = current as MaxOperation;
        const nextSource = transform(maxOp.source);
        if (nextSource === maxOp.source) {
          return maxOp;
        }
        const nextMax: MaxOperation = { ...maxOp, source: nextSource };
        return nextMax;
      }

      case "toDictionary": {
        const toDictionaryOp = current as ToDictionaryOperation;
        const nextSource = transform(toDictionaryOp.source);
        if (nextSource === toDictionaryOp.source) {
          return toDictionaryOp;
        }
        const nextToDictionary: ToDictionaryOperation = {
          ...toDictionaryOp,
          source: nextSource,
        };
        return nextToDictionary;
      }

      case "toLookup": {
        const toLookupOp = current as ToLookupOperation;
        const nextSource = transform(toLookupOp.source);
        if (nextSource === toLookupOp.source) {
          return toLookupOp;
        }
        const nextToLookup: ToLookupOperation = { ...toLookupOp, source: nextSource };
        return nextToLookup;
      }

      default:
        return current;
    }
  }

  const nextOperation = transform(operation);

  const contextParams = buildContextParams(context, requiredContextKeys);
  const withAutoParams = mergeParamsStrict(params, filterAutoParams, "Row filter auto-params");
  const nextParams = mergeParamsStrict(withAutoParams, contextParams, "Row filter context params");

  return { operation: nextOperation, params: nextParams };
}

export function applyRowFiltersToUpdateOperation(
  operation: UpdateOperation,
  rowFilters: RowFilterState | undefined,
  params: Record<string, unknown>,
  autoParamCounterStart: number,
): { operation: UpdateOperation; params: Record<string, unknown> } {
  if (!rowFilters) {
    return { operation, params };
  }

  const context = rowFilters.context;
  if (!context) {
    throw new Error("Row filters require context binding. Call schema.withContext(context).");
  }

  const resolved = resolveTableConfig(rowFilters.filters, operation.table, operation.schema);
  const predicateFn = resolvePredicateForOperation(resolved.config, "update");

  if (!predicateFn) {
    return { operation, params };
  }

  const parsed = parseRowFilter(predicateFn, resolved.key, "update", autoParamCounterStart);
  const contextParams = buildContextParams(context, parsed.contextKeys);
  const withAutoParams = mergeParamsStrict(params, parsed.autoParams, "Row filter auto-params");
  const nextParams = mergeParamsStrict(withAutoParams, contextParams, "Row filter context params");

  const includedAssignments = selectIncludedAssignments(operation.assignments, nextParams);
  const checkPredicate = substituteUpdatedColumnsInPredicate(parsed.predicate, includedAssignments);

  const nextPredicate = andPredicates(
    andPredicates(operation.predicate, parsed.predicate),
    checkPredicate,
  );

  return {
    operation: {
      ...operation,
      predicate: nextPredicate ?? operation.predicate,
    },
    params: nextParams,
  };
}

export function applyRowFiltersToDeleteOperation(
  operation: DeleteOperation,
  rowFilters: RowFilterState | undefined,
  params: Record<string, unknown>,
  autoParamCounterStart: number,
): { operation: DeleteOperation; params: Record<string, unknown> } {
  if (!rowFilters) {
    return { operation, params };
  }

  const context = rowFilters.context;
  if (!context) {
    throw new Error("Row filters require context binding. Call schema.withContext(context).");
  }

  const resolved = resolveTableConfig(rowFilters.filters, operation.table, operation.schema);
  const predicateFn = resolvePredicateForOperation(resolved.config, "delete");

  if (!predicateFn) {
    return { operation, params };
  }

  const parsed = parseRowFilter(predicateFn, resolved.key, "delete", autoParamCounterStart);
  const contextParams = buildContextParams(context, parsed.contextKeys);
  const withAutoParams = mergeParamsStrict(params, parsed.autoParams, "Row filter auto-params");
  const nextParams = mergeParamsStrict(withAutoParams, contextParams, "Row filter context params");

  const nextPredicate = andPredicates(operation.predicate, parsed.predicate);

  return {
    operation: {
      ...operation,
      predicate: nextPredicate ?? operation.predicate,
    },
    params: nextParams,
  };
}

function resolveTableConfig(
  filters: RowFilterState["filters"],
  table: string,
  schema: string | undefined,
): { key: string; config: TableRowFilters<unknown, Record<string, unknown>> } {
  const schemaQualified = schema ? `${schema}.${table}` : null;

  if (schemaQualified && Object.prototype.hasOwnProperty.call(filters, schemaQualified)) {
    return {
      key: schemaQualified,
      config: filters[schemaQualified]!,
    };
  }

  if (Object.prototype.hasOwnProperty.call(filters, table)) {
    return {
      key: table,
      config: filters[table]!,
    };
  }

  throw new Error(
    `Row filter schema is missing configuration for table "${schemaQualified || table}".`,
  );
}

function resolvePredicateForOperation(
  config: TableRowFilters<unknown, Record<string, unknown>>,
  kind: RowFilterOperation,
): RowFilterPredicateFn | null {
  if (config === null) {
    return null;
  }

  if (typeof config === "function") {
    return config as unknown as RowFilterPredicateFn;
  }

  const opConfig = config as {
    select: unknown;
    update: unknown;
    delete: unknown;
  };

  const value = opConfig[kind];
  if (value === null) {
    return null;
  }

  if (typeof value !== "function") {
    throw new Error(`Row filter config for ${kind} must be a function or null.`);
  }

  return value as RowFilterPredicateFn;
}

function parseRowFilter(
  predicateFn: RowFilterPredicateFn,
  table: string,
  kind: RowFilterOperation,
  autoParamCounterStart: number,
): ParsedRowFilter {
  const lambda = parseArrowFunctionExpression(predicateFn, `${table}.${kind}`);

  const ctxParamName = getIdentifierParamName(lambda, 1);
  const helpersParamName = getIdentifierParamName(lambda, 2);

  const visitorContext: VisitorContext = createBaseContext();
  visitorContext.autoParamCounter = autoParamCounterStart;
  visitorContext.currentTable = table;
  visitorContext.helpersParam = helpersParamName;

  const source: FromOperation = {
    type: "queryOperation",
    operationType: "from",
    table,
  };

  const call = createMethodCall("where", lambda);
  const result = visitWhereOperation(call, source, visitorContext);

  if (!result) {
    throw new Error(`Failed to parse row filter for ${table}.${kind}.`);
  }

  const contextKeys = new Set<string>();
  const predicate = bindContextParams(result.operation.predicate, ctxParamName, contextKeys);

  return {
    predicate,
    autoParams: result.autoParams,
    contextKeys,
    autoParamCounter: visitorContext.autoParamCounter,
  };
}

function bindContextParams(
  expr: BooleanExpression,
  ctxParamName: string | undefined,
  contextKeys: Set<string>,
): BooleanExpression {
  return rewriteExpression(expr, ctxParamName, contextKeys) as BooleanExpression;
}

function rewriteExpression(
  expr: Expression,
  ctxParamName: string | undefined,
  contextKeys: Set<string>,
): Expression {
  switch (expr.type) {
    case "param": {
      const paramExpr = expr as ParameterExpression;
      if (!ctxParamName || paramExpr.param !== ctxParamName) {
        return paramExpr;
      }

      if (!paramExpr.property || paramExpr.index !== undefined) {
        throw new Error("Row filter context parameters must use direct property access (ctx.key).");
      }

      contextKeys.add(paramExpr.property);

      return {
        type: "param",
        param: `${ROW_FILTER_CONTEXT_PARAM_PREFIX}${paramExpr.property}`,
      } as ParameterExpression;
    }

    case "column":
    case "constant":
    case "reference":
    case "allColumns":
    case "booleanColumn":
    case "booleanConstant":
      return expr;

    case "comparison": {
      return {
        ...expr,
        left: rewriteExpression(expr.left, ctxParamName, contextKeys) as ValueExpression,
        right: rewriteExpression(expr.right, ctxParamName, contextKeys) as ValueExpression,
      };
    }

    case "logical": {
      return {
        ...expr,
        left: rewriteExpression(expr.left, ctxParamName, contextKeys) as BooleanExpression,
        right: rewriteExpression(expr.right, ctxParamName, contextKeys) as BooleanExpression,
      };
    }

    case "not": {
      return {
        ...expr,
        expression: rewriteExpression(
          expr.expression,
          ctxParamName,
          contextKeys,
        ) as BooleanExpression,
      };
    }

    case "booleanMethod": {
      return {
        ...expr,
        object: rewriteExpression(expr.object, ctxParamName, contextKeys) as ValueExpression,
        arguments: expr.arguments.map(
          (arg) => rewriteExpression(arg, ctxParamName, contextKeys) as ValueExpression,
        ),
      };
    }

    case "caseInsensitiveFunction": {
      return {
        ...expr,
        arguments: expr.arguments.map(
          (arg) => rewriteExpression(arg, ctxParamName, contextKeys) as ValueExpression,
        ) as [ValueExpression, ValueExpression],
      };
    }

    case "in": {
      return {
        ...expr,
        value: rewriteExpression(expr.value, ctxParamName, contextKeys) as ValueExpression,
        list: Array.isArray(expr.list)
          ? expr.list.map(
              (item) => rewriteExpression(item, ctxParamName, contextKeys) as ValueExpression,
            )
          : (rewriteExpression(expr.list as unknown as Expression, ctxParamName, contextKeys) as
              | ArrayExpression
              | ParameterExpression),
      };
    }

    case "isNull": {
      return {
        ...expr,
        expression: rewriteExpression(
          expr.expression,
          ctxParamName,
          contextKeys,
        ) as ValueExpression,
      };
    }

    case "arithmetic":
    case "concat": {
      return {
        ...expr,
        left: rewriteExpression(expr.left, ctxParamName, contextKeys) as ValueExpression,
        right: rewriteExpression(expr.right, ctxParamName, contextKeys) as ValueExpression,
      };
    }

    case "stringMethod": {
      return {
        ...expr,
        object: rewriteExpression(expr.object, ctxParamName, contextKeys) as ValueExpression,
        arguments: expr.arguments
          ? expr.arguments.map(
              (arg) => rewriteExpression(arg, ctxParamName, contextKeys) as ValueExpression,
            )
          : undefined,
      };
    }

    case "case": {
      return {
        ...expr,
        conditions: expr.conditions.map((c) => ({
          when: rewriteExpression(c.when, ctxParamName, contextKeys) as BooleanExpression,
          then: rewriteExpression(c.then, ctxParamName, contextKeys) as ValueExpression,
        })),
        else: expr.else
          ? (rewriteExpression(expr.else, ctxParamName, contextKeys) as ValueExpression)
          : undefined,
      };
    }

    case "coalesce": {
      return {
        ...expr,
        expressions: expr.expressions.map(
          (e) => rewriteExpression(e, ctxParamName, contextKeys) as ValueExpression,
        ),
      };
    }

    case "aggregate": {
      return {
        ...expr,
        expression: expr.expression
          ? (rewriteExpression(expr.expression, ctxParamName, contextKeys) as ValueExpression)
          : undefined,
      };
    }

    case "windowFunction": {
      return {
        ...expr,
        partitionBy: expr.partitionBy.map(
          (e) => rewriteExpression(e, ctxParamName, contextKeys) as ValueExpression,
        ),
        orderBy: expr.orderBy.map((o) => ({
          ...o,
          expression: rewriteExpression(o.expression, ctxParamName, contextKeys) as ValueExpression,
        })),
      };
    }

    case "object": {
      const nextProperties: Record<string, Expression> = {};
      for (const [key, value] of Object.entries(expr.properties)) {
        nextProperties[key] = rewriteExpression(value, ctxParamName, contextKeys);
      }
      return { ...expr, properties: nextProperties };
    }

    case "array": {
      return {
        ...expr,
        elements: expr.elements.map((e) => rewriteExpression(e, ctxParamName, contextKeys)),
      };
    }

    case "memberAccess": {
      return {
        ...expr,
        object: rewriteExpression(expr.object, ctxParamName, contextKeys),
      };
    }

    case "methodCall": {
      return {
        ...expr,
        object: rewriteExpression(expr.object, ctxParamName, contextKeys),
        arguments: expr.arguments.map((a) => rewriteExpression(a, ctxParamName, contextKeys)),
      };
    }

    case "conditional": {
      return {
        ...expr,
        condition: rewriteExpression(
          expr.condition,
          ctxParamName,
          contextKeys,
        ) as BooleanExpression,
        then: rewriteExpression(expr.then, ctxParamName, contextKeys),
        else: rewriteExpression(expr.else, ctxParamName, contextKeys),
      };
    }

    case "functionCall": {
      return {
        ...expr,
        arguments: expr.arguments.map((a) => rewriteExpression(a, ctxParamName, contextKeys)),
      };
    }

    case "new": {
      return {
        ...expr,
        arguments: expr.arguments.map((a) => rewriteExpression(a, ctxParamName, contextKeys)),
      };
    }

    case "lambda": {
      return {
        ...expr,
        body: rewriteExpression(expr.body, ctxParamName, contextKeys),
      };
    }

    default:
      return expr;
  }
}

function buildContextParams(
  context: Record<string, unknown>,
  requiredKeys: Set<string>,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(context, key)) {
      throw new Error(`Row filter context is missing required key "${key}".`);
    }
    const value = context[key];
    if (value === undefined) {
      throw new Error(`Row filter context key "${key}" must not be undefined.`);
    }
    params[`${ROW_FILTER_CONTEXT_PARAM_PREFIX}${key}`] = value;
  }

  return params;
}

function mergeParamsStrict(
  base: Record<string, unknown>,
  additions: Record<string, unknown>,
  label: string,
): Record<string, unknown> {
  for (const key of Object.keys(additions)) {
    if (Object.prototype.hasOwnProperty.call(base, key)) {
      throw new Error(`${label} collided with existing parameter "${key}".`);
    }
  }
  return { ...base, ...additions };
}

function andPredicates(
  left: BooleanExpression | undefined,
  right: BooleanExpression | undefined,
): BooleanExpression | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    type: "logical",
    operator: "and",
    left,
    right,
  };
}

function selectIncludedAssignments(
  assignments: ObjectExpression,
  params: Record<string, unknown>,
): Record<string, Expression> {
  if (assignments.type !== "object") {
    return {};
  }

  const included: Record<string, Expression> = {};
  for (const [column, valueExpr] of Object.entries(assignments.properties)) {
    if (shouldSkipAssignment(valueExpr, params)) {
      continue;
    }
    included[column] = valueExpr;
  }
  return included;
}

function shouldSkipAssignment(valueExpr: Expression, params: Record<string, unknown>): boolean {
  if (valueExpr.type === "param") {
    const paramExpr = valueExpr as ParameterExpression;
    const paramName = paramExpr.property || paramExpr.param;
    if (Object.prototype.hasOwnProperty.call(params, paramName)) {
      return params[paramName] === undefined;
    }
    return true;
  }

  if (valueExpr.type === "constant") {
    const constant = valueExpr as ConstantExpression;
    return constant.value === undefined;
  }

  return false;
}

function substituteUpdatedColumnsInPredicate(
  predicate: BooleanExpression,
  assignments: Record<string, Expression>,
): BooleanExpression {
  function rewriteValue(value: ValueExpression): ValueExpression {
    if (value.type !== "column") {
      return rewriteExpression(value, undefined, new Set()) as ValueExpression;
    }

    const colExpr = value as ColumnExpression;
    if (colExpr.table || colExpr.source) {
      return colExpr;
    }

    const replacement = assignments[colExpr.name];
    if (!replacement) {
      return colExpr;
    }

    if (!isValueExpression(replacement)) {
      throw new Error(
        `Row filter column "${colExpr.name}" cannot be substituted with a non-value assignment.`,
      );
    }

    return replacement as ValueExpression;
  }

  function rewriteBoolean(expr: BooleanExpression): BooleanExpression {
    switch (expr.type) {
      case "comparison":
        return {
          ...expr,
          left: rewriteValue(expr.left),
          right: rewriteValue(expr.right),
        };
      case "logical":
        return {
          ...expr,
          left: rewriteBoolean(expr.left),
          right: rewriteBoolean(expr.right),
        };
      case "not":
        return { ...expr, expression: rewriteBoolean(expr.expression) };
      case "booleanMethod":
        return {
          ...expr,
          object: rewriteValue(expr.object),
          arguments: expr.arguments.map((a) => rewriteValue(a)),
        };
      case "caseInsensitiveFunction":
        return {
          ...expr,
          arguments: [rewriteValue(expr.arguments[0]), rewriteValue(expr.arguments[1])],
        };
      case "in":
        return {
          ...expr,
          value: rewriteValue(expr.value),
          list: Array.isArray(expr.list)
            ? expr.list.map((item) => rewriteValue(item as ValueExpression))
            : (rewriteExpression(expr.list as unknown as Expression, undefined, new Set()) as
                | ArrayExpression
                | ParameterExpression),
        };
      case "isNull":
        return {
          ...expr,
          expression: rewriteValue(expr.expression),
        };
      default:
        return expr;
    }
  }

  return rewriteBoolean(predicate);
}

function parseArrowFunctionExpression(
  lambda: (...args: unknown[]) => unknown,
  label: string,
): ArrowFunctionExpression {
  const source = lambda.toString();
  const program = parseJavaScript(source) as Program;
  const body = program.body?.[0];

  if (!body || body.type !== "ExpressionStatement") {
    throw new Error(`${label} expects an arrow function expression`);
  }

  const expression = body.expression as ASTExpression;
  if (expression.type !== "ArrowFunctionExpression") {
    throw new Error(`${label} expects an arrow function expression`);
  }

  return expression;
}

function getIdentifierParamName(
  lambda: ArrowFunctionExpression,
  index: number,
): string | undefined {
  const param = lambda.params?.[index];
  if (!param || param.type !== "Identifier") {
    return undefined;
  }
  return (param as Identifier).name;
}

function createMethodCall(methodName: string, argument?: ASTExpression): ASTCallExpression {
  return {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      object: {
        type: "Identifier",
        name: "__plan",
      },
      property: {
        type: "Identifier",
        name: methodName,
      },
      computed: false,
      optional: false,
    },
    arguments: argument ? [argument] : [],
    optional: false,
  } as ASTCallExpression;
}
