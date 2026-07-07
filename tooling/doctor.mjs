#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";

const checks = [];

function addCheck(name, status, message, required = false) {
  checks.push({ name, status, message, required });
}

function commandOutput(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function commandExists(command) {
  const lookup = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  return commandOutput(lookup, args) !== null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readMiseTools() {
  const content = readFileSync("mise.toml", "utf8");
  return Object.fromEntries(
    [...content.matchAll(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function versionMajor(version) {
  return version.replace(/^v/, "").split(".")[0];
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

const packageJson = readJson("package.json");
const miseTools = readMiseTools();

const expectedNode = miseTools.node;
const actualNode = process.version;
addCheck(
  "Node",
  versionMajor(actualNode) === expectedNode ? "pass" : "fail",
  `expected ${expectedNode} from mise.toml, found ${actualNode}`,
  true,
);

const expectedPnpm = packageJson.packageManager?.replace(/^pnpm@/, "");
const actualPnpm = commandOutput("pnpm", ["--version"]);
addCheck(
  "pnpm",
  actualPnpm === expectedPnpm ? "pass" : "fail",
  `expected ${expectedPnpm}, found ${actualPnpm ?? "missing"}`,
  true,
);

for (const tool of ["supabase", "docker"]) {
  addCheck(
    tool,
    commandExists(tool) ? "pass" : "warn",
    commandExists(tool)
      ? `${tool} is available`
      : `${tool} is missing; local Supabase workflows may not run`,
  );
}

for (const tool of ["maestro", "adb", "ngrok"]) {
  addCheck(
    tool,
    commandExists(tool) ? "pass" : "warn",
    commandExists(tool)
      ? `${tool} is available`
      : `${tool} is missing; related workflows are optional`,
  );
}

const envPairs = [
  ["apps/web/.env.local", "apps/web/.env.example"],
  ["apps/mobile/.env", "apps/mobile/.env.example"],
  ["apps/mobile/.env.e2e", "apps/mobile/.env.e2e.example"],
  ["packages/db/.env", "packages/db/.env.example"],
];

for (const [localPath, examplePath] of envPairs) {
  if (!existsSync(examplePath)) {
    addCheck(examplePath, "fail", "missing checked-in env template", true);
    continue;
  }
  addCheck(examplePath, "pass", "env template exists");
  addCheck(
    localPath,
    existsSync(localPath) ? "pass" : "warn",
    existsSync(localPath)
      ? "local env file exists"
      : `copy ${examplePath} when this surface is needed`,
  );
}

for (const port of [3000, 8081, 54321, 54322, 54324]) {
  const available = await isPortAvailable(port);
  addCheck(
    `port ${port}`,
    available ? "pass" : "warn",
    available ? "available" : "already in use; this may be expected if dev services are running",
  );
}

const icons = { pass: "✓", warn: "!", fail: "✗" };
for (const check of checks) {
  console.log(`${icons[check.status]} ${check.name}: ${check.message}`);
}

const failures = checks.filter((check) => check.status === "fail" && check.required);
if (failures.length > 0) {
  console.error(`\nDoctor found ${failures.length} required issue(s).`);
  process.exit(1);
}

console.log("\nDoctor completed. Warnings are optional/local workflow notes.");
