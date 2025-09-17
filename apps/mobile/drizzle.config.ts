import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schemas",
  out: "./lib/db/migrations",
  driver: "expo", // Specify the expo-sqlite driver
});
