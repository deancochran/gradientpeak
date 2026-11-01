import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

const config = defineConfig(({ mode }) => {
  const acceptanceMode = process.env.WEB_ACCEPTANCE === "1";
  const env = acceptanceMode ? {} : loadEnv(mode, process.cwd(), "");

  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  return {
    envDir: acceptanceMode ? false : undefined,
    server: {
      allowedHosts: ["outgoing-ape-repeatedly.ngrok-free.app"],
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    preview: {
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom"] },
    // Both packages have hoisted React peers; SSR must use the app's React copy.
    ssr: { noExternal: ["@trpc/react-query", "better-auth"] },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
      nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    ],
  };
});

export default config;
