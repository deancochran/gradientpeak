import { defineConfig, devices } from "@playwright/test";
import { localE2EDatabaseEnvironment } from "./e2e/support/database-url";
import { acceptanceOrigin } from "./scripts/disposable-acceptance-options";

if (process.env.E2E_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Use scripts/run-disposable-acceptance.ts to provision this acceptance target.");
}
localE2EDatabaseEnvironment(process.env);
const baseURL = acceptanceOrigin(process.env.E2E_ACCEPTANCE_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  testMatch:
    process.env.E2E_ACCEPTANCE_NATIVE === "1" ? ["native/**/*.spec.ts"] : ["specs/**/*.spec.ts"],
  testIgnore: [/auth\.setup\.ts/, /(?:integration-variations|integrations)\.spec\.ts/],
  timeout: 30_000,
  retries: 0,
  workers: 1,
  outputDir: `test-results/${process.env.E2E_RUN_ID}`,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    {
      name: "Mobile Chrome 390x844",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
});
