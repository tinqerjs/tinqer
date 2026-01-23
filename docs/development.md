[← Back to README](../README.md)

# Development Guide

Guide for contributing to Tinqer, running tests, and troubleshooting.

## Table of Contents

- [1. Getting Started](#1-getting-started)
  - [1.1 Prerequisites](#11-prerequisites)
  - [1.2 Installation](#12-installation)
  - [1.3 Project Structure](#13-project-structure)
- [2. Building](#2-building)
  - [2.1 Build Commands](#21-build-commands)
  - [2.2 Clean Build](#22-clean-build)
- [3. Testing](#3-testing)
  - [3.1 Running Tests](#31-running-tests)
  - [3.2 Test Organization](#32-test-organization)
  - [3.3 Writing Tests](#33-writing-tests)
- [4. Code Quality](#4-code-quality)
  - [4.1 Linting](#41-linting)
  - [4.2 Formatting](#42-formatting)
- [5. Contributing](#5-contributing)
  - [5.1 Coding Standards](#51-coding-standards)
  - [5.2 Commit Guidelines](#52-commit-guidelines)
  - [5.3 Pull Requests](#53-pull-requests)
- [6. Troubleshooting](#6-troubleshooting)
  - [6.1 Common Issues](#61-common-issues)
  - [6.2 Parser Errors](#62-parser-errors)
  - [6.3 Type Errors](#63-type-errors)

---

## 1. Getting Started

### 1.1 Prerequisites

- Node.js 22+ (required; see `package.json` `engines.node`)
- npm (workspaces; typically bundled with Node)
- Docker + Docker Compose (optional, for PostgreSQL integration tests via `devenv/docker-compose.yml`)

### 1.2 Installation

```bash
# Clone the repository
git clone https://github.com/tinqerjs/tinqer.git
cd tinqer

# Install dependencies
npm install

# Build all packages
./scripts/build.sh
```

### 1.3 Project Structure

```
tinqer/
├── packages/
│   ├── tinqer/                          # Core library
│   │   ├── src/
│   │   │   ├── expressions/             # Expression tree types
│   │   │   ├── linq/                    # Public query DSL (Queryable/TerminalQuery)
│   │   │   ├── parser/                  # Lambda parsing (OXC) + AST visitor
│   │   │   ├── plans/                   # Plan handles (defineSelect/defineUpdate/etc.)
│   │   │   ├── policies/                # Row filters / policy helpers
│   │   │   ├── query-tree/              # Operation node types
│   │   │   └── visitors/                # Operation visitors (AST -> query tree)
│   │   └── tests/                       # Core library tests
│   │
│   ├── pg-promise-adapter/              # PostgreSQL adapter (pg-promise)
│   │   ├── src/
│   │   │   ├── generators/              # SQL clause generators (from/where/select/etc.)
│   │   │   ├── expression-generator.ts  # Expression -> SQL generator
│   │   │   ├── sql-generator.ts         # Operation tree -> SQL orchestrator
│   │   │   └── index.ts                 # Public adapter API (execute*, toSql)
│   │   └── tests/                       # Unit tests (SQL generation + runtime behavior)
│   │
│   ├── better-sqlite3-adapter/          # SQLite adapter (better-sqlite3)
│   │   ├── src/
│   │   │   ├── generators/              # SQL clause generators (from/where/select/etc.)
│   │   │   ├── expression-generator.ts  # Expression -> SQL generator
│   │   │   ├── sql-generator.ts         # Operation tree -> SQL orchestrator
│   │   │   └── index.ts                 # Public adapter API (execute*, toSql)
│   │   └── tests/                       # Unit tests (SQL generation + runtime behavior)
│   │
│   ├── pg-promise-adapter-integration/  # PostgreSQL integration tests (requires a running DB)
│   │   └── tests/
│   └── better-sqlite3-adapter-integration/ # SQLite integration tests
│       └── tests/
│
├── devenv/                              # Local dev environment helpers
│   ├── docker-compose.yml               # PostgreSQL for integration tests
│   └── run.sh                           # Convenience wrapper around docker compose
│
├── scripts/                             # Build and utility scripts
│   ├── build.sh                         # Main build script
│   ├── clean.sh                         # Clean build artifacts
│   ├── lint-all.sh                      # Lint all packages
│   └── format-all.sh                    # Format with Prettier
│
└── docs/                                # Documentation
```

---

## 2. Building

### 2.1 Build Commands

```bash
# Standard build with formatting
./scripts/build.sh

# Build without formatting (faster during development)
./scripts/build.sh --no-format

# Build specific package
cd packages/tinqer
npm run build
```

**Build Process:**

1. Runs TypeScript compiler for each package
2. Generates ES modules with `.js` extensions
3. Runs Prettier formatting (unless `--no-format` is used)
4. Outputs to `dist/` directories

### 2.2 Clean Build

```bash
# Remove build artifacts
./scripts/clean.sh

# Remove build artifacts and node_modules
./scripts/clean.sh --all
```

---

## 3. Testing

### 3.1 Running Tests

```bash
# Run all tests
npm test

# Save full test output (gitignored)
npm test | tee .tests/run-<timestamp>.txt

# Run tests for a specific workspace
npm test --workspace @tinqerjs/tinqer
npm test --workspace @tinqerjs/pg-promise-adapter
npm test --workspace @tinqerjs/better-sqlite3-adapter
npm test --workspace @tinqerjs/better-sqlite3-adapter-integration

# Grep within a specific workspace (Mocha)
npm test --workspace @tinqerjs/tinqer -- --grep "WHERE operations"

# PostgreSQL integration tests (requires a running Postgres)
./devenv/run.sh up
TINQER_PG_INTEGRATION=1 npm test --workspace @tinqerjs/pg-promise-adapter-integration
```

### 3.2 Test Organization

**Core Library Tests** (`packages/tinqer/tests/`):

- Parser tests: Lambda expression parsing
- AST visitor tests: AST to expression tree conversion
- Queryable tests: Query builder API
- Type tests: TypeScript type inference

**Integration Tests**:

- PostgreSQL integration: `pg-promise-adapter-integration/tests/`
- SQLite integration: `better-sqlite3-adapter-integration/tests/`
- Full end-to-end query execution tests
- Database-specific feature tests

### 3.3 Writing Tests

**Unit Test Example:**

```typescript
import { describe, it } from "mocha";
import { strict as assert } from "assert";
import { createSchema, defineSelect } from "@tinqerjs/tinqer";
import { toSql } from "@tinqerjs/pg-promise-adapter";

describe("SQL Generation", () => {
  it("should generate SQL with WHERE clause", () => {
    interface Schema {
      users: { id: number; name: string; age: number };
    }

    const schema = createSchema<Schema>();
    const result = toSql(
      defineSelect(schema, (q) => q.from("users").where((u) => u.age >= 18)),
      {},
    );

    // Assert SQL and parameters
    assert.ok(result.sql.includes("WHERE"));
    assert.ok(result.params);
  });
});
```

**Integration Test Example:**

```typescript
import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import { createSchema } from "@tinqerjs/tinqer";
import { executeSelect } from "@tinqerjs/pg-promise-adapter";
import { db } from "./shared-db.js";

const schema = createSchema<Schema>();

describe("PostgreSQL Integration", () => {
  beforeEach(async () => {
    await db.none("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
    await db.none("INSERT INTO users (name, age) VALUES ('Alice', 30), ('Bob', 25)");
  });

  it("should execute SELECT query", async () => {
    const results = await executeSelect(
      db,
      schema,
      (q, params: { minAge: number }) =>
        q
          .from("users")
          .where((u) => u.age >= params.minAge)
          .select((u) => u.name),
      { minAge: 25 },
    );

    assert.deepEqual(results, ["Alice", "Bob"]);
  });
});
```

**Test Database Setup:**

PostgreSQL integration tests use a shared connection (`packages/pg-promise-adapter-integration/tests/shared-db.ts`):

```typescript
import pgPromise from "pg-promise";

const pgp = pgPromise();
const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/tinqer_test";
export const db = pgp(connectionString);
```

SQLite tests use isolated in-memory databases:

```typescript
import Database from "better-sqlite3";

describe("SQLite Tests", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    // Create schema and seed data
  });

  afterEach(() => {
    db.close();
  });
});
```

---

## 4. Code Quality

### 4.1 Linting

```bash
# Lint all packages
./scripts/lint-all.sh

# Lint with auto-fix
./scripts/lint-all.sh --fix

# Lint specific package
cd packages/tinqer
npm run lint
npm run lint:fix
```

**ESLint Configuration:**

- `@typescript-eslint/no-explicit-any`: error (no `any` types allowed)
- `@typescript-eslint/prefer-const`: error
- Strict type checking enabled

### 4.2 Formatting

```bash
# Format all files with Prettier
./scripts/format-all.sh

# Check formatting without changes
./scripts/format-all.sh --check

# Format specific package
cd packages/tinqer
npm run format
```

**IMPORTANT:** Always run `./scripts/format-all.sh` before committing.

---

## 5. Contributing

### 5.1 Coding Standards

**TypeScript Guidelines:**

- **No `any` types**: All code must be strictly typed
- **Prefer `type` over `interface`**: Use `interface` only for extensible contracts
- **ESM imports**: Always include `.js` extension in imports

  ```typescript
  // Correct
  import { Queryable } from "./linq/queryable.js";

  // Incorrect
  import { Queryable } from "./linq/queryable";
  ```

- **Pure functions**: Prefer stateless functions with explicit dependency injection
- **No dynamic imports**: Always use static imports

**Code Organization:**

- Export functions from modules when possible
- Use classes only for stateful connections or complex state management
- Keep files focused and single-purpose
- Write comprehensive JSDoc comments for public APIs

### 5.2 Commit Guidelines

```bash
# Before committing:
./scripts/format-all.sh  # Format code
./scripts/lint-all.sh    # Check linting
./scripts/build.sh       # Build all packages
npm test                 # Run all tests

# Commit with descriptive message
git add .
git commit -m "feat: add support for window functions"
```

**Commit Message Format:**

- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code refactoring
- `test:` - Test additions or changes
- `docs:` - Documentation changes
- `chore:` - Build process or tooling changes

### 5.3 Pull Requests

1. **Create feature branch:**

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make changes and test:**

   ```bash
   ./scripts/format-all.sh
   ./scripts/lint-all.sh
   ./scripts/build.sh
   npm test
   ```

3. **Push and create PR:**

   ```bash
   git push -u origin feat/my-feature
   # Create PR on GitHub
   ```

4. **PR Requirements:**
   - All tests passing
   - Code formatted and linted
   - Documentation updated
   - Clear description of changes
   - Type safety maintained

---

## 6. Troubleshooting

### 6.1 Common Issues

**Issue: Build Fails with Module Resolution Errors**

```
Error: Cannot find module './queryable.js'
```

**Solution:** Ensure all imports include `.js` extension:

```typescript
// Incorrect
import { Queryable } from "./queryable";

// Correct
import { Queryable } from "./queryable.js";
```

**Issue: Tests Fail with Connection Pool Destroyed**

```
Error: Connection pool has been destroyed
```

**Solution:** Use shared database connection, don't call `pgp.end()` in tests:

```typescript
// Correct
import { db } from "./shared-db.js";

// Incorrect - don't create new pgp instances in tests
const pgp = pgPromise();
const db = pgp({...});
pgp.end(); // This destroys the global pool!
```

**Issue: SQLite Boolean Type Errors**

```
TypeError: SQLite3 can only bind numbers, strings, bigints, buffers, and null
```

**Solution:** Use `number` type (0/1) for boolean columns in SQLite schemas:

```typescript
// Correct for SQLite
interface Schema {
  users: {
    is_active: number; // Use 0 for false, 1 for true
  };
}

// Incorrect for SQLite
interface Schema {
  users: {
    is_active: boolean; // SQLite doesn't have boolean type
  };
}
```

### 6.2 Parser Errors

**Issue: Unsupported AST Node Type**

```
Error: Unsupported AST node type: TemplateLiteral
```

**Solution:** Use params pattern for dynamic values:

```typescript
// Incorrect - template literal in lambda
.where(u => u.name === `User ${userId}`)

// Correct - use params with executeSelect
await executeSelect(
  db,
  schema,
  (q, params: { name: string }) =>
    q.from("users").where((u) => u.name === params.name),
  { name: `User ${userId}` },
);
```

**Issue: Unknown Identifier**

```
Error: Unknown identifier 'externalVar'
```

**Solution:** Pass external variables via params object:

```typescript
// Incorrect - closure variable
const minAge = 18;
.where(u => u.age >= minAge)

// Correct - params pattern with executeSelect
await executeSelect(
  db,
  schema,
  (q, params: { minAge: number }) =>
    q.from("users").where((u) => u.age >= params.minAge),
  { minAge: 18 },
);
```

### 6.3 Type Errors

**Issue: Type Inference Not Working**

```typescript
// Type inference fails without schema context
const schema = createSchema(); // No schema type provided

// Types will be 'unknown' without schema
const result = await executeSelect(
  db,
  schema,
  (q) => q.from("users"), // Type is Queryable<unknown>
  {},
);
```

**Solution:** Provide explicit schema type to createSchema:

```typescript
interface Schema {
  users: { id: number; name: string };
}

const schema = createSchema<Schema>();

// Now fully typed from schema
const result = await executeSelect(
  db,
  schema,
  (q) => q.from("users"), // Fully typed: Queryable<{ id: number; name: string }>
  {},
);
```

**Issue: Property Does Not Exist**

```
Property 'email' does not exist on type '{ id: number; name: string }'
```

**Solution:** Ensure schema definition includes all columns:

```typescript
interface Schema {
  users: {
    id: number;
    name: string;
    email: string; // Add missing column
  };
}
```

---

## Development Workflow

**Typical Development Cycle:**

1. **Make changes** to source files
2. **Run linter**: `./scripts/lint-all.sh --fix`
3. **Build**: `./scripts/build.sh --no-format` (skip formatting for speed)
4. **Run specific tests**: `npm test --workspace @tinqerjs/tinqer -- --grep "your feature"`
5. **Iterate** until tests pass
6. **Run full test suite**: `npm test | tee .tests/run-<timestamp>.txt`
7. **Format code**: `./scripts/format-all.sh` (or `./scripts/build.sh` without `--no-format`)
8. **Final build**: `./scripts/build.sh` (lint-first: run `./scripts/lint-all.sh` before building)
9. **Commit changes**

**Debugging Tips:**

- Use `npm test --workspace <workspace> -- --grep "pattern"` to focus on specific tests
- Check `.tests/` directory for saved test output (gitignored)
- Use `npm run typecheck` to check types without building
- Enable verbose logging in tests with `DEBUG=* npm test`

---

[← Back to README](../README.md)
