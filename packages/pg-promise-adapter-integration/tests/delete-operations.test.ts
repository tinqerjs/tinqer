/**
 * Integration tests for DELETE operations with PostgreSQL
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { strict as assert } from "node:assert";
import { createSchema } from "@tinqerjs/tinqer";
import { executeDelete } from "@tinqerjs/pg-promise-adapter";
import { db as dbClient } from "./shared-db.js";

// Define types for test tables
interface TestSchema {
  test_products: {
    id?: number;
    name: string;
    category?: string;
    price?: number;
    in_stock?: boolean;
    created_date?: Date;
    last_modified?: Date;
  };
  test_users: {
    id?: number;
    username: string;
    email: string;
    age?: number;
    is_active?: boolean;
    role?: string;
    joined_date?: Date;
    last_login?: Date;
  };
  test_orders: {
    id?: number;
    user_id: number;
    product_id: number;
    quantity: number;
    status?: string;
    order_date?: Date;
  };
  test_logs: {
    id?: number;
    user_id: number;
    action: string;
    log_date?: Date;
    level?: string;
    message?: string;
    created_at?: Date;
  };
}

const schema = createSchema<TestSchema>();

describe("DELETE Operations - PostgreSQL Integration", () => {
  before(async () => {
    // Create test tables for DELETE operations
    await dbClient.none(`
      CREATE TABLE IF NOT EXISTS test_products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50),
        price DECIMAL(10, 2),
        in_stock BOOLEAN DEFAULT true,
        created_date DATE,
        last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbClient.none(`
      CREATE TABLE IF NOT EXISTS test_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        age INTEGER,
        is_active BOOLEAN DEFAULT true,
        role VARCHAR(20) DEFAULT 'user',
        joined_date DATE,
        last_login TIMESTAMP
      )
    `);

    await dbClient.none(`
      CREATE TABLE IF NOT EXISTS test_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES test_users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES test_products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbClient.none(`
      CREATE TABLE IF NOT EXISTS test_logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(10) NOT NULL,
        message TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  after(async () => {
    // Drop test tables
    await dbClient.none("DROP TABLE IF EXISTS test_orders CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS test_logs CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS test_users CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS test_products CASCADE");
  });

  beforeEach(async () => {
    // Clear and seed test data
    await dbClient.none(
      "TRUNCATE TABLE test_orders, test_logs, test_users, test_products RESTART IDENTITY CASCADE",
    );

    // Seed products
    await dbClient.none(`
      INSERT INTO test_products (name, category, price, in_stock, created_date)
      VALUES
        ('Laptop', 'Electronics', 999.99, true, '2024-01-01'),
        ('Mouse', 'Electronics', 29.99, true, '2024-01-05'),
        ('Keyboard', 'Electronics', 79.99, false, '2024-01-10'),
        ('Monitor', 'Electronics', 299.99, true, '2024-01-15'),
        ('Desk Chair', 'Furniture', 249.99, true, '2024-01-20'),
        ('Standing Desk', 'Furniture', 599.99, false, '2024-01-25'),
        ('Notebook', 'Stationery', 5.99, true, '2024-02-01'),
        ('Pen Set', 'Stationery', 12.99, true, '2024-02-05')
    `);

    // Seed users
    await dbClient.none(`
      INSERT INTO test_users (username, email, age, is_active, role, joined_date)
      VALUES
        ('admin_user', 'admin@example.com', 35, true, 'admin', '2023-01-01'),
        ('john_doe', 'john@example.com', 28, true, 'user', '2023-06-15'),
        ('jane_smith', 'jane@example.com', 32, false, 'user', '2023-07-20'),
        ('bob_wilson', 'bob@example.com', 45, true, 'moderator', '2023-08-10'),
        ('alice_jones', 'alice@example.com', 26, true, 'user', '2024-01-05'),
        ('inactive_user', 'inactive@example.com', 30, false, 'user', '2023-03-01')
    `);

    // Seed orders
    await dbClient.none(`
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
    await dbClient.none(`
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
    it("should delete single row with WHERE clause", async () => {
      const initialCount = await dbClient.one("SELECT COUNT(*) FROM test_products");
      assert.equal(parseInt(initialCount.count), 8);

      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.name === "Notebook"),
        {},
      );

      assert.equal(rowCount, 1);

      const finalCount = await dbClient.one("SELECT COUNT(*) FROM test_products");
      assert.equal(parseInt(finalCount.count), 7);

      // Verify the specific row is deleted
      const result = await dbClient.any("SELECT * FROM test_products WHERE name = $1", [
        "Notebook",
      ]);
      assert.equal(result.length, 0);
    });

    it("should delete with parameters", async () => {
      const params = { productName: "Mouse" };

      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_products").where((prod) => prod.name === p.productName),
        params,
      );

      assert.equal(rowCount, 1);

      const result = await dbClient.any("SELECT * FROM test_products WHERE name = $1", [
        params.productName,
      ]);
      assert.equal(result.length, 0);
    });

    it("should delete with numeric comparison", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.price! < 10),
        {},
      );

      assert.equal(rowCount, 1); // Only Notebook (5.99)

      const remaining = await dbClient.any("SELECT * FROM test_products WHERE price < 10");
      assert.equal(remaining.length, 0);
    });

    it("should delete with boolean condition", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.is_active === false),
        {},
      );

      assert.equal(rowCount, 2); // jane_smith and inactive_user

      const inactiveUsers = await dbClient.any("SELECT * FROM test_users WHERE is_active = false");
      assert.equal(inactiveUsers.length, 0);
    });

    it("should delete with NULL checks", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").where((l) => l.user_id === null),
        {},
      );

      assert.equal(rowCount, 1); // One log with NULL user_id

      const nullLogs = await dbClient.any("SELECT * FROM test_logs WHERE user_id IS NULL");
      assert.equal(nullLogs.length, 0);
    });
  });

  describe("DELETE with complex WHERE clauses", () => {
    it("should delete with AND conditions", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) =>
          q
            .deleteFrom("test_products")
            .where((p) => p.category === "Electronics" && p.in_stock === false),
        {},
      );

      assert.equal(rowCount, 1); // Only Keyboard matches

      const result = await dbClient.any(
        "SELECT * FROM test_products WHERE category = $1 AND in_stock = $2",
        ["Electronics", false],
      );
      assert.equal(result.length, 0);
    });

    it("should delete with OR conditions", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) =>
          q.deleteFrom("test_products").where((p) => p.category === "Stationery" || p.price! > 500),
        {},
      );

      assert.equal(rowCount, 4); // Notebook, Pen Set (Stationery), Standing Desk (599.99), and Laptop (999.99)

      const stationery = await dbClient.any("SELECT * FROM test_products WHERE category = $1", [
        "Stationery",
      ]);
      assert.equal(stationery.length, 0);

      const expensive = await dbClient.any("SELECT * FROM test_products WHERE price > $1", [500]);
      assert.equal(expensive.length, 0);
    });

    it("should delete with complex nested conditions", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) =>
          q
            .deleteFrom("test_users")
            .where(
              (u) =>
                (u.role === "user" && u.age! < 30) || (u.is_active === false && u.role !== "admin"),
            ),
        {},
      );

      // john_doe (user, 28), alice_jones (user, 26), jane_smith (inactive, user), inactive_user (inactive, user)
      assert.equal(rowCount, 4);

      const remainingUsers = await dbClient.many("SELECT username FROM test_users");
      const usernames = remainingUsers.map((u) => u.username).sort();
      assert.deepEqual(usernames, ["admin_user", "bob_wilson"]);
    });

    it("should delete with NOT conditions", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").where((l) => l.level !== "INFO"),
        {},
      );

      assert.equal(rowCount, 4); // ERROR, WARNING, DEBUG logs

      const remainingLogs = await dbClient.many("SELECT * FROM test_logs");
      assert.equal(remainingLogs.length, 2);
      remainingLogs.forEach((log) => assert.equal(log.level, "INFO"));
    });

    it("should delete with comparison operators", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.price! >= 250 && p.price! <= 600),
        {},
      );

      assert.equal(rowCount, 2); // Monitor (299.99), Standing Desk (599.99)
      // Desk Chair is 249.99 which is < 250, so not deleted

      const remaining = await dbClient.many("SELECT name, price FROM test_products ORDER BY price");
      // Should have: Notebook (5.99), Pen Set (12.99), Mouse (29.99), Keyboard (79.99), Desk Chair (249.99), Laptop (999.99)
      assert.equal(remaining.length, 6);
    });
  });

  describe("DELETE with string operations", () => {
    it("should delete with startsWith", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.username.startsWith("john")),
        {},
      );

      assert.equal(rowCount, 1); // john_doe

      const johns = await dbClient.any("SELECT * FROM test_users WHERE username LIKE $1", [
        "john%",
      ]);
      assert.equal(johns.length, 0);
    });

    it("should delete with endsWith", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.email.endsWith("@example.com")),
        {},
      );

      assert.equal(rowCount, 6); // All users have @example.com

      const users = await dbClient.any("SELECT * FROM test_users");
      assert.equal(users.length, 0);
    });

    it("should delete with contains", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").where((l) => l.message!.includes("login")),
        {},
      );

      assert.equal(rowCount, 1); // Only "Failed login attempt" (contains "login" as substring)

      const loginLogs = await dbClient.any("SELECT * FROM test_logs WHERE message LIKE $1", [
        "%login%",
      ]);
      assert.equal(loginLogs.length, 0);
    });
  });

  describe("DELETE with IN operations", () => {
    it("should delete with array includes", async () => {
      const categoriesToDelete = ["Furniture", "Stationery"];

      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q, p) =>
          q.deleteFrom("test_products").where((prod) => p.categories.includes(prod.category!)),
        { categories: categoriesToDelete },
      );

      assert.equal(rowCount, 4); // 2 Furniture + 2 Stationery

      const remaining = await dbClient.many("SELECT DISTINCT category FROM test_products");
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].category, "Electronics");
    });

    it("should delete with parameterized list", async () => {
      const userIds = [2, 3, 4];

      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_users").where((u) => p.ids.includes(u.id!)),
        { ids: userIds },
      );

      assert.equal(rowCount, 3);

      const remaining = await dbClient.many("SELECT id FROM test_users ORDER BY id");
      assert.deepEqual(
        remaining.map((r) => r.id),
        [1, 5, 6],
      );
    });
  });

  describe("DELETE with date comparisons", () => {
    it("should delete with date comparison", async () => {
      const cutoffDate = new Date("2024-01-15");

      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_products").where((prod) => prod.created_date! < p.cutoff),
        { cutoff: cutoffDate },
      );

      assert.equal(rowCount, 3); // Products created before Jan 15, 2024

      const remaining = await dbClient.many("SELECT name FROM test_products ORDER BY name");
      assert.equal(remaining.length, 5);
    });

    it("should delete old records by timestamp", async () => {
      // First, update some logs to have old timestamps
      await dbClient.none(`
        UPDATE test_logs
        SET created_at = NOW() - INTERVAL '30 days'
        WHERE level = 'DEBUG'
      `);

      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - 7); // 7 days ago

      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q, p) => q.deleteFrom("test_logs").where((l) => l.created_at! < p.cutoff),
        { cutoff: cutoffTime },
      );

      assert.equal(rowCount, 1); // Only the DEBUG log we made old

      const oldLogs = await dbClient.any("SELECT * FROM test_logs WHERE created_at < $1", [
        cutoffTime,
      ]);
      assert.equal(oldLogs.length, 0);
    });
  });

  describe("DELETE multiple rows", () => {
    it("should delete all matching rows", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_orders").where((o) => o.status === "pending"),
        {},
      );

      assert.equal(rowCount, 2);

      const pendingOrders = await dbClient.any("SELECT * FROM test_orders WHERE status = $1", [
        "pending",
      ]);
      assert.equal(pendingOrders.length, 0);
    });

    it("should delete with allowFullTableDelete", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_logs").allowFullTableDelete(),
        {},
      );

      assert.equal(rowCount, 6); // All logs

      const logs = await dbClient.any("SELECT * FROM test_logs");
      assert.equal(logs.length, 0);
    });

    it("should throw error when DELETE has no WHERE and no allow flag", async () => {
      try {
        await executeDelete(dbClient, schema, (q) => q.deleteFrom("test_products"), {});
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
    it("should cascade delete related records", async () => {
      // Delete a user that has orders (CASCADE should delete orders too)
      const userOrdersBefore = await dbClient.any(
        "SELECT * FROM test_orders WHERE user_id = $1",
        [2],
      );
      assert.equal(userOrdersBefore.length, 2); // john_doe has 2 orders

      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_users").where((u) => u.username === "john_doe"),
        {},
      );

      assert.equal(rowCount, 1);

      // Check that orders were also deleted
      const userOrdersAfter = await dbClient.any(
        "SELECT * FROM test_orders WHERE user_id = $1",
        [2],
      );
      assert.equal(userOrdersAfter.length, 0);
    });
  });

  describe("DELETE with no matches", () => {
    it("should return 0 when no rows match", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.name === "NonExistent"),
        {},
      );

      assert.equal(rowCount, 0);

      // Verify nothing was deleted
      const count = await dbClient.one("SELECT COUNT(*) FROM test_products");
      assert.equal(parseInt(count.count), 8);
    });

    it("should handle impossible conditions gracefully", async () => {
      const rowCount = await executeDelete(
        dbClient,
        schema,
        (q) => q.deleteFrom("test_products").where((p) => p.price! < 0),
        {},
      );

      assert.equal(rowCount, 0);
    });
  });
});
