/**
 * Global hooks for all integration tests
 */

import { db } from "./shared-db.js";
import { closeDatabase } from "./shared-db.js";

const shouldForceRun = process.env.TINQER_PG_INTEGRATION === "1";

before(async function () {
  try {
    await db.one("SELECT 1 AS ok");
  } catch (error) {
    if (shouldForceRun) {
      throw error;
    }
    console.warn(
      "Skipping PostgreSQL integration tests: unable to connect to DATABASE_URL or localhost.",
    );
    this.skip();
  }
});

// This runs after all tests in all files are complete
after(() => {
  console.log("Closing database connection...");
  closeDatabase();
});
