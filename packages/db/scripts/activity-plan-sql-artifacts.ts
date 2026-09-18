import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

export const ACTIVITY_PLAN_AUTHORING_MIGRATION =
  "20260916000000_activity_plan_authoring_policy.sql";
const historicalNames = [
  "activity_plan_jsonb_has_exact_keys",
  "activity_plan_jsonb_is_uuid",
  "activity_plan_jsonb_is_string",
  "activity_plan_jsonb_is_integer_between",
  "activity_plan_duration_is_canonical",
  "activity_plan_target_is_canonical",
  "activity_plan_segment_is_canonical",
  "activity_plan_structure_is_canonical",
] as const;
export const pinnedActivityPlanFunctionNames = [
  ...historicalNames,
  "activity_plan_js_trim",
  "activity_plan_utf16_key",
  "activity_plan_js_length",
  "activity_plan_js_number",
  "activity_plan_core_canonical_json",
  "activity_plan_core_normalize_adaptation",
  "activity_plan_core_structure_hash",
  "activity_plan_core_semantic_hash",
  "activity_plan_authoring_structure_is_valid",
  "activity_plan_authoring_intent_is_valid",
  "activity_plan_authoring_uuid_is_valid",
  "activity_plan_authoring_content_is_valid",
  "enforce_activity_plan_authoring",
  "enforce_activity_plan_revision",
];
export const pinnedActivityPlanTriggerNames = [
  "activity_plans_authoring_guard",
  "activity_plans_enforce_revision",
];

/** Migration files are the SQL authority, including historical compatibility definitions.
 * Never sample a developer database or substitute always-true validators.
 */
export function activityPlanSqlArtifacts() {
  const migrations = resolve(import.meta.dirname, "../supabase/migrations");
  const baseline = readFileSync(resolve(migrations, "20260730000000_mvp_baseline.sql"), "utf8");
  const historical = historicalNames.map((name) => {
    const pattern = new RegExp(
      `CREATE (?:OR REPLACE )?FUNCTION (?:"public"|public)\\.(?:"${name}"|${name})\\([\\s\\S]*?\\bAS\\s+(\\$[a-z_]*\\$)[\\s\\S]*?\\1;`,
      "gi",
    );
    const definitions = [...baseline.matchAll(pattern)];
    const definition = definitions.at(-1)?.[0];
    if (!definition || /select true\s*\$\$/i.test(definition))
      throw new Error(`Missing real pinned SQL definition: ${name}`);
    return definition.replace(/^CREATE FUNCTION/i, "CREATE OR REPLACE FUNCTION");
  });
  const migration = readFileSync(resolve(migrations, ACTIVITY_PLAN_AUTHORING_MIGRATION), "utf8");
  const section = (name: string) => {
    const start = `-- activity-plan-authoring:${name}:start`;
    const end = `-- activity-plan-authoring:${name}:end`;
    const body = migration.split(start)[1]?.split(end)[0];
    if (!body || !migration.includes(end))
      throw new Error(`Missing pinned authoring SQL section: ${name}`);
    return body;
  };
  return {
    functions: [...historical, section("functions")].join("\n"),
    triggers: section("triggers"),
    acl: section("acl"),
  };
}

export async function installActivityPlanSqlFunctions(pool: Pool) {
  const artifacts = activityPlanSqlArtifacts();
  await pool.query(artifacts.functions);
  await pool.query(artifacts.acl);
}
