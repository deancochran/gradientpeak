import { defineConfig } from "drizzle-kit";

import { resolveDatabaseUrl } from "./src/client";

const localSupabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? localSupabaseUrl;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl({ DATABASE_URL: databaseUrl }),
  },
  strict: true,
});
