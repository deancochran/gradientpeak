import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schemas",
  out: "./src/lib/db/migrations",
  driver: "expo", // Specify the expo-sqlite driver
});
