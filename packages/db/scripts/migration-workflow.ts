#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";
import { type MigrationOperation, validateAutocommitOperation } from "./_migration-operations";

type ExecutionMode = "transactional" | "autocommit";
type Entry = {
  version: string;
  name: string;
  sha256: string;
  executionMode: ExecutionMode;
  operation?: MigrationOperation;
};
type Policy = {
  authorityDirectory: string;
  archiveDirectory: string;
  mirrorDirectory: string;
  baseline: { version: string; name: string; sha256: string };
  forwardMigrations: {
    filenamePattern: string;
    minimumVersionExclusive: string;
    executionModes: ExecutionMode[];
    autocommitOperationKinds: MigrationOperation["kind"][];
  };
  activeLedgerFile: string;
};
const packageRoot = process.env.GRADIENTPEAK_MIGRATION_WORKFLOW_ROOT ?? dbPackageRoot;
const policy = JSON.parse(
  readFileSync(resolve(packageRoot, "migration-policy.json"), "utf8"),
) as Policy;
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const sqlFiles = (directory: string) =>
  readdirSync(directory, { recursive: true })
    .filter((file): file is string => typeof file === "string" && file.endsWith(".sql"))
    .sort();

function activeEntries(
  directory: string,
  files: string[],
  filenamePattern: RegExp,
): Omit<Entry, "executionMode">[] {
  return files.map((file) => {
    const match = file.match(filenamePattern);
    if (!match?.[1] || !match[2]) throw new Error(`invalid active migration filename: ${file}`);
    return {
      version: match[1],
      name: match[2],
      sha256: hash(readFileSync(resolve(directory, file))),
    };
  });
}

function check() {
  const authority = resolve(packageRoot, policy.authorityDirectory);
  const mirror = resolve(packageRoot, policy.mirrorDirectory);
  const archive = resolve(packageRoot, policy.archiveDirectory);
  const active = sqlFiles(authority);
  const mirrors = sqlFiles(mirror);
  const archived = sqlFiles(archive);
  const expected = `${policy.baseline.version}_${policy.baseline.name}.sql`;
  const filenamePattern = new RegExp(policy.forwardMigrations.filenamePattern);
  const errors: string[] = [];
  if (active[0] !== expected) errors.push("generation 2 baseline is missing or reordered");
  if (hash(readFileSync(resolve(authority, expected))) !== policy.baseline.sha256)
    errors.push("generation 2 baseline hash differs from policy");
  if (JSON.stringify(mirrors) !== JSON.stringify(active))
    errors.push("drizzle/deploy file set differs from deployable migration authority");
  for (const file of active) {
    const content = readFileSync(resolve(authority, file));
    if (!readFileSync(resolve(mirror, file)).equals(content))
      errors.push(`byte-level mirror drift: ${file}`);
  }
  const fileEntries = activeEntries(authority, active, filenamePattern);
  for (const entry of fileEntries.slice(1)) {
    if (entry.version <= policy.forwardMigrations.minimumVersionExclusive)
      errors.push(`forward migration must be ordered after baseline: ${entry.version}`);
  }
  const lock = JSON.parse(readFileSync(resolve(packageRoot, "migration-lock.json"), "utf8")) as {
    files: Record<string, string>;
  };
  const archivePaths = archived.map((file) => `${policy.archiveDirectory}/${file}`);
  if (JSON.stringify(Object.keys(lock.files).sort()) !== JSON.stringify(archivePaths))
    errors.push("archive file set differs from migration lock");
  for (const path of archivePaths)
    if (lock.files[path] !== hash(readFileSync(resolve(packageRoot, path))))
      errors.push(`immutable archive drift: ${path}`);
  const ledger = JSON.parse(
    readFileSync(resolve(packageRoot, policy.activeLedgerFile), "utf8"),
  ) as { generation: number; entries: Entry[] };
  if (ledger.generation !== 2) errors.push("active ledger is not generation 2");
  if (ledger.entries[0]?.executionMode !== "transactional")
    errors.push("generation 2 baseline must remain transactional");
  for (const entry of ledger.entries.slice(1)) {
    if (!policy.forwardMigrations.executionModes.includes(entry.executionMode))
      errors.push(`unsupported forward migration execution mode: ${entry.executionMode}`);
    if (entry.executionMode === "autocommit") {
      if (
        !entry.operation ||
        !policy.forwardMigrations.autocommitOperationKinds.includes(entry.operation.kind)
      ) {
        errors.push(`unsupported autocommit migration operation: ${entry.version}`);
      } else {
        try {
          validateAutocommitOperation(
            readFileSync(resolve(authority, `${entry.version}_${entry.name}.sql`), "utf8"),
            entry.operation,
          );
        } catch (error) {
          errors.push(
            `invalid autocommit migration statement ${entry.version}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } else if (entry.operation) {
      errors.push(
        `transactional migration cannot declare an autocommit operation: ${entry.version}`,
      );
    }
  }
  const entries = ledger.entries.map(({ version, name, sha256 }) => ({ version, name, sha256 }));
  if (JSON.stringify(entries) !== JSON.stringify(fileEntries))
    errors.push("active ledger is not the exact baseline plus hashed forward chain");
  const versions = new Set<string>();
  for (const file of [...active, ...archived.map((file) => file.split("/").at(-1) ?? "")]) {
    const version = file.slice(0, 14);
    if (versions.has(version))
      errors.push(`duplicate migration timestamp across generations: ${version}`);
    versions.add(version);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `[db:migration:check] immutable generation 2 baseline, ${fileEntries.length - 1} hashed forwards, ${archived.length} immutable archived files, and mirror OK`,
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
  console.error(
    "[db:migration] only `check` is supported; repair, downgrade, and non-local mutation are prohibited",
  );
  process.exit(1);
}
