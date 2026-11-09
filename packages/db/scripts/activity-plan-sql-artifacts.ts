import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

export const pinnedActivityPlanFunctionNames = [
  "activity_plan_ecmascript_trim",
  "activity_plan_utf16_key",
  "activity_plan_js_length",
  "activity_plan_js_number",
  "activity_plan_core_canonical_json",
  "activity_plan_core_structure_hash",
  "activity_plan_core_semantic_hash",
  "activity_plan_v5_has_exact_keys",
  "activity_plan_v5_structure_is_valid",
  "activity_plan_authoring_structure_is_valid",
  "activity_plan_authoring_intent_is_valid",
  "enforce_activity_plan_authoring",
  "enforce_activity_plan_revision",
  "activity_plan_json_numbers_are_finite",
  "activity_plan_datetime_is_valid",
] as const;
export const pinnedActivityPlanTriggerNames = [
  "activity_plans_authoring_guard",
  "activity_plans_enforce_revision",
];

/** The sole fresh baseline is the SQL artifact authority; no developer DB capture is used. */
export function activityPlanSqlArtifacts() {
  const baseline = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20260730000000_mvp_baseline.sql"),
    "utf8",
  );
  const region = baseline.match(
    /-- activity-plan-v5:functions:start([\s\S]*?)-- activity-plan-v5:functions:end/,
  );
  const functions = region?.[1];
  if (!functions) throw new Error("Missing pinned V5 activity-plan SQL region");
  return { functions, triggers: "", acl: "" };
}

export async function installActivityPlanSqlFunctions(pool: Pool) {
  await pool.query(activityPlanSqlArtifacts().functions);
}
