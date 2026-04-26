import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  return {
    server: {
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    preview: {
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 3000),
    },
    resolve: { tsconfigPaths: true },
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
