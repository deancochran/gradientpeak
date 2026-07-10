#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appId = process.env.MAESTRO_APP_ID || "com.deancochran.gradientpeak.dev";
const defaultServerLabel = process.env.MAESTRO_EXPO_DEV_SERVER_LABEL || "http://10.0.2.2:8081";
const gradientPeakRoot = resolve(homedir(), "GradientPeak");
const artifactRoot = resolve(gradientPeakRoot, "e2e-artifacts");
const videoRoot = resolve(gradientPeakRoot, "videos");
const runId = process.env.E2E_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const videoScope = process.env.E2E_VIDEO_SCOPE || "ad-hoc";
const defaultFlows = [".maestro/flows/main"];
const forwardedPorts = [8081, 3000, 3100, 54321];
const loadedEnvKeys = new Set();

const command = process.argv[2] || "test";
const args = process.argv.slice(3);
if (args[0] === "--") {
  args.shift();
}

function assertSafeName(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`${label} may contain only letters, numbers, dots, underscores, and hyphens.`);
  }
}

function assertUnsupportedOverrides(env = process.env) {
  for (const name of [
    "E2E_ARTIFACT_ROOT",
    "MAESTRO_ARTIFACT_DIR",
    "MAESTRO_DEBUG_OUTPUT",
    "MAESTRO_TEST_OUTPUT_DIR",
  ]) {
    if (env[name] !== undefined) {
      throw new Error(`${name} is not supported; artifacts always use ~/GradientPeak/e2e-artifacts/<run-id>/maestro.`);
    }
  }
}

function isInside(rootPath, candidatePath) {
  const relativePath = relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..");
}

function nearestExistingAncestor(path) {
  let ancestor = path;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new Error(`No existing ancestor found for ${path}.`);
    }
    ancestor = parent;
  }
  return ancestor;
}

function assertRealPathInside(path, canonicalRoot, label) {
  const realRoot = realpathSync(canonicalRoot);
  const realPath = realpathSync(nearestExistingAncestor(path));
  if (!isInside(realRoot, realPath)) {
    throw new Error(`${label} resolves outside ${canonicalRoot}.`);
  }
}

function ensureDirectoryInside(path, canonicalRoot, label) {
  assertRealPathInside(canonicalRoot, gradientPeakRoot, "Canonical artifact root");
  assertRealPathInside(path, canonicalRoot, label);
  mkdirSync(path, { recursive: true });
  assertRealPathInside(path, canonicalRoot, label);
  return realpathSync(path);
}

function canonicalPaths() {
  assertUnsupportedOverrides();
  assertSafeName(runId, "E2E_RUN_ID");
  assertSafeName(videoScope, "E2E_VIDEO_SCOPE");
  assertRealPathInside(gradientPeakRoot, homedir(), "GradientPeak root");

  const maestroDir = resolve(artifactRoot, runId, "maestro");
  const videoDir = resolve(videoRoot, videoScope);
  const evidenceVideoPath = resolve(videoDir, `${runId}-main-tabs.mp4`);

  if (!isInside(artifactRoot, maestroDir) || !isInside(videoRoot, videoDir)) {
    throw new Error("Calculated E2E artifact path escaped its canonical root.");
  }

  return { evidenceVideoPath, maestroDir, videoDir };
}

function prepareArtifactDirectories() {
  const paths = canonicalPaths();
  ensureDirectoryInside(artifactRoot, gradientPeakRoot, "E2E artifact root");
  ensureDirectoryInside(paths.maestroDir, artifactRoot, "Maestro artifact directory");
  ensureDirectoryInside(videoRoot, gradientPeakRoot, "Video root");
  ensureDirectoryInside(paths.videoDir, videoRoot, "Video directory");
  return paths;
}

function loadEnvFile(path) {
  const envPath = resolve(root, path);
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key) {
      continue;
    }

    if (process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
    loadedEnvKeys.add(key);
  }
}

function run(bin, commandArgs, options = {}) {
  const result = spawnSync(bin, commandArgs, {
    cwd: root,
    env: process.env,
    stdio: options.stdio || "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    if (options.optional) {
      return false;
    }
    throw result.error;
  }

  if (result.status !== 0) {
    if (options.optional) {
      return false;
    }
    process.exit(result.status ?? 1);
  }

  return true;
}

function adb(adbArgs, options = {}) {
  return run(process.env.ADB_BIN || "adb", adbArgs, options);
}

function prepareAndroid() {
  if (process.env.MAESTRO_SKIP_ADB_REVERSE === "1") {
    return;
  }

  for (const port of forwardedPorts) {
    adb(["reverse", `tcp:${port}`, `tcp:${port}`], { optional: true });
  }
}

function launchApp() {
  if (process.env.MAESTRO_SKIP_APP_LAUNCH === "1") {
    return;
  }

  adb(["shell", "monkey", "-p", appId, "1"], { optional: true });
}

function prepare() {
  if (process.env.MAESTRO_SKIP_PREPARE === "1") {
    return;
  }

  prepareAndroid();
  launchApp();
}

function clean() {
  const { maestroDir } = canonicalPaths();
  if (!existsSync(artifactRoot)) {
    return;
  }
  assertRealPathInside(maestroDir, artifactRoot, "Maestro cleanup directory");
  rmSync(maestroDir, { force: true, recursive: true });
}

function buildMaestroArgs(flowArgs) {
  const flows = flowArgs.length > 0 ? flowArgs : defaultFlows;
  const { evidenceVideoPath, maestroDir } = prepareArtifactDirectories();
  const debugOutput = resolve(maestroDir, "debug");
  const testOutput = resolve(maestroDir, "test-output");
  const reportFormat = process.env.CI ? "JUNIT" : "HTML";
  const reportOutput = resolve(maestroDir, process.env.CI ? "junit.xml" : "report.html");
  ensureDirectoryInside(debugOutput, maestroDir, "Maestro debug output");
  ensureDirectoryInside(testOutput, maestroDir, "Maestro test output");
  assertRealPathInside(reportOutput, maestroDir, "Maestro report output");

  const maestroArgs = [
    "test",
    "--debug-output",
    debugOutput,
    "--test-output-dir",
    testOutput,
    "--format",
    reportFormat,
    "--output",
    reportOutput,
    "--env",
    `EXPO_DEV_SERVER_LABEL=${process.env.EXPO_DEV_SERVER_LABEL || defaultServerLabel}`,
    "--env",
    `MAESTRO_APP_ID=${appId}`,
    "--env",
    `MAESTRO_EVIDENCE_VIDEO_PATH=${evidenceVideoPath}`,
  ];

  for (const key of [...loadedEnvKeys].sort()) {
    const value = process.env[key];
    if (value !== undefined) {
      maestroArgs.push("--env", `${key}=${value}`);
    }
  }

  if (process.env.MAESTRO_PLATFORM) {
    maestroArgs.push("--platform", process.env.MAESTRO_PLATFORM);
  }

  if (process.env.MAESTRO_DEVICE_ID) {
    maestroArgs.push("--device", process.env.MAESTRO_DEVICE_ID);
  }

  if (process.env.MAESTRO_INCLUDE_TAGS) {
    maestroArgs.push("--include-tags", process.env.MAESTRO_INCLUDE_TAGS);
  }

  if (process.env.MAESTRO_EXCLUDE_TAGS) {
    maestroArgs.push("--exclude-tags", process.env.MAESTRO_EXCLUDE_TAGS);
  }

  if (process.env.CI) {
    maestroArgs.push("--flatten-debug-output");
  }

  maestroArgs.push(...flows);
  return maestroArgs;
}

function verifyArtifactSafety() {
  const { maestroDir } = canonicalPaths();
  if (maestroDir !== resolve(artifactRoot, runId, "maestro")) {
    throw new Error("Maestro cleanup path is not canonical.");
  }

  for (const name of ["E2E_ARTIFACT_ROOT", "MAESTRO_ARTIFACT_DIR", "MAESTRO_DEBUG_OUTPUT", "MAESTRO_TEST_OUTPUT_DIR"]) {
    let rejected = false;
    try {
      assertUnsupportedOverrides({ [name]: "/outside/GradientPeak" });
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(`${name} override was not rejected.`);
    }
  }

  ensureDirectoryInside(artifactRoot, gradientPeakRoot, "E2E artifact root");
  const probe = mkdtempSync(join(artifactRoot, ".safety-"));
  const escape = join(probe, "escape");
  try {
    symlinkSync("/", escape);
    if (!lstatSync(escape).isSymbolicLink()) {
      throw new Error("Safety probe did not create a symbolic link.");
    }
    let rejected = false;
    try {
      assertRealPathInside(escape, artifactRoot, "Symlink safety probe");
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error("Symlink escape was not rejected.");
    }
  } finally {
    rmSync(probe, { force: true, recursive: true });
  }

  console.log("E2E artifact safety checks passed.");
}

loadEnvFile(".maestro/fixtures.env");
for (const envFile of (process.env.MAESTRO_ENV_FILE || "").split(",")) {
  if (envFile.trim()) {
    loadEnvFile(envFile.trim());
  }
}
if (process.env.SIGNUP_EMAIL === undefined) {
  const prefix = process.env.MAESTRO_SIGNUP_EMAIL_PREFIX || "gradientpeak.maestro";
  const domain = process.env.MAESTRO_SIGNUP_EMAIL_DOMAIN || "example.com";
  process.env.SIGNUP_EMAIL = `${prefix}+${Date.now()}@${domain}`;
  loadedEnvKeys.add("SIGNUP_EMAIL");
}

switch (command) {
  case "prepare":
    prepare();
    break;
  case "launch":
    launchApp();
    break;
  case "clean":
    clean();
    break;
  case "test":
    prepare();
    if (process.env.MAESTRO_DRY_RUN === "1") {
      console.log([process.env.MAESTRO_BIN || "maestro", ...buildMaestroArgs(args)].join(" "));
      break;
    }
    run(process.env.MAESTRO_BIN || "maestro", buildMaestroArgs(args));
    break;
  case "verify-artifact-safety":
    verifyArtifactSafety();
    break;
  default:
    console.error(`Unknown Maestro command: ${command}`);
    process.exit(1);
}
