import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";
import { localE2EDatabaseEnvironment } from "./e2e/support/database-url";

const env = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;
// This runs while Playwright loads its config, before it can start or reuse a web server.
const databaseEnvironment = localE2EDatabaseEnvironment(process.env);
const canonicalProviderSpecs = /(?:integration-variations|integrations)\.spec\.ts/;

export default defineConfig({
  timeout: 30 * 1000,
  testDir: "./e2e/specs",
  retries: process.env.CI ? 2 : 0,
  // Keep the evidence-gathering default conservative. The actor fixtures are parallel-safe,
  // but worker growth remains an explicit opt-in until repeated local/CI runs prove it.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 1,
  outputDir: `test-results/${process.env.E2E_RUN_ID ?? `run-${process.pid}`}`,
  webServer: {
    command: "pnpm dev:e2e",
    env: {
      ...process.env,
      ...databaseEnvironment,
      APP_URL: baseURL,
      PORT: String(PORT),
      NEXT_PRIVATE_SUPABASE_URL: "http://127.0.0.1:55321",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
      VITE_CACHE_DIR: `/tmp/gradientpeak-web-vite-${process.pid}`,
    },
    url: baseURL,
    reuseExistingServer: false,
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
      testIgnore: [/auth\.setup\.ts/, canonicalProviderSpecs],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Desktop Firefox",
      testIgnore: [/auth\.setup\.ts/, canonicalProviderSpecs],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "Narrow Firefox",
      testIgnore: [/auth\.setup\.ts/, canonicalProviderSpecs],
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "Mobile Chrome",
      testIgnore: [/auth\.setup\.ts/, canonicalProviderSpecs],
      use: { ...devices["Pixel 7"] },
    },
    {
      // Provider tests intentionally exercise canonical seeded provider data. Keep this
      // exception visible, single-browser, and single-worker rather than hiding it in a lock.
      name: "Canonical Provider State",
      fullyParallel: false,
      testMatch: canonicalProviderSpecs,
      use: { ...devices["Desktop Chrome"] },
      workers: 1,
    },
  ],
});
