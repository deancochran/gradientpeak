/**
 * This file serves as the main entry point for all database-related modules.
 * It exports the local database hook and schema, as well as the online (remote)
 * database client and schema. This provides a single, consistent import path
 * for accessing any database functionality within the native app.
 *
 * @module
 */

// Export the local database hook and schema
export { schema as localSchema, useDb as useLocalDb } from "./local";

// Export the online database client and schema
export { db as onlineDb, onlineSchema } from "./online";
