export type DbSchema = typeof import("./schema/index").schema;

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
  keys: readonly string[] = ["DATABASE_URL"],
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
