import type { Config } from "drizzle-kit";

const databaseUrl =
  process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  throw new Error("Missing POSTGRES_URL");
}

const nonPoolingUrl = databaseUrl.replace(":6543", ":5432");

export default {
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: nonPoolingUrl },
  casing: "snake_case",
} satisfies Config;
