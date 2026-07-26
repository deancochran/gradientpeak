#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";

type Entry = { version: string; name: string };
type Policy = {
  authorityDirectory: string;
  archiveDirectory: string;
  mirrorDirectory: string;
  baseline: { version: string; name: string; sha256: string };
  activeLedgerFile: string;
};
const policy = JSON.parse(
  readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
) as Policy;
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const sqlFiles = (directory: string) =>
  readdirSync(directory, { recursive: true })
    .filter((file): file is string => typeof file === "string" && file.endsWith(".sql"))
    .sort();

function activeEntries(files: string[]): Entry[] {
  return files.map((file) => {
    const match = file.match(/^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/);
    if (!match?.[1] || !match[2]) throw new Error(`invalid active migration filename: ${file}`);
    return { version: match[1], name: match[2] };
  });
}

function check() {
  const authority = resolve(dbPackageRoot, policy.authorityDirectory);
  const mirror = resolve(dbPackageRoot, policy.mirrorDirectory);
  const archive = resolve(dbPackageRoot, policy.archiveDirectory);
  const active = sqlFiles(authority);
  const mirrors = sqlFiles(mirror);
  const archived = sqlFiles(archive);
  const expected = `${policy.baseline.version}_${policy.baseline.name}.sql`;
  const errors: string[] = [];
  if (JSON.stringify(active) !== JSON.stringify([expected]))
    errors.push("generation 2 requires exactly one active baseline");
  if (JSON.stringify(mirrors) !== JSON.stringify([expected]))
    errors.push("drizzle/deploy must contain only the active baseline mirror");
  if (active[0]) {
    const content = readFileSync(resolve(authority, active[0]));
    if (hash(content) !== policy.baseline.sha256)
      errors.push("generation 2 baseline hash differs from policy");
    if (!readFileSync(resolve(mirror, active[0])).equals(content))
      errors.push("byte-level mirror drift");
  }
  const lock = JSON.parse(readFileSync(resolve(dbPackageRoot, "migration-lock.json"), "utf8")) as {
    files: Record<string, string>;
  };
  const archivePaths = archived.map((file) => `${policy.archiveDirectory}/${file}`);
  if (JSON.stringify(Object.keys(lock.files).sort()) !== JSON.stringify(archivePaths))
    errors.push("archive file set differs from migration lock");
  for (const path of archivePaths)
    if (lock.files[path] !== hash(readFileSync(resolve(dbPackageRoot, path))))
      errors.push(`immutable archive drift: ${path}`);
  const ledger = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
  ) as { entries: Entry[] };
  if (JSON.stringify(ledger.entries) !== JSON.stringify(activeEntries(active)))
    errors.push("active ledger is not the exact generation 2 baseline");
  const versions = new Set<string>();
  for (const file of [...active, ...archived.map((file) => file.split("/").at(-1) ?? "")]) {
    const version = file.slice(0, 14);
    if (versions.has(version))
      errors.push(`duplicate migration timestamp across generations: ${version}`);
    versions.add(version);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `[db:migration:check] generation 2 baseline, ${archived.length} immutable archived files, and mirror OK`,
  );
}

if (process.argv[2] === "check") {
  try {
    check();
  } catch (error) {
    console.error(`[db:migration] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else {
  console.error("[db:migration] generation 2 is hard-reset-only; only `check` is supported");
  process.exit(1);
}
