import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT || 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  timeout: 30 * 1000,
  testDir: "./e2e/specs",
  retries: 2,
  outputDir: "test-results/",
  globalSetup: "./e2e/setup.ts",
  webServer: {
    command: "pnpm test:serve",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } }],
});
