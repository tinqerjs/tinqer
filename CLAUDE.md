# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Tinqer codebase.

## Critical Guidelines

### NEVER ACT WITHOUT EXPLICIT USER APPROVAL

**YOU MUST ALWAYS ASK FOR PERMISSION BEFORE:**

- Making architectural decisions or changes
- Implementing new features or functionality
- Modifying APIs, interfaces, or data structures
- Changing expected behavior or test expectations
- Adding new dependencies or patterns

**ONLY make changes AFTER the user explicitly approves.** When you identify issues or potential improvements, explain them clearly and wait for the user's decision. Do NOT assume what the user wants or make "helpful" changes without permission.

### ANSWER QUESTIONS AND STOP

**CRITICAL RULE**: If the user asks you a question - whether as part of a larger text or just the question itself - you MUST:

1. **Answer ONLY that question**
2. **STOP your response completely**
3. **DO NOT continue with any other tasks or implementation**
4. **DO NOT proceed with previous tasks**
5. **Wait for the user's next instruction**

This applies to ANY question, even if it seems like part of a larger task or discussion.

### FINISH DISCUSSIONS BEFORE WRITING CODE

**IMPORTANT**: When the user asks a question or you're in the middle of a discussion, DO NOT jump to writing code. Always:

1. **Complete the discussion first** - Understand the problem fully
2. **Analyze and explain** - Work through the issue verbally
3. **Get confirmation** - Ensure the user agrees with the approach
4. **Only then write code** - After the user explicitly asks you to implement

### STOP AND DISCUSS FUNDAMENTAL ISSUES

**CRITICAL**: If you discover fundamental architectural issues or parser limitations:

1. **STOP IMMEDIATELY** - Do not proceed with workarounds or hacks
2. **Explain the issue clearly** - Show exactly what information is being lost
3. **Discuss proper solutions** - Work with the user to identify the correct fix
4. **Never implement hacks** - No "clever" workarounds for parser/architecture problems
5. **Fix the root cause** - Address issues at their source, not with band-aids

### NEVER USE MULTIEDIT

**NEVER use the MultiEdit tool.** It has caused issues in multiple projects. Always use individual Edit operations instead, even if it means more edits. This ensures better control and prevents unintended changes.

### NEVER USE AUTOMATED SCRIPTS FOR FIXES

**🚨 CRITICAL RULE: NEVER EVER attempt automated fixes via scripts or mass updates. 🚨**

This is a **MANDATORY** requirement that you **MUST NEVER** violate:

- **NEVER** create scripts to automate replacements (JS, Python, shell, etc.)
- **NEVER** use sed, awk, grep, or other text processing tools for bulk changes
- **NEVER** use xargs, find -exec, or any other batch processing commands
- **NEVER** write code that modifies multiple files automatically
- **NEVER** do "mass updates" or "bulk replacements" of any kind
- **ALWAYS** make changes manually using the Edit tool
- **Even if there are hundreds of similar changes, do them ONE BY ONE**

**WHY THIS IS CRITICAL:**

- Automated scripts break syntax in unpredictable ways
- Pattern matching fails on edge cases
- Mass updates destroy the codebase
- Manual edits ensure accuracy and preserve context
- You WILL mess up the code if you violate this rule

## GIT SAFETY RULES

### NEVER DISCARD UNCOMMITTED WORK

**🚨 CRITICAL RULE: NEVER use commands that permanently delete uncommitted changes. 🚨**

These commands cause **PERMANENT DATA LOSS** that cannot be recovered:

- **NEVER** use `git reset --hard`
- **NEVER** use `git reset --soft`
- **NEVER** use `git reset --mixed`
- **NEVER** use `git reset HEAD`
- **NEVER** use `git checkout -- .`
- **NEVER** use `git checkout -- <file>`
- **NEVER** use `git restore` to discard changes
- **NEVER** use `git clean -fd`

**Why this matters for AI sessions:**

- Uncommitted work is invisible to future AI sessions
- Once discarded, changes cannot be recovered
- AI cannot help fix problems it cannot see

**What to do instead:**

| Situation               | ❌ WRONG                            | ✅ CORRECT                         |
| ----------------------- | ----------------------------------- | ---------------------------------- |
| Need to switch branches | `git checkout main` (loses changes) | Commit first, then switch          |
| Made mistakes           | `git reset --hard`                  | Commit to temp branch, start fresh |
| Want clean slate        | `git restore .`                     | Commit current state, then revert  |
| On wrong branch         | `git checkout --`                   | Commit here, then cherry-pick      |

**Safe workflow:**

```bash
# Always commit before switching context
git add -A
git commit -m "wip: current progress on feature X"
git checkout other-branch

# If commit was wrong, fix with new commit or revert
git revert HEAD  # Creates new commit that undoes last commit
# OR
git commit -m "fix: correct the previous commit"
```

### NEVER USE GIT STASH

**🚨 CRITICAL RULE: NEVER use git stash - it hides work and causes data loss. 🚨**

- **NEVER** use `git stash`
- **NEVER** use `git stash push`
- **NEVER** use `git stash pop`
- **NEVER** use `git stash apply`
- **NEVER** use `git stash drop`

**Why stash is dangerous:**

- Stashed changes are invisible to AI sessions
- Easy to forget what's stashed
- Stash can be accidentally dropped
- Causes merge conflicts when applied
- No clear history of when/why stashed

**What to do instead - Use WIP branches:**

```bash
# Instead of stash, create a timestamped WIP branch
git checkout -b wip/feature-name-$(date +%Y%m%d-%H%M%S)
git add -A
git commit -m "wip: in-progress work on feature X"
git push -u origin wip/feature-name-$(date +%Y%m%d-%H%M%S)

# Now switch to other work safely
git checkout main
# ... do other work ...

# Return to your WIP later
git checkout wip/feature-name-20251108-084530
# Continue working...

# When done, squash WIP commits or rebase
git rebase -i main
```

**Benefits of WIP branches over stash:**

- ✅ Work is visible in git history
- ✅ Work is backed up on remote
- ✅ AI can see the work in future sessions
- ✅ Can have multiple WIP branches
- ✅ Clear timestamps show when work was done
- ✅ Can share WIP with others if needed

### Safe Branch Switching

**ALWAYS commit before switching branches:**

```bash
# Check current status
git status

# If there are changes, commit them first
git add -A
git commit -m "wip: current state before switching"

# NOW safe to switch
git checkout other-branch
```

**If you accidentally started work on wrong branch:**

```bash
# DON'T use git reset or git checkout --
# Instead, commit the work here
git add -A
git commit -m "wip: work started on wrong branch"

# Create correct branch from current state
git checkout -b correct-branch-name

# Previous branch will still have the commit
# You can cherry-pick it or just continue on new branch
```

### Recovery from Mistakes

If you realize you made a mistake AFTER committing:

```bash
# ✅ CORRECT: Create a fix commit
git commit -m "fix: correct the mistake from previous commit"

# ✅ CORRECT: Revert the bad commit
git revert HEAD

# ❌ WRONG: Try to undo with reset
git reset --hard HEAD~1  # NEVER DO THIS - loses history
```

**If you accidentally committed to main:**

```bash
# DON'T panic or use git reset
# Just create a feature branch from current position
git checkout -b feat/your-feature-name

# Push the branch
git push -u origin feat/your-feature-name

# When merged, it will fast-forward (no conflicts)
# Main will catch up to the same commit
```

### Other Git Safety Rules

**CRITICAL GIT SAFETY RULES**:

1. **NEVER use `git push --force` or `git push -f`** - Force pushing destroys history
2. **NEVER use `git push origin --delete`** - Never delete remote branches
3. **NEVER use destructive rebase/amend without explicit permission** - These rewrite history
4. **NEVER perform ANY destructive operations on remote repositories**
5. **ONLY allowed remote operation is standard `git push` or `git push -u origin branch-name`**
6. **ALL git push commands require EXPLICIT user authorization**
7. **Use revert commits instead of force push** - To undo changes, create revert commits
8. **If you need to overwrite remote**, explain consequences and get explicit confirmation

**IMPORTANT**: NEVER commit, push, revert, or perform ANY git operations without explicit user permission. You are ONLY allowed to delete LOCAL branches with `git branch -D`, NEVER remote branches.

**BRANCH REQUIREMENTS**:

1. **ALL changes MUST be made on a new feature branch, NEVER directly on main**
2. **BEFORE committing, ALWAYS verify you are NOT on main branch** - Run `git branch --show-current` first
3. **If accidentally on main**, create a new branch BEFORE committing: `git checkout -b feature/branch-name`
4. **Branch naming**: Use descriptive names like `feat/feature-name`, `fix/bug-name`, `docs/doc-update`

### Git Commit & Push Workflow

When the user asks you to commit and push:

1. Run `./scripts/format-all.sh` to format all files with Prettier
2. Run `./scripts/lint-all.sh` to ensure code passes linting
3. Follow the git commit guidelines in the main Claude system prompt
4. Get explicit user confirmation before any `git push`
5. Use only standard push commands - no force flags, no delete operations

**Standard workflow:**

```bash
# 1. Verify you're on correct branch
git branch --show-current

# 2. Make changes and commit frequently
git add -A
git commit -m "feat: descriptive message"

# 3. Format and test before pushing
./scripts/format-all.sh
npm test

# 4. Push to remote (with user permission)
git push
```

## WORKING DIRECTORIES

**IMPORTANT**: Never create temporary files in the project root or package directories. Use dedicated gitignored directories for different purposes.

### .tests/ Directory (Test Output Capture)

**Purpose:** Save test run output for analysis without re-running tests

**Usage:**

```bash
# Create directory (gitignored)
mkdir -p .tests

# Run tests with tee - shows output AND saves to file
npm test | tee .tests/run-$(date +%s).txt

# Analyze saved output later without re-running:
grep "failing" .tests/run-*.txt
tail -50 .tests/run-*.txt
grep -A10 "specific test name" .tests/run-*.txt
```

**Benefits:**

- See test output in real-time (unlike `>` redirection)
- Analyze failures without expensive re-runs
- Keep historical test results for comparison
- Search across multiple test runs

**Key Rule:** ALWAYS use `tee` for test output, NEVER plain redirection (`>` or `2>&1`)

### .analysis/ Directory (Research & Documentation)

**Purpose:** Keep analysis artifacts separate from source code

**Usage:**

```bash
# Create directory (gitignored)
mkdir -p .analysis

# Use for:
# - Code complexity reports
# - API documentation generation
# - Dependency analysis
# - Performance profiling results
# - Architecture diagrams and documentation
# - Parser output investigations
# - Temporary debugging scripts
```

**Benefits:**

- Keeps analysis work separate from source code
- Allows iterative analysis without cluttering repository
- Safe place for temporary debugging scripts
- Gitignored - no risk of committing debug artifacts

### .todos/ Directory (Persistent Task Tracking)

**Purpose:** Track multi-step tasks across conversation sessions

**Usage:**

```bash
# Create task file: YYYY-MM-DD-task-name.md
# Example: 2025-01-13-sql-generation.md

# Task file must include:
# - Task overview and objectives
# - Current status (completed work)
# - Detailed remaining work list
# - Important decisions made
# - Code locations affected
# - Testing requirements
# - Special considerations

# Mark complete: YYYY-MM-DD-task-name-COMPLETED.md
```

**Benefits:**

- Resume complex tasks across sessions with full context
- No loss of progress or decisions
- Gitignored for persistence

**Note:** All three directories (`.tests/`, `.analysis/`, `.todos/`) should be added to `.gitignore`

## Session Startup & Task Management

### First Steps When Starting a Session

When you begin working on this project, you MUST:

1. **Read this entire CLAUDE.md file** to understand the project structure and conventions
2. **Check for ongoing tasks in `.todos/` directory** - Look for any in-progress task files
3. **Read the key documentation files** in this order:
   - `/README.md` - Project overview and API specification
   - `/CODING-STANDARDS.md` - Mandatory coding patterns and conventions
   - `/ARCHITECTURE.md` - System architecture and design decisions

Only after reading these documents should you proceed with any implementation or analysis tasks.

**IMPORTANT**: After every conversation compact/summary, you MUST re-read this CLAUDE.md file again as your first action.

## Project Overview & Principles

Tinqer is a type-safe query builder for TypeScript that provides type-safe, composable query construction using lambda expressions parsed at runtime. For project overview, see [README.md](../README.md).

### Greenfield Development Context

**IMPORTANT**: Tinqer is a greenfield project with no legacy constraints:

- **No backward compatibility concerns** - No existing deployments or users to migrate
- **No legacy code patterns** - All code should follow current best practices without compromise
- **No migration paths needed** - APIs and data structures can be designed optimally
- **Write code as if starting fresh** - Every implementation should be clean and modern
- **No change tracking in comments** - Avoid "changed from X to Y" since there is no "previous" state
- **No deprecation warnings** - Nothing is deprecated because nothing is legacy

This means: Focus on clean, optimal implementations without worrying about existing systems. Design for the ideal case, not for compatibility.

### Documentation & Code Principles

**Documentation Guidelines:**

- Write as if the spec was designed from the beginning, not evolved over time
- Avoid phrases like "now allows", "changed from", "previously was"
- Present features and constraints as inherent design decisions
- Be concise and technical - avoid promotional language, superlatives
- Use active voice and include code examples
- Keep README.md as single source of truth

**Code Principles:**

- **NO BACKWARDS COMPATIBILITY** - Do not write backwards compatibility code
- **PREFER FUNCTIONS OVER CLASSES** - Export functions from modules when possible, use classes only when beneficial for stateful connections or complex state management
- **NO DYNAMIC IMPORTS** - Always use static imports, never `await import()` or `import()` in the code
- **STRICT TYPING REQUIRED** - No `any` types allowed. All code must be strictly typed. ESLint rule `@typescript-eslint/no-explicit-any` must be set to "error"
- Use pure functions with explicit dependency injection
- Prefer `type` over `interface` (use `interface` only for extensible contracts)

## Key Technical Decisions

### Security: Never Use npx

**CRITICAL SECURITY REQUIREMENT**: NEVER use `npx` for any commands. This poses grave security risks by executing arbitrary code.

- **ALWAYS use exact dependency versions** in package.json
- **ALWAYS use local node_modules binaries** (e.g., `prettier`, `mocha`)
- **NEVER use `npx prettier`** - use `prettier` from local dependencies
- **NEVER use `npx mocha`** - use `mocha` from local dependencies

**Exception**: Only acceptable `npx` usage is for one-time project initialization when explicitly setting up new projects.

### ESM Modules

- **All imports MUST include `.js` extension**: `import { foo } from "./bar.js"`
- **TypeScript configured for `"module": "NodeNext"`**
- **Type: `"module"` in all package.json files**
- **NO DYNAMIC IMPORTS**: Always use static imports. Never use `await import()` or `import()` in the code

## Essential Commands & Workflow

### Build & Development Commands

```bash
# Build entire project (from root)
./scripts/build.sh              # Standard build with formatting
./scripts/build.sh --no-format  # Skip prettier formatting (faster builds during development)

# Clean build artifacts
./scripts/clean.sh
./scripts/clean.sh --all        # Also remove node_modules

# Lint entire project
./scripts/lint-all.sh           # Run ESLint on all packages
./scripts/lint-all.sh --fix     # Run ESLint with auto-fix

# Format code with Prettier (MUST run before committing)
./scripts/format-all.sh         # Format all files
./scripts/format-all.sh --check # Check formatting without changing files

# Run tests
npm test | tee .tests/run-<timestamp>.txt # Run all tests (save output)

# Run tests for a specific workspace
npm test --workspace @tinqerjs/tinqer
npm test --workspace @tinqerjs/pg-promise-adapter
npm test --workspace @tinqerjs/better-sqlite3-adapter
npm test --workspace @tinqerjs/better-sqlite3-adapter-integration
TINQER_PG_INTEGRATION=1 npm test --workspace @tinqerjs/pg-promise-adapter-integration

# Run specific tests by grep (Mocha)
npm test --workspace @tinqerjs/tinqer -- --grep "pattern"
```

### Testing Commands

```bash
# Run specific tests by grep within a workspace
npm test --workspace @tinqerjs/tinqer -- --grep "pattern to match"

# Examples:
npm test --workspace @tinqerjs/tinqer -- --grep "WHERE"
npm test --workspace @tinqerjs/pg-promise-adapter -- --grep "JOIN"
```

**IMPORTANT**: When running tests with mocha, use `npm test --workspace <workspace> -- --grep "pattern"`. NEVER use `2>&1` redirection with mocha commands. Use `| tee` for output capture.

### Build & Lint Workflow

**ALWAYS follow this sequence:**

1. Run `./scripts/lint-all.sh` first
2. Run `./scripts/build.sh`
3. **If build fails and you make changes**: You MUST run `./scripts/lint-all.sh` again before building

**TIP**: Use `./scripts/build.sh --no-format` during debugging sessions to skip prettier formatting for faster builds.

## Core Architecture

For detailed architecture information, see `/ARCHITECTURE.md` and `/README.md`.

Key concepts:

- **Parser**: Uses OXC parser to convert lambda expressions to AST
- **Expression Trees**: Type-safe representation of query operations
- **Queryable**: Fluent API for building queries
- **SQL Adapters**: Convert expression trees to database-specific SQL

### Package Structure

```
packages/
├── tinqer/                    # Core library with parser and query builder
│   ├── src/
│   │   ├── expressions/
│   │   ├── linq/
│   │   ├── parser/
│   │   ├── plans/
│   │   ├── policies/
│   │   ├── query-tree/
│   │   └── visitors/
│   └── tests/
├── pg-promise-adapter/         # PostgreSQL adapter using pg-promise
│   ├── src/
│   │   ├── generators/
│   │   ├── expression-generator.ts
│   │   ├── sql-generator.ts
│   │   └── index.ts
│   └── tests/
├── better-sqlite3-adapter/     # SQLite adapter using better-sqlite3
│   ├── src/
│   │   ├── generators/
│   │   ├── expression-generator.ts
│   │   ├── sql-generator.ts
│   │   └── index.ts
│   └── tests/
├── pg-promise-adapter-integration/
│   └── tests/
└── better-sqlite3-adapter-integration/
    └── tests/
```

## Code Patterns

### Import Patterns

```typescript
// Always include .js extension
import { Queryable } from "./linq/queryable.js";
import type { Expression } from "./expressions/expression.js";
```

### Expression Tree Pattern

```typescript
// Direct object construction with explicit parameters
const param = { type: "parameter", name: "u", origin: { type: "table", ref: "users" } };
const member = { type: "member", property: "age", object: param };
const constant = { type: "constant", value: 18 };
const comparison = { type: "binary", operator: ">=", left: member, right: constant };
```

## Test Files Convention

**NEVER create temporary test scripts in the root directory**. Test files belong in:

- `packages/tinqer/tests/` - Core library tests
- `packages/pg-promise-adapter/tests/` - SQL adapter tests

**Temporary debugging scripts** should be created in `.analysis/` directory (gitignored).

## Common Issues

For troubleshooting common issues, refer to:

- Parser errors: Check lambda syntax and supported features
- Expression tree mismatches: Verify parameter origins
- Test failures: Ensure helper functions use explicit object parameters
- Build errors: Check ESM import extensions (.js)

## Additional Resources

- `/CODING-STANDARDS.md` - Detailed coding conventions
- `/ARCHITECTURE.md` - System design and implementation details
- `/README.md` - Project overview and usage examples
