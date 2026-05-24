#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appId = process.env.MAESTRO_APP_ID || "com.deancochran.gradientpeak.dev";
const defaultServerLabel = process.env.MAESTRO_EXPO_DEV_SERVER_LABEL || "http://10.0.2.2:8081";
const artifactDir = process.env.MAESTRO_ARTIFACT_DIR || ".maestro/artifacts";
const defaultFlows = [".maestro/flows/main"];
const forwardedPorts = [8081, 3000, 3100, 54321];
const loadedEnvKeys = new Set();

const command = process.argv[2] || "test";
const args = process.argv.slice(3);
if (args[0] === "--") {
  args.shift();
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

function adb(args, options = {}) {
  return run(process.env.ADB_BIN || "adb", args, options);
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
  rmSync(resolve(root, artifactDir), { force: true, recursive: true });
}

function buildMaestroArgs(flowArgs) {
  const flows = flowArgs.length > 0 ? flowArgs : defaultFlows;
  const debugOutput = process.env.MAESTRO_DEBUG_OUTPUT || `${artifactDir}/debug`;
  const testOutput = process.env.MAESTRO_TEST_OUTPUT_DIR || `${artifactDir}/test-output`;
  mkdirSync(resolve(root, debugOutput), { recursive: true });
  mkdirSync(resolve(root, testOutput), { recursive: true });

  const maestroArgs = [
    "test",
    "--debug-output",
    debugOutput,
    "--test-output-dir",
    testOutput,
    "--env",
    `EXPO_DEV_SERVER_LABEL=${process.env.EXPO_DEV_SERVER_LABEL || defaultServerLabel}`,
    "--env",
    `MAESTRO_APP_ID=${appId}`,
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
    maestroArgs.push(
      "--flatten-debug-output",
      "--format",
      "JUNIT",
      "--output",
      `${artifactDir}/junit.xml`,
    );
  }

  maestroArgs.push(...flows);
  return maestroArgs;
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
  default:
    console.error(`Unknown Maestro command: ${command}`);
    process.exit(1);
}
