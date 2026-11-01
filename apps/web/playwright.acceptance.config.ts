import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

import { readFreshAcceptanceTarget } from "./e2e/acceptance/fresh-target";

const target = readFreshAcceptanceTarget();
const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: "./e2e/acceptance/setup.ts",
  outputDir: "test-results/acceptance",
  retries: 0,
  testDir: "./e2e/acceptance",
  timeout: 45 * 1000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite dev --host 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      APP_URL: baseURL,
      AUTH_EMAIL_MODE: "log",
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      DATABASE_URL: target.databaseUrl,
      POSTGRES_URL: target.databaseUrl,
    },
    reuseExistingServer: false,
    timeout: 120 * 1000,
    url: baseURL,
  },
  workers: 1,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
