#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { dbPackageRoot, repoRoot } from "./_helpers";

const functionName = "analyze-activity-file";
const confirmationToken = "DELETE_ANALYZE_ACTIVITY_FILE_FROM_HOSTED_PROJECT";

/**
 * Guarded hosted-retirement runbook. Repository absence is not evidence of hosted safety.
 * Before running this procedure, record external-caller and hosted-runtime review in an
 * evidence file, then supply that file with the explicit project ref and confirmation token.
 */

function getArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(
    `${message}\n\n` +
      "Hosted retirement requires evidence beyond repository search. Before execution, record " +
      "external-caller and runtime evidence showing that no supported hosted caller remains.\n\n" +
      "Usage: tsx scripts/retire-edge-function.ts " +
      "--project-ref <ref> --evidence-file <path> " +
      `--confirm ${confirmationToken}`,
  );
}

const projectRef = getArgument("--project-ref");
const evidenceFileArgument = getArgument("--evidence-file");
const confirmation = getArgument("--confirm");

if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) {
  fail("A valid explicit --project-ref is required.");
}

if (!evidenceFileArgument) {
  fail("An --evidence-file documenting external-caller and hosted-runtime review is required.");
}

const evidenceFile = resolve(repoRoot, evidenceFileArgument);

if (!existsSync(evidenceFile) || !statSync(evidenceFile).isFile()) {
  fail(`Evidence file does not exist: ${evidenceFileArgument}`);
}

if (confirmation !== confirmationToken) {
  fail("The deliberate hosted-retirement confirmation token was not provided.");
}

console.log(`Deleting hosted Edge Function from explicit project ${projectRef}.`);
execFileSync(
  "pnpm",
  ["exec", "supabase", "functions", "delete", functionName, "--project-ref", projectRef, "--yes"],
  { cwd: dbPackageRoot, stdio: "inherit" },
);

const functionList = execFileSync(
  "pnpm",
  ["exec", "supabase", "functions", "list", "--project-ref", projectRef, "--output", "json"],
  { cwd: dbPackageRoot, encoding: "utf8" },
);

process.stdout.write(functionList);

if (functionList.includes(functionName)) {
  throw new Error(`Hosted retirement verification failed: ${functionName} is still listed.`);
}

console.log(`Hosted retirement verified for project ${projectRef}.`);
