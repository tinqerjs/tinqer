import { Queryable } from "../linq/queryable.js";
import { TerminalQuery } from "../linq/terminal-query.js";
import type { QueryHelpers } from "../linq/functions.js";
import type { QueryBuilder } from "../linq/query-builder.js";
import type { DatabaseSchema, RowFilterState } from "../linq/database-context.js";
import type { Grouping } from "../linq/grouping.js";
import type { ParseQueryOptions } from "../parser/types.js";
import type { QueryOperation } from "../query-tree/operations.js";
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression as ASTExpression,
  NumericLiteral,
  Program,
} from "../parser/ast-types.js";
import { parseJavaScript } from "../parser/oxc-parser.js";
import { parseQuery } from "../parser/parse-query.js";
import { normalizeJoins } from "../parser/normalize-joins.js";
import { wrapWindowFilters } from "../parser/normalize-window-filters.js";
import type { ParseResult } from "../parser/parse-query.js";
import {
  restoreVisitorContext,
  snapshotVisitorContext,
  type VisitorContext,
  type VisitorContextSnapshot,
} from "../visitors/types.js";
import { visitWhereOperation } from "../visitors/where/index.js";
import { visitSelectOperation } from "../visitors/select/index.js";
import { visitOrderByOperation, visitThenByOperation } from "../visitors/orderby/index.js";
import { visitTakeOperation } from "../visitors/take-skip/take.js";
import { visitSkipOperation } from "../visitors/take-skip/skip.js";
import { visitDistinctOperation } from "../visitors/distinct/index.js";
import { visitReverseOperation } from "../visitors/reverse/index.js";
import { visitGroupByOperation } from "../visitors/groupby/index.js";
import { visitCountOperation } from "../visitors/count/index.js";
import { visitFirstOperation } from "../visitors/predicates/first.js";
import { visitLastOperation } from "../visitors/predicates/last.js";
import { visitSingleOperation } from "../visitors/predicates/single.js";
import { visitSumOperation } from "../visitors/aggregates/sum.js";
import { visitAverageOperation } from "../visitors/aggregates/average.js";
import { visitMinOperation } from "../visitors/aggregates/min.js";
import { visitMaxOperation } from "../visitors/aggregates/max.js";
import { visitAnyOperation } from "../visitors/boolean-predicates/any.js";
import { visitAllOperation } from "../visitors/boolean-predicates/all.js";
import { applyRowFiltersToSelectOperation } from "../policies/row-filters.js";

// -----------------------------------------------------------------------------
// Plan data
// -----------------------------------------------------------------------------

export interface SelectPlan<TRecord, TParams> {
  readonly kind: "select";
  readonly operation: QueryOperation;
  readonly autoParams: Record<string, unknown>;
  readonly autoParamInfos?: Record<string, unknown>;
  readonly contextSnapshot: VisitorContextSnapshot;
  readonly parseOptions?: ParseQueryOptions;
  readonly rowFilters?: RowFilterState;
  readonly __type?: {
    record: TRecord;
    params: TParams;
  };
}

type SelectPlanState<TRecord, TParams> = SelectPlan<TRecord, TParams>;

function createInitialState<TRecord, TParams>(
  parseResult: ParseResult,
  options?: ParseQueryOptions,
  rowFilters?: RowFilterState,
): SelectPlanState<TRecord, TParams> {
  const operationClone = cloneOperationTree(parseResult.operation);
  return {
    kind: "select",
    operation: operationClone,
    autoParams: { ...parseResult.autoParams },
    autoParamInfos: parseResult.autoParamInfos ? { ...parseResult.autoParamInfos } : undefined,
    contextSnapshot: parseResult.contextSnapshot,
    parseOptions: options,
    rowFilters,
  };
}

function createState<TRecord, TParams>(
  base: SelectPlanState<unknown, TParams>,
  nextOperation: QueryOperation,
  visitorContext: VisitorContext,
): SelectPlanState<TRecord, TParams> {
  const nextSnapshot = snapshotVisitorContext(visitorContext);
  const autoParamEntries = Array.from(visitorContext.autoParams.entries());
  const autoParams = Object.fromEntries(autoParamEntries);
  const autoParamInfos = visitorContext.autoParamInfos
    ? Object.fromEntries(visitorContext.autoParamInfos.entries())
    : base.autoParamInfos;

  const normalizedOperation = wrapWindowFilters(normalizeJoins(cloneOperationTree(nextOperation)));

  return {
    kind: "select",
    operation: normalizedOperation,
    autoParams,
    autoParamInfos,
    contextSnapshot: nextSnapshot,
    parseOptions: base.parseOptions,
    rowFilters: base.rowFilters,
  };
}

// -----------------------------------------------------------------------------
// Plan handle
// -----------------------------------------------------------------------------

export interface SelectPlanSql {
  operation: QueryOperation;
  params: Record<string, unknown>;
  autoParamInfos?: Record<string, unknown>;
}

export class SelectPlanHandle<TRecord, TParams> extends Queryable<TRecord> {
  constructor(private readonly state: SelectPlanState<TRecord, TParams>) {
    super();
  }

  finalize(params: TParams): SelectPlanSql {
    const merged = mergeParams(this.state.autoParams, params);
    const filtered = applyRowFiltersToSelectOperation(
      this.state.operation,
      this.state.rowFilters,
      merged,
      this.state.contextSnapshot.autoParamCounter,
    );
    return {
      operation: filtered.operation,
      params: filtered.params,
      autoParamInfos: this.state.autoParamInfos,
    };
  }

  execute(_params: TParams): Promise<never> {
    return Promise.reject(
      new Error("execute() is not implemented. Use adapter methods (toSql/executeSelect) instead."),
    );
  }

  toPlan(): SelectPlan<TRecord, TParams> {
    return this.state;
  }

  // Overload to maintain Queryable compatibility
  where(predicate: (item: TRecord) => boolean): SelectPlanHandle<TRecord, TParams>;
  where<ExtraParams extends object = Record<string, never>>(
    predicate: (item: TRecord, params: TParams & ExtraParams) => boolean,
  ): SelectPlanHandle<TRecord, TParams & ExtraParams>;
  where<ExtraParams extends object = Record<string, never>>(
    predicate:
      | ((item: TRecord) => boolean)
      | ((item: TRecord, params: TParams & ExtraParams) => boolean),
  ): SelectPlanHandle<TRecord, TParams | (TParams & ExtraParams)> {
    const nextState = appendWhere(
      this.state,
      predicate as unknown as (...args: unknown[]) => boolean,
    );
    return new SelectPlanHandle(
      nextState as SelectPlanState<TRecord, TParams | (TParams & ExtraParams)>,
    );
  }

  select<TResult>(selector: (item: TRecord) => TResult): SelectPlanHandle<TResult, TParams> {
    const nextState = appendSelect(this.state, selector as unknown as (item: TRecord) => TResult);
    return new SelectPlanHandle(nextState as unknown as SelectPlanState<TResult, TParams>);
  }

  orderBy<TKey>(selector: (item: TRecord) => TKey): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendOrderBy(
      this.state,
      selector as unknown as (item: TRecord) => unknown,
      "orderBy",
    );
    return new SelectPlanHandle(nextState);
  }

  orderByDescending<TKey>(selector: (item: TRecord) => TKey): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendOrderBy(
      this.state,
      selector as unknown as (item: TRecord) => unknown,
      "orderByDescending",
    );
    return new SelectPlanHandle(nextState);
  }

  thenBy<TKey>(selector: (item: TRecord) => TKey): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendThenBy(
      this.state,
      selector as unknown as (item: TRecord) => unknown,
      "thenBy",
    );
    return new SelectPlanHandle(nextState);
  }

  thenByDescending<TKey>(selector: (item: TRecord) => TKey): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendThenBy(
      this.state,
      selector as unknown as (item: TRecord) => unknown,
      "thenByDescending",
    );
    return new SelectPlanHandle(nextState);
  }

  take(count: number): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendTake(this.state, count);
    return new SelectPlanHandle(nextState);
  }

  skip(count: number): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendSkip(this.state, count);
    return new SelectPlanHandle(nextState);
  }

  distinct(): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendDistinct(this.state);
    return new SelectPlanHandle(nextState);
  }

  reverse(): SelectPlanHandle<TRecord, TParams> {
    const nextState = appendReverse(this.state);
    return new SelectPlanHandle(nextState);
  }

  // NOTE: join, groupJoin, and selectMany are NOT supported on plan handles.
  // These operations must be composed inside the defineSelect builder where the query builder (q) is in scope.
  //
  // Working pattern:
  //   const plan = defineSelect(schema, (q) =>
  //     q.from("users").join(q.from("orders"), ...)
  //   );
  //
  // Plan handles only support operations that don't require access to the query builder.

  groupBy<TKey>(
    keySelector: (item: TRecord) => TKey,
  ): SelectPlanHandle<Grouping<TKey, TRecord>, TParams> {
    const nextState = appendGroupBy(
      this.state,
      keySelector as unknown as (item: unknown) => unknown,
    );
    return new SelectPlanHandle(
      nextState as unknown as SelectPlanState<Grouping<TKey, TRecord>, TParams>,
    );
  }

  // Terminal operations - these return terminal handles that cannot be chained further

  count(predicate?: (item: TRecord) => boolean): SelectTerminalHandle<number, TParams> {
    const nextState = appendCount(this.state, predicate);
    return new SelectTerminalHandle(nextState);
  }

  first(predicate?: (item: TRecord) => boolean): SelectTerminalHandle<TRecord, TParams> {
    const nextState = appendFirst(this.state, predicate);
    return new SelectTerminalHandle(nextState);
  }

  last(predicate?: (item: TRecord) => boolean): SelectTerminalHandle<TRecord, TParams> {
    const nextState = appendLast(this.state, predicate);
    return new SelectTerminalHandle(nextState);
  }

  single(predicate?: (item: TRecord) => boolean): SelectTerminalHandle<TRecord, TParams> {
    const nextState = appendSingle(this.state, predicate);
    return new SelectTerminalHandle(nextState);
  }

  sum(selector?: (item: TRecord) => number): SelectTerminalHandle<number, TParams> {
    if (!selector) {
      throw new Error("sum() requires a selector function");
    }
    const nextState = appendSum(this.state, selector);
    return new SelectTerminalHandle(nextState);
  }

  avg(selector?: (item: TRecord) => number): SelectTerminalHandle<number, TParams> {
    if (!selector) {
      throw new Error("avg() requires a selector function");
    }
    const nextState = appendAverage(this.state, selector);
    return new SelectTerminalHandle(nextState);
  }

  min(): SelectTerminalHandle<TRecord, TParams>;
  min<TResult>(selector: (item: TRecord) => TResult): SelectTerminalHandle<TResult, TParams>;
  min<TResult = TRecord>(
    selector?: (item: TRecord) => TResult,
  ): SelectTerminalHandle<TRecord | TResult, TParams> {
    const nextState = appendMin(this.state, selector as (item: TRecord) => unknown);
    return new SelectTerminalHandle(nextState as SelectPlanState<TRecord | TResult, TParams>);
  }

  max(): SelectTerminalHandle<TRecord, TParams>;
  max<TResult>(selector: (item: TRecord) => TResult): SelectTerminalHandle<TResult, TParams>;
  max<TResult = TRecord>(
    selector?: (item: TRecord) => TResult,
  ): SelectTerminalHandle<TRecord | TResult, TParams> {
    const nextState = appendMax(this.state, selector as (item: TRecord) => unknown);
    return new SelectTerminalHandle(nextState as SelectPlanState<TRecord | TResult, TParams>);
  }

  any(predicate?: (item: TRecord) => boolean): SelectTerminalHandle<boolean, TParams> {
    const nextState = appendAny(this.state, predicate);
    return new SelectTerminalHandle(nextState);
  }

  all(predicate: (item: TRecord) => boolean): SelectTerminalHandle<boolean, TParams> {
    const nextState = appendAll(this.state, predicate);
    return new SelectTerminalHandle(nextState);
  }
}

// -----------------------------------------------------------------------------
// Terminal Handle
// -----------------------------------------------------------------------------

export class SelectTerminalHandle<TResult, TParams> extends TerminalQuery<TResult> {
  constructor(private readonly state: SelectPlanState<TResult, TParams>) {
    super();
  }

  finalize(params: TParams): SelectPlanSql {
    const merged = mergeParams(this.state.autoParams, params);
    const filtered = applyRowFiltersToSelectOperation(
      this.state.operation,
      this.state.rowFilters,
      merged,
      this.state.contextSnapshot.autoParamCounter,
    );
    return {
      operation: filtered.operation,
      params: filtered.params,
      autoParamInfos: this.state.autoParamInfos,
    };
  }

  toPlan(): SelectPlan<TResult, TParams> {
    return this.state;
  }

  execute(_params: TParams): Promise<TResult> {
    return Promise.reject(
      new Error("execute() is not implemented. Use adapter methods (toSql/executeSelect) instead."),
    );
  }

  // Terminal handles block all fluent methods - no further chaining allowed
}

// -----------------------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------------------

import type { OrderedQueryable } from "../linq/queryable.js";

type SelectResult = Queryable<unknown> | OrderedQueryable<unknown> | TerminalQuery<unknown>;

type SelectBuilder<TSchema, TParams, TQuery extends SelectResult> =
  | ((queryBuilder: QueryBuilder<TSchema>, params: TParams, helpers: QueryHelpers) => TQuery)
  | ((queryBuilder: QueryBuilder<TSchema>, params: TParams) => TQuery)
  | ((queryBuilder: QueryBuilder<TSchema>) => TQuery);

export function defineSelect<TSchema, TParams, TQuery extends SelectResult>(
  schema: DatabaseSchema<TSchema>,
  builder: (queryBuilder: QueryBuilder<TSchema>, params: TParams, helpers: QueryHelpers) => TQuery,
  options?: ParseQueryOptions,
): TQuery extends TerminalQuery<infer T>
  ? SelectTerminalHandle<T, TParams>
  : SelectPlanHandle<
      TQuery extends Queryable<infer T> ? T : TQuery extends OrderedQueryable<infer T> ? T : never,
      TParams
    >;

export function defineSelect<TSchema, TParams, TQuery extends SelectResult>(
  schema: DatabaseSchema<TSchema>,
  builder: (queryBuilder: QueryBuilder<TSchema>, params: TParams) => TQuery,
  options?: ParseQueryOptions,
): TQuery extends TerminalQuery<infer T>
  ? SelectTerminalHandle<T, TParams>
  : SelectPlanHandle<
      TQuery extends Queryable<infer T> ? T : TQuery extends OrderedQueryable<infer T> ? T : never,
      TParams
    >;

export function defineSelect<TSchema, TQuery extends SelectResult>(
  schema: DatabaseSchema<TSchema>,
  builder: (queryBuilder: QueryBuilder<TSchema>) => TQuery,
  options?: ParseQueryOptions,
): TQuery extends TerminalQuery<infer T>
  ? SelectTerminalHandle<T, Record<string, never>>
  : SelectPlanHandle<
      TQuery extends Queryable<infer T> ? T : TQuery extends OrderedQueryable<infer T> ? T : never,
      Record<string, never>
    >;

export function defineSelect<
  TSchema,
  TParams = Record<string, never>,
  TQuery extends SelectResult = SelectResult,
>(
  schema: DatabaseSchema<TSchema>,
  builder: SelectBuilder<TSchema, TParams, TQuery>,
  options?: ParseQueryOptions,
): SelectPlanHandle<unknown, TParams> | SelectTerminalHandle<unknown, TParams> {
  const parseResult = parseQuery(builder, options);
  if (!parseResult) {
    throw new Error("Failed to parse query");
  }

  const rowFilters = schema.__tinqerRowFilters();
  const initialState = createInitialState<unknown, TParams>(parseResult, options, rowFilters);

  // Check if this is a terminal operation
  const isTerminal = [
    "count",
    "longCount",
    "first",
    "firstOrDefault",
    "single",
    "singleOrDefault",
    "last",
    "lastOrDefault",
    "min",
    "max",
    "sum",
    "average",
    "any",
    "all",
  ].includes(parseResult.operation.operationType);

  if (isTerminal) {
    return new SelectTerminalHandle(initialState);
  }

  return new SelectPlanHandle(initialState);
}

// Keep compatibility with legacy helpers used by adapters.
export function defineSelectPlan<TSchema, TParams, TQuery extends SelectResult>(
  schema: DatabaseSchema<TSchema>,
  builder: SelectBuilder<TSchema, TParams, TQuery>,
  options?: ParseQueryOptions,
): SelectPlan<unknown, TParams> {
  return defineSelect<TSchema, TParams, TQuery>(schema, builder, options).toPlan();
}

// -----------------------------------------------------------------------------
// Helper functions for individual operations
// -----------------------------------------------------------------------------

function appendWhere<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  predicate: (...args: unknown[]) => boolean,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(predicate as (...args: unknown[]) => unknown, "where");
  const call = createMethodCall("where", lambda);
  const result = visitWhereOperation(call, state.operation, visitorContext);

  if (!result) {
    throw new Error("Failed to append where clause to select plan");
  }

  visitorContext.autoParams = mergeAutoParams(visitorContext.autoParams, result.autoParams);

  return createState(state, result.operation, visitorContext);
}

function appendSelect<TRecord, TParams, TResult>(
  state: SelectPlanState<TRecord, TParams>,
  selector: (item: TRecord) => TResult,
): SelectPlanState<TResult, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, "select");
  const call = createMethodCall("select", lambda);
  const result = visitSelectOperation(call, state.operation, visitorContext);

  if (!result) {
    throw new Error("Failed to append select clause to plan");
  }

  return createState(
    state as unknown as SelectPlanState<TResult, TParams>,
    result.operation,
    visitorContext,
  );
}

function appendOrderBy<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  selector: (item: TRecord) => unknown,
  method: "orderBy" | "orderByDescending",
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, method);
  const call = createMethodCall(method, lambda);
  const result = visitOrderByOperation(call, state.operation, method, visitorContext);

  if (!result) {
    throw new Error(`Failed to append ${method} clause to plan`);
  }

  return createState(state, result.operation, visitorContext);
}

function appendThenBy<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  selector: (item: TRecord) => unknown,
  method: "thenBy" | "thenByDescending",
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, method);
  const call = createMethodCall(method, lambda);
  const result = visitThenByOperation(call, state.operation, method, visitorContext);

  if (!result) {
    throw new Error(`Failed to append ${method} clause to plan`);
  }

  return createState(state, result.operation, visitorContext);
}

function appendTake<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  count: number,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const literal = createNumericLiteral(count);
  const call = createMethodCall("take", literal);
  const result = visitTakeOperation(call, state.operation, "take", visitorContext);

  if (!result) {
    throw new Error("Failed to append take clause to plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendSkip<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  count: number,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const literal = createNumericLiteral(count);
  const call = createMethodCall("skip", literal);
  const result = visitSkipOperation(call, state.operation, "skip", visitorContext);

  if (!result) {
    throw new Error("Failed to append skip clause to plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendDistinct<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const call = createMethodCall("distinct");
  const result = visitDistinctOperation(call, state.operation, "distinct", visitorContext);

  if (!result) {
    throw new Error("Failed to append distinct clause to plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendReverse<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const call = createMethodCall("reverse");
  const result = visitReverseOperation(call, state.operation, "reverse", visitorContext);

  if (!result) {
    throw new Error("Failed to append reverse clause to plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendGroupBy<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  keySelector: (item: unknown) => unknown,
): SelectPlanState<unknown, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(keySelector, "groupBy");
  const call = createMethodCall("groupBy", lambda);
  const result = visitGroupByOperation(call, state.operation, "groupBy", visitorContext);

  if (!result) {
    throw new Error("Failed to append groupBy to plan");
  }

  visitorContext.autoParams = mergeAutoParams(visitorContext.autoParams, result.autoParams);

  return createState(
    state as unknown as SelectPlanState<unknown, TParams>,
    result.operation,
    visitorContext,
  );
}

// -----------------------------------------------------------------------------
// AST helpers
// -----------------------------------------------------------------------------

function parseLambdaExpression(
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

// -----------------------------------------------------------------------------
// Terminal operation append functions
// -----------------------------------------------------------------------------

function appendCount<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  predicate?: (item: TRecord) => boolean,
): SelectPlanState<number, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  let call: CallExpression;

  if (predicate) {
    const lambda = parseLambdaExpression(predicate as (...args: unknown[]) => unknown, "count");
    call = createMethodCall("count", lambda);
  } else {
    call = createMethodCall("count");
  }

  const result = visitCountOperation(call, state.operation, "count", visitorContext);

  if (!result) {
    throw new Error("Failed to append count operation to plan");
  }

  return createState(
    state as unknown as SelectPlanState<number, TParams>,
    result.operation,
    visitorContext,
  );
}

function appendFirst<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  predicate?: (item: TRecord) => boolean,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  let call: CallExpression;

  if (predicate) {
    const lambda = parseLambdaExpression(predicate as (...args: unknown[]) => unknown, "first");
    call = createMethodCall("first", lambda);
  } else {
    call = createMethodCall("first");
  }

  const result = visitFirstOperation(call, state.operation, "first", visitorContext);

  if (!result) {
    throw new Error("Failed to append first operation to plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendLast<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  predicate?: (item: TRecord) => boolean,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  let call: CallExpression;

  if (predicate) {
    const lambda = parseLambdaExpression(predicate as (...args: unknown[]) => unknown, "last");
    call = createMethodCall("last", lambda);
  } else {
    call = createMethodCall("last");
  }

  const result = visitLastOperation(call, state.operation, "last", visitorContext);

  if (!result) {
    throw new Error("Failed to append last operation to plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendSingle<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  predicate?: (item: TRecord) => boolean,
): SelectPlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  let call: CallExpression;

  if (predicate) {
    const lambda = parseLambdaExpression(predicate as (...args: unknown[]) => unknown, "single");
    call = createMethodCall("single", lambda);
  } else {
    call = createMethodCall("single");
  }

  const result = visitSingleOperation(call, state.operation, "single", visitorContext);

  if (!result) {
    throw new Error("Failed to append single operation to plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendSum<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  selector: (item: TRecord) => number,
): SelectPlanState<number, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, "sum");
  const call = createMethodCall("sum", lambda);

  const result = visitSumOperation(call, state.operation, "sum", visitorContext);

  if (!result) {
    throw new Error("Failed to append sum operation to plan");
  }

  return createState(
    state as unknown as SelectPlanState<number, TParams>,
    result.operation,
    visitorContext,
  );
}

function appendAverage<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  selector: (item: TRecord) => number,
): SelectPlanState<number, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, "average");
  const call = createMethodCall("average", lambda);

  const result = visitAverageOperation(call, state.operation, "average", visitorContext);

  if (!result) {
    throw new Error("Failed to append average operation to plan");
  }

  return createState(
    state as unknown as SelectPlanState<number, TParams>,
    result.operation,
    visitorContext,
  );
}

function appendMin<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  selector?: (item: TRecord) => unknown,
): SelectPlanState<unknown, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  let call: CallExpression;

  if (selector) {
    const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, "min");
    call = createMethodCall("min", lambda);
  } else {
    call = createMethodCall("min");
  }

  const result = visitMinOperation(call, state.operation, "min", visitorContext);

  if (!result) {
    throw new Error("Failed to append min operation to plan");
  }

  return createState(state as SelectPlanState<unknown, TParams>, result.operation, visitorContext);
}

function appendMax<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  selector?: (item: TRecord) => unknown,
): SelectPlanState<unknown, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  let call: CallExpression;

  if (selector) {
    const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, "max");
    call = createMethodCall("max", lambda);
  } else {
    call = createMethodCall("max");
  }

  const result = visitMaxOperation(call, state.operation, "max", visitorContext);

  if (!result) {
    throw new Error("Failed to append max operation to plan");
  }

  return createState(state as SelectPlanState<unknown, TParams>, result.operation, visitorContext);
}

function appendAny<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  predicate?: (item: TRecord) => boolean,
): SelectPlanState<boolean, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  let call: CallExpression;

  if (predicate) {
    const lambda = parseLambdaExpression(predicate as (...args: unknown[]) => unknown, "any");
    call = createMethodCall("any", lambda);
  } else {
    call = createMethodCall("any");
  }

  const result = visitAnyOperation(call, state.operation, "any", visitorContext);

  if (!result) {
    throw new Error("Failed to append any operation to plan");
  }

  return createState(
    state as unknown as SelectPlanState<boolean, TParams>,
    result.operation,
    visitorContext,
  );
}

function appendAll<TRecord, TParams>(
  state: SelectPlanState<TRecord, TParams>,
  predicate: (item: TRecord) => boolean,
): SelectPlanState<boolean, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(predicate as (...args: unknown[]) => unknown, "all");
  const call = createMethodCall("all", lambda);

  const result = visitAllOperation(call, state.operation, "all", visitorContext);

  if (!result) {
    throw new Error("Failed to append all operation to plan");
  }

  return createState(
    state as unknown as SelectPlanState<boolean, TParams>,
    result.operation,
    visitorContext,
  );
}

function createMethodCall(methodName: string, argument?: ASTExpression): CallExpression {
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
  } as CallExpression;
}

function createNumericLiteral(value: number): NumericLiteral {
  return {
    type: "NumericLiteral",
    value,
  } as NumericLiteral;
}

function mergeAutoParams(
  existing: Map<string, unknown>,
  additions: Record<string, unknown>,
): Map<string, unknown> {
  const result = new Map(existing);
  for (const [key, value] of Object.entries(additions)) {
    result.set(key, value);
  }
  return result;
}

function mergeParams<TParams>(
  autoParams: Record<string, unknown>,
  params: TParams,
): Record<string, unknown> {
  return {
    ...autoParams,
    ...(params as Record<string, unknown>),
  };
}

function cloneOperationTree(operation: QueryOperation): QueryOperation {
  // Deep clone that preserves Maps and other complex structures
  function deepClone(obj: unknown): unknown {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    // Handle Map instances
    if (obj instanceof Map) {
      const clonedMap = new Map();
      for (const [key, value] of obj) {
        clonedMap.set(key, deepClone(value));
      }
      return clonedMap;
    }

    // Handle Array instances
    if (Array.isArray(obj)) {
      return obj.map((item) => deepClone(item));
    }

    // Handle regular objects
    const clonedObj: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone((obj as Record<string, unknown>)[key]);
      }
    }
    return clonedObj;
  }

  return deepClone(operation) as QueryOperation;
}
