#!/usr/bin/env node

import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

export const E2E_SERVER_PORTS = Object.freeze([3100, 8082]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function defaultIsListening(port) {
  const stdout = await run("ss", ["-H", "-ltn", `sport = :${port}`]);
  return stdout.trim().length > 0;
}

async function defaultKillPorts(ports) {
  await run("pnpm", ["exec", "kill-port", ...ports.map(String)]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function listeningPorts(isListening) {
  const states = await Promise.all(
    E2E_SERVER_PORTS.map(async (port) => ({ listening: await isListening(port), port })),
  );
  return states.filter(({ listening }) => listening).map(({ port }) => port);
}

export async function stopE2EServers({
  attempts = 20,
  isListening = defaultIsListening,
  killPorts = defaultKillPorts,
  wait = () => delay(100),
} = {}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("E2E server shutdown attempts must be a positive integer.");
  }

  const activePorts = await listeningPorts(isListening);
  if (activePorts.length === 0) return;

  try {
    await killPorts(activePorts);
  } catch {
    // The authoritative result is the port read-back below, not kill-port's exit status.
  }

  let remainingPorts = activePorts;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    remainingPorts = await listeningPorts(isListening);
    if (remainingPorts.length === 0) return;
    if (attempt + 1 < attempts) await wait();
  }

  const label =
    remainingPorts.length === 1 ? "listener remains on port" : "listeners remain on ports";
  throw new Error(`E2E server shutdown failed: ${label} ${remainingPorts.join(", ")}.`);
}

async function main() {
  await stopE2EServers();
  console.log("[dev-e2e-stop] ports 3100 and 8082 are idle.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[dev-e2e-stop] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
