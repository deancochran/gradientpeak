import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@repo/core": path.resolve(__dirname, "../../packages/core/index.ts"),
      "react-native": path.resolve(__dirname, "test/mocks/react-native.ts"),
    },
  },
  test: {
    setupFiles: [path.resolve(__dirname, "test/setup.ts")],
  },
});
