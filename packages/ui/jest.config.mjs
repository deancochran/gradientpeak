export default {
  clearMocks: true,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  rootDir: ".",
  setupFilesAfterEnv: ["<rootDir>/src/test/setup-native.ts"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.native.test.tsx"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: true,
          },
          target: "es2022",
          transform: {
            react: {
              runtime: "automatic",
            },
          },
        },
        module: {
          type: "commonjs",
        },
      },
    ],
  },
};
