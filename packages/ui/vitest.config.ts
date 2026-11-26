import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.web.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup-web.ts"],
  },
});
