import { useMigrations as useDrizzleMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useDb } from "./index";

/**
 * Hook to run database migrations for the local SQLite database.
 * This wraps the Drizzle useMigrations hook and provides our local database instance.
 */
export function useMigrations(migrations: any) {
  const db = useDb();
  return useDrizzleMigrations(db, migrations);
}
