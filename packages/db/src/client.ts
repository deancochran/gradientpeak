import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type DbSchema = typeof schema;

export const pool = new Pool({
  connectionString: resolveDatabaseUrl(process.env),
});

export const db = drizzle({
  client: pool,
  schema,
  casing: "snake_case",
});

export type DrizzleDbClient = typeof db;

export interface DbClientLike<TFullSchema = DbSchema> {
  readonly schema: TFullSchema;
}

export interface DbConnectionConfig {
  readonly url: string;
}

export function assertDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE_URL is required for Drizzle connections.");
  }

  return url;
}

export function resolveDatabaseUrl(
  env: Record<string, string | undefined>,
  keys: readonly string[] = ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"],
): string {
  for (const key of keys) {
    const value = env[key];

    if (value) {
      return value;
    }
  }

  return assertDatabaseUrl(undefined);
}

export function defineDbConnection(url: string | undefined): DbConnectionConfig {
  return {
    url: assertDatabaseUrl(url),
  };
}
