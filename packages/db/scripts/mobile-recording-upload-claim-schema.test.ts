import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { activityFileIngestionStatusEnum } from "../src/schema/enums";
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
  "uploaded_at",
  "staging_cleanup_pending",
  "staging_cleaned_at",
  "staging_cleanup_error",
  "contract_version",
  "operation_id",
  "failure_code",
]) {
  assert.ok(columns.has(columnName), `activity_file_ingestions.${columnName} must exist`);
}

assert.equal(columns.get("expected_byte_size")?.dataType, "number");
assert.equal(columns.get("staging_cleanup_pending")?.notNull, true);
assert.equal(columns.get("staging_cleanup_pending")?.default, false);

const checkNames = new Set(config.checks.map((constraint) => constraint.name));
for (const checkName of [
  "activity_file_ingestions_operation_id_check",
  "activity_file_ingestions_provider_identity_check",
  "activity_file_ingestions_expected_size_check",
  "activity_file_ingestions_expected_hash_check",
  "activity_file_ingestions_staging_metadata_check",
  "activity_file_ingestions_cleanup_state_check",
  "activity_file_ingestions_lifecycle_check",
]) {
  assert.ok(checkNames.has(checkName), `${checkName} must exist`);
}

for (const removedColumn of [
  "claim_token",
  "lease_expires_at",
  "attempt_count",
  "last_error_message",
  "recovery_context",
  "cancellation_reason",
  "accepted_sha256",
  "accepted_byte_size",
  "accepted_bucket",
  "accepted_path",
  "accepted_media_type",
  "accepted_format",
]) {
  assert.equal(
    columns.has(removedColumn),
    false,
    `activity_file_ingestions.${removedColumn} must be owned by activity_artifacts only`,
  );
}

const indexNames = new Set(config.indexes.map((index) => index.config.name));
assert.ok(indexNames.has("activity_file_ingestions_profile_operation_unique"));
assert.deepEqual(activityFileIngestionStatusEnum.enumValues, [
  "awaiting_upload",
  "processing",
  "failed_retryable",
  "succeeded",
  "failed_terminal",
]);

const migration = readFileSync(
  resolve(dbPackageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql"),
  "utf8",
);
for (const mediaType of ["application/vnd.ant.fit", "application/vnd.garmin.tcx+xml"]) {
  assert.ok(
    migration.includes(`'${mediaType}'`),
    `activity-files must accept promoted ${mediaType} artifacts`,
  );
}
for (const deferredObject of ["activity_ingestion_jobs", "recovery_context"]) {
  assert.equal(
    migration.includes(deferredObject),
    false,
    `fresh baseline must not contain deferred ingestion recovery object ${deferredObject}`,
  );
}

console.log("Direct activity intake business-record schema contract tests passed.");
