/**
 * Insertable class for INSERT operations with type safety
 */

/**
 * Insertable provides type-safe INSERT query building
 */
export class Insertable<T> {
  constructor() {
    // Never actually instantiated - used only for type inference
  }

  /**
   * Specifies the values to insert
   * @param valuesSelector Object mapping columns to values
   * @returns Insertable for further chaining
   */
  values(_valuesSelector: Partial<T>): Insertable<T> {
    return this;
  }

  /**
   * Adds an ON CONFLICT clause for upserts (PostgreSQL + SQLite)
   * Column targets are expressed as typed selectors (no string column names).
   */
  onConflict(
    _target: (_item: T) => unknown,
    ..._additionalTargets: Array<(_item: T) => unknown>
  ): InsertableOnConflict<T> {
    return new InsertableOnConflict<T>();
  }

  /**
   * Specifies columns to return after insert (PostgreSQL only)
   * @param selector Function that returns the columns to return
   * @returns InsertableWithReturning for type inference
   */
  returning<TResult>(_selector: (_item: T) => TResult): InsertableWithReturning<T, TResult> {
    return new InsertableWithReturning<T, TResult>();
  }
}

/**
 * InsertableWithReturning represents an INSERT with RETURNING clause
 */
export class InsertableWithReturning<TTable, TResult> {
  constructor() {
    // Never actually instantiated - used only for type inference
    // Type parameters TTable and TResult are preserved for external type inference
  }

  // Force TypeScript to keep the type parameters
  _table?: (_: TTable) => void;
  _result?: (_: TResult) => void;
}

/**
 * InsertableOnConflict represents an INSERT with an ON CONFLICT target
 */
export class InsertableOnConflict<TTable> {
  constructor() {
    // Never actually instantiated - used only for type inference
  }

  /**
   * ON CONFLICT ... DO NOTHING
   */
  doNothing(): Insertable<TTable> {
    return new Insertable<TTable>();
  }

  /**
   * ON CONFLICT ... DO UPDATE SET ...
   */
  doUpdateSet(_valuesSelector: Partial<TTable>): Insertable<TTable>;
  doUpdateSet(
    _valuesSelector: (_existing: TTable, _excluded: TTable) => Partial<TTable>,
  ): Insertable<TTable>;
  doUpdateSet(_valuesSelector: unknown): Insertable<TTable> {
    return new Insertable<TTable>();
  }
}
