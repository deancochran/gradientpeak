#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";

type MirrorPolicy = {
  authorityDirectory: string;
  mirrorDirectory: string;
  baseline: { version: string; name: string; sha256: string };
};

export type MigrationMirrorDirectories = {
  authorityDirectory: string;
  mirrorDirectory: string;
  baseline: MirrorPolicy["baseline"];
};

function assertDirectory(directory: string, label: string) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function onlyExpectedSqlFile(directory: string, label: string, expectedFilename: string) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const entry = entries[0];
  if (
    entries.length !== 1 ||
    !entry?.isFile() ||
    entry.isSymbolicLink() ||
    entry.name !== expectedFilename
  ) {
    throw new Error(`${label} must contain only the regular policy-selected baseline file`);
  }
  return entry.name;
}

/**
 * Mirrors the sole policy-selected baseline. Active directories contain no
 * nested, non-SQL, or additional entries.
 */
export function syncBaselineMirror({
  authorityDirectory,
  mirrorDirectory,
  baseline,
}: MigrationMirrorDirectories) {
  assertDirectory(authorityDirectory, "baseline authority directory");
  assertDirectory(mirrorDirectory, "baseline mirror directory");

  const expectedFilename = `${baseline.version}_${baseline.name}.sql`;
  const authorityFile = onlyExpectedSqlFile(
    authorityDirectory,
    "baseline authority",
    expectedFilename,
  );
  const source = resolve(authorityDirectory, authorityFile);
  const sourceContents = readFileSync(source);
  if (createHash("sha256").update(sourceContents).digest("hex") !== baseline.sha256)
    throw new Error("policy-selected baseline hash differs from authority file");

  onlyExpectedSqlFile(mirrorDirectory, "baseline mirror", expectedFilename);
  const destination = resolve(mirrorDirectory, expectedFilename);
  if (lstatSync(destination, { throwIfNoEntry: false })?.isFile()) {
    if (readFileSync(destination).equals(sourceContents)) return [authorityFile];
  }
  rmSync(destination, { force: true });
  writeFileSync(destination, sourceContents);
  return [authorityFile];
}

function resolvePackageOwnedDirectory(relativeDirectory: string) {
  const directory = resolve(dbPackageRoot, relativeDirectory);
  const pathFromPackage = relative(dbPackageRoot, directory);
  if (pathFromPackage.startsWith("..") || pathFromPackage === "") {
    throw new Error(`baseline policy directory escapes package ownership: ${relativeDirectory}`);
  }
  return directory;
}

function main() {
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as MirrorPolicy;
  const authorityFiles = syncBaselineMirror({
    authorityDirectory: resolvePackageOwnedDirectory(policy.authorityDirectory),
    mirrorDirectory: resolvePackageOwnedDirectory(policy.mirrorDirectory),
    baseline: policy.baseline,
  });
  console.log(
    `[db:baseline:mirror] synchronized ${authorityFiles.length} policy-selected baseline from authority`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
