import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@repo\/db$/,
        replacement: path.resolve(__dirname, "./src/test/db-module.ts"),
      },
    ],
  },
  test: {
    fileParallelism: false,
    include: ["src/**/*.live-db.test.ts"],
    setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
  },
});
