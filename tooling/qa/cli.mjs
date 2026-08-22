#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { getChangedFiles } from "../testing/cli.mjs";
import { createProfilePlan, formatProfilePlan, QA_PROFILES } from "./profiles.mjs";

const SHUTDOWN_TIMEOUT = 5_000;
const STABILIZATION_TIMEOUT = 100;

function validPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

export function listenerPidsFromSs(output) {
  const pids = [...String(output).matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
  if (pids.length === 0 || pids.some((pid) => !Number.isSafeInteger(pid) || pid < 1)) {
    throw new Error("Unable to identify listener PIDs from ss output.");
  }
  return [...new Set(pids)].sort((left, right) => left - right);
}

export async function listeningPids(port, run = execFile) {
  if (process.platform !== "linux")
    throw new Error("QA listener ownership verification requires Linux.");
  if (!validPort(port)) throw new Error("QA listener port is invalid.");
  const { stdout } = await new Promise((resolve, reject) => {
    run("ss", ["-ltnp", `sport = :${port}`], { encoding: "utf8" }, (error, stdout) =>
      error ? reject(error) : resolve({ stdout }),
    );
  });
  return listenerPidsFromSs(stdout);
}

export async function processGroupForPid(pid, read = readFile) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Listener PID is invalid.");
  const stat = await read(`/proc/${pid}/stat`, "utf8");
  const closing = stat.lastIndexOf(")");
  const fields =
    closing === -1
      ? []
      : stat
          .slice(closing + 1)
          .trim()
          .split(/\s+/);
  const pgrp = Number(fields[2]);
  if (!Number.isSafeInteger(pgrp) || pgrp < 1)
    throw new Error("Unable to read listener process group.");
  return pgrp;
}

export async function verifyListenerOwnership(
  port,
  child,
  { listeners = listeningPids, processGroup = processGroupForPid } = {},
) {
  if (!child?.pid || !Number.isSafeInteger(child.pid))
    throw new Error("QA host PID is unavailable.");
  const pids = await listeners(port);
  const groups = await Promise.all(pids.map((pid) => processGroup(pid)));
  if (groups.some((group) => group !== child.pid)) {
    throw new Error(`QA host port ${port} listener is not exclusively owned by its process group.`);
  }
}

export function parseArguments(argv) {
  const options = { changedPaths: [], plan: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--plan") options.plan = true;
    else if (argument === "--profile-only") options.profileOnly = true;
    else if (argument === "--integration-only") options.integrationOnly = true;
    else if (argument === "--changed") options.changed = true;
    else if (argument === "--changed-paths") {
      const paths = argv.slice(index + 1);
      if (paths.length === 0) throw new Error("--changed-paths requires at least one path.");
      options.changedPaths.push(...paths);
      break;
    } else if (["--profile", "--changed-path", "--base"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--profile") options.profile = value;
      else if (argument === "--changed-path") options.changedPaths.push(value);
      else options.base = value;
      index += 1;
    } else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.base && !options.changed) throw new Error("--base requires --changed.");
  return options;
}

function defaultConnect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.end();
      resolve();
    });
    socket.once("error", reject);
  });
}

export async function isPortAvailable(port, connect = defaultConnect) {
  try {
    await connect(port);
    return false;
  } catch {
    return true;
  }
}

export function waitForPort(port, { timeout = 30_000, connect = defaultConnect, child } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    child?.once("exit", (code, signal) =>
      fail(new Error(`QA host exited before health check (${code ?? signal}).`)),
    );
    child?.once("error", (error) =>
      fail(new Error(`QA host failed before health check: ${error.message}`)),
    );
    const attempt = () =>
      connect(port).then(
        () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        },
        () => {
          if (!settled) {
            if (Date.now() - started >= timeout)
              fail(new Error(`Timed out waiting for port ${port}.`));
            else setTimeout(attempt, 100);
          }
        },
      );
    attempt();
  });
}

export function stabilizeService(
  child,
  { timeout = STABILIZATION_TIMEOUT, sleep = setTimeout } = {},
) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.killed)
      return reject(new Error("QA host exited during stabilization."));
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    child.once("exit", () => fail(new Error("QA host exited during stabilization.")));
    child.once("error", (error) =>
      fail(new Error(`QA host failed during stabilization: ${error.message}`)),
    );
    sleep(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, timeout);
  });
}

function childExit(child, timeout, sleep = setTimeout) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) return resolve(true);
    const timer = sleep(() => resolve(false), timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
    if (child.exitCode !== null || child.killed) {
      clearTimeout(timer);
      resolve(true);
    }
  });
}

export function createRunner({
  spawnProcess = spawn,
  portAvailable = isPortAvailable,
  waitForHealth = waitForPort,
  stabilize = stabilizeService,
  verifyOwnership = verifyListenerOwnership,
  killProcess = process.kill,
  shutdownTimeout = SHUTDOWN_TIMEOUT,
} = {}) {
  const spawnOptions = (root, environment = {}) => ({
    cwd: root,
    detached: process.platform !== "win32",
    shell: false,
    stdio: "inherit",
    env: { ...process.env, CI: "true", ...environment },
  });
  const run = async (entry, root) => {
    await new Promise((resolve, reject) => {
      const child = spawnProcess(entry.command, entry.args, spawnOptions(root));
      let settled = false;
      child.once("error", (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      child.once("exit", (code, signal) => {
        if (settled) return;
        settled = true;
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `Required QA command failed: ${[entry.command, ...entry.args].join(" ")} exited with ${code ?? signal}.`,
            ),
          );
        }
      });
    });
  };
  const signal = (child, value) => {
    try {
      if (process.platform !== "win32" && child.pid) killProcess(-child.pid, value);
      else child.kill(value);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const stop = async (child) => {
    if (!child || child.exitCode !== null || child.killed) return;
    signal(child, "SIGTERM");
    if (!(await childExit(child, shutdownTimeout))) {
      signal(child, "SIGKILL");
      if (!(await childExit(child, shutdownTimeout)))
        throw new Error("QA host did not exit after SIGKILL.");
    }
  };
  return {
    async execute(plan, root) {
      const services = [];
      const errors = [];
      try {
        for (const entry of plan.commands) {
          if (entry.phase !== "start") {
            await run(entry, root);
            continue;
          }
          if (!(await portAvailable(entry.port)))
            throw new Error(
              `Required QA prerequisite unavailable: host port ${entry.port} is already occupied.`,
            );
          const child = spawnProcess(entry.command, entry.args, spawnOptions(root));
          const service = { child, errors: [] };
          child.on("error", (error) => service.errors.push(error));
          services.push(service);
          await waitForHealth(entry.port, { child });
          await verifyOwnership(entry.port, child);
          await stabilize(child);
          await verifyOwnership(entry.port, child);
          if (service.errors.length) throw service.errors[0];
        }
      } catch (error) {
        errors.push(error);
      }
      for (const service of [...services].reverse()) {
        try {
          await stop(service.child);
        } catch (error) {
          errors.push(error);
        }
      }
      for (const entry of plan.cleanup) {
        try {
          await run(entry, root);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "QA lifecycle failed.");
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help)
    return process.stdout.write(
      `Usage: pnpm qa:run --profile <${QA_PROFILES.join("|")}> [--changed | --changed-path <path> | --changed-paths <paths...>] [--integration-only] [--profile-only] [--plan]\n`,
    );
  const root = process.cwd();
  const changedPaths = options.changed
    ? [...options.changedPaths, ...(await getChangedFiles(root, options.base))]
    : options.changedPaths;
  const plan = createProfilePlan({
    profile: options.profile,
    changedPaths,
    includeStatic: !options.integrationOnly,
  });
  if (options.profileOnly) {
    process.stdout.write(`${plan.profile}\n`);
    return;
  }
  process.stdout.write(formatProfilePlan(plan));
  if (!options.plan) {
    await createRunner().execute(plan, root);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main().catch((error) => {
    process.stderr.write(`qa: ${formatQaError(error)}\n`);
    process.exitCode = 1;
  });

export function formatQaError(error) {
  if (error instanceof AggregateError) {
    return error.errors.map((item) => formatQaError(item)).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
