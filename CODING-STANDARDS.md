# Coding Standards

This document outlines the coding standards and patterns used throughout the Tinqer codebase.

## TypeScript Configuration

### Strict Mode Required

All TypeScript code must compile with `strict: true`. No exceptions.

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### No Any Types

The `any` type is forbidden. Use proper types or `unknown` when type is genuinely unknown.

```typescript
// ✅ Good
function processData(data: unknown): void {
  if (typeof data === "string") {
    // data is string here
  }
}

// ❌ Bad
function processData(data: any): void {
  // No type safety
}
```

## Module System

### ESM Modules Only

All code uses ES modules with `.js` extensions in imports.

```typescript
// ✅ Good
import type { Expression } from "./expressions/expression.js";
import { parseQuery } from "./parser/parse-query.js";

// ❌ Bad
import type { Expression } from "./expressions/expression"; // Missing .js
const parser = require("./parser/parse-query"); // CommonJS
```

### No Dynamic Imports

Static imports only. No `await import()` or `import()` in code.

```typescript
// ✅ Good
import { parseQuery } from "./parser/parse-query.js";

// ❌ Bad
const parser = await import("./parser/parse-query.js");
```

## Design Patterns

### Functions Over Classes

Export functions from modules. Use classes only for stateful connections or complex state management.

```typescript
// ✅ Good - Pure functions
export function where<T>(operation: QueryOperationNode, predicate: Expression): WhereOperation {
  return {
    type: "queryOperation",
    operationType: "where",
    source: operation,
    predicate,
  };
}

// ✅ Good - Class for stateful API
export class Queryable<T> {
  constructor(public readonly operation: QueryOperationNode) {}

  where(predicate: (item: T) => boolean): Queryable<T> {
    // Maintains operation chain state
  }
}

// ❌ Bad - Unnecessary class
export class QueryHelper {
  static where(operation: QueryOperationNode): WhereOperation {
    // Should be a function
  }
}
```

### Discriminated Unions

Use discriminated unions for expression types.

```typescript
// ✅ Good
export type Expression =
  | ConstantExpression
  | ParameterExpression
  | MemberExpression
  | BinaryExpression
  | LogicalExpression
  | CallExpression
  | LambdaExpression;

export interface ConstantExpression {
  type: "constant";
  value: unknown;
}

export interface ParameterExpression {
  type: "parameter";
  name: string;
  origin: ParameterOrigin;
}
```

### Use `type` for unions, `interface` for structures

Use `type` for unions and type-level composition, and `interface` for structured data shapes (especially exported node types).

```typescript
// ✅ Good - type for unions
export type Expression = BooleanExpression | ValueExpression | ObjectExpression | ArrayExpression;

// ✅ Good - interface for structured nodes
export interface QueryOperation {
  type: "queryOperation";
  operationType: string;
}
```

## Expression Trees

### Generic Expression Handling

Always implement generic cases first. Simple cases should be special cases of generic structures.

```typescript
// ✅ Good - Generic expression for all conditions
export interface JoinOperation {
  type: "queryOperation";
  operationType: "join";
  source: QueryOperationNode;
  inner: QueryOperationNode;
  on: Expression; // Generic - handles any condition
}

// ❌ Bad - Special case handling
export interface JoinOperation {
  leftColumn: string;
  rightColumn: string;
  // Can't handle complex join conditions
}
```

### Parameter Origin Tracking

Every parameter must track its origin.

```typescript
export type ParameterOrigin =
  | { type: "table"; ref: string }
  | { type: "external" }
  | { type: "joined" }
  | { type: "cte" }
  | { type: "subquery" };

export interface ParameterExpression {
  type: "parameter";
  name: string;
  origin: ParameterOrigin;
}
```

## Error Handling

### Parser Failures vs User Errors

Prefer returning `null` (or a similar "no result" signal) for parse failures, and throw clear errors for invalid DSL usage (unsupported expressions, invalid query shapes, etc.).

```typescript
// ✅ Good - parseQuery returns null on parse failure
export function parseQuery(/* ... */): ParseResult | null {
  try {
    // parsing logic
    return result;
  } catch {
    return null;
  }
}
```

## Testing

### Expression Tree Helpers

Tests use helper functions that create the same structures the parser creates.

```typescript
// ✅ Good - Helper creates exact AST structure
const expected = expr.binary(expr.member("age"), ">=", expr.constant(18));

// ❌ Bad - Manual object construction
const expected = {
  type: "binary",
  operator: ">=",
  left: { type: "member", property: "age" },
  right: { type: "constant", value: 18 },
};
```

### Test Organization

- Core tests in `packages/tinqer/tests/`
- Adapter tests in `packages/*-adapter/tests/`
- Integration tests in `packages/*-adapter-integration/tests/`
- Test files named `*.test.ts`
- Helper utilities in `packages/tinqer/tests/test-utils/`

## Code Style

### Comments

Prefer self-documenting code. Use comments sparingly for complex intent or non-obvious constraints.

```typescript
// ✅ Good - Self-documenting
export function extractLambdaBody(lambda: LambdaExpression): Expression {
  return lambda.body;
}

// ❌ Bad - Unnecessary comment
export function extractLambdaBody(lambda: LambdaExpression): Expression {
  // Extract the body from the lambda expression
  return lambda.body;
}
```

### Naming Conventions

- **Files**: kebab-case (`query-operations.ts`)
- **Types/Interfaces**: PascalCase (`QueryOperation`)
- **Functions**: camelCase (`extractLambdaBody`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_QUERY_DEPTH`)
- **Private fields**: underscore prefix (`_phantom`)

### Formatting

Use Prettier with default settings:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 80,
  "tabWidth": 2
}
```

## Security

### Never Use npx

Critical security requirement. Never use `npx` for any commands.

```bash
# ✅ Good - Use local dependencies
./node_modules/.bin/mocha
npm run test

# ❌ Bad - Security risk
npx mocha
npx prettier
```

### Parameter Binding

All SQL values must be parameterized, never concatenated.

```typescript
// ✅ Good - Parameterized
const sql = "SELECT * FROM users WHERE age >= :minAge";
const params = { minAge: 18 };

// ❌ Bad - SQL injection risk
const sql = `SELECT * FROM users WHERE age >= ${minAge}`;
```

## Performance

### Lazy Evaluation

Operations should build expression trees without immediate processing.

```typescript
// ✅ Good - Builds tree, no execution
const query = users.where((u) => u.age >= 18).select((u) => u.name);
// No database hit yet

// Execution happens when passed to executeSelect
const results = await executeSelect(db, () => query, {});
```

### Expression Reuse

Common sub-expressions should be identified and reused when possible.

## Documentation

### API Documentation

Public APIs must have JSDoc comments.

```typescript
/**
 * Filters a sequence of values based on a predicate
 * @param predicate Function to test each element
 * @returns New queryable with filter applied
 */
where(predicate: (item: T) => boolean): Queryable<T>
```

### No Change Tracking

Documentation should present features as designed, not evolved.

```typescript
// ✅ Good
"The where method filters elements based on a predicate";

// ❌ Bad
"The where method now supports lambda expressions";
"Changed from string predicates to lambda functions";
```
