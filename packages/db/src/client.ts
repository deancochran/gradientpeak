export type DbSchema = typeof import("./schema/index").schema;

export interface DbClientLike<TFullSchema = DbSchema> {
  readonly schema: TFullSchema;
}

export function assertDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE_URL is required for Drizzle connections.");
  }

  return url;
}
