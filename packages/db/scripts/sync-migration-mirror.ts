#!/usr/bin/env tsx

import { lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";

type MirrorPolicy = {
  authorityDirectory: string;
  mirrorDirectory: string;
};

export type MigrationMirrorDirectories = {
  authorityDirectory: string;
  mirrorDirectory: string;
};

function assertDirectory(directory: string, label: string) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function sqlFiles(directory: string, label: string, allowSymlinks = false) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith(".sql"))
    .map((entry) => {
      if (!entry.isFile() && !(allowSymlinks && entry.isSymbolicLink())) {
        throw new Error(`${label} migration entry must be a regular file: ${entry.name}`);
      }
      return entry.name;
    })
    .sort();
}

/**
 * Mirrors only top-level SQL files. Nested and non-SQL entries are outside the
 * deployable-migration policy and are intentionally left untouched.
 */
export function syncMigrationMirror({
  authorityDirectory,
  mirrorDirectory,
}: MigrationMirrorDirectories) {
  assertDirectory(authorityDirectory, "migration authority directory");
  assertDirectory(mirrorDirectory, "migration mirror directory");

  const authorityFiles = sqlFiles(authorityDirectory, "authority");
  const mirrorFiles = sqlFiles(mirrorDirectory, "mirror", true);
  const authorityFileSet = new Set(authorityFiles);

  for (const file of mirrorFiles) {
    if (!authorityFileSet.has(file)) rmSync(resolve(mirrorDirectory, file));
  }

  for (const file of authorityFiles) {
    const source = resolve(authorityDirectory, file);
    const destination = resolve(mirrorDirectory, file);
    const sourceContents = readFileSync(source);

    if (lstatSync(destination, { throwIfNoEntry: false })?.isFile()) {
      if (readFileSync(destination).equals(sourceContents)) continue;
    }

    // Unlink a stale symlink before writing so a mirror entry cannot redirect
    // this generated output outside the explicitly supplied mirror directory.
    rmSync(destination, { force: true });
    writeFileSync(destination, sourceContents);
  }

  return authorityFiles;
}

function resolvePackageOwnedDirectory(relativeDirectory: string) {
  const directory = resolve(dbPackageRoot, relativeDirectory);
  const pathFromPackage = relative(dbPackageRoot, directory);
  if (pathFromPackage.startsWith("..") || pathFromPackage === "") {
    throw new Error(`migration policy directory escapes package ownership: ${relativeDirectory}`);
  }
  return directory;
}

function main() {
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as MirrorPolicy;
  const authorityFiles = syncMigrationMirror({
    authorityDirectory: resolvePackageOwnedDirectory(policy.authorityDirectory),
    mirrorDirectory: resolvePackageOwnedDirectory(policy.mirrorDirectory),
  });
  console.log(
    `[db:migration:mirror] synchronized ${authorityFiles.length} deployable migrations from authority`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
