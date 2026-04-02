import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";

import * as schema from "./schema";

export type DbSchema = typeof schema;

export const db = drizzle({
  client: sql,
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
