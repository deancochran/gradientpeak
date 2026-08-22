#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { loadBaseRegistry } from "./base-registry.mjs";
import {
  changedCapabilityIds,
  runRegisteredJourneys,
  selectChangedCapabilities,
  selectRegisteredJourneys,
  validateChangedCapabilityProof,
  validateRegistryStructure,
} from "./capability-runner.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? args[baseIndex + 1] : "HEAD";

async function main() {
  const registry = await import(
    pathToFileURL(path.join(root, "packages/core/parity/index.ts")).href
  );
  let baseRegistry;
  try {
    baseRegistry = await loadBaseRegistry(root, base);
  } catch (error) {
    process.stderr.write(`Unable to load base capability registry: ${error.message}\n`);
    return 1;
  }
  const changedOutput = await execFileAsync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRD", base, "--"],
    { cwd: root },
  );
  const changedPaths = changedOutput.stdout.trim() ? changedOutput.stdout.trim().split("\n") : [];
  const changedIds = changedCapabilityIds(
    baseRegistry.crossPlatformFeatureRegistry ?? baseRegistry.parityRegistry,
    registry.crossPlatformFeatureRegistry,
  );
  const structuralIssues = validateRegistryStructure(
    registry.crossPlatformFeatureRegistry,
    registry.crossPlatformFeatureSchema,
  );
  const regressionIssues = validateChangedCapabilityProof(
    baseRegistry.crossPlatformFeatureRegistry ?? baseRegistry.parityRegistry,
    registry.crossPlatformFeatureRegistry,
  );
  for (const issue of [...structuralIssues, ...regressionIssues]) {
    process.stderr.write(`Changed-proof failure: ${issue}\n`);
  }
  if (structuralIssues.length > 0 || regressionIssues.length > 0) return 1;
  const records = selectChangedCapabilities(
    registry.crossPlatformFeatureRegistry,
    changedPaths,
    changedIds,
  );
  const deletedIds = changedIds.filter(
    (id) => !registry.crossPlatformFeatureRegistry.some((record) => record.id === id),
  );
  const selection = selectRegisteredJourneys(records);
  process.stdout.write(
    `Changed capabilities: ${[...records.map((record) => record.id), ...deletedIds].join(", ") || "none"}\n`,
  );
  for (const id of deletedIds) process.stderr.write(`Proof gap: ${id} — capability was deleted\n`);
  for (const journey of selection.journeys) {
    process.stdout.write(
      `Selected ${journey.platform}: ${journey.reference.path} :: ${journey.reference.identity}\n`,
    );
  }
  for (const gap of selection.missing)
    process.stderr.write(`Proof gap: ${gap.capabilityId} (${gap.platform}) — ${gap.reason}\n`);
  if (args.includes("--plan")) return selection.missing.length > 0 ? 1 : 0;
  const results = await runRegisteredJourneys(selection.journeys, { cwd: root });
  const failed = results.filter((result) => result.status !== "passed");
  for (const result of failed)
    process.stderr.write(`Journey ${result.status}: ${result.capabilityId} (${result.platform})\n`);
  return deletedIds.length > 0 || selection.missing.length > 0 || failed.length > 0 ? 1 : 0;
}

process.exitCode = await main();
