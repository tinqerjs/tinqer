import type { DatabaseSchema, RowFilterState } from "../linq/database-context.js";
import type { QueryBuilder } from "../linq/query-builder.js";
import type { QueryHelpers } from "../linq/functions.js";
import type {
  Updatable,
  UpdatableWithSet,
  UpdatableComplete,
  UpdatableWithReturning,
} from "../linq/updatable.js";
import type { ParseQueryOptions } from "../parser/types.js";
import type { QueryOperation, UpdateOperation } from "../query-tree/operations.js";
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression as ASTExpression,
  Program,
} from "../parser/ast-types.js";
import { parseJavaScript } from "../parser/oxc-parser.js";
import { normalizeJoins } from "../parser/normalize-joins.js";
import { wrapWindowFilters } from "../parser/normalize-window-filters.js";
import type { ParseResult } from "../parser/parse-query.js";
import { parseQuery } from "../parser/parse-query.js";
import {
  restoreVisitorContext,
  snapshotVisitorContext,
  type VisitorContext,
  type VisitorContextSnapshot,
} from "../visitors/types.js";
import { visitWhereUpdateOperation } from "../visitors/update/where-update.js";
import { visitSetOperation } from "../visitors/update/set.js";
import { visitAllowFullUpdateOperation } from "../visitors/update/allow-full-update.js";
import { visitReturningUpdateOperation } from "../visitors/update/returning-update.js";
import { applyRowFiltersToUpdateOperation } from "../policies/row-filters.js";

// -----------------------------------------------------------------------------
// Plan data
// -----------------------------------------------------------------------------

export interface UpdatePlan<TRecord, TParams> {
  readonly kind: "update";
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

type UpdatePlanState<TRecord, TParams> = UpdatePlan<TRecord, TParams>;

function createInitialState<TRecord, TParams>(
  parseResult: ParseResult,
  options?: ParseQueryOptions,
  rowFilters?: RowFilterState,
): UpdatePlanState<TRecord, TParams> {
  const operationClone = cloneOperationTree(parseResult.operation);
  return {
    kind: "update",
    operation: operationClone,
    autoParams: { ...parseResult.autoParams },
    autoParamInfos: parseResult.autoParamInfos ? { ...parseResult.autoParamInfos } : undefined,
    contextSnapshot: parseResult.contextSnapshot,
    parseOptions: options,
    rowFilters,
  };
}

function createState<TRecord, TParams>(
  base: UpdatePlanState<unknown, TParams>,
  nextOperation: QueryOperation,
  visitorContext: VisitorContext,
): UpdatePlanState<TRecord, TParams> {
  const nextSnapshot = snapshotVisitorContext(visitorContext);
  const autoParamEntries = Array.from(visitorContext.autoParams.entries());
  const autoParams = Object.fromEntries(autoParamEntries);
  const autoParamInfos = visitorContext.autoParamInfos
    ? Object.fromEntries(visitorContext.autoParamInfos.entries())
    : base.autoParamInfos;

  const normalizedOperation = wrapWindowFilters(normalizeJoins(cloneOperationTree(nextOperation)));

  return {
    kind: "update",
    operation: normalizedOperation,
    autoParams,
    autoParamInfos,
    contextSnapshot: nextSnapshot,
    parseOptions: base.parseOptions,
    rowFilters: base.rowFilters,
  };
}

// -----------------------------------------------------------------------------
// Plan SQL result
// -----------------------------------------------------------------------------

export interface UpdatePlanSql {
  operation: QueryOperation;
  params: Record<string, unknown>;
  autoParamInfos?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Plan handle stages
// -----------------------------------------------------------------------------

// Initial stage - only table is specified
export class UpdatePlanHandleInitial<TRecord, TParams> {
  constructor(private readonly state: UpdatePlanState<TRecord, TParams>) {}

  set(values: Partial<TRecord>): UpdatePlanHandleWithSet<TRecord, TParams>;
  set(
    valuesSelector: (row: TRecord) => Partial<TRecord>,
  ): UpdatePlanHandleWithSet<TRecord, TParams>;
  set<ExtraParams extends object = Record<string, never>>(
    valuesSelector: (row: TRecord, params: TParams & ExtraParams) => Partial<TRecord>,
  ): UpdatePlanHandleWithSet<TRecord, TParams & ExtraParams>;
  set<ExtraParams extends object = Record<string, never>>(
    values:
      | Partial<TRecord>
      | ((row: TRecord) => Partial<TRecord>)
      | ((row: TRecord, params: TParams & ExtraParams) => Partial<TRecord>),
  ): UpdatePlanHandleWithSet<TRecord, TParams | (TParams & ExtraParams)> {
    const nextState = appendSet(
      this.state,
      values as unknown as
        | Partial<TRecord>
        | ((row: TRecord) => Partial<TRecord>)
        | ((row: TRecord, params: TParams) => Partial<TRecord>),
    );
    return new UpdatePlanHandleWithSet(nextState);
  }

  finalize(_params: TParams): UpdatePlanSql {
    // Initial stage without SET clause - this would be invalid SQL
    throw new Error("UPDATE statement requires set() to be called before generating SQL");
  }

  toPlan(): UpdatePlan<TRecord, TParams> {
    return this.state;
  }
}

// After set() is called
export class UpdatePlanHandleWithSet<TRecord, TParams> {
  constructor(private readonly state: UpdatePlanState<TRecord, TParams>) {}

  // Overload for simple predicate without external params
  where(predicate: (item: TRecord) => boolean): UpdatePlanHandleComplete<TRecord, TParams>;
  // Overload for predicate with external params
  where<ExtraParams extends object = Record<string, never>>(
    predicate: (item: TRecord, params: TParams & ExtraParams) => boolean,
  ): UpdatePlanHandleComplete<TRecord, TParams & ExtraParams>;
  // Implementation
  where<ExtraParams extends object = Record<string, never>>(
    predicate:
      | ((item: TRecord) => boolean)
      | ((item: TRecord, params: TParams & ExtraParams) => boolean),
  ): UpdatePlanHandleComplete<TRecord, TParams | (TParams & ExtraParams)> {
    const nextState = appendWhereUpdate(
      this.state,
      predicate as unknown as (...args: unknown[]) => boolean,
    );
    return new UpdatePlanHandleComplete(
      nextState as UpdatePlanState<TRecord, TParams | (TParams & ExtraParams)>,
    );
  }

  allowFullTableUpdate(): UpdatePlanHandleComplete<TRecord, TParams> {
    const nextState = appendAllowFullUpdate(this.state);
    return new UpdatePlanHandleComplete(nextState);
  }

  returning<TResult>(
    selector: (item: TRecord) => TResult,
  ): UpdatePlanHandleWithReturning<TResult, TParams> {
    const nextState = appendReturning(
      this.state,
      selector as unknown as (item: TRecord) => unknown,
    );
    return new UpdatePlanHandleWithReturning(nextState as UpdatePlanState<TResult, TParams>);
  }

  finalize(params: TParams): UpdatePlanSql {
    const merged = mergeParams(this.state.autoParams, params);
    const filtered = applyRowFiltersToUpdateOperation(
      this.state.operation as UpdateOperation,
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

  toPlan(): UpdatePlan<TRecord, TParams> {
    return this.state;
  }

  execute(_params: TParams): Promise<void> {
    return Promise.reject(
      new Error("execute() is not implemented. Use adapter methods (toSql/executeUpdate) instead."),
    );
  }
}

// After where() or allowFullTableUpdate() is called
export class UpdatePlanHandleComplete<TRecord, TParams> {
  constructor(private readonly state: UpdatePlanState<TRecord, TParams>) {}

  returning<TResult>(
    selector: (item: TRecord) => TResult,
  ): UpdatePlanHandleWithReturning<TResult, TParams> {
    const nextState = appendReturning(
      this.state,
      selector as unknown as (item: TRecord) => unknown,
    );
    return new UpdatePlanHandleWithReturning(nextState as UpdatePlanState<TResult, TParams>);
  }

  finalize(params: TParams): UpdatePlanSql {
    const merged = mergeParams(this.state.autoParams, params);
    const filtered = applyRowFiltersToUpdateOperation(
      this.state.operation as UpdateOperation,
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

  toPlan(): UpdatePlan<TRecord, TParams> {
    return this.state;
  }

  execute(_params: TParams): Promise<void> {
    return Promise.reject(
      new Error("execute() is not implemented. Use adapter methods (toSql/executeUpdate) instead."),
    );
  }
}

// After returning() is called
export class UpdatePlanHandleWithReturning<TResult, TParams> {
  constructor(private readonly state: UpdatePlanState<TResult, TParams>) {}

  finalize(params: TParams): UpdatePlanSql {
    const merged = mergeParams(this.state.autoParams, params);
    const filtered = applyRowFiltersToUpdateOperation(
      this.state.operation as UpdateOperation,
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

  toPlan(): UpdatePlan<TResult, TParams> {
    return this.state;
  }

  execute(_params: TParams): Promise<TResult[]> {
    return Promise.reject(
      new Error("execute() is not implemented. Use adapter methods (toSql/executeUpdate) instead."),
    );
  }
}

// -----------------------------------------------------------------------------
// Public entry points
// -----------------------------------------------------------------------------

// Single builder overload
export function defineUpdate<
  TSchema,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} is correct for extensible empty object
  TParams = {},
  TQuery = unknown,
>(
  schema: DatabaseSchema<TSchema>,
  builder: (queryBuilder: QueryBuilder<TSchema>, params: TParams, helpers?: QueryHelpers) => TQuery,
  options?: ParseQueryOptions,
): TQuery extends UpdatableWithReturning<unknown, infer TReturning>
  ? UpdatePlanHandleWithReturning<TReturning, TParams>
  : TQuery extends UpdatableComplete<infer TTable>
    ? UpdatePlanHandleComplete<TTable, TParams>
    : TQuery extends UpdatableWithSet<infer TTable>
      ? UpdatePlanHandleWithSet<TTable, TParams>
      : TQuery extends Updatable<infer TTable>
        ? UpdatePlanHandleInitial<TTable, TParams>
        : never;

// Overload for direct table name - DISABLED FOR NOW
// export function defineUpdate<TSchema, TParams = {}, TTable extends keyof TSchema = keyof TSchema>(
//   schema: DatabaseSchema<TSchema>,
//   table: TTable,
//   options?: ParseQueryOptions,
// ): UpdatePlanHandleInitial<TSchema[TTable], TParams>;

// Implementation
export function defineUpdate(
  schema: DatabaseSchema<unknown>,
  builder: (
    queryBuilder: QueryBuilder<unknown>,
    params: unknown,
    helpers?: QueryHelpers,
  ) => unknown,
  options?: ParseQueryOptions,
) {
  // Parse the builder function to get the operation
  const parseResult = parseQuery(builder, options);
  if (!parseResult || parseResult.operation.operationType !== "update") {
    throw new Error("Failed to parse update builder or not an update operation");
  }

  const rowFilters = schema.__tinqerRowFilters();
  const initialState = createInitialState<unknown, unknown>(parseResult, options, rowFilters);

  // Check the state of the parsed operation to return the appropriate handle
  const updateOp = parseResult.operation as UpdateOperation;

  // Check if WHERE clause is present
  if (updateOp.predicate || updateOp.allowFullTableUpdate) {
    return new UpdatePlanHandleComplete(initialState);
  }

  // Check if SET clause is present
  if (
    updateOp.assignments &&
    updateOp.assignments.properties &&
    Object.keys(updateOp.assignments.properties).length > 0
  ) {
    return new UpdatePlanHandleWithSet(initialState);
  }

  return new UpdatePlanHandleInitial(initialState);
}

// -----------------------------------------------------------------------------
// Helper functions for individual operations
// -----------------------------------------------------------------------------

function appendSet<TRecord, TParams>(
  state: UpdatePlanState<TRecord, TParams>,
  values:
    | Partial<TRecord>
    | ((row: TRecord) => Partial<TRecord>)
    | ((row: TRecord, params: TParams) => Partial<TRecord>),
): UpdatePlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);

  let setExpression: ASTExpression;

  if (typeof values === "function") {
    setExpression = parseLambdaExpression(
      values as unknown as (...args: unknown[]) => unknown,
      "set",
    );
  } else {
    // Create an object literal AST for direct values
    setExpression = {
      type: "ObjectExpression",
      properties: Object.entries(values as Record<string, unknown>).map(([key, value]) => ({
        type: "Property",
        key: { type: "Identifier", name: key },
        value: { type: "Literal", value },
        kind: "init",
        method: false,
        shorthand: false,
        computed: false,
      })),
    } as ASTExpression;
  }

  const call = createMethodCall("set", setExpression);
  const result = visitSetOperation(call, state.operation as UpdateOperation, visitorContext);

  if (!result) {
    throw new Error("Failed to append set clause to update plan");
  }

  visitorContext.autoParams = mergeAutoParams(visitorContext.autoParams, result.autoParams);

  return createState(state, result.operation, visitorContext);
}

function appendWhereUpdate<TRecord, TParams>(
  state: UpdatePlanState<TRecord, TParams>,
  predicate: (...args: unknown[]) => boolean,
): UpdatePlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(predicate, "where");
  const call = createMethodCall("where", lambda);
  const result = visitWhereUpdateOperation(
    call,
    state.operation as UpdateOperation,
    visitorContext,
  );

  if (!result) {
    throw new Error("Failed to append where clause to update plan");
  }

  visitorContext.autoParams = mergeAutoParams(visitorContext.autoParams, result.autoParams);

  return createState(state, result.operation, visitorContext);
}

function appendAllowFullUpdate<TRecord, TParams>(
  state: UpdatePlanState<TRecord, TParams>,
): UpdatePlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const call = createMethodCall("allowFullTableUpdate");
  const result = visitAllowFullUpdateOperation(call, state.operation as UpdateOperation);

  if (!result) {
    throw new Error("Failed to append allowFullTableUpdate to update plan");
  }

  return createState(state, result.operation, visitorContext);
}

function appendReturning<TRecord, TParams>(
  state: UpdatePlanState<TRecord, TParams>,
  selector: (item: TRecord) => unknown,
): UpdatePlanState<unknown, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(selector as (...args: unknown[]) => unknown, "returning");
  const call = createMethodCall("returning", lambda);
  const result = visitReturningUpdateOperation(
    call,
    state.operation as UpdateOperation,
    visitorContext,
  );

  if (!result) {
    throw new Error("Failed to append returning clause to update plan");
  }

  return createState(
    state as unknown as UpdatePlanState<unknown, TParams>,
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
