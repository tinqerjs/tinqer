/**
 * Integration tests for UPDATE operations with PostgreSQL
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { strict as assert } from "node:assert";
import { createSchema } from "@tinqerjs/tinqer";
import { executeUpdate } from "@tinqerjs/pg-promise-adapter";
import { db as dbClient } from "./shared-db.js";

// Define types for test tables
interface TestSchema {
  inventory: {
    id?: number;
    product_name: string;
    quantity: number;
    price?: number;
    last_updated?: Date;
    status?: string;
    warehouse_location?: string;
    is_active?: boolean;
    notes?: string;
  };
  user_profiles: {
    id?: number;
    username: string;
    email: string;
    full_name?: string;
    age?: number | null;
    bio?: string | null;
    is_verified?: boolean;
    last_login?: Date;
    settings?: string;
    created_at?: Date;
    updated_at?: Date;
  };
  product_reviews: {
    id?: number;
    product_id: number;
    user_id: number;
    rating: number;
    review_text?: string;
    is_verified_purchase?: boolean;
    helpful_count?: number;
    created_at?: Date;
    updated_at?: Date;
  };
}

const schema = createSchema<TestSchema>();

describe("UPDATE Operations - PostgreSQL Integration", () => {
  before(async () => {
    // Create test tables for UPDATE operations
    await dbClient.none(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        product_name VARCHAR(100) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        price DECIMAL(10, 2),
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'available',
        warehouse_location VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        notes TEXT
      )
    `);

    await dbClient.none(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        full_name VARCHAR(100),
        age INTEGER,
        bio TEXT,
        is_verified BOOLEAN DEFAULT false,
        last_login TIMESTAMP,
        settings JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbClient.none(`
      CREATE TABLE IF NOT EXISTS product_reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        review_text TEXT,
        is_verified_purchase BOOLEAN DEFAULT false,
        helpful_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  after(async () => {
    // Drop test tables
    await dbClient.none("DROP TABLE IF EXISTS inventory CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS user_profiles CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS product_reviews CASCADE");
  });

  beforeEach(async () => {
    // Clear and seed test data
    await dbClient.none(
      "TRUNCATE TABLE inventory, user_profiles, product_reviews RESTART IDENTITY CASCADE",
    );

    // Seed inventory data
    await dbClient.none(`
      INSERT INTO inventory (product_name, quantity, price, status, warehouse_location)
      VALUES
        ('Laptop', 10, 999.99, 'available', 'Warehouse A'),
        ('Mouse', 50, 29.99, 'available', 'Warehouse B'),
        ('Keyboard', 0, 79.99, 'out_of_stock', 'Warehouse A'),
        ('Monitor', 5, 299.99, 'low_stock', 'Warehouse C'),
        ('Headphones', 25, 149.99, 'available', 'Warehouse B')
    `);

    // Seed user profiles
    await dbClient.none(`
      INSERT INTO user_profiles (username, email, full_name, age, bio, is_verified)
      VALUES
        ('john_doe', 'john@example.com', 'John Doe', 30, 'Software developer', true),
        ('jane_smith', 'jane@example.com', 'Jane Smith', 25, 'Designer', false),
        ('bob_wilson', 'bob@example.com', 'Bob Wilson', 35, NULL, true),
        ('alice_jones', 'alice@example.com', 'Alice Jones', 28, 'Product manager', false)
    `);

    // Seed product reviews
    await dbClient.none(`
      INSERT INTO product_reviews (product_id, user_id, rating, review_text, is_verified_purchase)
      VALUES
        (1, 1, 5, 'Excellent product!', true),
        (1, 2, 4, 'Good value for money', false),
        (2, 1, 3, 'Average quality', true),
        (2, 3, 5, 'Highly recommend', true)
    `);
  });

  describe("Basic UPDATE operations", () => {
    it("should update single column with WHERE clause", async () => {
      const rowCount = await executeUpdate(
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

      const product = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Laptop",
      ]);
      assert.equal(product.quantity, 20);
    });

    it("should update multiple columns", async () => {
      const rowCount = await executeUpdate(
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

      const product = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Keyboard",
      ]);
      assert.equal(product.quantity, 15);
      assert.equal(parseFloat(product.price), 89.99);
      assert.equal(product.status, "available");
    });

    it("should update with parameters", async () => {
      const params = {
        newQuantity: 100,
        newPrice: 24.99,
        productName: "Mouse",
      };

      const rowCount = await executeUpdate(
        dbClient,
        schema,
        (q, p) =>
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

      const product = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        params.productName,
      ]);
      assert.equal(product.quantity, 100);
      assert.equal(parseFloat(product.price), 24.99);
    });

    it("should update boolean values", async () => {
      const rowCount = await executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("user_profiles")
            .set({ is_verified: true })
            .where((u) => u.username === "jane_smith"),
        {},
      );

      assert.equal(rowCount, 1);

      const user = await dbClient.one("SELECT * FROM user_profiles WHERE username = $1", [
        "jane_smith",
      ]);
      assert.equal(user.is_verified, true);
    });

    it("should update with NULL values", async () => {
      const rowCount = await executeUpdate(
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

      const user = await dbClient.one("SELECT * FROM user_profiles WHERE username = $1", [
        "john_doe",
      ]);
      assert.equal(user.bio, null);
      assert.equal(user.age, null);
    });
  });

  describe("UPDATE with optional fields", () => {
    it("should skip undefined parameter values", async () => {
      const rowCount = await executeUpdate(
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

      const profile = await dbClient.one(
        "SELECT full_name, bio, age FROM user_profiles WHERE username = $1",
        ["jane_smith"],
      );
      assert.equal(profile.full_name, "Jane A. Smith");
      assert.equal(profile.bio, "Designer");
      assert.equal(profile.age, 25);
    });

    it("should throw when all values are undefined", async () => {
      await assert.rejects(
        async () =>
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
    it("should update with AND conditions", async () => {
      const rowCount = await executeUpdate(
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

      const monitor = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Monitor",
      ]);
      assert.equal(monitor.status, "reorder_needed");
    });

    it("should update with OR conditions", async () => {
      const rowCount = await executeUpdate(
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

      const keyboard = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Keyboard",
      ]);
      assert.equal(keyboard.warehouse_location, "Warehouse D");

      const monitor = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Monitor",
      ]);
      assert.equal(monitor.warehouse_location, "Warehouse D");
    });

    it("should update with complex nested conditions", async () => {
      const rowCount = await executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ is_active: false })
            .where(
              (i) =>
                (i.quantity === 0 && i.status === "out_of_stock") ||
                (i.price! > 500 && i.quantity < 10),
            ),
        {},
      );

      // Keyboard (quantity=0 && status="out_of_stock") OR Laptop (price=999.99 && quantity=10)
      // Note: Laptop has exactly 10, not < 10, so only Keyboard should be updated
      assert.equal(rowCount, 1);

      const keyboard = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Keyboard",
      ]);
      assert.equal(keyboard.is_active, false);
    });

    it("should update with string operations", async () => {
      const rowCount = await executeUpdate(
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

      const laptop = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Laptop",
      ]);
      assert.equal(laptop.notes, "Premium product");
    });

    it("should update with IN-like conditions", async () => {
      const targetProducts = ["Mouse", "Keyboard", "Headphones"];

      const rowCount = await executeUpdate(
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

      const results = await dbClient.many(
        "SELECT product_name FROM inventory WHERE warehouse_location = $1",
        ["Warehouse E"],
      );
      assert.equal(results.length, 3);
      const names = results.map((r) => r.product_name).sort();
      assert.deepEqual(names, ["Headphones", "Keyboard", "Mouse"]);
    });
  });

  describe("UPDATE with RETURNING clause", () => {
    it("should return updated rows with RETURNING *", async () => {
      const results = await executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("inventory")
            .set({ quantity: 30, status: "available" })
            .where((i) => i.product_name === "Monitor")
            .returning((i) => i),
        {},
      );

      assert(Array.isArray(results));
      assert.equal(results.length, 1);
      assert.equal(results[0]!.product_name, "Monitor");
      assert.equal(results[0]!.quantity, 30);
      assert.equal(results[0]!.status, "available");
    });

    it("should return specific columns with RETURNING", async () => {
      const results = await executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("user_profiles")
            .set({ age: 31, bio: "Updated bio" })
            .where((u) => u.username === "john_doe")
            .returning((u) => ({
              id: u.id,
              username: u.username,
              age: u.age,
            })),
        {},
      );

      assert(Array.isArray(results));
      assert.equal(results.length, 1);
      assert.equal(results[0]!.username, "john_doe");
      assert.equal(results[0]!.age, 31);
      assert(!("bio" in results[0]!)); // Should not include bio
    });

    it("should return single column with RETURNING", async () => {
      const results = await executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("product_reviews")
            .set({ helpful_count: 10 })
            .where((r) => r.rating === 5)
            .returning((r) => r.id),
        {},
      );

      assert(Array.isArray(results));
      assert.equal(results.length, 2); // Two reviews with rating 5
      // Note: Currently returns {id: number}, not just number (type mismatch to fix later)
      results.forEach((result) => {
        assert(typeof (result as unknown as { id: number }).id === "number");
        assert((result as unknown as { id: number }).id > 0);
      });
    });
  });

  describe("UPDATE multiple rows", () => {
    it("should update all matching rows", async () => {
      const rowCount = await executeUpdate(
        dbClient,
        schema,
        (q) =>
          q
            .update("user_profiles")
            .set({ is_verified: true })
            .where((u) => u.is_verified === false),
        {},
      );

      assert.equal(rowCount, 2); // jane_smith and alice_jones

      const unverifiedCount = await dbClient.one(
        "SELECT COUNT(*) FROM user_profiles WHERE is_verified = false",
      );
      assert.equal(parseInt(unverifiedCount.count), 0);
    });

    it("should update with allowFullTableUpdate", async () => {
      const rowCount = await executeUpdate(
        dbClient,
        schema,
        (q) => q.update("product_reviews").set({ helpful_count: 0 }).allowFullTableUpdate(),
        {},
      );

      assert.equal(rowCount, 4); // All reviews

      const totalHelpful = await dbClient.one(
        "SELECT SUM(helpful_count) as total FROM product_reviews",
      );
      assert.equal(parseInt(totalHelpful.total || 0), 0);
    });

    it("should throw error when UPDATE has no WHERE and no allow flag", async () => {
      try {
        await executeUpdate(
          dbClient,
          schema,
          (q) => q.update("inventory").set({ quantity: 0 }),
          {},
        );
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
    it("should update timestamp columns", async () => {
      const newDate = new Date("2024-06-01T12:00:00Z");

      const rowCount = await executeUpdate(
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

      const user = await dbClient.one("SELECT * FROM user_profiles WHERE username = $1", [
        "bob_wilson",
      ]);
      assert(user.last_login instanceof Date);
      // Compare timestamps (might need timezone handling)
      assert.equal(user.last_login.toISOString(), newDate.toISOString());
    });

    it("should update with CURRENT_TIMESTAMP", async () => {
      // Note: We can't directly use CURRENT_TIMESTAMP in the LINQ syntax
      // This would need to be handled differently in real usage
      const beforeUpdate = new Date();

      const rowCount = await executeUpdate(
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
        { currentTime: new Date() },
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM inventory WHERE product_name = $1", [
        "Headphones",
      ]);
      assert(product.last_updated >= beforeUpdate);
    });
  });

  describe("UPDATE with JSONB columns", () => {
    it("should update JSONB data", async () => {
      const newSettings = {
        theme: "dark",
        notifications: true,
        language: "en",
        privacy: {
          profileVisible: true,
          emailVisible: false,
        },
      };

      const rowCount = await executeUpdate(
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

      const user = await dbClient.one("SELECT * FROM user_profiles WHERE username = $1", [
        "alice_jones",
      ]);
      assert.deepEqual(user.settings, newSettings);
    });
  });

  describe("UPDATE with special characters", () => {
    it("should handle special characters in strings", async () => {
      const rowCount = await executeUpdate(
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

      const product = await dbClient.one("SELECT * FROM inventory WHERE id = $1", [1]);
      assert(product.notes.includes("'quotes'"));
      assert(product.notes.includes('"double"'));
      assert(product.notes.includes("\n"));
      assert(product.notes.includes("\t"));
    });

    it("should handle Unicode characters", async () => {
      const rowCount = await executeUpdate(
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

      const user = await dbClient.one("SELECT * FROM user_profiles WHERE id = $1", [2]);
      assert(user.bio.includes("你好"));
      assert(user.bio.includes("🎉"));
      assert(user.bio.includes("Здравствуйте"));
    });
  });
});
