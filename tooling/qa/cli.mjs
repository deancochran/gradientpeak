#!/usr/bin/env node

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { getChangedFiles } from "../testing/cli.mjs";
import { createProfilePlan, formatProfilePlan, QA_PROFILES } from "./profiles.mjs";

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

export function createRunner({ spawnProcess = spawn } = {}) {
  const spawnOptions = (root) => ({
    cwd: root,
    shell: false,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
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
  return {
    async execute(plan, root) {
      for (const entry of plan.commands) await run(entry, root);
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
