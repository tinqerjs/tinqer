/**
 * Tests for type inference in execute function
 */

import { executeSelect } from "../dist/index.js";
import { schema } from "./test-schema.js";

// Mock database for type testing
const mockDb = {
  prepare(_sql: string) {
    return {
      all(_params?: Record<string, unknown>): unknown[] {
        return [];
      },
      get(_params?: Record<string, unknown>): unknown {
        return {};
      },
      run(_params?: Record<string, unknown>): { changes: number } {
        return { changes: 0 };
      },
    };
  },
};

// Type tests - these should compile without errors
function typeTests() {
  // Queryable returns array
  const users: {
    id: number;
    name: string;
    age: number;
    email: string | null;
    isActive: boolean;
    role: string;
    department: string;
    salary: number;
    city: string;
    country: string;
    phone: string;
    isDeleted: boolean;
    createdAt: Date;
    username: string;
    active: boolean;
    deptId: number;
  }[] = executeSelect(mockDb, schema, (q) => q.from("users"), {});

  // With select, returns projected array
  const userNames: { id: number; name: string }[] = executeSelect(
    mockDb,
    schema,
    (q) => q.from("users").select((u) => ({ id: u.id, name: u.name })),
    {},
  );

  // first() returns single item
  const firstUser: {
    id: number;
    name: string;
    age: number;
    email: string | null;
    isActive: boolean;
    role: string;
    department: string;
    salary: number;
    city: string;
    country: string;
    phone: string;
    isDeleted: boolean;
    createdAt: Date;
    username: string;
    active: boolean;
    deptId: number;
  } = executeSelect(mockDb, schema, (q) => q.from("users").first(), {});

  // firstOrDefault() returns item or null
  const maybeUser: {
    id: number;
    name: string;
    age: number;
    email: string | null;
    isActive: boolean;
    role: string;
    department: string;
    salary: number;
    city: string;
    country: string;
    phone: string;
    isDeleted: boolean;
    createdAt: Date;
    username: string;
    active: boolean;
    deptId: number;
  } | null = executeSelect(mockDb, schema, (q) => q.from("users").firstOrDefault(), {});

  // count() returns number
  const count: number = executeSelect(mockDb, schema, (q) => q.from("users").count(), {});

  // any() returns boolean
  const hasUsers: boolean = executeSelect(mockDb, schema, (q) => q.from("users").any(), {});

  // sum() returns number
  const totalAge: number = executeSelect(
    mockDb,
    schema,
    (q) => q.from("users").sum((u) => u.age),
    {},
  );

  // Use the variables to avoid unused variable warnings
  console.log(users, userNames, firstUser, maybeUser, count, hasUsers, totalAge);
}

// Export to ensure module is valid
export { typeTests };
