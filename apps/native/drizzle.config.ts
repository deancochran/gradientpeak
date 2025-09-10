import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/local/schemas/index.ts",
  out: "./lib/db/local/migrations",
  driver: "expo", // Specify the expo-sqlite driver
});
