import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.web.test.tsx"],
    setupFiles: ["./src/test/setup-web.ts"],
  },
});
