#!/usr/bin/env tsx

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import {
  autocommitSettings,
  type MigrationLedgerEntry,
  type MigrationPolicy,
} from "./_migration-plan";

const fixtureDirectory = mkdtempSync(resolve(tmpdir(), "gradientpeak-autocommit-migration-"));
const failedIndex = resolve(fixtureDirectory, "failed_index.sql");
writeFileSync(
  failedIndex,
  readFileSync(
    resolve(dbPackageRoot, "supabase/migrations/20260727090002_add_planned_day_summary_index.sql"),
    "utf8",
  ),
);
const policy = JSON.parse(
  readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
) as MigrationPolicy;
const indexEntry = JSON.parse(
  readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
) as { entries: MigrationLedgerEntry[] };

try {
  await withDisposableDatabase(process.argv.slice(2), "autocommit_failure", async (target) => {
    await bootstrapSupabaseSchemas(target);
    await applySqlFile(
      target,
      resolve(dbPackageRoot, "supabase/migrations/20260726005149_generation_2_baseline.sql"),
    );
    for (const migration of indexEntry.entries.slice(1, 2)) {
      await applySqlFile(
        target,
        resolve(dbPackageRoot, "supabase/migrations", `${migration.version}_${migration.name}.sql`),
        migration.executionMode,
        autocommitSettings(policy, migration),
      );
    }
    const indexMigration = indexEntry.entries[2];
    if (!indexMigration) throw new Error("migration ledger is missing index migration metadata");
    const autocommit = autocommitSettings(policy, indexMigration);
    await applySqlFile(target, failedIndex, "autocommit", autocommit);
    try {
      await applySqlFile(target, failedIndex, "autocommit", autocommit);
      throw new Error("failing concurrent index migration unexpectedly succeeded");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("DROP INDEX CONCURRENTLY IF EXISTS"))
        throw new Error("failed concurrent index did not report cleanup instructions", {
          cause: error,
        });
    }
  });
  console.log(
    "[db:migration:autocommit:test] failed concurrent index reports cleanup instructions",
  );
} finally {
  rmSync(fixtureDirectory, { force: true, recursive: true });
}
