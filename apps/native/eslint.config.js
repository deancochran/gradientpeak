// apps/native/.eslintrc.js
const { defineConfig } = require("eslint/config");
const { config: baseConfig } = require("@repo/eslint-config/base");

module.exports = defineConfig([
  ...baseConfig,
  {
    ignores: ["dist/**", "node_modules/**", ".expo/**", "build/**"],
  },
]);
