/**
 * Type-safe database context for table schemas
 */

import type { QueryHelpers } from "./functions.js";

/**
 * Database context that provides type information for tables
 * @template TSchema The schema type defining all tables and their row types
 */
export class DatabaseSchema<TSchema> {
  // Phantom type to ensure TSchema is used in type checking
  private readonly _phantom?: TSchema;

  constructor() {
    // Context doesn't need runtime data, just provides type information
    // The _phantom field is never assigned, it's only for TypeScript type checking
    void this._phantom; // Mark as intentionally unused
  }

  withRowFilters<TContext extends Record<string, unknown>>(
    filters: RowFilterMap<TSchema, TContext>,
  ): RowFilteredSchema<TSchema, TContext> {
    return new RowFilteredSchema(filters);
  }

  /** @internal */
  __tinqerRowFilters(): RowFilterState | undefined {
    return undefined;
  }
}

/**
 * Creates a typed database context
 * @template TSchema The schema type defining all tables and their row types
 * @returns A new DatabaseSchema instance
 */
export function createSchema<TSchema>(): DatabaseSchema<TSchema> {
  return new DatabaseSchema<TSchema>();
}

export type RowFilterOperation = "select" | "update" | "delete";

export type RowFilterPredicate<TRow, TContext extends Record<string, unknown>> = (
  row: TRow,
  context: TContext,
  helpers: QueryHelpers,
) => boolean;

export type TableRowFilters<TRow, TContext extends Record<string, unknown>> =
  | RowFilterPredicate<TRow, TContext>
  | {
      select: RowFilterPredicate<TRow, TContext> | null;
      update: RowFilterPredicate<TRow, TContext> | null;
      delete: RowFilterPredicate<TRow, TContext> | null;
    }
  | null;

export type RowFilterMap<TSchema, TContext extends Record<string, unknown>> = {
  [K in keyof TSchema]: TableRowFilters<TSchema[K], TContext>;
};

export type RowFilterState = {
  filters: Record<string, TableRowFilters<unknown, Record<string, unknown>>>;
  context?: Record<string, unknown>;
};

export class RowFilteredSchema<
  TSchema,
  TContext extends Record<string, unknown>,
> extends DatabaseSchema<TSchema> {
  constructor(
    private readonly filters: RowFilterMap<TSchema, TContext>,
    private readonly context?: TContext,
  ) {
    super();
  }

  withContext(context: TContext): RowFilteredSchema<TSchema, TContext> {
    return new RowFilteredSchema(this.filters, context);
  }

  /** @internal */
  override __tinqerRowFilters(): RowFilterState | undefined {
    return {
      filters: this.filters as unknown as RowFilterState["filters"],
      context: this.context as unknown as RowFilterState["context"],
    };
  }
}
