#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const checks = [];
const laneFlagIndex = process.argv.indexOf("--lane");
const lane = laneFlagIndex === -1 ? "all" : process.argv[laneFlagIndex + 1];
const supportedLanes = new Set(["all", "dev", "web", "mobile", "db", "e2e"]);

if (!supportedLanes.has(lane)) {
  console.error(
    `Unknown lane ${JSON.stringify(lane)}. Use one of: ${[...supportedLanes].join(", ")}.`,
  );
  process.exit(2);
}

const requiresLocalDatabase = ["all", "dev", "web", "db", "e2e"].includes(lane);
const requiresWebEnv = ["all", "dev", "web", "e2e"].includes(lane);
const requiresMobileEnv = ["all", "dev", "mobile", "e2e"].includes(lane);
const requiresPublicTunnel = ["all", "dev"].includes(lane);

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
  const lookup = process.platform === "win32" ? "where" : "which";
  const args = [command];
  return commandOutput(lookup, args) !== null;
}

function commandSucceeds(command, args = []) {
  return commandOutput(command, args) !== null;
}

function workspaceCommandExists(workspace, command) {
  return commandSucceeds("pnpm", ["--filter", workspace, "exec", command, "--version"]);
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
const actualNode = process.version.replace(/^v/, "");
addCheck(
  "Node",
  actualNode === expectedNode ? "pass" : "fail",
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
  const required = requiresLocalDatabase;
  const available =
    tool === "supabase" ? workspaceCommandExists("@repo/db", tool) : commandExists(tool);
  addCheck(
    tool,
    available ? "pass" : required ? "fail" : "warn",
    available
      ? `${tool} is available`
      : `${tool} is missing; the ${lane} lane requires local Supabase`,
    required,
  );
}

if (commandExists("docker")) {
  const daemonAvailable = commandSucceeds("docker", ["info"]);
  addCheck(
    "Docker daemon",
    daemonAvailable ? "pass" : requiresLocalDatabase ? "fail" : "warn",
    daemonAvailable ? "running" : "not available; start Docker before using a local Supabase lane",
    requiresLocalDatabase,
  );
}

for (const tool of ["maestro", "adb"]) {
  addCheck(
    tool,
    commandExists(tool) ? "pass" : "warn",
    commandExists(tool)
      ? `${tool} is available`
      : `${tool} is missing; related workflows are optional`,
  );
}

const cloudflaredAvailable = commandExists("cloudflared");
addCheck(
  "cloudflared",
  cloudflaredAvailable ? "pass" : requiresPublicTunnel ? "fail" : "warn",
  cloudflaredAvailable
    ? "cloudflared is available"
    : requiresPublicTunnel
      ? "install cloudflared before starting the public callback lane"
      : "cloudflared is missing; the public callback lane requires it",
  requiresPublicTunnel,
);

if (requiresPublicTunnel) {
  const tunnelTokenFile =
    process.env.CLOUDFLARE_TUNNEL_TOKEN_FILE ??
    join(homedir(), ".config", "gradientpeak", "gradientpeak-dev.tunnel-token");
  addCheck(
    "Cloudflare tunnel token",
    existsSync(tunnelTokenFile) ? "pass" : "fail",
    existsSync(tunnelTokenFile)
      ? `token file is available at ${tunnelTokenFile}`
      : `save the named tunnel token at ${tunnelTokenFile} or set CLOUDFLARE_TUNNEL_TOKEN_FILE`,
    true,
  );
  if (existsSync(tunnelTokenFile) && process.platform !== "win32") {
    const ownerOnly = (statSync(tunnelTokenFile).mode & 0o077) === 0;
    addCheck(
      "Cloudflare tunnel token permissions",
      ownerOnly ? "pass" : "fail",
      ownerOnly
        ? "token file is readable only by its owner"
        : `run chmod 600 ${tunnelTokenFile} before starting the public callback lane`,
      true,
    );
  }
  addCheck(
    "apps/web/.env.tunnel",
    existsSync("apps/web/.env.tunnel") ? "pass" : "fail",
    existsSync("apps/web/.env.tunnel")
      ? "public callback environment exists"
      : "copy apps/web/.env.tunnel.example before starting the public callback lane",
    true,
  );
}

const envPairs = [
  ["apps/web/.env.local", "apps/web/.env.example", requiresWebEnv],
  ["apps/mobile/.env", "apps/mobile/.env.example", requiresMobileEnv],
  ["apps/mobile/.env.e2e", "apps/mobile/.env.e2e.example", lane === "e2e"],
  ["packages/db/.env", "packages/db/.env.example", false],
];

for (const [localPath, examplePath, required] of envPairs) {
  if (!existsSync(examplePath)) {
    addCheck(examplePath, "fail", "missing checked-in env template", true);
    continue;
  }
  addCheck(examplePath, "pass", "env template exists");
  addCheck(
    localPath,
    existsSync(localPath) ? "pass" : required ? "fail" : "warn",
    existsSync(localPath)
      ? "local env file exists"
      : `copy ${examplePath} when this surface is needed`,
    required,
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

console.log(`\nDoctor completed for the ${lane} lane. Warnings are optional workflow notes.`);
