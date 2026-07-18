#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { changedDiffArguments } from "./changed.mjs";
import { createPlan, formatPlan } from "./planner.mjs";
import { checkStructure, formatStructureResult, writeStructureBaseline } from "./structure.mjs";

const execFileAsync = promisify(execFile);

function usage() {
  return `Usage: node tooling/testing/cli.mjs <selector> [options]

Selectors (choose one):
  --path <file-or-dir>  Select a test, source file, directory, or canonical feature path
  --feature <id>       Select an id across every canonical feature root
  --changed            Select tests related to changed files
  --all                Select every conventionally named test

Options:
  --base <ref>         Git base for --changed (defaults to working tree changes)
  --run                Execute the planned package-owned commands
  --verify             Execute tests, then package type and artifact checks
  --plan               Plan only (the default)
  --runtime            Include live-db, Playwright, and Maestro commands
  --check-structure    Validate UI test structure against the debt baseline
  --write-structure-baseline
                       Replace the deterministic UI structure debt baseline
  --json               Emit deterministic JSON
  --help               Show this message
`;
}

export function parseArguments(argv) {
  const options = { json: false, run: false, runtime: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help") options.help = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--run") options.run = true;
    else if (argument === "--verify") options.verify = true;
    else if (argument === "--plan") options.run = false;
    else if (argument === "--runtime") options.runtime = true;
    else if (argument === "--changed") options.changed = true;
    else if (argument === "--all") options.all = true;
    else if (argument === "--check-structure") options.checkStructure = true;
    else if (argument === "--write-structure-baseline") options.writeStructureBaseline = true;
    else if (["--path", "--feature", "--base"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      options[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }

  const structureModes = [options.checkStructure, options.writeStructureBaseline].filter(Boolean);
  const selectors = [options.path, options.feature, options.changed, options.all].filter(Boolean);
  if (!options.help && structureModes.length > 1) {
    throw new Error("Choose only one structure mode.");
  }
  if (!options.help && structureModes.length === 1 && selectors.length > 0) {
    throw new Error("Structure modes cannot be combined with a test selector.");
  }
  if (!options.help && structureModes.length === 0 && selectors.length !== 1) {
    throw new Error("Choose exactly one selector: --path, --feature, --changed, or --all.");
  }
  if (options.base && !options.changed) throw new Error("--base can only be used with --changed.");
  return options;
}

async function gitLines(root, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return stdout.split("\n").filter(Boolean);
}

export async function getChangedFiles(root, base) {
  const groups = [];
  if (base) groups.push(await gitLines(root, changedDiffArguments(base)));
  groups.push(await gitLines(root, changedDiffArguments()));
  groups.push(await gitLines(root, ["ls-files", "--others", "--exclude-standard"]));
  return [...new Set(groups.flat())].sort();
}

async function runCommand(command, root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command.command} exited with ${code ?? signal}`));
    });
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const root = process.cwd();
  if (options.writeStructureBaseline) {
    const baseline = await writeStructureBaseline(root);
    process.stdout.write(
      `Wrote tooling/testing/structure-baseline.json with ${baseline.findings.length} findings.\n`,
    );
    return;
  }
  if (options.checkStructure) {
    const result = await checkStructure(root);
    process.stdout.write(
      options.json ? `${JSON.stringify(result, null, 2)}\n` : formatStructureResult(result),
    );
    if (!result.ok) process.exitCode = 1;
    return;
  }

  const changedFiles = options.changed ? await getChangedFiles(root, options.base) : [];
  const selector = {
    ...(options.path ? { path: options.path } : {}),
    ...(options.feature ? { feature: options.feature } : {}),
    ...(options.changed ? { changed: true } : {}),
    ...(options.all ? { all: true } : {}),
  };
  const plan = await createPlan({
    root,
    selector,
    changedFiles,
    runtime: options.runtime,
    verify: options.verify,
    requireTests: options.run || options.verify,
  });
  process.stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : formatPlan(plan));

  if (options.run || options.verify) {
    for (const command of plan.commands) await runCommand(command, root);
  }
}

main().catch((error) => {
  process.stderr.write(`test planner: ${error.message}\n`);
  process.exitCode = 1;
});
