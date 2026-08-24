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

/** Guard one transactional MVP baseline followed only by ordered forward migrations. */
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
  const entries = readdirSync(authority, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (
    entries.length === 0 ||
    entries.some(
      (entry) =>
        !entry.isFile() || entry.isSymbolicLink() || !/^\d{14}_[a-z0-9_]+\.sql$/.test(entry.name),
    )
  ) {
    throw new Error("migration authority must contain only regular timestamped SQL files");
  }
  const baselineEntries = entries.filter((entry) => /^\d{14}_mvp_baseline\.sql$/.test(entry.name));
  if (baselineEntries.length !== 1 || entries[0]?.name !== baselineEntries[0]?.name) {
    throw new Error(
      "migration authority must begin with exactly one regular MVP baseline SQL file",
    );
  }
  const versions = entries.map((entry) => entry.name.slice(0, 14));
  if (new Set(versions).size !== versions.length) {
    throw new Error("migration authority requires unique ordered timestamp versions");
  }
  const filename = baselineEntries[0]?.name;
  if (!filename) throw new Error("migration authority is missing the MVP baseline SQL file");
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
  console.log("[db:baseline:check] transactional MVP baseline and ordered forward migrations OK");
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
