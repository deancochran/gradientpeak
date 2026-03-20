import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "src/test/react-native.tsx"),
    },
  },
  test: {
    projects: [
      {
        test: {
          environment: "jsdom",
          include: ["src/**/*.web.test.tsx"],
          name: "web",
          setupFiles: ["./src/test/setup-web.ts"],
        },
      },
      {
        test: {
          environment: "node",
          include: ["src/**/*.native.test.tsx"],
          name: "native",
          setupFiles: ["./src/test/setup-native.ts"],
        },
      },
    ],
  },
});
