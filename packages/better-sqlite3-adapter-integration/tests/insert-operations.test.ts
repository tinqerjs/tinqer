/**
 * Integration tests for INSERT operations with Better SQLite3
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { strict as assert } from "node:assert";
import { createSchema } from "@tinqerjs/tinqer";
import { executeInsert } from "@tinqerjs/better-sqlite3-adapter";
import Database from "better-sqlite3";

// Use isolated in-memory database for INSERT tests
const dbClient: Database.Database = new Database(":memory:");

// Define types for test tables
// Note: SQLite doesn't have a boolean type, it uses INTEGER (0/1)
interface TestSchema {
  products: {
    id?: number;
    name: string;
    price?: number;
    category?: string | null;
    in_stock?: number; // SQLite uses INTEGER (0/1) for boolean values
    description?: string | null;
    created_at?: string;
    metadata?: string;
  };
  orders: {
    id?: number;
    customer_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    total_price: number;
    order_date?: string;
    status?: string;
  };
  customers: {
    id?: number;
    email: string;
    name?: string;
    age?: number;
    is_active?: number; // SQLite uses INTEGER (0/1) for boolean values
    created_at?: string;
  };
}

const schema = createSchema<TestSchema>();

describe("INSERT Operations - SQLite Integration", () => {
  before(() => {
    // Enable foreign key constraints in SQLite
    dbClient.exec("PRAGMA foreign_keys = ON");

    // Drop existing tables to ensure fresh schema
    dbClient.exec("DROP TABLE IF EXISTS orders");
    dbClient.exec("DROP TABLE IF EXISTS products");
    dbClient.exec("DROP TABLE IF EXISTS customers");

    // Create test tables for INSERT operations
    dbClient.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL,
        category TEXT,
        in_stock INTEGER DEFAULT 1,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )
    `);

    dbClient.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        order_date TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending'
      )
    `);

    dbClient.exec(`
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        age INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  after(() => {
    // Drop test tables
    dbClient.exec("DROP TABLE IF EXISTS orders");
    dbClient.exec("DROP TABLE IF EXISTS products");
    dbClient.exec("DROP TABLE IF EXISTS customers");
    // Close isolated database
    dbClient.close();
  });

  beforeEach(() => {
    // Clear tables before each test
    dbClient.exec("DELETE FROM orders");
    dbClient.exec("DELETE FROM products");
    dbClient.exec("DELETE FROM customers");
    // Reset auto-increment counters
    dbClient.exec("DELETE FROM sqlite_sequence WHERE name IN ('orders', 'products', 'customers')");
  });

  describe("Basic INSERT operations", () => {
    it("should insert a single row with all columns", () => {
      const rowCount = executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Laptop",
            price: 999.99,
            category: "Electronics",
            in_stock: 1, // SQLite uses 0/1 for boolean values
            description: "High-performance laptop",
          }),
        {},
      );

      assert.equal(rowCount, 1);

      // Verify the insert
      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Laptop") as TestSchema["products"];
      assert.equal(product.name, "Laptop");
      assert.equal(product.price, 999.99);
      assert.equal(product.category, "Electronics");
      assert.equal(product.in_stock, 1); // SQLite stores booleans as 0/1
      assert.equal(product.description, "High-performance laptop");
    });

    it("should insert with partial columns (nullable columns)", () => {
      const rowCount = executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Basic Item",
            price: 10.0,
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Basic Item") as TestSchema["products"];
      assert.equal(product.name, "Basic Item");
      assert.equal(product.price, 10.0);
      assert.equal(product.category, null); // Should be null
      assert.equal(product.in_stock, 1); // Should use default (true = 1)
    });

    it("should insert with parameters", () => {
      const params = {
        productName: "Tablet",
        productPrice: 599.99,
        productCategory: "Electronics",
      };

      const rowCount = executeInsert(
        dbClient,
        schema,
        (q, p: typeof params) =>
          q.insertInto("products").values({
            name: p.productName,
            price: p.productPrice,
            category: p.productCategory,
            in_stock: 1, // SQLite uses 0/1 for boolean values
          }),
        params,
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Tablet") as TestSchema["products"];
      assert.equal(product.name, "Tablet");
      assert.equal(product.price, 599.99);
    });

    it("should handle boolean values correctly", () => {
      const rowCount = executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Out of Stock Item",
            price: 50.0,
            in_stock: 0, // SQLite uses 0/1 for boolean values
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Out of Stock Item") as TestSchema["products"];
      assert.equal(product.in_stock, 0); // false = 0 in SQLite
    });

    it("should handle NULL values explicitly", () => {
      const rowCount = executeInsert(
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

      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Minimal Product") as TestSchema["products"];
      assert.equal(product.category, null);
      assert.equal(product.description, null);
    });
  });

  describe("INSERT with optional fields", () => {
    it("should skip undefined parameter values", () => {
      const rowCount = executeInsert(
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

      const customer = dbClient
        .prepare("SELECT email, name, age FROM customers WHERE email = ?")
        .get("optional@example.com") as TestSchema["customers"];
      assert.equal(customer.email, "optional@example.com");
      assert.equal(customer.name, "Optional Customer");
      assert.equal(customer.age, null);
    });

    it("should throw when all values are undefined", () => {
      assert.throws(
        () =>
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

  describe("Complex INSERT scenarios", () => {
    it("should handle special characters in strings", () => {
      const rowCount = executeInsert(
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

      const product = dbClient
        .prepare("SELECT * FROM products WHERE price = ?")
        .get(100.0) as TestSchema["products"];
      assert(product.name.includes("'quotes'"));
      assert(product.name.includes('"double quotes"'));
      assert(product.description!.includes("\n"));
      assert(product.description!.includes("\t"));
    });

    it("should handle Unicode characters", () => {
      const rowCount = executeInsert(
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

      const product = dbClient
        .prepare("SELECT * FROM products WHERE price = ?")
        .get(88.88) as TestSchema["products"];
      assert(product.name.includes("🚀"));
      assert(product.name.includes("中文"));
      assert(product.category!.includes("ñ"));
    });

    it("should handle numeric edge cases", () => {
      const rowCount = executeInsert(
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

      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Edge Case Product") as TestSchema["products"];
      assert.equal(product.price, 0.01);
    });

    it("should handle datetime values", () => {
      const testDate = new Date("2024-01-15T10:30:00Z").toISOString();

      const rowCount = executeInsert(
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

      const order = dbClient
        .prepare("SELECT * FROM orders WHERE customer_id = ?")
        .get(1) as TestSchema["orders"];
      assert.equal(order.status, "completed");
      // SQLite stores dates as strings in ISO format
      assert(typeof order.order_date === "string");
      assert(order.order_date.includes("2024-01-15"));
    });

    it("should handle JSON data as TEXT", () => {
      const metadata = {
        tags: ["featured", "bestseller"],
        specifications: {
          weight: "1.5kg",
          dimensions: { width: 30, height: 20, depth: 2 },
        },
      };

      const rowCount = executeInsert(
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

      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Product with Metadata") as TestSchema["products"];
      const parsedMetadata = JSON.parse(product.metadata!);
      assert.deepEqual(parsedMetadata, metadata);
    });
  });

  describe("INSERT with unique constraints", () => {
    it("should handle unique constraint violations gracefully", () => {
      // First insert
      executeInsert(
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
        executeInsert(
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
        assert((error as Error).message.includes("UNIQUE constraint"));
      }
    });
  });

  describe("Multiple related INSERTs", () => {
    it("should handle multiple inserts in sequence", () => {
      // Insert customer
      const customerCount = executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("customers").values({
            email: "john@example.com",
            name: "John Doe",
            age: 35,
          }),
        {},
      );

      assert.equal(customerCount, 1);

      // Get the inserted customer ID
      const customer = dbClient
        .prepare("SELECT id FROM customers WHERE email = ?")
        .get("john@example.com") as TestSchema["customers"];
      const customerId: number = customer.id!;

      // Insert product
      const productCount = executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Test Product",
            price: 49.99,
            category: "Test",
          }),
        {},
      );

      assert.equal(productCount, 1);

      // Get the inserted product ID
      const product = dbClient
        .prepare("SELECT id FROM products WHERE name = ?")
        .get("Test Product") as TestSchema["products"];
      const productId: number = product.id!;

      // Insert order referencing both
      const orderCount = executeInsert(
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
      const order = dbClient
        .prepare("SELECT * FROM orders WHERE customer_id = ? AND product_id = ?")
        .get(customerId, productId) as TestSchema["orders"];
      assert.equal(order.quantity, 3);
      assert.equal(order.total_price, 149.97);
    });
  });

  describe("SQLite-specific behaviors", () => {
    it("should handle SQLite auto-increment primary keys", () => {
      // Insert multiple products
      for (let i = 1; i <= 3; i++) {
        executeInsert(
          dbClient,
          schema,
          (q, params) =>
            q.insertInto("products").values({
              name: params.name,
              price: params.price,
            }),
          { name: `Product ${i}`, price: i * 10 },
        );
      }

      const products = dbClient.prepare("SELECT id, name FROM products ORDER BY id").all() as {
        id: number;
      }[];
      assert.equal(products.length, 3);
      // Auto-increment IDs should be sequential
      assert.equal(products[0]!.id, 1);
      assert.equal(products[1]!.id, 2);
      assert.equal(products[2]!.id, 3);
    });

    it("should handle SQLite's flexible typing", () => {
      // SQLite allows flexible types
      const rowCount = executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("products").values({
            name: "Flexible Type Product",
            price: "99.99" as unknown as number, // String that can be coerced to number
            category: 123 as unknown as string, // Number in text field
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const product = dbClient
        .prepare("SELECT * FROM products WHERE name = ?")
        .get("Flexible Type Product") as TestSchema["products"];
      // SQLite will store these as provided
      assert(product.price == 99.99); // May be string or number depending on affinity
      assert(product.category == (123 as unknown as string));
    });

    it("should handle CURRENT_TIMESTAMP default", () => {
      const rowCount = executeInsert(
        dbClient,
        schema,
        (q) =>
          q.insertInto("customers").values({
            email: "timestamp@test.com",
            name: "Timestamp Test",
          }),
        {},
      );

      assert.equal(rowCount, 1);

      const customer = dbClient
        .prepare("SELECT * FROM customers WHERE email = ?")
        .get("timestamp@test.com") as TestSchema["customers"];
      assert(customer.created_at); // Should have a timestamp
      // Verify it's a valid ISO timestamp string
      assert(customer.created_at.match(/^\d{4}-\d{2}-\d{2}/));
    });
  });
});
