import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";
/**
 * This file serves as the main entry point for all database-related modules.
 * It exports the local database hook and schema, as well as the online (remote)
 * database client and schema. This provides a single, consistent import path
 * for accessing any database functionality within the native app.
 *
 * @module
 */

const expoDb = openDatabaseSync("db.db", { enableChangeListener: true });
const localdb = drizzle(expoDb);

// Also exporting the schema for convenience
export { expoDb, localdb };
