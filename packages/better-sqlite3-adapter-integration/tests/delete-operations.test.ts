/**
 * Integration tests for DELETE operations with Better SQLite3
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { strict as assert } from "node:assert";
import { createSchema } from "@tinqerjs/tinqer";
import { executeDelete } from "@tinqerjs/better-sqlite3-adapter";
import Database from "better-sqlite3";

// Use isolated in-memory database for DELETE tests
const dbClient: Database.Database = new Database(":memory:");

// Define types for test tables
// Note: SQLite doesn't have a boolean type, it uses INTEGER (0/1)
interface TestSchema {
  test_products: {
    id?: number;
    name: string;
    category?: string;
    price?: number;
    in_stock?: number; // SQLite uses INTEGER (0/1) for boolean values
    created_date?: string;
    last_modified?: string;
  };
  test_users: {
    id?: number;
    username: string;
    email: string;
    age?: number;
    is_active?: number; // SQLite uses INTEGER (0/1) for boolean values
    role?: string;
    joined_date?: string;
    last_login?: string;
  };
  test_orders: {
    id?: number;
    user_id: number;
    product_id: number;
    quantity: number;
    status?: string;
    order_date?: string;
  };
  test_logs: {
    id?: number;
    user_id: number;
    action: string;
    log_date?: string;
    level?: string;
    message?: string;
    created_at?: string;
  };
}

const schema = createSchema<TestSchema>();

describe("DELETE Operations - SQLite Integration", () => {
  before(() => {
    // Enable foreign key constraints in SQLite (must be set before creating tables)
    dbClient.exec("PRAGMA foreign_keys = ON");

    // Drop existing tables to ensure fresh schema
    dbClient.exec("DROP TABLE IF EXISTS test_orders");
    dbClient.exec("DROP TABLE IF EXISTS test_logs");
    dbClient.exec("DROP TABLE IF EXISTS test_users");
    dbClient.exec("DROP TABLE IF EXISTS test_products");

    // Create test tables for DELETE operations
    dbClient.exec(`
      CREATE TABLE test_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        price REAL,
        in_stock INTEGER DEFAULT 1,
        created_date TEXT,
        last_modified TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    dbClient.exec(`
      CREATE TABLE test_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        is_active INTEGER DEFAULT 1,
        role TEXT DEFAULT 'user',
        joined_date TEXT,
        last_login TEXT
      )
    `);

    dbClient.exec(`
      CREATE TABLE test_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES test_users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES test_products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        order_date TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    dbClient.exec(`
      CREATE TABLE test_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT,
        user_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  after(() => {
    // Drop test tables
    dbClient.exec("DROP TABLE IF EXISTS test_orders");
    dbClient.exec("DROP TABLE IF EXISTS test_logs");
    dbClient.exec("DROP TABLE IF EXISTS test_users");
    dbClient.exec("DROP TABLE IF EXISTS test_products");
    // Close isolated database
    dbClient.close();
  });

  beforeEach(() => {
    // Clear and seed test data
    dbClient.exec("DELETE FROM test_orders");
    dbClient.exec("DELETE FROM test_logs");
    dbClient.exec("DELETE FROM test_users");
    dbClient.exec("DELETE FROM test_products");
    // Reset auto-increment counters
    dbClient.exec(
      "DELETE FROM sqlite_sequence WHERE name IN ('test_orders', 'test_logs', 'test_users', 'test_products')",
    );

    // Seed products
    dbClient.exec(`
      INSERT INTO test_products (name, category, price, in_stock, created_date)
      VALUES
        ('Laptop', 'Electronics', 999.99, 1, '2024-01-01'),
        ('Mouse', 'Electronics', 29.99, 1, '2024-01-05'),
        ('Keyboard', 'Electronics', 79.99, 0, '2024-01-10'),
        ('Monitor', 'Electronics', 299.99, 1, '2024-01-15'),
        ('Desk Chair', 'Furniture', 249.99, 1, '2024-01-20'),
        ('Standing Desk', 'Furniture', 599.99, 0, '2024-01-25'),
        ('Notebook', 'Stationery', 5.99, 1, '2024-02-01'),
        ('Pen Set', 'Stationery', 12.99, 1, '2024-02-05')
    `);

    // Seed users
    dbClient.exec(`
      INSERT INTO test_users (username, email, age, is_active, role, joined_date)
      VALUES
        ('admin_user', 'admin@example.com', 35, 1, 'admin', '2023-01-01'),
        ('john_doe', 'john@example.com', 28, 1, 'user', '2023-06-15'),
        ('jane_smith', 'jane@example.com', 32, 0, 'user', '2023-07-20'),
        ('bob_wilson', 'bob@example.com', 45, 1, 'moderator', '2023-08-10'),
        ('alice_jones', 'alice@example.com', 26, 1, 'user', '2024-01-05'),
        ('inactive_user', 'inactive@example.com', 30, 0, 'user', '2023-03-01')
    `);

    // Seed orders
    dbClient.exec(`
      INSERT INTO test_orders (user_id, product_id, quantity, status)
      VALUES
        (1, 1, 1, 'completed'),
        (2, 2, 2, 'completed'),
        (2, 3, 1, 'pending'),
        (3, 4, 1, 'cancelled'),
        (4, 5, 1, 'completed'),
        (5, 1, 1, 'pending')
    `);

    // Seed logs
    dbClient.exec(`
      INSERT INTO test_logs (level, message, user_id)
      VALUES
        ('INFO', 'User logged in', 1),
        ('ERROR', 'Failed login attempt', 2),
        ('WARNING', 'Suspicious activity detected', 3),
        ('INFO', 'Password changed', 1),
        ('ERROR', 'Database connection failed', NULL),
        ('DEBUG', 'Query executed', 2)
    `);
  });

  describe("Basic DELETE operations", () => {
    it("should delete single row with WHERE clause", () => {
      const initialCount = dbClient
        .prepare("SELECT COUNT(*) as count FROM test_products")
        .get() as {
        count: number;
      };
      assert.equal(initialCount.count, 8);

      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.name === "Notebook"),
        {},
      );

      assert.equal(rowCount, 1);

      const finalCount = dbClient.prepare("SELECT COUNT(*) as count FROM test_products").get() as {
        count: number;
      };
      assert.equal(finalCount.count, 7);

      // Verify the specific row is deleted
      const result = dbClient.prepare("SELECT * FROM test_products WHERE name = ?").all("Notebook");
      assert.equal(result.length, 0);
    });

    it("should delete with parameters", () => {
      const params = { productName: "Mouse" };

      const rowCount = executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_products").where((prod) => prod.name === p.productName),
        params,
      );

      assert.equal(rowCount, 1);

      const result = dbClient
        .prepare("SELECT * FROM test_products WHERE name = ?")
        .all(params.productName);
      assert.equal(result.length, 0);
    });

    it("should delete with numeric comparison", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.price! < 10),
        {},
      );

      assert.equal(rowCount, 1); // Only Notebook (5.99)

      const remaining = dbClient.prepare("SELECT * FROM test_products WHERE price < ?").all(10);
      assert.equal(remaining.length, 0);
    });

    it("should delete with boolean condition", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.is_active === 0), // SQLite uses 0 for false
        {},
      );

      assert.equal(rowCount, 2); // jane_smith and inactive_user

      const inactiveUsers = dbClient.prepare("SELECT * FROM test_users WHERE is_active = ?").all(0);
      assert.equal(inactiveUsers.length, 0);
    });

    it("should delete with NULL checks", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").where((l) => l.user_id === null),
        {},
      );

      assert.equal(rowCount, 1); // One log with NULL user_id

      const nullLogs = dbClient.prepare("SELECT * FROM test_logs WHERE user_id IS NULL").all();
      assert.equal(nullLogs.length, 0);
    });
  });

  describe("DELETE with complex WHERE clauses", () => {
    it("should delete with AND conditions", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) =>
          q.deleteFrom("test_products").where(
            (p) => p.category === "Electronics" && p.in_stock === 0, // SQLite uses 0 for false
          ),
        {},
      );

      assert.equal(rowCount, 1); // Only Keyboard matches

      const result = dbClient
        .prepare("SELECT * FROM test_products WHERE category = ? AND in_stock = ?")
        .all("Electronics", 0);
      assert.equal(result.length, 0);
    });

    it("should delete with OR conditions", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) =>
          q.deleteFrom("test_products").where((p) => p.category === "Stationery" || p.price! > 500),
        {},
      );

      assert.equal(rowCount, 4); // Notebook, Pen Set (Stationery), Standing Desk (599.99), and Laptop (999.99)

      const stationery = dbClient
        .prepare("SELECT * FROM test_products WHERE category = ?")
        .all("Stationery");
      assert.equal(stationery.length, 0);

      const expensive = dbClient.prepare("SELECT * FROM test_products WHERE price > ?").all(500);
      assert.equal(expensive.length, 0);
    });

    it("should delete with complex nested conditions", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) =>
          q.deleteFrom("test_users").where(
            (u) => (u.role === "user" && u.age! < 30) || (u.is_active === 0 && u.role !== "admin"), // SQLite uses 0 for false
          ),
        {},
      );

      // john_doe (user, 28), alice_jones (user, 26), jane_smith (inactive, user), inactive_user (inactive, user)
      assert.equal(rowCount, 4);

      const remainingUsers = dbClient
        .prepare("SELECT username FROM test_users ORDER BY username")
        .all() as { username: string }[];
      const usernames = remainingUsers.map((u) => u.username);
      assert.deepEqual(usernames, ["admin_user", "bob_wilson"]);
    });

    it("should delete with NOT conditions", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").where((l) => l.level !== "INFO"),
        {},
      );

      assert.equal(rowCount, 4); // ERROR, WARNING, DEBUG logs

      const remainingLogs = dbClient
        .prepare("SELECT * FROM test_logs")
        .all() as TestSchema["test_logs"][];
      assert.equal(remainingLogs.length, 2);
      remainingLogs.forEach((log) => assert.equal(log.level, "INFO"));
    });

    it("should delete with comparison operators", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.price! >= 250 && p.price! <= 600),
        {},
      );

      assert.equal(rowCount, 2); // Monitor (299.99) and Standing Desk (599.99)
      // Desk Chair (249.99) doesn't match because 249.99 < 250

      const remaining = dbClient
        .prepare("SELECT name, price FROM test_products ORDER BY price")
        .all();
      // Should have deleted Monitor (299.99) and Standing Desk (599.99)
      assert.equal(remaining.length, 6);
    });
  });

  describe("DELETE with string operations", () => {
    it("should delete with startsWith", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.username.startsWith("john")),
        {},
      );

      assert.equal(rowCount, 1); // john_doe

      const johns = dbClient.prepare("SELECT * FROM test_users WHERE username LIKE ?").all("john%");
      assert.equal(johns.length, 0);
    });

    it("should delete with endsWith", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.email.endsWith("@example.com")),
        {},
      );

      assert.equal(rowCount, 6); // All users have @example.com

      const users = dbClient.prepare("SELECT * FROM test_users").all();
      assert.equal(users.length, 0);
    });

    it("should delete with contains", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").where((l) => l.message!.includes("login")),
        {},
      );

      assert.equal(rowCount, 1); // Only "Failed login attempt" (contains "login" as substring)

      const loginLogs = dbClient
        .prepare("SELECT * FROM test_logs WHERE message LIKE ?")
        .all("%login%");
      assert.equal(loginLogs.length, 0);
    });
  });

  describe("DELETE with IN operations", () => {
    it("should delete with array includes", () => {
      const categoriesToDelete = ["Furniture", "Stationery"];

      const rowCount = executeDelete(
        dbClient,
        schema,
        (q, p) =>
          q.deleteFrom("test_products").where((prod) => p.categories.includes(prod.category!)),
        { categories: categoriesToDelete },
      );

      assert.equal(rowCount, 4); // 2 Furniture + 2 Stationery

      const remaining = dbClient.prepare("SELECT DISTINCT category FROM test_products").all() as {
        category: string;
      }[];
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0]!.category, "Electronics");
    });

    it("should delete with parameterized list", () => {
      const userIds = [2, 3, 4];

      const rowCount = executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_users").where((u) => p.ids.includes(u.id!)),
        { ids: userIds },
      );

      assert.equal(rowCount, 3);

      const remaining = dbClient.prepare("SELECT id FROM test_users ORDER BY id").all() as {
        id: number;
      }[];
      assert.deepEqual(
        remaining.map((r) => r.id),
        [1, 5, 6],
      );
    });
  });

  describe("DELETE with date comparisons", () => {
    it("should delete with date comparison", () => {
      const cutoffDate = "2024-01-15";

      const rowCount = executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_products").where((prod) => prod.created_date! < p.cutoff),
        { cutoff: cutoffDate },
      );

      assert.equal(rowCount, 3); // Products created before Jan 15, 2024

      const remaining = dbClient.prepare("SELECT name FROM test_products ORDER BY name").all();
      assert.equal(remaining.length, 5);
    });

    it("should delete old records by timestamp", () => {
      // First, update some logs to have old timestamps
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      dbClient
        .prepare("UPDATE test_logs SET created_at = ? WHERE level = ?")
        .run(oldDate.toISOString(), "DEBUG");

      const now = new Date();
      now.setDate(now.getDate() - 7); // 7 days ago
      const cutoffTime = now.toISOString();

      const rowCount = executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_logs").where((l) => l.created_at! < p.cutoff),
        { cutoff: cutoffTime },
      );

      assert.equal(rowCount, 1); // Only the DEBUG log we made old

      const oldLogs = dbClient
        .prepare("SELECT * FROM test_logs WHERE created_at < ?")
        .all(cutoffTime);
      assert.equal(oldLogs.length, 0);
    });
  });

  describe("DELETE multiple rows", () => {
    it("should delete all matching rows", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_orders").where((o) => o.status === "pending"),
        {},
      );

      assert.equal(rowCount, 2);

      const pendingOrders = dbClient
        .prepare("SELECT * FROM test_orders WHERE status = ?")
        .all("pending");
      assert.equal(pendingOrders.length, 0);
    });

    it("should delete with allowFullTableDelete", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").allowFullTableDelete(),
        {},
      );

      assert.equal(rowCount, 6); // All logs

      const logs = dbClient.prepare("SELECT * FROM test_logs").all();
      assert.equal(logs.length, 0);
    });

    it("should throw error when DELETE has no WHERE and no allow flag", () => {
      try {
        executeDelete(dbClient, schema, (q) => q.deleteFrom("test_products"), {});
        assert.fail("Should have thrown error for missing WHERE clause");
      } catch (error: unknown) {
        assert(
          (error as Error).message.includes("WHERE clause") ||
            (error as Error).message.includes("allowFullTableDelete"),
        );
      }
    });
  });

  describe("DELETE with cascading", () => {
    it("should cascade delete related records", () => {
      // Delete a user that has orders (CASCADE should delete orders too)
      const userOrdersBefore = dbClient
        .prepare("SELECT * FROM test_orders WHERE user_id = ?")
        .all(2);
      assert.equal(userOrdersBefore.length, 2); // john_doe has 2 orders

      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.username === "john_doe"),
        {},
      );

      assert.equal(rowCount, 1);

      // Check that orders were also deleted (if foreign keys are enabled)
      const userOrdersAfter = dbClient
        .prepare("SELECT * FROM test_orders WHERE user_id = ?")
        .all(2);
      assert.equal(userOrdersAfter.length, 0);
    });
  });

  describe("DELETE with no matches", () => {
    it("should return 0 when no rows match", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.name === "NonExistent"),
        {},
      );

      assert.equal(rowCount, 0);

      // Verify nothing was deleted
      const count = dbClient.prepare("SELECT COUNT(*) as count FROM test_products").get() as {
        count: number;
      };
      assert.equal(count.count, 8);
    });

    it("should handle impossible conditions gracefully", () => {
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.price! < 0),
        {},
      );

      assert.equal(rowCount, 0);
    });
  });

  describe("SQLite-specific behaviors", () => {
    it("should handle boolean values as 0/1", () => {
      // SQLite stores booleans as integers
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.in_stock === 1), // SQLite uses 1 for true
        {},
      );

      // Should delete all products where in_stock = 1
      // Products: Laptop, Mouse, Monitor, Desk Chair, Notebook, Pen Set = 6 products
      assert.equal(rowCount, 6);

      const remaining = dbClient
        .prepare("SELECT * FROM test_products")
        .all() as TestSchema["test_products"][];
      assert.equal(remaining.length, 2); // Only Keyboard and Standing Desk remain (in_stock = 0)
      remaining.forEach((p) => assert.equal(p.in_stock, 0));
    });

    it("should handle type coercion in comparisons", () => {
      // SQLite allows flexible type comparisons
      const rowCount = executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.price === 299.99),
        {},
      );

      // Should match Monitor with price 299.99 even though we used string
      assert.equal(rowCount, 1);

      const monitor = dbClient.prepare("SELECT * FROM test_products WHERE name = ?").all("Monitor");
      assert.equal(monitor.length, 0);
    });
  });
});
