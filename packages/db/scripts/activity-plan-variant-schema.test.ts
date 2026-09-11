import assert from "node:assert/strict";

import type { ActivityPlanDocument } from "@repo/core/activity-plan";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { activityPlans, events, plannedSessions } from "../src/schema/tables";
import type { ActivityPlanRow, EventInsert, PlannedSessionInsert } from "../src/schema/types";
import {
  publicActivityPlansRowSchema,
  publicPlannedSessionsInsertSchema,
  publicPlannedSessionsRowSchema,
} from "../src/validation";
import { buildActivityPlanVariantsHardCutMigration } from "./generate-activity-plan-variants-hard-cut-migration";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;
type Assert<Condition extends true> = Condition;
type IsRequired<Value, Key extends keyof Value> =
  Record<Key, Value[Key]> extends Pick<Value, Key> ? true : false;

type AuthoredSchemaTypeContract = [
  Assert<Equal<ActivityPlanRow["structure"], ActivityPlanDocument>>,
  Assert<IsRequired<PlannedSessionInsert, "activity_plan_variant_id">>,
  Assert<IsRequired<PlannedSessionInsert, "activity_plan_variant_name">>,
  Assert<IsRequired<PlannedSessionInsert, "prescription_structure_hash">>,
  Assert<Equal<EventInsert["planned_session_id"], string | null | undefined>>,
];
const authoredSchemaTypeContract: AuthoredSchemaTypeContract = [true, true, true, true, true];
assert.equal(authoredSchemaTypeContract.every(Boolean), true);

const dialect = new PgDialect();
const checkSql = (table: PgTable, name: string) => {
  const check = getTableConfig(table).checks.find((candidate) => candidate.name === name);
  assert.ok(check, `${name} must exist`);
  return dialect.sqlToQuery(check.value.getSQL()).sql;
};

const activityPlanColumns = getTableColumns(activityPlans);
assert.equal(activityPlanColumns.structure.notNull, true);
assert.match(
  checkSql(activityPlans, "activity_plans_structure_document_v1_check"),
  /"structure"->'contractVersion' = '1'::jsonb/,
);
assert.match(
  checkSql(activityPlans, "activity_plans_structure_document_v1_check"),
  /jsonb_array_length\("activity_plans"\."structure"->'variants'\) between 1 and 16/,
);
assert.match(
  checkSql(activityPlans, "activity_plans_structure_document_v1_check"),
  /pg_column_size\("activity_plans"\."structure"\) <= 1048576/,
);
assert.equal(
  checkSql(activityPlans, "activity_plans_structure_canonical_check"),
  'public.activity_plan_document_is_canonical("activity_plans"."structure")',
);
assert.equal(
  getTableConfig(activityPlans).checks.some(
    (check) => check.name === "activity_plans_structure_v3_check",
  ),
  false,
);

const categoryIndex = getTableConfig(activityPlans).indexes.find(
  (index) => index.config.name === "idx_activity_plans_structure_category",
);
assert.ok(categoryIndex);
const categoryExpression = categoryIndex.config.columns[0];
if (
  !categoryExpression ||
  !("getSQL" in categoryExpression) ||
  typeof categoryExpression.getSQL !== "function"
) {
  throw new Error("activity-plan category index must use the nested category expression");
}
assert.equal(
  dialect.sqlToQuery(categoryExpression.getSQL()).sql,
  `("activity_plans"."structure" #>> '{variants,0,structure,activity_category}')`,
);

const plannedSessionColumns = getTableColumns(plannedSessions);
for (const columnName of ["activity_plan_variant_id", "activity_plan_variant_name"] as const) {
  assert.equal(plannedSessionColumns[columnName].notNull, true);
  assert.equal(plannedSessionColumns[columnName].hasDefault, false);
}
assert.equal(plannedSessionColumns.prescription_structure_hash.notNull, true);
assert.equal(plannedSessionColumns.prescription_structure_hash.hasDefault, false);
assert.equal(getTableColumns(events).planned_session_id.notNull, false);
assert.ok(
  getTableConfig(events).foreignKeys.some(
    (foreignKey) => foreignKey.getName() === "events_planned_session_owner_fkey",
  ),
);
assert.match(
  checkSql(events, "events_training_plan_session_check"),
  /"training_plan_id" is null or "events"\."planned_session_id" is not null/,
);
assert.deepEqual(plannedSessionColumns.contract_version.enumValues, ["planned-session-v2"]);
assert.equal(plannedSessionColumns.contract_version.default, "planned-session-v2");
assert.equal(
  checkSql(plannedSessions, "planned_sessions_contract_version_check"),
  `"planned_sessions"."contract_version" = 'planned-session-v2'`,
);
assert.match(
  checkSql(plannedSessions, "planned_sessions_variant_provenance_check"),
  /char_length\("planned_sessions"\."activity_plan_variant_name"\) between 1 and 100/,
);
assert.match(
  checkSql(plannedSessions, "planned_sessions_variant_provenance_check"),
  /btrim\("planned_sessions"\."activity_plan_variant_name", U&'\\0009.*\\00A0.*\\FEFF'\)/,
);

for (const columnName of [
  "activity_plan_id",
  "activity_plan_revision",
  "prescription_structure",
  "prescription_quantification",
  "prescription_captured_at",
] as const) {
  assert.ok(
    plannedSessionColumns[columnName],
    `${columnName} must remain in the concrete snapshot`,
  );
}

assert.equal(publicActivityPlansRowSchema.shape.structure.safeParse({ version: 3 }).success, false);
assert.equal(
  publicPlannedSessionsRowSchema.shape.contract_version.safeParse("planned-session-v1").success,
  false,
);
assert.equal(
  publicPlannedSessionsRowSchema.shape.activity_plan_variant_id.safeParse(undefined).success,
  false,
);
assert.equal(
  publicPlannedSessionsInsertSchema.shape.activity_plan_variant_name.safeParse(" Base ").success,
  false,
);
for (const whitespace of ["\u00a0", "\u1680", "\u202f", "\u3000", "\ufeff"]) {
  assert.equal(
    publicPlannedSessionsInsertSchema.shape.activity_plan_variant_name.safeParse(
      `${whitespace}Base${whitespace}`,
    ).success,
    false,
  );
}
assert.equal(
  publicPlannedSessionsInsertSchema.shape.activity_plan_variant_name.safeParse("x".repeat(101))
    .success,
  false,
);

const migrationSql = buildActivityPlanVariantsHardCutMigration();
const lockOffset = migrationSql.indexOf("LOCK TABLE public.activity_plans");
const preconditionOffset = migrationSql.indexOf(
  "activity-plan hard cut requires every stored plan",
);
const transformationOffset = migrationSql.indexOf("WITH transformed AS MATERIALIZED");
assert.ok(lockOffset >= 0 && lockOffset < preconditionOffset && lockOffset < transformationOffset);
assert.doesNotMatch(migrationSql, /repeat\('0', 64\)|v1:sha256:0{64}/);
assert.match(migrationSql, /pg_temp\.activity_plan_structure_hash\(transformed\.document\)/);
assert.match(migrationSql, /DISABLE TRIGGER activity_plans_enforce_revision/);
assert.match(migrationSql, /revision = activity_plan\.revision \+ 1/);
assert.match(migrationSql, /ENABLE TRIGGER activity_plans_enforce_revision/);
assert.match(migrationSql, /variant_value ->> 'name' <> pg_catalog\.btrim\([\s\S]*U&'\\0009/);
assert.match(
  migrationSql,
  /event to planned-session backfill is ambiguous because one snapshot matches multiple training-plan events/,
);
assert.match(migrationSql, /FOREIGN KEY \(planned_session_id, profile_id, activity_plan_id\)/);

process.stdout.write("activity-plan variant authored schema contract passed\n");
