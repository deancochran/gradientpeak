import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schemas",
  out: "./src/lib/db/migrations",
  driver: "expo",
  dbCredentials: {
    url: "./src/lib/db/db.db", // path to your SQLite file (can be relative)
  },
});
