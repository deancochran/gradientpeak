import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const PORT = process.env.PORT || 3000;
const baseURL = `http://127.0.0.1:${PORT}`;
// biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export default defineConfig({
  timeout: 30 * 1000,
  testDir: "./e2e/specs",
  retries: process.env.CI ? 2 : 0,
  outputDir: "test-results/",
  webServer: {
    command: "pnpm test:serve",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? localDatabaseUrl,
      POSTGRES_URL: process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? localDatabaseUrl,
    },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
  use: {
    baseURL,
    trace: process.env.E2E_ARTIFACTS === "1" ? "on-first-retry" : "off",
    screenshot: process.env.E2E_ARTIFACTS === "1" ? "only-on-failure" : "off",
    video: process.env.E2E_ARTIFACTS === "1" ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "Desktop Chrome",
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Desktop Firefox",
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "Narrow Firefox",
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "Mobile Chrome",
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
