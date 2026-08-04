import { fileURLToPath } from "node:url";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

import {
  clientDisconnectRecorderPlugin,
  clientDisconnectSuppressionPlugin,
} from "./vite/client-disconnect-plugin";

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  return {
    server: {
      allowedHosts: ["outgoing-ape-repeatedly.ngrok-free.app"],
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    preview: {
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    plugins: [
      clientDisconnectRecorderPlugin(),
      devtools(),
      tailwindcss(),
      tanstackStart({
        router: {
          routeFileIgnorePattern: "\\.(test|spec)\\.tsx?$",
        },
      }),
      viteReact(),
      nitro({ rollupConfig: { external: [/^@sentry\//] } }),
      sentryTanstackStart({
        authToken: env.SENTRY_AUTH_TOKEN,
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
      }),
      clientDisconnectSuppressionPlugin(),
    ],
  };
});

export default config;
