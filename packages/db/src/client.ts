import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { relationalSchema, type schema } from "./schema";

export type DbSchema = typeof schema;

export const pool = new Pool({
  connectionString: resolveDatabaseUrl(process.env),
});

export const db = drizzle({
  client: pool,
  schema: relationalSchema,
  casing: "snake_case",
});

export type DrizzleDbClient = typeof db;

export interface DbClientLike<TFullSchema = DbSchema> {
  readonly schema: TFullSchema;
}

export interface DbConnectionConfig {
  readonly url: string;
}

/** Creates a schema-bound, closeable client for isolated local tooling and test lanes. */
export function createDbClient(config: DbConnectionConfig, options: PoolConfig = {}) {
  const pool = new Pool({ ...options, connectionString: config.url });
  const db = drizzle({
    client: pool,
    schema: relationalSchema,
    casing: "snake_case",
  });
  return { db, close: () => pool.end() };
}

export function assertDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE_URL is required for Drizzle connections.");
  }

  return url;
}

export function resolveDatabaseUrl(
  env: Record<string, string | undefined>,
  keys: readonly string[] = ["DATABASE_URL", "POSTGRES_URL"],
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
