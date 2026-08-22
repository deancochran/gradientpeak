import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  thresholdEvaluationEffortRoleEnum,
  thresholdEvaluationOutcomeEnum,
  thresholdEvaluationRejectionReasonEnum,
  thresholdMetricEnum,
} from "../src/schema/enums";
import {
  profilePerformanceEstimates,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholds,
} from "../src/schema/tables";

assert.deepEqual(thresholdMetricEnum.enumValues, ["power", "speed"]);
assert.deepEqual(thresholdEvaluationOutcomeEnum.enumValues, ["qualified", "rejected"]);
assert.deepEqual(thresholdEvaluationEffortRoleEnum.enumValues, ["primary", "supporting"]);
assert.deepEqual(thresholdEvaluationRejectionReasonEnum.enumValues, [
  "source_not_accepted",
  "ownership_unverified",
  "series_missing",
  "series_ambiguous",
  "exact_window_missing",
  "exact_window_ambiguous",
  "exact_window_incomplete",
  "source_incomplete",
  "coverage_insufficient",
  "gap_bound_exceeded",
  "value_implausible",
]);

const evaluationColumns = getTableColumns(thresholdEvaluations);
for (const name of [
  "profile_id",
  "activity_category",
  "metric",
  "method",
  "outcome",
  "value",
  "unit",
  "confidence",
  "observed_at",
  "rejection_reason",
  "policy_version",
  "diagnostics",
  "source_activity_id",
  "source_revision",
] as const) {
  assert.ok(evaluationColumns[name], `Missing threshold evaluation column ${name}`);
}
assert.ok(!("updated_at" in evaluationColumns));

const evaluationConfig = getTableConfig(thresholdEvaluations);
const evaluationChecks = new Set(evaluationConfig.checks.map((constraint) => constraint.name));
for (const checkName of [
  "threshold_evaluations_outcome_check",
  "threshold_evaluations_value_finite_positive_check",
  "threshold_evaluations_confidence_finite_range_check",
  "threshold_evaluations_source_revision_check",
]) {
  assert.ok(evaluationChecks.has(checkName), `Missing evaluation check ${checkName}`);
}
assert.ok(
  !evaluationChecks.has("threshold_evaluations_identity_check"),
  "Threshold identity policy belongs to @repo/core, not the database",
);
assert.ok(
  evaluationConfig.uniqueConstraints.some(
    (constraint) => constraint.name === "threshold_evaluations_idempotency_unique",
  ),
);
assert.ok(
  evaluationConfig.foreignKeys.some(
    (constraint) => constraint.getName() === "threshold_evaluations_source_activity_profile_fkey",
  ),
);

const linkConfig = getTableConfig(thresholdEvaluationEfforts);
assert.equal(linkConfig.columns.find(({ name }) => name === "source_series")?.notNull, true);
assert.ok(
  linkConfig.uniqueConstraints.some(
    (constraint) => constraint.name === "threshold_evaluation_efforts_role_ordinal_unique",
  ),
);
assert.ok(
  linkConfig.checks.some(
    (constraint) => constraint.name === "threshold_evaluation_efforts_ordinal_check",
  ),
  "Supporting effort ordinals must remain database-bounded",
);
for (const foreignKeyName of [
  "threshold_evaluation_efforts_evaluation_ownership_fkey",
  "threshold_evaluation_efforts_effort_ownership_fkey",
]) {
  assert.ok(
    linkConfig.foreignKeys.some((constraint) => constraint.getName() === foreignKeyName),
    `Missing composite ownership FK ${foreignKeyName}`,
  );
}

const thresholdColumns = getTableColumns(thresholds);
for (const name of [
  "evaluation_id",
  "effective_at",
  "value",
  "unit",
  "confidence",
  "method",
  "policy_version",
  "supersedes_id",
] as const) {
  assert.ok(thresholdColumns[name], `Missing threshold column ${name}`);
}
for (const forbidden of ["freshness", "stale_at", "expires_at"] as const) {
  assert.ok(!(forbidden in thresholdColumns), `Thresholds must not persist ${forbidden}`);
}
assert.ok(!("threshold_id" in getTableColumns(profilePerformanceEstimates)));
const thresholdConfig = getTableConfig(thresholds);
assert.ok(
  thresholdConfig.foreignKeys.some(
    (constraint) => constraint.getName() === "thresholds_qualified_evaluation_ownership_fkey",
  ),
);
const rootIndex = thresholdConfig.indexes.find(
  (index) => index.config.name === "thresholds_identity_root_unique",
);
assert.ok(rootIndex?.config.unique, "Threshold roots require a race-proof unique index");
const supersedesForeignKey = thresholdConfig.foreignKeys.find(
  (constraint) => constraint.getName() === "thresholds_supersedes_fkey",
);
assert.equal(supersedesForeignKey?.onDelete, "no action");
assert.ok(
  thresholdConfig.uniqueConstraints.some(
    (constraint) => constraint.name === "thresholds_supersedes_unique",
  ),
  "Threshold history must retain one direct successor per row",
);

const baselinePath = fileURLToPath(
  new URL("../supabase/migrations/20260730000000_mvp_baseline.sql", import.meta.url),
);
const baseline = await readFile(baselinePath, "utf8");
const activeBaseline = baseline;
for (const required of [
  'CREATE TABLE "threshold_evaluations"',
  'CREATE TYPE "public"."activity_effort_source_series"',
  'CREATE TABLE "threshold_evaluation_efforts"',
  'CREATE TABLE "thresholds"',
  'CONSTRAINT "threshold_evaluations_idempotency_unique"',
  'CONSTRAINT "threshold_evaluation_efforts_evaluation_ownership_fkey"',
  'CONSTRAINT "threshold_evaluation_efforts_effort_ownership_fkey"',
  'CONSTRAINT "thresholds_qualified_evaluation_ownership_fkey"',
  'CREATE INDEX "thresholds_profile_identity_effective_idx"',
  'CREATE UNIQUE INDEX "thresholds_identity_root_unique"',
  'CREATE INDEX "threshold_evaluation_efforts_activity_evaluation_idx"',
  'ALTER TABLE "public"."threshold_evaluations" ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE "public"."threshold_evaluation_efforts" ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE "public"."thresholds" ENABLE ROW LEVEL SECURITY',
  "CREATE FUNCTION public.enforce_threshold_truth_immutability()",
  "CREATE FUNCTION public.validate_threshold_evaluation_efforts()",
  "CREATE FUNCTION public.validate_threshold_insert()",
  "CREATE FUNCTION public.delete_effort_dependent_threshold_evaluations()",
  "CREATE CONSTRAINT TRIGGER threshold_evaluations_efforts_guard",
  "CREATE TRIGGER activity_efforts_delete_threshold_dependents",
  "CREATE TRIGGER activity_efforts_immutable",
  "REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE",
] as const) {
  assert.ok(activeBaseline.includes(required), `Baseline is missing ${required}`);
}

for (const removed of [
  "performance_calibration_evidence",
  "performance_calibration_model_inputs",
  "performance_calibration_selection_evidence",
  "performance_calibrations",
  "swimming_css_protocol_evidence",
  "performance_calibration_metric_key",
  "performance_calibration_evidence_state",
  "performance_calibration_rejection_reason",
  "performance_calibration_source_semantics",
] as const) {
  assert.ok(
    !activeBaseline.includes(removed),
    `Fresh baseline still contains active removed ${removed}`,
  );
}

assert.ok(!activeBaseline.includes("activity_efforts_duration_seconds_bounds_check"));
assert.match(
  activeBaseline,
  /threshold_evaluations_source_activity_profile_fkey[^;]+ON DELETE cascade/,
);
assert.match(
  activeBaseline,
  /threshold_evaluation_efforts_effort_ownership_fkey[^;]+"source_series"[^;]+REFERENCES[^;]+"source_series"[^;]+ON DELETE cascade/,
);
assert.match(
  activeBaseline,
  /threshold_evaluation_efforts_ordinal_check" CHECK \("threshold_evaluation_efforts"\."ordinal" between 0 and 63\)/,
);
assert.ok(
  activeBaseline.includes("IF evaluation.outcome = 'qualified' AND primary_count <> 1 THEN"),
);
assert.ok(activeBaseline.includes("CONSTRAINT = 'threshold_evaluations_rejected_effort_source'"));
assert.match(
  activeBaseline,
  /thresholds_qualified_evaluation_ownership_fkey[^;]+ON DELETE cascade/,
);
assert.match(
  activeBaseline,
  /thresholds_supersedes_fkey[^;]+ON DELETE no action[^;]+DEFERRABLE INITIALLY DEFERRED/,
);
assert.ok(
  activeBaseline.includes("CREATE FUNCTION public.rewire_threshold_successor_after_delete()"),
);
assert.ok(activeBaseline.includes("CREATE TRIGGER thresholds_rewire_successor"));
assert.match(
  activeBaseline,
  /CREATE FUNCTION public\.rewire_threshold_successor_after_delete\(\) RETURNS trigger[\s\S]+?SECURITY DEFINER[\s\S]+?WHERE successor\.supersedes_id = OLD\.id[\s\S]+?successor\.profile_id = OLD\.profile_id[\s\S]+?successor\.activity_category = OLD\.activity_category[\s\S]+?successor\.metric = OLD\.metric/,
);
assert.ok(
  activeBaseline.includes(
    "REVOKE ALL ON FUNCTION public.rewire_threshold_successor_after_delete() FROM PUBLIC, anon, authenticated, service_role",
  ),
);
assert.match(
  activeBaseline,
  /CREATE UNIQUE INDEX "thresholds_identity_root_unique"[^;]+WHERE "thresholds"\."supersedes_id" is null/,
);

console.log("Threshold truth schema and baseline contract tests passed.");
