import type { DatabaseSchema, RowFilterState } from "../linq/database-context.js";
import type { QueryBuilder } from "../linq/query-builder.js";
import type { QueryHelpers } from "../linq/functions.js";
import type { Deletable, DeletableComplete } from "../linq/deletable.js";
import type { ParseQueryOptions } from "../parser/types.js";
import type { QueryOperation, DeleteOperation } from "../query-tree/operations.js";
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
import { visitWhereDeleteOperation } from "../visitors/delete/where-delete.js";
import { visitAllowFullDeleteOperation } from "../visitors/delete/allow-full-delete.js";
import { applyRowFiltersToDeleteOperation } from "../policies/row-filters.js";

// -----------------------------------------------------------------------------
// Plan data
// -----------------------------------------------------------------------------

export interface DeletePlan<TRecord, TParams> {
  readonly kind: "delete";
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

type DeletePlanState<TRecord, TParams> = DeletePlan<TRecord, TParams>;

function createInitialState<TRecord, TParams>(
  parseResult: ParseResult,
  options?: ParseQueryOptions,
  rowFilters?: RowFilterState,
): DeletePlanState<TRecord, TParams> {
  const operationClone = cloneOperationTree(parseResult.operation);
  return {
    kind: "delete",
    operation: operationClone,
    autoParams: { ...parseResult.autoParams },
    autoParamInfos: parseResult.autoParamInfos ? { ...parseResult.autoParamInfos } : undefined,
    contextSnapshot: parseResult.contextSnapshot,
    parseOptions: options,
    rowFilters,
  };
}

function createState<TRecord, TParams>(
  base: DeletePlanState<unknown, TParams>,
  nextOperation: QueryOperation,
  visitorContext: VisitorContext,
): DeletePlanState<TRecord, TParams> {
  const nextSnapshot = snapshotVisitorContext(visitorContext);
  const autoParamEntries = Array.from(visitorContext.autoParams.entries());
  const autoParams = Object.fromEntries(autoParamEntries);
  const autoParamInfos = visitorContext.autoParamInfos
    ? Object.fromEntries(visitorContext.autoParamInfos.entries())
    : base.autoParamInfos;

  const normalizedOperation = wrapWindowFilters(normalizeJoins(cloneOperationTree(nextOperation)));

  return {
    kind: "delete",
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

export interface DeletePlanSql {
  operation: QueryOperation;
  params: Record<string, unknown>;
  autoParamInfos?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Plan handle stages
// -----------------------------------------------------------------------------

// Initial stage - only table is specified
export class DeletePlanHandleInitial<TRecord, TParams> {
  constructor(private readonly state: DeletePlanState<TRecord, TParams>) {}

  // Overload for simple predicate without external params
  where(predicate: (item: TRecord) => boolean): DeletePlanHandleComplete<TRecord, TParams>;
  // Overload for predicate with external params
  where<ExtraParams extends object = Record<string, never>>(
    predicate: (item: TRecord, params: TParams & ExtraParams) => boolean,
  ): DeletePlanHandleComplete<TRecord, TParams & ExtraParams>;
  // Implementation
  where<ExtraParams extends object = Record<string, never>>(
    predicate:
      | ((item: TRecord) => boolean)
      | ((item: TRecord, params: TParams & ExtraParams) => boolean),
  ): DeletePlanHandleComplete<TRecord, TParams & ExtraParams> {
    const nextState = appendWhereDelete(
      this.state,
      predicate as unknown as (...args: unknown[]) => boolean,
    );
    return new DeletePlanHandleComplete(
      nextState as DeletePlanState<TRecord, TParams & ExtraParams>,
    );
  }

  allowFullTableDelete(): DeletePlanHandleComplete<TRecord, TParams> {
    const nextState = appendAllowFullDelete(this.state);
    return new DeletePlanHandleComplete(nextState);
  }

  finalize(params: TParams): DeletePlanSql {
    const merged = mergeParams(this.state.autoParams, params);
    const filtered = applyRowFiltersToDeleteOperation(
      this.state.operation as DeleteOperation,
      this.state.rowFilters,
      merged,
      this.state.contextSnapshot.autoParamCounter,
    );

    const deleteOp = filtered.operation;
    if (!deleteOp.predicate && !deleteOp.allowFullTableDelete) {
      throw new Error("DELETE requires a WHERE clause or explicit allowFullTableDelete");
    }

    return {
      operation: filtered.operation,
      params: filtered.params,
      autoParamInfos: this.state.autoParamInfos,
    };
  }

  toPlan(): DeletePlan<TRecord, TParams> {
    return this.state;
  }
}

// After where() or allowFullTableDelete() is called
export class DeletePlanHandleComplete<TRecord, TParams> {
  constructor(private readonly state: DeletePlanState<TRecord, TParams>) {}

  finalize(params: TParams): DeletePlanSql {
    const merged = mergeParams(this.state.autoParams, params);
    const filtered = applyRowFiltersToDeleteOperation(
      this.state.operation as DeleteOperation,
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

  toPlan(): DeletePlan<TRecord, TParams> {
    return this.state;
  }

  execute(_params: TParams): Promise<void> {
    return Promise.reject(
      new Error("execute() is not implemented. Use adapter methods (toSql/executeDelete) instead."),
    );
  }
}

// -----------------------------------------------------------------------------
// Public entry points
// -----------------------------------------------------------------------------

// Single builder overload
export function defineDelete<
  TSchema,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} is correct for extensible empty object
  TParams = {},
  TQuery = unknown,
>(
  schema: DatabaseSchema<TSchema>,
  builder: (queryBuilder: QueryBuilder<TSchema>, params: TParams, helpers?: QueryHelpers) => TQuery,
  options?: ParseQueryOptions,
): TQuery extends DeletableComplete<infer TTable>
  ? DeletePlanHandleComplete<TTable, TParams>
  : TQuery extends Deletable<infer TTable>
    ? DeletePlanHandleInitial<TTable, TParams>
    : never;

// Overload for direct table name - DISABLED FOR NOW
// export function defineDelete<
//   TSchema,
//   // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} is correct for extensible empty object
//   TParams = {},
//   TTable extends keyof TSchema = keyof TSchema,
// >(
//   schema: DatabaseSchema<TSchema>,
//   table: TTable,
//   options?: ParseQueryOptions,
// ): DeletePlanHandleInitial<TSchema[TTable], TParams>;

// Implementation
export function defineDelete(
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
  if (!parseResult || parseResult.operation.operationType !== "delete") {
    throw new Error("Failed to parse delete builder or not a delete operation");
  }

  const rowFilters = schema.__tinqerRowFilters();
  const initialState = createInitialState<unknown, unknown>(parseResult, options, rowFilters);

  // Check the state of the parsed operation to return the appropriate handle
  const deleteOp = parseResult.operation as DeleteOperation;

  // Check if WHERE clause or allowFullTableDelete is present
  if (deleteOp.predicate || deleteOp.allowFullTableDelete) {
    return new DeletePlanHandleComplete(initialState);
  }

  return new DeletePlanHandleInitial(initialState);
}

// -----------------------------------------------------------------------------
// Helper functions for individual operations
// -----------------------------------------------------------------------------

function appendWhereDelete<TRecord, TParams>(
  state: DeletePlanState<TRecord, TParams>,
  predicate: (...args: unknown[]) => boolean,
): DeletePlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const lambda = parseLambdaExpression(predicate, "where");
  const call = createMethodCall("where", lambda);
  const result = visitWhereDeleteOperation(
    call,
    state.operation as DeleteOperation,
    visitorContext,
  );

  if (!result) {
    throw new Error("Failed to append where clause to delete plan");
  }

  visitorContext.autoParams = mergeAutoParams(visitorContext.autoParams, result.autoParams);

  return createState(state, result.operation, visitorContext);
}

function appendAllowFullDelete<TRecord, TParams>(
  state: DeletePlanState<TRecord, TParams>,
): DeletePlanState<TRecord, TParams> {
  const visitorContext = restoreVisitorContext(state.contextSnapshot);
  const call = createMethodCall("allowFullTableDelete");
  const result = visitAllowFullDeleteOperation(call, state.operation as DeleteOperation);

  if (!result) {
    throw new Error("Failed to append allowFullTableDelete to delete plan");
  }

  return createState(state, result.operation, visitorContext);
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
