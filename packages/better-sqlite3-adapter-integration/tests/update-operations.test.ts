/**
 * Integration tests for UPDATE operations with Better SQLite3
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { strict as assert } from "node:assert";
import { createSchema } from "@tinqerjs/tinqer";
import { executeUpdate } from "@tinqerjs/better-sqlite3-adapter";
import Database from "better-sqlite3";

// Use isolated in-memory database for UPDATE tests
const dbClient: Database.Database = new Database(":memory:");

// Define types for test tables
// Note: SQLite doesn't have a boolean type, it uses INTEGER (0/1)
interface TestSchema {
  inventory: {
    id?: number;
    product_name: string;
    quantity: number;
    price?: number;
    last_updated?: string;
    status?: string;
    warehouse_location?: string;
    is_active?: number; // SQLite uses INTEGER (0/1) for boolean values
    notes?: string;
  };
  user_profiles: {
    id?: number;
    username: string;
    email: string;
    full_name?: string;
    age?: number | null;
    bio?: string | null;
    is_verified?: number; // SQLite uses INTEGER (0/1) for boolean values
    last_login?: string;
    settings?: string;
    created_at?: string;
    updated_at?: string;
  };
  product_reviews: {
    id?: number;
    product_id: number;
    user_id: number;
    rating: number;
    review_text?: string;
    is_verified_purchase?: number; // SQLite uses INTEGER (0/1) for boolean values
    helpful_count?: number;
    created_at?: string;
    updated_at?: string;
  };
}

const schema = createSchema<TestSchema>();

describe("UPDATE Operations - SQLite Integration", () => {
  before(() => {
    // Enable foreign key constraints in SQLite
    dbClient.exec("PRAGMA foreign_keys = ON");

    // Drop existing tables to ensure fresh schema
    dbClient.exec("DROP TABLE IF EXISTS product_reviews");
    dbClient.exec("DROP TABLE IF EXISTS user_profiles");
    dbClient.exec("DROP TABLE IF EXISTS inventory");

    // Create test tables for UPDATE operations
    dbClient.exec(`
      CREATE TABLE inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        price REAL,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'available',
        warehouse_location TEXT,
        is_active INTEGER DEFAULT 1,
        notes TEXT
      )
    `);

    dbClient.exec(`
      CREATE TABLE user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        age INTEGER,
        bio TEXT,
        is_verified INTEGER DEFAULT 0,
        last_login TEXT,
        settings TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    dbClient.exec(`
      CREATE TABLE product_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        review_text TEXT,
        is_verified_purchase INTEGER DEFAULT 0,
        helpful_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  after(() => {
    // Drop test tables
    dbClient.exec("DROP TABLE IF EXISTS inventory");
    dbClient.exec("DROP TABLE IF EXISTS user_profiles");
    dbClient.exec("DROP TABLE IF EXISTS product_reviews");
    // Close isolated database
    dbClient.close();
  });

  beforeEach(() => {
    // Clear and seed test data
    dbClient.exec("DELETE FROM inventory");
    dbClient.exec("DELETE FROM user_profiles");
    dbClient.exec("DELETE FROM product_reviews");
    // Reset auto-increment counters
    dbClient.exec(
      "DELETE FROM sqlite_sequence WHERE name IN ('inventory', 'user_profiles', 'product_reviews')",
    );

    // Seed inventory data
    dbClient.exec(`
      INSERT INTO inventory (product_name, quantity, price, status, warehouse_location)
      VALUES
        ('Laptop', 10, 999.99, 'available', 'Warehouse A'),
        ('Mouse', 50, 29.99, 'available', 'Warehouse B'),
        ('Keyboard', 0, 79.99, 'out_of_stock', 'Warehouse A'),
        ('Monitor', 5, 299.99, 'low_stock', 'Warehouse C'),
        ('Headphones', 25, 149.99, 'available', 'Warehouse B')
    `);

    // Seed user profiles
    dbClient.exec(`
      INSERT INTO user_profiles (username, email, full_name, age, bio, is_verified)
      VALUES
        ('john_doe', 'john@example.com', 'John Doe', 30, 'Software developer', 1),
        ('jane_smith', 'jane@example.com', 'Jane Smith', 25, 'Designer', 0),
        ('bob_wilson', 'bob@example.com', 'Bob Wilson', 35, NULL, 1),
        ('alice_jones', 'alice@example.com', 'Alice Jones', 28, 'Product manager', 0)
    `);

    // Seed product reviews
    dbClient.exec(`
      INSERT INTO product_reviews (product_id, user_id, rating, review_text, is_verified_purchase)
      VALUES
        (1, 1, 5, 'Excellent product!', 1),
        (1, 2, 4, 'Good value for money', 0),
        (2, 1, 3, 'Average quality', 1),
        (2, 3, 5, 'Highly recommend', 1)
    `);
  });

  describe("Basic UPDATE operations", () => {
    it("should update single column with WHERE clause", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ quantity: 20 })
            .where((i) => i.product_name === "Laptop"),
        {},
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Laptop") as TestSchema["inventory"];
      assert.equal(product.quantity, 20);
    });

    it("should update multiple columns", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({
              quantity: 15,
              price: 89.99,
              status: "available",
            })
            .where((i) => i.product_name === "Keyboard"),
        {},
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Keyboard") as TestSchema["inventory"];
      assert.equal(product.quantity, 15);
      assert.equal(product.price, 89.99);
      assert.equal(product.status, "available");
    });

    it("should update with parameters", () => {
      const params = {
        newQuantity: 100,
        newPrice: 24.99,
        productName: "Mouse",
      };

      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q, p: typeof params) =>
          q
            .update("inventory")
            .set({
              quantity: p.newQuantity,
              price: p.newPrice,
            })
            .where((i) => i.product_name === p.productName),
        params,
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get(params.productName) as TestSchema["inventory"];
      assert.equal(product.quantity, 100);
      assert.equal(product.price, 24.99);
    });

    it("should update boolean values", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("user_profiles")
            .set({ is_verified: 1 }) // SQLite uses 0/1 for boolean values
            .where((u) => u.username === "jane_smith"),
        {},
      );

      assert.equal(rowCount, 1);

      const user = dbClient
        .prepare("SELECT * FROM user_profiles WHERE username = ?")
        .get("jane_smith") as TestSchema["user_profiles"];
      assert.equal(user.is_verified, 1); // true = 1 in SQLite
    });

    it("should update with NULL values", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("user_profiles")
            .set({ bio: null, age: null })
            .where((u) => u.username === "john_doe"),
        {},
      );

      assert.equal(rowCount, 1);

      const user = dbClient
        .prepare("SELECT * FROM user_profiles WHERE username = ?")
        .get("john_doe") as TestSchema["user_profiles"];
      assert.equal(user.bio, null);
      assert.equal(user.age, null);
    });
  });

  describe("UPDATE with optional fields", () => {
    it("should skip undefined parameter values", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q, p: { username: string; fullName?: string; bio?: string; age?: number }) =>
          q
            .update("user_profiles")
            .set({
              full_name: p.fullName,
              bio: p.bio,
              age: p.age,
            })
            .where((u) => u.username === p.username),
        { username: "jane_smith", fullName: "Jane A. Smith" },
      );

      assert.equal(rowCount, 1);

      const profile = dbClient
        .prepare("SELECT full_name, bio, age FROM user_profiles WHERE username = ?")
        .get("jane_smith") as TestSchema["user_profiles"];
      assert.equal(profile.full_name, "Jane A. Smith");
      assert.equal(profile.bio, "Designer");
      assert.equal(profile.age, 25);
    });

    it("should throw when all values are undefined", () => {
      assert.throws(
        () =>
          executeUpdate(
            dbClient,
            schema,
            (q, p: { username: string; bio?: string }) =>
              q
                .update("user_profiles")
                .set({
                  bio: p.bio,
                })
                .where((u) => u.username === p.username),
            { username: "john_doe" },
          ),
        /All provided values were undefined/,
      );
    });
  });

  describe("UPDATE with complex WHERE clauses", () => {
    it("should update with AND conditions", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ status: "reorder_needed" })
            .where((i) => i.quantity < 10 && i.status === "low_stock"),
        {},
      );

      assert.equal(rowCount, 1); // Only Monitor matches

      const monitor = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Monitor") as TestSchema["inventory"];
      assert.equal(monitor.status, "reorder_needed");
    });

    it("should update with OR conditions", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ warehouse_location: "Warehouse D" })
            .where((i) => i.status === "out_of_stock" || i.quantity < 6),
        {},
      );

      assert.equal(rowCount, 2); // Keyboard (out_of_stock) and Monitor (quantity = 5)

      const keyboard = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Keyboard") as TestSchema["inventory"];
      assert.equal(keyboard.warehouse_location, "Warehouse D");

      const monitor = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Monitor") as TestSchema["inventory"];
      assert.equal(monitor.warehouse_location, "Warehouse D");
    });

    it("should update with complex nested conditions", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ is_active: 0 }) // SQLite uses 0/1 for boolean values
            .where(
              (i) =>
                (i.quantity === 0 && i.status === "out_of_stock") ||
                (i.price! > 500 && i.quantity < 10),
            ),
        {},
      );

      // Keyboard (quantity=0 && status="out_of_stock") should be updated
      assert.equal(rowCount, 1);

      const keyboard = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Keyboard") as TestSchema["inventory"];
      assert.equal(keyboard.is_active, 0); // false = 0 in SQLite
    });

    it("should update with string operations", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ notes: "Premium product" })
            .where((i) => i.product_name.startsWith("L")),
        {},
      );

      assert.equal(rowCount, 1); // Only Laptop

      const laptop = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Laptop") as TestSchema["inventory"];
      assert.equal(laptop.notes, "Premium product");
    });

    it("should update with IN-like conditions", () => {
      const targetProducts = ["Mouse", "Keyboard", "Headphones"];

      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q, p) =>
          q
            .update("inventory")
            .set({ warehouse_location: "Warehouse E" })
            .where((i) => p.products.includes(i.product_name)),
        { products: targetProducts },
      );

      assert.equal(rowCount, 3);

      const results = dbClient
        .prepare("SELECT product_name FROM inventory WHERE warehouse_location = ?")
        .all("Warehouse E") as { product_name: string }[];
      assert.equal(results.length, 3);
      const names = results.map((r) => r.product_name).sort();
      assert.deepEqual(names, ["Headphones", "Keyboard", "Mouse"]);
    });
  });

  describe("UPDATE multiple rows", () => {
    it("should update all matching rows", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("user_profiles")
            .set({ is_verified: 1 }) // SQLite uses 0/1 for boolean values
            .where((u) => u.is_verified === 0), // SQLite uses 0 for false
        {},
      );

      assert.equal(rowCount, 2); // jane_smith and alice_jones

      const unverifiedCount = dbClient
        .prepare("SELECT COUNT(*) as count FROM user_profiles WHERE is_verified = 0")
        .get() as { count: number };
      assert.equal(unverifiedCount.count, 0);
    });

    it("should update with allowFullTableUpdate", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) => q.update("product_reviews").set({ helpful_count: 0 }).allowFullTableUpdate(),
        {},
      );

      assert.equal(rowCount, 4); // All reviews

      const totalHelpful = dbClient
        .prepare("SELECT SUM(helpful_count) as total FROM product_reviews")
        .get() as { total: number | null };
      assert.equal(totalHelpful.total, 0);
    });

    it("should throw error when UPDATE has no WHERE and no allow flag", () => {
      try {
        executeUpdate(dbClient, schema, (q) => q.update("inventory").set({ quantity: 0 }), {});
        assert.fail("Should have thrown error for missing WHERE clause");
      } catch (error: unknown) {
        assert(
          (error as Error).message.includes("WHERE clause") ||
            (error as Error).message.includes("allowFullTableUpdate"),
        );
      }
    });
  });

  describe("UPDATE with timestamps", () => {
    it("should update datetime columns", () => {
      const newDate = new Date("2024-06-01T12:00:00Z").toISOString();

      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q, params) =>
          q
            .update("user_profiles")
            .set({ last_login: params.newDate })
            .where((u) => u.username === "bob_wilson"),
        { newDate },
      );

      assert.equal(rowCount, 1);

      const user = dbClient
        .prepare("SELECT * FROM user_profiles WHERE username = ?")
        .get("bob_wilson") as TestSchema["user_profiles"];
      // SQLite stores dates as strings
      assert(typeof user.last_login === "string");
      assert(user.last_login.includes("2024-06-01"));
    });

    it("should update with current timestamp", () => {
      const beforeUpdate = new Date();
      const currentTime = new Date().toISOString();

      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q, params) =>
          q
            .update("inventory")
            .set({
              quantity: 50,
              last_updated: params.currentTime,
            })
            .where((i) => i.product_name === "Headphones"),
        { currentTime },
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM inventory WHERE product_name = ?")
        .get("Headphones") as TestSchema["inventory"];
      // Verify the timestamp was updated (as string in SQLite)
      assert(product.last_updated);
      const updatedDate = new Date(product.last_updated);
      assert(updatedDate >= beforeUpdate);
    });
  });

  describe("UPDATE with JSON data", () => {
    it("should update JSON data stored as TEXT", () => {
      const newSettings = {
        theme: "dark",
        notifications: true,
        language: "en",
        privacy: {
          profileVisible: true,
          emailVisible: false,
        },
      };

      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q, params) =>
          q
            .update("user_profiles")
            .set({ settings: params.settingsJson })
            .where((u) => u.username === "alice_jones"),
        { settingsJson: JSON.stringify(newSettings) },
      );

      assert.equal(rowCount, 1);

      const user = dbClient
        .prepare("SELECT * FROM user_profiles WHERE username = ?")
        .get("alice_jones") as TestSchema["user_profiles"];
      const parsedSettings = JSON.parse(user.settings!);
      assert.deepEqual(parsedSettings, newSettings);
    });
  });

  describe("UPDATE with special characters", () => {
    it("should handle special characters in strings", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({
              notes: "Special chars: 'quotes' \"double\" \n newline \t tab",
            })
            .where((i) => i.id === 1),
        {},
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM inventory WHERE id = ?")
        .get(1) as TestSchema["inventory"];
      assert(product.notes!.includes("'quotes'"));
      assert(product.notes!.includes('"double"'));
      assert(product.notes!.includes("\n"));
      assert(product.notes!.includes("\t"));
    });

    it("should handle Unicode characters", () => {
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("user_profiles")
            .set({
              bio: "Unicode test: 你好 🎉 Здравствуйте émoji",
            })
            .where((u) => u.id === 2),
        {},
      );

      assert.equal(rowCount, 1);

      const user = dbClient
        .prepare("SELECT * FROM user_profiles WHERE id = ?")
        .get(2) as TestSchema["user_profiles"];
      assert(user.bio!.includes("你好"));
      assert(user.bio!.includes("🎉"));
      assert(user.bio!.includes("Здравствуйте"));
    });
  });

  describe("SQLite-specific behaviors", () => {
    it("should handle SQLite's type coercion", () => {
      // SQLite allows flexible typing
      const rowCount = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({
              quantity: "50" as unknown as number, // String that will be coerced to number
              price: 99, // Integer that will be stored as REAL
            })
            .where((i) => i.id === 1),
        {},
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM inventory WHERE id = ?")
        .get(1) as TestSchema["inventory"];
      // SQLite will coerce types based on column affinity
      assert(product.quantity == 50);
      assert(product.price == 99);
    });

    it("should handle boolean as 0/1", () => {
      // Test updating with explicit 0/1 and boolean
      const rowCount1 = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ is_active: 0 })
            .where((i) => i.id === 1),
        {},
      );

      assert.equal(rowCount1, 1);

      const product1 = dbClient.prepare("SELECT is_active FROM inventory WHERE id = ?").get(1) as {
        is_active: number;
      };
      assert.equal(product1.is_active, 0);

      const rowCount2 = executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ is_active: 1 }) // SQLite uses 0/1 for boolean values
            .where((i) => i.id === 1),
        {},
      );

      assert.equal(rowCount2, 1);

      const product2 = dbClient.prepare("SELECT is_active FROM inventory WHERE id = ?").get(1) as {
        is_active: number;
      };
      assert.equal(product2.is_active, 1);
    });
  });
});
