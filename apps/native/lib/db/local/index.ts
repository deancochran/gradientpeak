import { drizzle } from "drizzle-orm/expo-sqlite";
import { useSQLiteContext } from "expo-sqlite";
import * as schema from "./schemas";

/**
 * This file sets up the Drizzle client for the local Expo SQLite database.
 * It uses the `useSQLiteContext` hook to get the database instance provided by the
 * `SQLiteProvider` in the component tree.
 */

// Note: The database client is created dynamically using a hook, so we export the hook itself.

/**
 * A hook to get a typed Drizzle instance for the local database.
 * @returns The Drizzle instance for the local database.
 */
export function useDb() {
  const sqlite = useSQLiteContext();
  const db = drizzle(sqlite, { schema });
  return db;
}

// Also exporting the schema for convenience
export { schema };
