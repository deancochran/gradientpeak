import { defineConfig, devices } from "@playwright/test";
import { localE2EDatabaseEnvironment } from "./e2e/support/database-url";
import { requirePrivatePlaywrightArtifactDirectory } from "./e2e/support/disposable-acceptance-server";
import { acceptanceOrigin } from "./scripts/disposable-acceptance-options";

if (process.env.E2E_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Use scripts/run-disposable-acceptance.ts to provision this acceptance target.");
}
localE2EDatabaseEnvironment(process.env);
const baseURL = acceptanceOrigin(process.env.E2E_ACCEPTANCE_BASE_URL);
// Playwright removes and recreates outputDir. The exact private parent remains
// the privacy boundary, while the child must remain owned and non-symlinked.
const outputDir = requirePrivatePlaywrightArtifactDirectory(
  process.env.E2E_ACCEPTANCE_ARTIFACTS,
  process.env.E2E_ACCEPTANCE_OUTPUT_DIR,
);

export default defineConfig({
  testDir: "./e2e",
  testMatch:
    process.env.E2E_ACCEPTANCE_NATIVE === "1" ? ["native/**/*.spec.ts"] : ["specs/**/*.spec.ts"],
  testIgnore: [/auth\.setup\.ts/, /(?:integration-variations|integrations)\.spec\.ts/],
  timeout: 30_000,
  retries: 0,
  workers: 1,
  outputDir,
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
