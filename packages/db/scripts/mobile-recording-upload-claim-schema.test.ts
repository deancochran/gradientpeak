import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { activityFileIngestions } from "../src/schema/tables";
import { dbPackageRoot } from "./_helpers";

const config = getTableConfig(activityFileIngestions);
const columns = new Map(config.columns.map((column) => [column.name, column]));

for (const columnName of [
  "staging_bucket",
  "staging_path",
  "expected_sha256",
  "expected_byte_size",
  "expected_format",
  "expected_media_type",
  "accepted_sha256",
  "accepted_byte_size",
  "accepted_bucket",
  "accepted_path",
  "accepted_media_type",
  "accepted_format",
  "uploaded_at",
  "staging_cleanup_pending",
  "staging_cleaned_at",
  "staging_cleanup_error",
]) {
  assert.ok(columns.has(columnName), `activity_file_ingestions.${columnName} must exist`);
}

assert.equal(columns.get("expected_byte_size")?.dataType, "number");
assert.equal(columns.get("accepted_byte_size")?.dataType, "number");
assert.equal(columns.get("staging_cleanup_pending")?.notNull, true);
assert.equal(columns.get("staging_cleanup_pending")?.default, false);

const checkNames = new Set(config.checks.map((constraint) => constraint.name));
for (const checkName of [
  "activity_file_ingestions_claim_check",
  "activity_file_ingestions_processing_claim_check",
  "activity_file_ingestions_expected_size_check",
  "activity_file_ingestions_accepted_size_check",
  "activity_file_ingestions_expected_hash_check",
  "activity_file_ingestions_accepted_hash_check",
  "activity_file_ingestions_staging_metadata_check",
  "activity_file_ingestions_accepted_metadata_check",
  "activity_file_ingestions_claim_artifact_match_check",
  "activity_file_ingestions_cleanup_state_check",
]) {
  assert.ok(checkNames.has(checkName), `${checkName} must exist`);
}

const indexNames = new Set(config.indexes.map((index) => index.config.name));
assert.ok(indexNames.has("activity_file_ingestions_profile_operation_unique"));

const migration = readFileSync(
  resolve(
    dbPackageRoot,
    "supabase/migrations/20260724143824_add_mobile_recording_upload_claim.sql",
  ),
  "utf8",
);
for (const mediaType of ["application/vnd.ant.fit", "application/vnd.garmin.tcx+xml"]) {
  assert.ok(
    migration.includes(`'${mediaType}'`),
    `activity-files must accept promoted ${mediaType} artifacts`,
  );
}
assert.match(
  migration,
  /activity_file_ingestions_processing_claim_check check[\s\S]*?\) not valid/,
  "strict processing-state enforcement must be additive and unvalidated for legacy rows",
);
assert.equal(/\bupdate\s+public\.activity_file_ingestions\b/i.test(migration), false);
assert.equal(/drop\s+constraint\s+activity_file_ingestions_claim_check/i.test(migration), false);
assert.equal(/create\s+index/i.test(migration), false);

console.log("Mobile recording upload claim schema contract tests passed.");
