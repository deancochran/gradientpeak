import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { importRunOwnershipSql } from "../src/schema/import-run-ownership";
import { activitySourceReferences, providerSyncJobs } from "../src/schema/tables";

const customConstraintNames = new Set([
  "activity_source_refs_last_import_run_profile_fk",
  "activity_source_refs_material_import_run_profile_fk",
  "provider_sync_jobs_import_run_profile_fkey",
]);

for (const table of [activitySourceReferences, providerSyncJobs]) {
  for (const foreignKey of getTableConfig(table).foreignKeys) {
    assert.ok(
      !customConstraintNames.has(foreignKey.getName()),
      `${foreignKey.getName()} must remain bespoke SQL until Drizzle supports ON DELETE SET NULL column lists`,
    );
  }
}

assert.match(importRunOwnershipSql, /on delete set null \(last_import_run_id\)/);
assert.match(importRunOwnershipSql, /on delete set null \(last_material_import_run_id\)/);
assert.match(importRunOwnershipSql, /on delete set null \(import_run_id\)/);
assert.match(importRunOwnershipSql, /last_material_effective_at = null/);

const baseline = readFileSync(
  resolve(import.meta.dirname, "../supabase/migrations/20260730000000_mvp_baseline.sql"),
  "utf8",
);
assert.ok(
  baseline.includes(importRunOwnershipSql.trim()),
  "baseline must materialize the canonical import-run ownership SQL artifact",
);

console.log("Import-run ownership schema source contract tests passed.");
