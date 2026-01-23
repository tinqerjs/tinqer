/**
 * Updatable class for UPDATE operations with type safety
 */

/**
 * Updatable provides type-safe UPDATE query building
 */
export class Updatable<T> {
  private __hasSet = false;

  constructor() {
    // Never actually instantiated - used only for type inference
  }

  /**
   * Specifies the columns to update and their new values
   * Can only be called once per query
   * @param setSelector Object mapping columns to new values
   * @returns UpdatableWithSet for further chaining
   */
  set(_setSelector: Partial<T>): UpdatableWithSet<T>;
  set(_setSelector: (row: T) => Partial<T>): UpdatableWithSet<T>;
  set(_setSelector: Partial<T> | ((row: T) => Partial<T>)): UpdatableWithSet<T> {
    if (this.__hasSet) {
      throw new Error("set() can only be called once per UPDATE query");
    }
    this.__hasSet = true;
    return new UpdatableWithSet<T>();
  }
}

/**
 * UpdatableWithSet represents an UPDATE with SET clause
 */
export class UpdatableWithSet<T> {
  private __hasWhereOrAllow = false;

  constructor() {
    // Never actually instantiated - used only for type inference
  }

  /**
   * Specifies the WHERE condition for the update
   * @param predicate Function that returns a boolean condition
   * @returns UpdatableComplete for optional chaining
   */
  where(_predicate: (_item: T) => boolean): UpdatableComplete<T> {
    if (this.__hasWhereOrAllow) {
      throw new Error("Cannot call where() after allowFullTableUpdate()");
    }
    this.__hasWhereOrAllow = true;
    return new UpdatableComplete<T>();
  }

  /**
   * Explicitly allows a full table update without WHERE clause
   * DANGEROUS: This will update ALL rows in the table
   * @returns UpdatableComplete for optional chaining
   */
  allowFullTableUpdate(): UpdatableComplete<T> {
    if (this.__hasWhereOrAllow) {
      throw new Error("Cannot call allowFullTableUpdate() after where()");
    }
    this.__hasWhereOrAllow = true;
    return new UpdatableComplete<T>();
  }
}

/**
 * UpdatableComplete represents a complete UPDATE query
 */
export class UpdatableComplete<T> {
  constructor() {
    // Never actually instantiated - used only for type inference
  }

  /**
   * Specifies columns to return after update (PostgreSQL only)
   * @param selector Function that returns the columns to return
   * @returns UpdatableWithReturning for type inference
   */
  returning<TResult>(_selector: (_item: T) => TResult): UpdatableWithReturning<T, TResult> {
    return new UpdatableWithReturning<T, TResult>();
  }
}

/**
 * UpdatableWithReturning represents an UPDATE with RETURNING clause
 */
export class UpdatableWithReturning<TTable, TResult> {
  constructor() {
    // Never actually instantiated - used only for type inference
    // Type parameters TTable and TResult are preserved for external type inference
  }

  // Force TypeScript to keep the type parameters
  _table?: (_: TTable) => void;
  _result?: (_: TResult) => void;
}
