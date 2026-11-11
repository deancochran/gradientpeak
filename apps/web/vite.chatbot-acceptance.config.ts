import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";

import {
  disposableAcceptanceLeaseVitePlugin,
  requireDisposableAcceptanceEnvironment,
} from "./e2e/support/disposable-acceptance-server";
import baseConfig from "./vite.config";

// Reject copied targets before Vite starts; each request rechecks owner liveness.
requireDisposableAcceptanceEnvironment();

/**
 * This config is only selected by the guarded disposable runner. Production's
 * Vite config never imports the fixture, so a provider replacement cannot be
 * bundled or selected by a normal development/build invocation.
 */
export default defineConfig(async (environment) => {
  const base = typeof baseConfig === "function" ? await baseConfig(environment) : baseConfig;
  return mergeConfig(base, {
    plugins: [disposableAcceptanceLeaseVitePlugin()],
    // Virtual Start entries discover these after the initial scan. Prebundle
    // them before the first browser journey to avoid invalidating its imports.
    optimizeDeps: {
      include: [
        "@tanstack/history",
        "@tanstack/router-core",
        "@tanstack/router-core/isServer",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/ssr/server",
        "h3-v2",
        "seroval",
      ],
    },
    resolve: {
      alias: {
        "@repo/api/chatbot/host": fileURLToPath(
          new URL("./e2e/support/chatbot/acceptance-host.ts", import.meta.url),
        ),
      },
    },
  });
});
