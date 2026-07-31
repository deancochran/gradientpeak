import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const port = process.env.PORT ?? "3000";
const baseURL = `http://127.0.0.1:${port}`;
// biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export default defineConfig({
  fullyParallel: false,
  forbidOnly: true,
  outputDir: "test-results/future-red/artifacts",
  preserveOutput: "always",
  projects: [
    {
      name: "Future Red Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["line"], ["json", { outputFile: "test-results/future-red/results.json" }]],
  retries: 0,
  testDir: "./e2e/future-red/specs",
  testMatch: /.*\.red\.spec\.ts/,
  timeout: 45_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "pnpm dev:e2e",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? localDatabaseUrl,
      POSTGRES_URL: process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? localDatabaseUrl,
    },
    reuseExistingServer: true,
    timeout: 120_000,
    url: baseURL,
  },
  workers: 1,
});
