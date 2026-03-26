export default {
  clearMocks: true,
  moduleFileExtensions: ["native.tsx", "native.ts", "tsx", "ts", "jsx", "js", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@repo/core$": "<rootDir>/../../packages/core/index.ts",
    "^@repo/core/(.*)$": "<rootDir>/../../packages/core/$1",
    "^@repo/supabase$": "<rootDir>/../../packages/supabase/index.ts",
    "^@repo/trpc/(.*)$": "<rootDir>/../../packages/trpc/src/$1",
    "^@repo/ui$": "<rootDir>/../../packages/ui/src/index.ts",
    "^@repo/ui/(.*)$": "<rootDir>/../../packages/ui/src/$1",
  },
  rootDir: ".",
  setupFilesAfterEnv: ["<rootDir>/test/setup-jest.ts"],
  testEnvironment: "node",
  testEnvironmentOptions: {
    customExportConditions: ["react-native"],
  },
  testMatch: ["<rootDir>/**/*.jest.test.ts", "<rootDir>/**/*.jest.test.tsx"],
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
