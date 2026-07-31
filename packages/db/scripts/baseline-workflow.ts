#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dbPackageRoot } from "./_helpers";

type Entry = { version: string; name: string; sha256: string; executionMode: "transactional" };
type Policy = {
  authorityDirectory: string;
  mirrorDirectory: string;
  baseline: Pick<Entry, "version" | "name" | "sha256">;
  activeLedgerFile: string;
};

const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

export type FreshBaseline = Policy["baseline"] & { filename: string; sourcePath: string };

function onlyRegularSql(directory: string, label: string) {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    !entries[0]?.isFile() ||
    entries[0].isSymbolicLink() ||
    !entries[0].name.endsWith(".sql")
  ) {
    throw new Error(
      `${label} must contain exactly one regular non-symlink SQL file and no other entries`,
    );
  }
  return entries[0].name;
}

export function requireFreshBaseline(root = dbPackageRoot): FreshBaseline {
  const policy = JSON.parse(readFileSync(resolve(root, "migration-policy.json"), "utf8")) as Policy;
  const authority = resolve(root, policy.authorityDirectory);
  const mirror = resolve(root, policy.mirrorDirectory);
  if (
    !lstatSync(authority).isDirectory() ||
    lstatSync(authority).isSymbolicLink() ||
    !lstatSync(mirror).isDirectory() ||
    lstatSync(mirror).isSymbolicLink()
  ) {
    throw new Error("active baseline directories must be real directories");
  }
  if (
    !/^\d+$/.test(policy.baseline.version) ||
    policy.baseline.name !== "mvp_baseline" ||
    !/^[a-f0-9]{64}$/.test(policy.baseline.sha256)
  ) {
    throw new Error("baseline policy must declare the MVP baseline version, name, and SHA-256");
  }
  const filename = `${policy.baseline.version}_${policy.baseline.name}.sql`;
  const source = onlyRegularSql(authority, "baseline authority");
  const copy = onlyRegularSql(mirror, "baseline mirror");
  const sourcePath = resolve(authority, source);
  const mirrorPath = resolve(mirror, copy);
  const ledger = JSON.parse(readFileSync(resolve(root, policy.activeLedgerFile), "utf8")) as {
    generation: string;
    entries: Entry[];
  };
  const expected: Entry = { ...policy.baseline, executionMode: "transactional" };
  if (source !== filename || copy !== filename)
    throw new Error("fresh-only baseline filename differs from policy");
  if (digest(sourcePath) !== policy.baseline.sha256)
    throw new Error("baseline hash differs from policy");
  if (!readFileSync(sourcePath).equals(readFileSync(mirrorPath)))
    throw new Error("baseline mirror is not byte-identical");
  if (
    ledger.generation !== "mvp-fresh-only" ||
    ledger.entries.length !== 1 ||
    JSON.stringify(ledger.entries[0]) !== JSON.stringify(expected)
  ) {
    throw new Error("active ledger must contain exactly one matching transactional baseline entry");
  }
  return { ...policy.baseline, filename, sourcePath };
}

function check() {
  requireFreshBaseline(process.env.GRADIENTPEAK_BASELINE_WORKFLOW_ROOT ?? dbPackageRoot);
  console.log(
    "[db:baseline:check] one fresh-only transactional baseline, mirror, and ledger entry OK",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "check") {
    console.error(
      "[db:baseline] only `check` is supported; fresh targets are the sole supported workflow",
    );
    process.exit(1);
  }
  try {
    check();
  } catch (error) {
    console.error(`[db:baseline] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
