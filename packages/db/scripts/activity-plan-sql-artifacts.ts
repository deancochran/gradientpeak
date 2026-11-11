import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

export const pinnedActivityPlanFunctionNames = [
  "activity_plan_jsonb_has_exact_keys",
  "activity_plan_target_is_canonical",
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

const canonicalPrerequisiteStarts = [
  'CREATE OR REPLACE FUNCTION "public"."activity_plan_jsonb_has_exact_keys"',
  'CREATE OR REPLACE FUNCTION "public"."activity_plan_target_is_canonical"',
  "CREATE OR REPLACE FUNCTION public.activity_plan_js_trim",
  "CREATE OR REPLACE FUNCTION public.activity_plan_utf16_key",
  "CREATE OR REPLACE FUNCTION public.activity_plan_js_length",
  "CREATE OR REPLACE FUNCTION public.activity_plan_js_number",
  "CREATE OR REPLACE FUNCTION public.activity_plan_core_canonical_json",
  "CREATE OR REPLACE FUNCTION public.activity_plan_ecmascript_trim",
] as const;

function extractSingleDollarQuotedFunction(baseline: string, start: string) {
  const first = baseline.indexOf(start);
  if (first < 0 || baseline.indexOf(start, first + start.length) >= 0) {
    throw new Error(`Missing or ambiguous pinned activity-plan function ${start}`);
  }
  const end = baseline.indexOf("$$;", first);
  if (end < 0) throw new Error(`Unterminated pinned activity-plan function ${start}`);
  return baseline.slice(first, end + 3);
}

/** The sole fresh baseline is the SQL artifact authority; no developer DB capture is used. */
export function activityPlanSqlArtifacts() {
  const baseline = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20260730000000_mvp_baseline.sql"),
    "utf8",
  );
  const region = baseline.match(
    /-- activity-plan-v5:functions:start([\s\S]*?)-- activity-plan-v5:functions:end/,
  );
  const v5Functions = region?.[1];
  if (!v5Functions) throw new Error("Missing pinned V5 activity-plan SQL region");
  const prerequisites = canonicalPrerequisiteStarts
    .map((start) => extractSingleDollarQuotedFunction(baseline, start))
    .join("\n\n");
  return { functions: `${prerequisites}\n\n${v5Functions}`, triggers: "", acl: "" };
}

export async function installActivityPlanSqlFunctions(pool: Pool) {
  await pool.query(activityPlanSqlArtifacts().functions);
}
