/**
 * Integration tests for INSERT operations with PostgreSQL
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { strict as assert } from "node:assert";
import { createSchema } from "@tinqerjs/tinqer";
import { executeInsert } from "@tinqerjs/pg-promise-adapter";
import { db as dbClient } from "./shared-db.js";

// Define types for test tables
interface TestSchema {
  products: {
    id?: number;
    name: string;
    price?: number;
    category?: string | null;
    in_stock?: boolean;
    description?: string | null;
    created_at?: Date;
    metadata?: string;
  };
  orders: {
    id?: number;
    customer_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    total_price: number;
    order_date?: Date;
    status?: string;
  };
  customers: {
    id?: number;
    email: string;
    name?: string;
    age?: number;
    is_active?: boolean;
    created_at?: Date;
  };
}

const schema = createSchema<TestSchema>();

describe("INSERT Operations - PostgreSQL Integration", () => {
  before(async () => {
    // Drop existing tables to ensure fresh schema
    await dbClient.none("DROP TABLE IF EXISTS orders CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS products CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS customers CASCADE");

    // Create test tables for INSERT operations
    await dbClient.none(`
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2),
        category VARCHAR(50),
        in_stock BOOLEAN DEFAULT true,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      )
    `);

    await dbClient.none(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending'
      )
    `);

    await dbClient.none(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(100),
        age INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  after(async () => {
    // Drop test tables
    await dbClient.none("DROP TABLE IF EXISTS orders CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS products CASCADE");
    await dbClient.none("DROP TABLE IF EXISTS customers CASCADE");
  });

  beforeEach(async () => {
    // Clear tables before each test
    await dbClient.none("TRUNCATE TABLE orders, products, customers RESTART IDENTITY CASCADE");
  });

  describe("Basic INSERT operations", () => {
    it("should insert a single row with all columns", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q, _) =>
          q.insertInto("products").values({
            name: "Laptop",
            price: 999.99,
            category: "Electronics",
            in_stock: true,
            description: "High-performance laptop",
          }),
        {},
      );

      assert.equal(rowCount, 1);

      // Verify the insert
      const product = await dbClient.one("SELECT * FROM products WHERE name = $1", ["Laptop"]);
      assert.equal(product.name, "Laptop");
      assert.equal(parseFloat(product.price), 999.99);
      assert.equal(product.category, "Electronics");
      assert.equal(product.in_stock, true);
      assert.equal(product.description, "High-performance laptop");
    });

    it("should insert with partial columns (nullable columns)", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q, _) =>
          q.insertInto("products").values({
            name: "Basic Item",
            price: 10.0,
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE name = $1", ["Basic Item"]);
      assert.equal(product.name, "Basic Item");
      assert.equal(parseFloat(product.price), 10.0);
      assert.equal(product.category, null); // Should be null
      assert.equal(product.in_stock, true); // Should use default
    });

    it("should insert with parameters", async () => {
      const params = {
        productName: "Tablet",
        productPrice: 599.99,
        productCategory: "Electronics",
      };

      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q, p: typeof params) =>
          q.insertInto("products").values({
            name: p.productName,
            price: p.productPrice,
            category: p.productCategory,
            in_stock: true,
          }),
        params,
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE name = $1", [
        params.productName,
      ]);
      assert.equal(product.name, "Tablet");
      assert.equal(parseFloat(product.price), 599.99);
    });

    it("should handle boolean values correctly", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Out of Stock Item",
            price: 50.0,
            in_stock: false,
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE name = $1", [
        "Out of Stock Item",
      ]);
      assert.equal(product.in_stock, false);
    });

    it("should handle NULL values explicitly", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Minimal Product",
            price: 25.0,
            category: null,
            description: null,
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE name = $1", [
        "Minimal Product",
      ]);
      assert.equal(product.category, null);
      assert.equal(product.description, null);
    });
  });

  describe("INSERT with optional fields", () => {
    it("should skip undefined parameter values", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q, p: { email: string; name: string; age?: number }) =>
          q.insertInto("customers").values({
            email: p.email,
            name: p.name,
            age: p.age,
          }),
        { email: "optional@example.com", name: "Optional Customer" },
      );

      assert.equal(rowCount, 1);

      const customer = await dbClient.one(
        "SELECT email, name, age FROM customers WHERE email = $1",
        ["optional@example.com"],
      );
      assert.equal(customer.email, "optional@example.com");
      assert.equal(customer.name, "Optional Customer");
      assert.equal(customer.age, null);
    });

    it("should throw when all values are undefined", async () => {
      await assert.rejects(
        async () =>
          executeInsert(
            dbClient,
            schema,
            (q, p: { email?: string }) =>
              q.insertInto("customers").values({
                email: p.email,
              }),
            {},
          ),
        /All provided values were undefined/,
      );
    });
  });

  describe("INSERT with RETURNING clause", () => {
    it("should return inserted row with RETURNING *", async () => {
      const results = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q
            .insertInto("products")
            .values({
              name: "Smartphone",
              price: 799.99,
              category: "Electronics",
            })
            .returning((p) => p),
        {},
      );

      assert(Array.isArray(results));
      assert.equal(results.length, 1);
      assert.equal(results[0]!.name, "Smartphone");
      assert.equal(parseFloat(String(results[0]!.price!)), 799.99);
      assert(results[0]!.id! > 0); // Auto-generated ID
    });

    it("should return specific columns with RETURNING", async () => {
      const results = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q
            .insertInto("products")
            .values({
              name: "Monitor",
              price: 299.99,
              category: "Electronics",
            })
            .returning((p) => ({ id: p.id, name: p.name })),
        {},
      );

      assert(Array.isArray(results));
      assert.equal(results.length, 1);
      assert.equal(results[0]!.name, "Monitor");
      assert(results[0]!.id! > 0);
      // Should not have other columns
      assert(!("price" in results[0]!));
      assert(!("category" in results[0]!));
    });

    it("should return single column with RETURNING", async () => {
      const results = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q
            .insertInto("products")
            .values({
              name: "Keyboard",
              price: 79.99,
            })
            .returning((p) => p.id),
        {},
      );

      assert(Array.isArray(results));
      assert.equal(results.length, 1);
      // Note: Currently returns {id: number}, not just number (type mismatch to fix later)
      assert(typeof (results[0]! as unknown as { id: number }).id === "number");
      assert((results[0]! as unknown as { id: number }).id > 0);
    });
  });

  describe("Complex INSERT scenarios", () => {
    it("should handle special characters in strings", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Product with 'quotes' and \"double quotes\"",
            price: 100.0,
            description: "Description with\nnewlines\tand\ttabs",
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE price = $1", [100.0]);
      assert(product.name.includes("'quotes'"));
      assert(product.name.includes('"double quotes"'));
      assert(product.description.includes("\n"));
      assert(product.description.includes("\t"));
    });

    it("should handle Unicode characters", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Product with émoji 🚀 and 中文",
            price: 88.88,
            category: "Special ñ категория",
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE price = $1", [88.88]);
      assert(product.name.includes("🚀"));
      assert(product.name.includes("中文"));
      assert(product.category.includes("ñ"));
    });

    it("should handle numeric edge cases", async () => {
      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Edge Case Product",
            price: 0.01, // Very small
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE name = $1", [
        "Edge Case Product",
      ]);
      assert.equal(parseFloat(product.price), 0.01);
    });

    it("should handle timestamp values", async () => {
      const testDate = new Date("2024-01-15T10:30:00Z");

      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q, params) =>
          q.insertInto("orders").values({
            customer_id: 1,
            product_id: 1,
            quantity: 2,
            unit_price: 50.0,
            total_price: 100.0,
            order_date: params.testDate,
            status: "completed",
          }),
        { testDate },
      );

      assert.equal(rowCount, 1);

      const order = await dbClient.one("SELECT * FROM orders WHERE customer_id = $1", [1]);
      assert.equal(order.status, "completed");
      // Date comparison might need timezone handling
      assert(order.order_date instanceof Date);
    });

    it("should handle JSONB columns", async () => {
      const metadata = {
        tags: ["featured", "bestseller"],
        specifications: {
          weight: "1.5kg",
          dimensions: { width: 30, height: 20, depth: 2 },
        },
      };

      const rowCount = await executeInsert(
        dbClient,
        schema,
        (q, params) =>
          q.insertInto("products").values({
            name: "Product with Metadata",
            price: 199.99,
            metadata: params.metadataJson,
          }),
        { metadataJson: JSON.stringify(metadata) },
      );

      assert.equal(rowCount, 1);

      const product = await dbClient.one("SELECT * FROM products WHERE name = $1", [
        "Product with Metadata",
      ]);
      assert.deepEqual(product.metadata, metadata);
    });
  });

  describe("INSERT with unique constraints", () => {
    it("should handle unique constraint violations gracefully", async () => {
      // First insert
      await executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("customers").values({
            email: "test@example.com",
            name: "Test User",
            age: 30,
          }),
        {},
      );

      // Second insert with same email should fail
      try {
        await executeInsert(
          dbClient,
          schema,
          (q) =>
            q.insertInto("customers").values({
              email: "test@example.com",
              name: "Another User",
              age: 25,
            }),
          {},
        );
        assert.fail("Should have thrown unique constraint error");
      } catch (error: unknown) {
        assert(
          (error as Error).message.includes("duplicate key") ||
            (error as Error).message.includes("unique"),
        );
      }
    });
  });

  describe("Multiple related INSERTs", () => {
    it("should handle multiple inserts in sequence", async () => {
      // Insert customer
      const customerResults = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q
            .insertInto("customers")
            .values({
              email: "john@example.com",
              name: "John Doe",
              age: 35,
            })
            .returning((c) => c.id),
        {},
      );

      const customerId = (customerResults[0]! as unknown as { id: number }).id;

      // Insert product
      const productResults = await executeInsert(
        dbClient,
        schema,
        (q) =>
          q
            .insertInto("products")
            .values({
              name: "Test Product",
              price: 49.99,
              category: "Test",
            })
            .returning((p) => p.id),
        {},
      );

      const productId = (productResults[0]! as unknown as { id: number }).id;

      // Insert order referencing both
      const orderCount = await executeInsert(
        dbClient,
        schema,
        (q, params) =>
          q.insertInto("orders").values({
            customer_id: params.customerId,
            product_id: params.productId,
            quantity: 3,
            unit_price: 49.99,
            total_price: 149.97,
          }),
        { customerId, productId },
      );

      assert.equal(orderCount, 1);

      // Verify all inserts
      const order = await dbClient.one(
        "SELECT * FROM orders WHERE customer_id = $1 AND product_id = $2",
        [customerId, productId],
      );
      assert.equal(order.quantity, 3);
      assert.equal(parseFloat(order.total_price), 149.97);
    });
  });
});
