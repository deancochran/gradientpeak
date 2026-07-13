import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing POSTGRES_URL");
}

const nonPoolingUrl = databaseUrl.replace(":6543", ":5432");

export default defineConfig({
  schema: "./src/schema.ts",
  // Drizzle is schema/introspection tooling only. Manual generation must target
  // the single Supabase migration authority rather than a second deploy tree.
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: { url: nonPoolingUrl },
  casing: "snake_case",
  schemaFilter: ["public"],
  entities: {
    roles: {
      provider: "supabase",
    },
  },
  strict: true,
  verbose: true,
});
