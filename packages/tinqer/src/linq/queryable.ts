/**
 * Queryable and OrderedQueryable classes for compile-time type safety
 * ONLY BASIC SQL OPERATIONS + single, last, contains, union, reverse
 */

import type { Grouping } from "./grouping.js";
import { TerminalQuery } from "./terminal-query.js";

/**
 * Queryable provides a fluent API for building queries with type safety.
 * This class is never actually executed - it's parsed from its string representation.
 */
export class Queryable<T> {
  constructor() {
    // Never actually instantiated in practice
  }

  // ==================== Filtering ====================

  where(_predicate: (_item: T) => boolean): Queryable<T> {
    return this;
  }

  // ==================== Projection ====================

  select<TResult>(_selector: (_item: T) => TResult): Queryable<TResult> {
    return new Queryable<TResult>();
  }

  // ==================== Joining ====================

  join<TInner, TKey, TResult>(
    _inner: Queryable<TInner>,
    _outerKeySelector: (_outer: T) => TKey,
    _innerKeySelector: (_inner: TInner) => TKey,
    _resultSelector: (_outer: T, _inner: TInner) => TResult,
  ): Queryable<TResult> {
    return new Queryable<TResult>();
  }

  groupJoin<TInner, TKey, TResult>(
    _inner: Queryable<TInner>,
    _outerKeySelector: (_outer: T) => TKey,
    _innerKeySelector: (_inner: TInner) => TKey,
    _resultSelector: (_outer: T, _innerGroup: Grouping<TKey, TInner>) => TResult,
  ): Queryable<TResult> {
    return new Queryable<TResult>();
  }

  selectMany<TCollection>(
    _collectionSelector: (_item: T) => Queryable<TCollection> | Iterable<TCollection>,
  ): Queryable<TCollection>;

  selectMany<TCollection, TResult>(
    _collectionSelector: (_item: T) => Queryable<TCollection> | Iterable<TCollection>,
    _resultSelector: (_item: T, _collectionItem: TCollection) => TResult,
  ): Queryable<TResult>;

  selectMany<TCollection, TResult = TCollection>(
    _collectionSelector: (_item: T) => Queryable<TCollection> | Iterable<TCollection>,
    _resultSelector?: (_item: T, _collectionItem: TCollection) => TResult,
  ): Queryable<TResult> {
    return new Queryable<TResult>();
  }

  // ==================== Grouping ====================

  groupBy<TKey>(_keySelector: (_item: T) => TKey): Queryable<Grouping<TKey, T>> {
    return new Queryable<Grouping<TKey, T>>();
  }

  // ==================== Ordering ====================

  orderBy<TKey>(_keySelector: (_item: T) => TKey): OrderedQueryable<T> {
    return new OrderedQueryable<T>();
  }

  orderByDescending<TKey>(_keySelector: (_item: T) => TKey): OrderedQueryable<T> {
    return new OrderedQueryable<T>();
  }

  // ==================== Partitioning ====================

  take(_count: number): Queryable<T> {
    return this;
  }

  skip(_count: number): Queryable<T> {
    return this;
  }

  // ==================== Set Operations ====================

  distinct(): Queryable<T> {
    return this;
  }

  union(_second: Queryable<T>): Queryable<T> {
    return this;
  }

  concat(_second: Queryable<T>): Queryable<T> {
    return this;
  }

  intersect(_second: Queryable<T>): Queryable<T> {
    return this;
  }

  except(_second: Queryable<T>): Queryable<T> {
    return this;
  }

  reverse(): Queryable<T> {
    return this;
  }

  defaultIfEmpty(_defaultValue?: T): Queryable<T> {
    return new Queryable<T>();
  }

  // ==================== Terminal Operations ====================

  first(_predicate?: (_item: T) => boolean): TerminalQuery<T> {
    return new TerminalQuery<T>();
  }

  firstOrDefault(_predicate?: (_item: T) => boolean): TerminalQuery<T | null> {
    return new TerminalQuery<T | null>();
  }

  single(_predicate?: (_item: T) => boolean): TerminalQuery<T> {
    return new TerminalQuery<T>();
  }

  singleOrDefault(_predicate?: (_item: T) => boolean): TerminalQuery<T | null> {
    return new TerminalQuery<T | null>();
  }

  last(_predicate?: (_item: T) => boolean): TerminalQuery<T> {
    return new TerminalQuery<T>();
  }

  lastOrDefault(_predicate?: (_item: T) => boolean): TerminalQuery<T | null> {
    return new TerminalQuery<T | null>();
  }

  contains(_value: T): TerminalQuery<boolean> {
    return new TerminalQuery<boolean>();
  }

  // ==================== Aggregates ====================

  sum(_selector?: (_item: T) => number): TerminalQuery<number> {
    return new TerminalQuery<number>();
  }

  average(_selector?: (_item: T) => number): TerminalQuery<number> {
    return new TerminalQuery<number>();
  }

  min(): TerminalQuery<T>;
  min<TResult>(_selector: (_item: T) => TResult): TerminalQuery<TResult>;
  min<TResult>(_selector?: (_item: T) => TResult): TerminalQuery<T | TResult> {
    return new TerminalQuery<T | TResult>();
  }

  max(): TerminalQuery<T>;
  max<TResult>(_selector: (_item: T) => TResult): TerminalQuery<TResult>;
  max<TResult>(_selector?: (_item: T) => TResult): TerminalQuery<T | TResult> {
    return new TerminalQuery<T | TResult>();
  }

  // ==================== Boolean Tests ====================

  any(_predicate?: (_item: T) => boolean): TerminalQuery<boolean> {
    return new TerminalQuery<boolean>();
  }

  all(_predicate: (_item: T) => boolean): TerminalQuery<boolean> {
    return new TerminalQuery<boolean>();
  }

  // ==================== Counting ====================

  count(_predicate?: (_item: T) => boolean): TerminalQuery<number> {
    return new TerminalQuery<number>();
  }
}

/**
 * OrderedQueryable extends Queryable with thenBy operations
 * Matches .NET's IOrderedQueryable<T> : IQueryable<T> inheritance
 */
export class OrderedQueryable<T> extends Queryable<T> {
  constructor() {
    super();
  }

  // Override methods that need to return OrderedQueryable instead of Queryable
  override where(_predicate: (_item: T) => boolean): OrderedQueryable<T> {
    return this;
  }

  override distinct(): OrderedQueryable<T> {
    return this;
  }

  override take(_count: number): OrderedQueryable<T> {
    return this;
  }

  override skip(_count: number): OrderedQueryable<T> {
    return this;
  }

  // Secondary ordering methods (unique to OrderedQueryable)
  thenBy<TKey>(_keySelector: (_item: T) => TKey): OrderedQueryable<T> {
    return this;
  }

  thenByDescending<TKey>(_keySelector: (_item: T) => TKey): OrderedQueryable<T> {
    return this;
  }
}
