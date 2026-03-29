import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "."),
      },
      {
        find: "@repo/core",
        replacement: path.resolve(__dirname, "../../packages/core/index.ts"),
      },
      {
        find: /^@repo\/core\/(.*)$/,
        replacement: path.resolve(__dirname, "../../packages/core/$1"),
      },
      {
        find: "react-native",
        replacement: path.resolve(__dirname, "test/mocks/react-native.ts"),
      },
    ],
  },
  test: {
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
    ],
    exclude: ["**/*.jest.test.ts", "**/*.jest.test.tsx", "**/node_modules/**", "../../packages/**"],
    server: {
      deps: {
        inline: ["@testing-library/react-native"],
      },
    },
    setupFiles: [path.resolve(__dirname, "test/setup.ts")],
  },
});
