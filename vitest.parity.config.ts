import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/parity/**/*.test.ts"],
    name: "parity",
  },
});
