import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY } from "@repo/core/performance-calibration";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  performanceCalibrationEvidenceStateEnum,
  performanceCalibrationMetricKeyEnum,
} from "../src/schema/enums";
import {
  activities,
  activityArtifactLinks,
  performanceCalibrationEvidence,
  performanceCalibrationModelInputs,
  performanceCalibrationSelectionEvidence,
  performanceCalibrations,
  profilePerformanceEstimates,
} from "../src/schema/tables";

assert.deepEqual(performanceCalibrationMetricKeyEnum.enumValues, [
  "threshold_power",
  "threshold_speed",
  "threshold_heart_rate",
]);
assert.deepEqual(performanceCalibrationEvidenceStateEnum.enumValues, [
  "candidate",
  "rejected",
  "invalidated",
]);

const evidenceColumns = getTableColumns(performanceCalibrationEvidence);
for (const name of [
  "profile_id",
  "metric_key",
  "activity_category",
  "segment_revision",
  "source_artifact_id",
  "diagnostics",
  "invalidated_at",
] as const) {
  assert.ok(evidenceColumns[name], `Missing calibration evidence column ${name}`);
}
const calibrationColumns = getTableColumns(performanceCalibrations);
assert.ok(calibrationColumns.selection_diagnostics);
assert.ok(calibrationColumns.supersedes_id);
assert.ok(!("state" in calibrationColumns));
assert.ok(!("calibration_state" in getTableColumns(profilePerformanceEstimates)));
const calibrationConfig = getTableConfig(performanceCalibrations);
assert.ok(
  calibrationConfig.uniqueConstraints.some(
    (constraint) => constraint.name === "performance_calibrations_supersedes_unique",
  ),
);
assert.ok(
  calibrationConfig.foreignKeys.some(
    (constraint) => constraint.getName() === "performance_calibrations_supersedes_identity_fkey",
  ),
);
const modelInputColumns = getTableColumns(performanceCalibrationModelInputs);
for (const name of [
  "calibration_evidence_id",
  "effort_id",
  "profile_id",
  "activity_id",
  "segment_id",
  "segment_revision",
  "source_artifact_id",
  "source_artifact_digest",
] as const) {
  assert.ok(modelInputColumns[name], `Missing calibration model input column ${name}`);
}
const selectionEvidenceColumns = getTableColumns(performanceCalibrationSelectionEvidence);
assert.ok(selectionEvidenceColumns.evidence_id);
assert.ok(selectionEvidenceColumns.calibration_id);
assert.ok(selectionEvidenceColumns.profile_id);
assert.ok(selectionEvidenceColumns.metric_key);
assert.ok(selectionEvidenceColumns.activity_category);

const baselinePath = fileURLToPath(
  new URL("../supabase/migrations/20260730000000_mvp_baseline.sql", import.meta.url),
);
const baseline = await readFile(baselinePath, "utf8");
for (const required of [
  'CREATE TABLE "performance_calibration_evidence"',
  'CREATE TABLE "performance_calibration_model_inputs"',
  'CREATE TABLE "performance_calibrations"',
  'CREATE TABLE "performance_calibration_selection_evidence"',
  'CONSTRAINT "performance_calibration_evidence_source_policy_unique"',
  'CONSTRAINT "performance_calibration_evidence_identity_unique" UNIQUE("id","profile_id","metric_key","activity_category")',
  'CONSTRAINT "performance_calibration_model_inputs_evidence_identity_fkey" FOREIGN KEY ("calibration_evidence_id","profile_id","metric_key","activity_category")',
  'CONSTRAINT "performance_calibrations_identity_unique" UNIQUE("id","profile_id","metric_key","activity_category")',
  'CONSTRAINT "performance_calibration_selection_evidence_calibration_identity_fkey" FOREIGN KEY ("calibration_id","profile_id","metric_key","activity_category")',
  'CONSTRAINT "performance_calibration_selection_evidence_evidence_identity_fkey" FOREIGN KEY ("evidence_id","profile_id","metric_key","activity_category")',
  'CREATE INDEX "performance_calibrations_due_idx"',
  'CREATE INDEX "performance_calibration_selection_evidence_evidence_idx"',
  'ALTER TABLE "public"."performance_calibration_evidence" ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE "public"."performance_calibration_model_inputs" ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE "public"."performance_calibrations" ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE "public"."performance_calibration_selection_evidence" ENABLE ROW LEVEL SECURITY',
  'CREATE OR REPLACE FUNCTION "public"."reject_activity_performance_target_snapshot_mutation"()',
  "CREATE FUNCTION public.guard_performance_calibration_evidence_history()",
  "CREATE FUNCTION public.performance_calibration_lifecycle_policy()",
  "CREATE FUNCTION public.performance_calibration_evidence_is_current(target_evidence_id uuid)",
  "CREATE FUNCTION public.guard_performance_calibration_insert()",
  "CREATE FUNCTION public.guard_performance_calibration_append_only()",
  "CREATE FUNCTION public.guard_performance_calibration_selection_insert()",
  "CREATE FUNCTION public.guard_performance_calibration_model_input_insert()",
  "CREATE FUNCTION public.validate_performance_calibration_selection()",
  "CREATE FUNCTION public.validate_performance_calibration_model_inputs()",
  "CREATE TRIGGER performance_calibration_evidence_history_guard",
  "CREATE TRIGGER performance_calibrations_append_only",
  "CREATE TRIGGER performance_calibration_selection_append_only",
  "CREATE TRIGGER performance_calibration_model_inputs_append_only",
  "CREATE CONSTRAINT TRIGGER performance_calibrations_selection_guard",
  "CREATE CONSTRAINT TRIGGER performance_calibration_model_inputs_complete_guard",
  "REVOKE TRUNCATE ON TABLE",
  "CREATE TRIGGER activities_performance_target_snapshot_immutable BEFORE UPDATE OF performance_target_snapshot ON public.activities",
]) {
  assert.ok(baseline.includes(required), `Baseline is missing ${required}`);
}
const lifecyclePolicyMatch = baseline.match(
  /CREATE FUNCTION public\.performance_calibration_lifecycle_policy\(\)[\s\S]+?SELECT '(\{[\s\S]+?\})'::jsonb[\s\S]+?\$\$;/,
);
assert.ok(lifecyclePolicyMatch?.[1], "Baseline lifecycle policy JSON is missing");
assert.deepEqual(
  JSON.parse(lifecyclePolicyMatch[1]),
  PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY,
  "Core and database lifecycle policy values must remain identical",
);
assert.match(
  baseline,
  /selection_reason = 'complete_protocol'[\s\S]+calibration\.metric_key = 'threshold_speed'[\s\S]+calibration\.activity_category = 'swim'/,
  "The database must allow immediate confirmation only for complete swim CSS protocols",
);
assert.ok(
  !baseline.includes('CREATE UNIQUE INDEX "activity_artifact_links_current_source_unique"'),
  "Activities may retain multiple exact current source tuples",
);
assert.ok(
  !getTableConfig(activityArtifactLinks).indexes.some(
    (index) => index.config.name === "activity_artifact_links_current_source_unique",
  ),
  "Drizzle must allow multiple exact current source tuples per activity",
);
assert.ok(!baseline.includes('"state" "performance_calibration_state"'));
assert.ok(!baseline.includes('"calibration_state" "performance_calibration_state"'));
assert.match(
  baseline,
  /CONSTRAINT "performance_calibration_evidence_source_policy_unique" UNIQUE\("activity_id","segment_id","segment_revision","source_artifact_id","metric_key","policy_version"\)/,
);
assert.match(
  baseline,
  /CONSTRAINT "performance_calibrations_supersedes_identity_fkey" FOREIGN KEY \("supersedes_id","profile_id","metric_key","activity_category"\)/,
);
assert.ok(
  getTableColumns(activities).performance_target_snapshot,
  "Completed activities must retain their immutable published target snapshot",
);
assert.match(
  baseline,
  /if new\.performance_target_snapshot is distinct from old\.performance_target_snapshot then\s+raise exception 'activity performance target snapshots are immutable after capture'/,
  "The database must reject every post-capture snapshot change, including null-to-value updates",
);
for (const cascadingConstraint of [
  "performance_calibration_evidence_profile_id_profiles_id_fk",
  "performance_calibrations_profile_id_profiles_id_fk",
]) {
  assert.match(
    baseline,
    new RegExp(`CONSTRAINT "${cascadingConstraint}"[^;]+ON DELETE cascade`),
    `${cascadingConstraint} must preserve hard-delete cleanup`,
  );
}
for (const retainedAuditConstraint of [
  "performance_calibration_evidence_activity_profile_fkey",
  "performance_calibration_evidence_segment_activity_profile_fkey",
  "performance_calibration_evidence_source_link_fkey",
]) {
  assert.ok(
    !baseline.includes(`CONSTRAINT "${retainedAuditConstraint}"`),
    `${retainedAuditConstraint} would delete retained invalidation audit history`,
  );
}

console.log("Performance calibration schema and baseline contract tests passed.");
