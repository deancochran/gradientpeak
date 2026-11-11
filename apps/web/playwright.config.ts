import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";
import { applyE2EFileEnvironment, localE2EDatabaseEnvironment } from "./e2e/support/database-url";

const env = loadEnv("test", process.cwd(), "");
applyE2EFileEnvironment(process.env, env);

const PORT = Number(process.env.E2E_WEB_PORT ?? 3001);
if (PORT !== 3001) {
  throw new Error("Playwright E2E requires E2E_WEB_PORT=3001.");
}
const baseURL = `http://127.0.0.1:${PORT}`;
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === "1";
const retainSuccessArtifacts = process.env.E2E_SUCCESS_ARTIFACTS === "1";
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
    reuseExistingServer,
    timeout: 120 * 1000,
  },
  use: {
    baseURL,
    trace: retainSuccessArtifacts
      ? "on"
      : process.env.E2E_ARTIFACTS === "1"
        ? "on-first-retry"
        : "off",
    screenshot: retainSuccessArtifacts
      ? "on"
      : process.env.E2E_ARTIFACTS === "1"
        ? "only-on-failure"
        : "off",
    video: retainSuccessArtifacts
      ? "on"
      : process.env.E2E_ARTIFACTS === "1"
        ? "retain-on-failure"
        : "off",
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
      // Representative iPhone-sized responsive viewport while retaining the
      // Chromium engine, mobile context, and touch input from the Pixel profile.
      name: "Mobile Chrome 390x844",
      testIgnore: [/auth\.setup\.ts/, canonicalProviderSpecs],
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
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
