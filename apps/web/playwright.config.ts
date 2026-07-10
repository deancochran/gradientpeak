import { defineConfig, devices } from "@playwright/test";
import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { relative, resolve, sep } from "node:path";

const PORT = process.env.PORT || 3000;
const baseURL = `http://127.0.0.1:${PORT}`;
const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const gradientPeakRoot = resolve(homedir(), "GradientPeak");
const artifactRoot = resolve(gradientPeakRoot, "e2e-artifacts");

if (process.env.E2E_ARTIFACT_ROOT !== undefined) {
  throw new Error("E2E_ARTIFACT_ROOT is not supported; artifacts always use ~/GradientPeak/e2e-artifacts/<run-id>/playwright.");
}

const runId = process.env.E2E_RUN_ID ?? new Date().toISOString().replaceAll(/[:.]/g, "-");
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
  throw new Error("E2E_RUN_ID may contain only letters, numbers, dots, underscores, and hyphens.");
}

function isInside(rootPath: string, candidatePath: string) {
  const relativePath = relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..");
}

function assertRealPathInside(path: string, canonicalRoot: string, label: string) {
  const realRoot = realpathSync(canonicalRoot);
  const realPath = realpathSync(path);
  if (!isInside(realRoot, realPath)) {
    throw new Error(`${label} resolves outside ${canonicalRoot}.`);
  }
}

assertRealPathInside(gradientPeakRoot, homedir(), "GradientPeak root");
mkdirSync(artifactRoot, { recursive: true });
assertRealPathInside(artifactRoot, gradientPeakRoot, "E2E artifact root");
const artifactDir = resolve(artifactRoot, runId, "playwright");
mkdirSync(artifactDir, { recursive: true });
assertRealPathInside(artifactDir, artifactRoot, "Playwright artifact directory");
const testResultsDir = resolve(artifactDir, "test-results");
const htmlReportDir = resolve(artifactDir, "html-report");
mkdirSync(testResultsDir, { recursive: true });
mkdirSync(htmlReportDir, { recursive: true });
assertRealPathInside(testResultsDir, artifactDir, "Playwright test-results directory");
assertRealPathInside(htmlReportDir, artifactDir, "Playwright HTML report directory");
const captureEvidence = process.env.E2E_CAPTURE === "1";

export default defineConfig({
  timeout: 30 * 1000,
  testDir: "./e2e/specs",
  retries: 1,
  outputDir: testResultsDir,
  reporter: [
    ["html", { outputFolder: htmlReportDir, open: "never" }],
    ["junit", { outputFile: resolve(artifactDir, "junit.xml") }],
  ],
  globalSetup: "./e2e/setup.ts",
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
    trace: captureEvidence ? "on" : "on-first-retry",
    screenshot: captureEvidence ? "on" : "only-on-failure",
    video: captureEvidence ? "on" : "retain-on-failure",
  },
  projects: [{ name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } }],
});
