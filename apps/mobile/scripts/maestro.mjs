#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireAdbReverses,
  resolveMaestroE2EEnvironment,
  runWithRequiredMaestroPreparation,
} from "./maestro-environment.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appId = process.env.MAESTRO_APP_ID || "com.deancochran.gradientpeak.dev";
const appScheme = process.env.MAESTRO_APP_SCHEME || "gradientpeak-dev";

let expoPort;
let webPort;
let defaultServerLabel;
let forwardedPorts;
const expoDevClientScheme = process.env.MAESTRO_EXPO_DEV_CLIENT_SCHEME || "exp+gradientpeak";
let expoDevClientUrl;
const runId = process.env.E2E_RUN_ID || `run-${Date.now()}-${process.pid}`;
const artifactDir = process.env.MAESTRO_ARTIFACT_DIR || `.maestro/artifacts/${runId}`;
const defaultCheckFlows = [".maestro/flows/smoke", ".maestro/flows/reusable"];
const defaultTestFlows = [".maestro/flows/smoke"];
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
  const deviceArgs =
    process.env.MAESTRO_DEVICE_ID && !process.env.MAESTRO_DEVICE_ID.includes(",")
      ? ["-s", process.env.MAESTRO_DEVICE_ID]
      : [];
  return run(process.env.ADB_BIN || "adb", [...deviceArgs, ...args], options);
}

function prepareAndroid() {
  if (process.env.MAESTRO_SKIP_ADB_REVERSE === "1") {
    return;
  }

  requireAdbReverses(forwardedPorts, (port) =>
    adb(["reverse", `tcp:${port}`, `tcp:${port}`], { optional: true }),
  );
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

function waitForEndpoint(url, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (
      run("curl", ["--silent", "--show-error", "--max-time", "2", "--output", "/dev/null", url], {
        optional: true,
      })
    ) {
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  throw new Error(`${label} did not become ready at its dedicated E2E endpoint.`);
}

function requireE2EReadiness() {
  waitForEndpoint(`${e2eEnvironment.apiUrl}/`, "E2E web/API");
  waitForEndpoint(`http://127.0.0.1:${expoPort}/status`, "E2E Metro");
  waitForEndpoint(`${e2eEnvironment.supabaseUrl}/rest/v1/`, "E2E Supabase");
}

function clean() {
  rmSync(resolve(root, artifactDir), { force: true, recursive: true });
}

function collectFlowFiles(path) {
  const absolutePath = resolve(root, path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Maestro flow path does not exist: ${path}`);
  }

  if (statSync(absolutePath).isFile()) {
    return [path];
  }

  return readdirSync(absolutePath, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? collectFlowFiles(`${path}/${entry.name}`)
        : entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")
          ? [`${path}/${entry.name}`]
          : [],
    )
    .sort();
}

function checkSyntax(flowArgs) {
  const paths = flowArgs.length > 0 ? flowArgs : defaultCheckFlows;
  const flows = paths.flatMap(collectFlowFiles);
  for (const flow of flows) {
    run(process.env.MAESTRO_BIN || "maestro", ["check-syntax", flow]);
  }
}

function buildMaestroArgs(flowArgs) {
  const flows = flowArgs.length > 0 ? flowArgs : defaultTestFlows;
  const debugOutput = process.env.MAESTRO_DEBUG_OUTPUT || `${artifactDir}/debug`;
  const testOutput = process.env.MAESTRO_TEST_OUTPUT_DIR || `${artifactDir}/test-output`;
  mkdirSync(resolve(root, debugOutput), { recursive: true });
  mkdirSync(resolve(root, testOutput), { recursive: true });

  const maestroArgs = [
    "test",
    "--no-reinstall-driver",
    "--debug-output",
    debugOutput,
    "--test-output-dir",
    testOutput,
    "--env",
    `EXPO_DEV_SERVER_LABEL=${process.env.EXPO_DEV_SERVER_LABEL || defaultServerLabel}`,
    "--env",
    `EXPO_DEV_CLIENT_URL=${expoDevClientUrl}`,
    "--env",
    `MAESTRO_APP_ID=${appId}`,
    "--env",
    `MAESTRO_APP_SCHEME=${appScheme}`,
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

  if (process.env.MAESTRO_JUNIT_OUTPUT) {
    maestroArgs.push("--format", "JUNIT", "--output", process.env.MAESTRO_JUNIT_OUTPUT);
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

const e2eEnvironment = resolveMaestroE2EEnvironment(process.env);
expoPort = e2eEnvironment.expoPort;
webPort = e2eEnvironment.webPort;
forwardedPorts = e2eEnvironment.forwardedPorts;
process.env.MAESTRO_DEVICE_ID = e2eEnvironment.deviceId;
process.env.EXPO_PUBLIC_MAESTRO_E2E_API_URL = e2eEnvironment.apiUrl;
process.env.EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL = e2eEnvironment.supabaseUrl;
defaultServerLabel = process.env.MAESTRO_EXPO_DEV_SERVER_LABEL || `http://127.0.0.1:${expoPort}`;
expoDevClientUrl = `${expoDevClientScheme}://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${expoPort}`)}`;

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
  case "check":
    checkSyntax(args);
    break;
  case "test":
    if (process.env.MAESTRO_DRY_RUN === "1") {
      console.log(
        `[maestro] dry-run device=${e2eEnvironment.deviceId} metro=127.0.0.1:${expoPort} api=127.0.0.1:${webPort} supabase=127.0.0.1:55321 forwards=${forwardedPorts.join(",")} artifacts=${artifactDir}`,
      );
      break;
    }
    requireE2EReadiness();
    runWithRequiredMaestroPreparation({
      environment: process.env,
      execute: () => {
        launchApp();
        run(process.env.MAESTRO_BIN || "maestro", buildMaestroArgs(args));
      },
      ports: forwardedPorts,
      reverse: (port) =>
        adb(["reverse", `tcp:${port}`, `tcp:${port}`], {
          optional: true,
        }),
    });
    if (process.env.MAESTRO_JUNIT_OUTPUT) {
      process.stdout.write(readFileSync(resolve(root, process.env.MAESTRO_JUNIT_OUTPUT), "utf8"));
    }
    break;
  default:
    console.error(`Unknown Maestro command: ${command}`);
    process.exit(1);
}
