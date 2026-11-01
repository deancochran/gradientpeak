import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

import { readFreshAcceptanceTarget } from "./e2e/acceptance/fresh-target";

const target = readFreshAcceptanceTarget();
const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const syntheticStorageUrl = "http://127.0.0.1:54321";
const serverEnv = {
  APP_URL: baseURL,
  AUTH_EMAIL_MODE: "log",
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  DATABASE_URL: target.databaseUrl,
  HOME: process.env.HOME,
  NEXT_PRIVATE_SUPABASE_SECRET_KEY: randomBytes(32).toString("base64url"),
  NEXT_PRIVATE_SUPABASE_URL: syntheticStorageUrl,
  NODE_ENV: "development",
  PATH: process.env.PATH,
  POSTGRES_URL: target.databaseUrl,
  TMPDIR: process.env.TMPDIR,
  WEB_ACCEPTANCE: "1",
};

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: "./e2e/acceptance/setup.ts",
  outputDir: "test-results/acceptance",
  retries: 0,
  testDir: "./e2e/acceptance",
  testMatch: "**/*.spec.ts",
  timeout: 45 * 1000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    // Playwright merges webServer.env with its own process environment. The launcher
    // creates the actual Vite child with only these acceptance-safe values.
    command: "node e2e/acceptance/server-launcher.mjs",
    env: serverEnv,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    url: baseURL,
  },
  workers: 1,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
