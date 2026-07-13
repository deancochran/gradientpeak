#!/usr/bin/env tsx

import { type BinaryLike, createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";

type Policy = {
  authorityDirectory: string;
  archiveDirectory: string;
  mirrorDirectory: string;
  baseline: { version: string; name: string; sha256: string };
  ledgerEvidence: {
    preReconciliationFile: string;
    postReconciliationFile: string;
    mismatchCatalogFile: string;
  };
  contentAliases: string[][];
};
type Ledger = { entries: Array<{ version: string; name: string }> };
type MismatchCatalog = { ledgerOnly: string[]; archiveOnly: string[] };

const policyPath = resolve(dbPackageRoot, "migration-policy.json");
const lockPath = resolve(dbPackageRoot, "migration-lock.json");
const policy = JSON.parse(readFileSync(policyPath, "utf8")) as Policy;
const authorityDirectory = resolve(dbPackageRoot, policy.authorityDirectory);
const archiveDirectory = resolve(dbPackageRoot, policy.archiveDirectory);
const mirrorDirectory = resolve(dbPackageRoot, policy.mirrorDirectory);
const migrationPattern = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

function sqlFiles(directory: string) {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function repoPath(path: string) {
  return relative(dbPackageRoot, path).replaceAll("\\", "/");
}

function hash(content: BinaryLike) {
  return createHash("sha256").update(content).digest("hex");
}

function baselineFileName() {
  return `${policy.baseline.version}_${policy.baseline.name}.sql`;
}

function syncMirrors() {
  mkdirSync(mirrorDirectory, { recursive: true });
  const activeFiles = sqlFiles(authorityDirectory);
  for (const file of activeFiles) {
    copyFileSync(resolve(authorityDirectory, file), resolve(mirrorDirectory, file));
  }
  console.log(`[db:migration:sync] mirrored ${activeFiles.length} authoritative migrations`);
}

function writeArchiveLock() {
  const files = Object.fromEntries(
    sqlFiles(archiveDirectory).map((file) => [
      `${policy.archiveDirectory}/${file}`,
      hash(readFileSync(resolve(archiveDirectory, file))),
    ]),
  );
  writeFileSync(lockPath, `${JSON.stringify({ algorithm: "sha256", files }, null, 2)}\n`);
  console.log(`[db:migration:lock] recorded ${Object.keys(files).length} archived migrations`);
}

function isAllowedDuplicate(paths: string[]) {
  const sorted = [...paths].sort();
  return policy.contentAliases.some(
    (alias) => JSON.stringify([...alias].sort()) === JSON.stringify(sorted),
  );
}

function check() {
  const errors: string[] = [];
  const activeFiles = sqlFiles(authorityDirectory);
  const archiveFiles = sqlFiles(archiveDirectory);
  const mirrorFiles = sqlFiles(mirrorDirectory);
  const allPaths = [
    ...activeFiles.map((file) => resolve(authorityDirectory, file)),
    ...archiveFiles.map((file) => resolve(archiveDirectory, file)),
  ];
  const versions = new Map<string, string[]>();
  const hashes = new Map<string, string[]>();

  for (const path of allPaths) {
    const match = basename(path).match(migrationPattern);
    if (!match?.[1]) {
      errors.push(`invalid migration filename: ${repoPath(path)}`);
      continue;
    }
    const versionPaths = versions.get(match[1]) ?? [];
    versionPaths.push(repoPath(path));
    versions.set(match[1], versionPaths);
    const digest = hash(readFileSync(path));
    const digestPaths = hashes.get(digest) ?? [];
    digestPaths.push(repoPath(path));
    hashes.set(digest, digestPaths);
  }

  for (const [version, paths] of versions) {
    if (paths.length > 1) errors.push(`duplicate timestamp ${version}: ${paths.join(", ")}`);
  }
  for (const paths of hashes.values()) {
    if (paths.length > 1 && !isAllowedDuplicate(paths)) {
      errors.push(`duplicate migration content: ${paths.join(", ")}`);
    }
  }
  for (const alias of policy.contentAliases) {
    const aliasHashes = alias.map((path) => hash(readFileSync(resolve(dbPackageRoot, path))));
    if (new Set(aliasHashes).size !== 1) {
      errors.push(`stale content alias does not describe byte-identical SQL: ${alias.join(", ")}`);
    }
  }

  if (JSON.stringify(activeFiles) !== JSON.stringify(mirrorFiles)) {
    errors.push("active Supabase migrations and drizzle/deploy mirror filenames differ");
  } else {
    for (const file of activeFiles) {
      const authority = readFileSync(resolve(authorityDirectory, file));
      const mirror = readFileSync(resolve(mirrorDirectory, file));
      if (!authority.equals(mirror)) errors.push(`byte-level mirror drift: ${file}`);
    }
  }

  const actualBaseline = readFileSync(resolve(authorityDirectory, baselineFileName()));
  if (hash(actualBaseline) !== policy.baseline.sha256) {
    errors.push("reconciliation baseline hash differs from migration-policy.json");
  }

  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { files: Record<string, string> };
  const archivePaths = archiveFiles.map((file) => `${policy.archiveDirectory}/${file}`);
  if (JSON.stringify(Object.keys(lock.files).sort()) !== JSON.stringify(archivePaths.sort())) {
    errors.push("archive file set differs from migration-lock.json");
  }
  for (const path of archivePaths) {
    const digest = hash(readFileSync(resolve(dbPackageRoot, path)));
    if (lock.files[path] !== digest) errors.push(`immutable archive drift: ${path}`);
  }

  const preLedger = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.preReconciliationFile), "utf8"),
  ) as Ledger;
  const postLedger = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.postReconciliationFile), "utf8"),
  ) as Ledger;
  const mismatches = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.mismatchCatalogFile), "utf8"),
  ) as MismatchCatalog;
  const activeEntries = activeFiles.map((file) => ({
    version: file.slice(0, 14),
    name: file.slice(15, -4),
  }));
  if (JSON.stringify(postLedger.entries) !== JSON.stringify(activeEntries)) {
    errors.push("post-reconciliation ledger does not exactly match active migrations");
  }
  const preVersions = new Set(preLedger.entries.map((entry) => entry.version));
  const archiveVersions = new Set(archiveFiles.map((file) => file.slice(0, 14)));
  const ledgerOnly = [...preVersions].filter((version) => !archiveVersions.has(version)).sort();
  const archiveOnly = [...archiveVersions].filter((version) => !preVersions.has(version)).sort();
  if (JSON.stringify(mismatches.ledgerOnly) !== JSON.stringify(ledgerOnly)) {
    errors.push("ledger-only mismatch catalog is stale");
  }
  if (JSON.stringify(mismatches.archiveOnly) !== JSON.stringify(archiveOnly)) {
    errors.push("archive-only mismatch catalog is stale");
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(
    `[db:migration:check] ${activeFiles.length} active, ${archiveFiles.length} archived, mirrors and baseline OK`,
  );
}

function timestamp(date = new Date()) {
  return date.toISOString().replaceAll(/[-:T]/g, "").slice(0, 14);
}

function createMigration(rawName: string | undefined) {
  const name = rawName
    ?.trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_|_$/g, "");
  if (!name) throw new Error("usage: pnpm db:migration:new <descriptive-name>");

  const version = timestamp();
  const activeVersions = sqlFiles(authorityDirectory).map((file) => file.slice(0, 14));
  const archivedVersions = new Set(sqlFiles(archiveDirectory).map((file) => file.slice(0, 14)));
  if (activeVersions.some((existing) => existing >= version)) {
    throw new Error(`timestamp ${version} is not newer than active migration history; retry later`);
  }
  if (archivedVersions.has(version)) {
    throw new Error(`timestamp ${version} collides with archived migration history; retry later`);
  }

  const file = `${version}_${name}.sql`;
  const content = `-- ${name.replaceAll("_", " ")}\n`;
  mkdirSync(mirrorDirectory, { recursive: true });
  writeFileSync(resolve(authorityDirectory, file), content, { flag: "wx" });
  writeFileSync(resolve(mirrorDirectory, file), content, { flag: "wx" });
  console.log(`[db:migration:new] created ${policy.authorityDirectory}/${file}`);
  console.log(`[db:migration:new] mirrored ${policy.mirrorDirectory}/${file}`);
}

const [commandOrName, value] = process.argv.slice(2);
try {
  if (commandOrName === "check") check();
  else if (commandOrName === "sync") syncMirrors();
  else if (commandOrName === "lock-archive") writeArchiveLock();
  else createMigration(commandOrName ?? value);
} catch (error) {
  console.error(`[db:migration] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
