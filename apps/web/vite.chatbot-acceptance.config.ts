import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";

import baseConfig from "./vite.config";

/**
 * This config is only selected by the guarded disposable runner. Production's
 * Vite config never imports the fixture, so a provider replacement cannot be
 * bundled or selected by a normal development/build invocation.
 */
export default defineConfig(async (environment) => {
  const base = typeof baseConfig === "function" ? await baseConfig(environment) : baseConfig;
  return mergeConfig(base, {
    resolve: {
      alias: {
        "@repo/api/chatbot/host": fileURLToPath(
          new URL("./e2e/support/chatbot/acceptance-host.ts", import.meta.url),
        ),
      },
    },
  });
});
