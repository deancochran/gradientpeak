import { fileURLToPath } from "node:url";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

import {
  clientDisconnectRecorderPlugin,
  clientDisconnectSuppressionPlugin,
} from "./vite/client-disconnect-plugin";

/**
 * Tailscale's browser proxy re-fetches modules without browser fetch metadata.
 * Vite otherwise lets TanStack Start's page renderer handle those module
 * requests, which turns them into 404 page responses.
 */
function tunnelSourceModulePlugin(): Plugin {
  return {
    name: "gradientpeak:tunnel-source-modules",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url;
        const pathname = url?.split("?", 1)[0];
        const isSourceModule = pathname?.startsWith("/src/");
        const isPrebundledDependency = pathname?.startsWith("/node_modules/.vite/deps/");
        const isClientConfig = pathname === "/sentry-config.mjs";

        if (!url || (!isSourceModule && !isPrebundledDependency && !isClientConfig)) {
          return next();
        }

        try {
          const module = await server.transformRequest(url);

          if (!module) {
            return next();
          }

          response.statusCode = 200;
          response.setHeader("Content-Type", "text/javascript");
          response.end(module.code);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  return {
    ...(process.env.VITE_CACHE_DIR === undefined ? {} : { cacheDir: process.env.VITE_CACHE_DIR }),
    server: {
      allowedHosts: ["dev.gradientpeak.com", "tokyo.goose-noodlefish.ts.net"],
      host: process.env.DEV_HOST ?? "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    preview: {
      host: process.env.DEV_HOST ?? "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    plugins: [
      tunnelSourceModulePlugin(),
      clientDisconnectRecorderPlugin(),
      ...(process.env.VITE_ENABLE_DEVTOOLS === "true" ? [devtools()] : []),
      tailwindcss(),
      tanstackStart({
        router: {
          routeFileIgnorePattern: "\\.(test|spec)\\.tsx?$",
        },
      }),
      viteReact(),
      nitro({ rollupConfig: { external: [/^@sentry\//] } }),
      sentryTanstackStart({
        ...(env.SENTRY_AUTH_TOKEN === undefined ? {} : { authToken: env.SENTRY_AUTH_TOKEN }),
        ...(env.SENTRY_ORG === undefined ? {} : { org: env.SENTRY_ORG }),
        ...(env.SENTRY_PROJECT === undefined ? {} : { project: env.SENTRY_PROJECT }),
      }),
      clientDisconnectSuppressionPlugin(),
    ],
  };
});

export default config;
