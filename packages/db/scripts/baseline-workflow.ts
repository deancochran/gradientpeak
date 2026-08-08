#!/usr/bin/env tsx

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dbPackageRoot } from "./_helpers";

export type FreshBaseline = {
  filename: string;
  name: "mvp_baseline";
  sourcePath: string;
  version: string;
};

/** Small fresh-only guard: Supabase owns exactly one regular transactional MVP baseline. */
export function requireFreshBaseline(root = dbPackageRoot): FreshBaseline {
  const authority = resolve(root, "supabase/migrations");
  const retiredActiveArtifacts = [
    resolve(root, "drizzle/deploy"),
    resolve(root, "migration-ledger.json"),
    resolve(root, "migration-policy.json"),
  ];
  if (retiredActiveArtifacts.some((path) => existsSync(path))) {
    throw new Error("retired baseline mirror, ledger, or policy artifacts must remain absent");
  }
  if (!lstatSync(authority).isDirectory() || lstatSync(authority).isSymbolicLink()) {
    throw new Error("baseline authority must be a real directory");
  }
  const entries = readdirSync(authority, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    !entries[0]?.isFile() ||
    entries[0].isSymbolicLink() ||
    !/^\d{14}_mvp_baseline\.sql$/.test(entries[0].name)
  ) {
    throw new Error("baseline authority must contain exactly one regular MVP baseline SQL file");
  }
  const filename = entries[0].name;
  const sourcePath = resolve(authority, filename);
  const sql = readFileSync(sourcePath, "utf8").trim();
  if (!/^BEGIN;/i.test(sql) || !/COMMIT;$/i.test(sql)) {
    throw new Error("MVP baseline must be explicitly transactional");
  }
  return {
    filename,
    name: "mvp_baseline",
    sourcePath,
    version: filename.slice(0, 14),
  };
}

function check() {
  requireFreshBaseline(process.env.GRADIENTPEAK_BASELINE_WORKFLOW_ROOT ?? dbPackageRoot);
  console.log("[db:baseline:check] exactly one transactional Supabase MVP baseline OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "check") {
    console.error("[db:baseline] only `check` is supported");
    process.exit(1);
  }
  try {
    check();
  } catch (error) {
    console.error(`[db:baseline] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
