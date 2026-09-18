import assert from "node:assert/strict";

import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { plannedSessionSourceKindEnum } from "../src/schema/enums";
import * as schemaTables from "../src/schema/tables";
import {
  activityFileIngestions,
  activityTrainingEffects,
  athleteRecalculationQueue,
  dailyTrainingLoad,
  plannedSessions,
  profileAthleteState,
  thresholdEvidence,
} from "../src/schema/tables";
import type {
  ActivityFileIngestionInsert,
  ActivityFileIngestionRow,
  ActivityFileIngestionUpdate,
  ActivityTrainingEffectInsert,
  ActivityTrainingEffectRow,
  ActivityTrainingEffectUpdate,
  AthleteRecalculationQueueInsert,
  AthleteRecalculationQueueRow,
  AthleteRecalculationQueueUpdate,
  DailyTrainingLoadInsert,
  DailyTrainingLoadRow,
  DailyTrainingLoadUpdate,
  PlannedSessionInsert,
  PlannedSessionRow,
  PlannedSessionUpdate,
  ProfileAthleteStateInsert,
  ProfileAthleteStateRow,
  ProfileAthleteStateUpdate,
  ThresholdEvidenceInsert,
  ThresholdEvidenceRow,
  ThresholdEvidenceUpdate,
} from "../src/schema/types";
import {
  type PublicActivityFileIngestionsInsert,
  type PublicActivityFileIngestionsRow,
  type PublicActivityFileIngestionsUpdate,
  type PublicActivityTrainingEffectsInsert,
  type PublicActivityTrainingEffectsRow,
  type PublicActivityTrainingEffectsUpdate,
  type PublicAthleteRecalculationQueueInsert,
  type PublicAthleteRecalculationQueueRow,
  type PublicAthleteRecalculationQueueUpdate,
  type PublicDailyTrainingLoadInsert,
  type PublicDailyTrainingLoadRow,
  type PublicDailyTrainingLoadUpdate,
  type PublicPlannedSessionsInsert,
  type PublicPlannedSessionsRow,
  type PublicPlannedSessionsUpdate,
  type PublicProfileAthleteStateInsert,
  type PublicProfileAthleteStateRow,
  type PublicProfileAthleteStateUpdate,
  type PublicThresholdEvidenceInsert,
  type PublicThresholdEvidenceRow,
  type PublicThresholdEvidenceUpdate,
  publicActivityFileIngestionsInsertSchema,
  publicActivityFileIngestionsRowSchema,
  publicActivityFileIngestionsUpdateSchema,
  publicActivityTrainingEffectsInsertSchema,
  publicActivityTrainingEffectsRowSchema,
  publicActivityTrainingEffectsUpdateSchema,
  publicAthleteRecalculationQueueInsertSchema,
  publicAthleteRecalculationQueueRowSchema,
  publicAthleteRecalculationQueueUpdateSchema,
  publicDailyTrainingLoadInsertSchema,
  publicDailyTrainingLoadRowSchema,
  publicDailyTrainingLoadUpdateSchema,
  publicPlannedSessionsInsertSchema,
  publicPlannedSessionsRowSchema,
  publicPlannedSessionsUpdateSchema,
  publicProfileAthleteStateInsertSchema,
  publicProfileAthleteStateRowSchema,
  publicProfileAthleteStateUpdateSchema,
  publicThresholdEvidenceInsertSchema,
  publicThresholdEvidenceRowSchema,
  publicThresholdEvidenceUpdateSchema,
} from "../src/validation";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;
type Assert<Condition extends true> = Condition;

type GeneratedTypeParity = [
  Assert<Equal<ActivityFileIngestionRow, PublicActivityFileIngestionsRow>>,
  Assert<Equal<ActivityFileIngestionInsert, PublicActivityFileIngestionsInsert>>,
  Assert<Equal<ActivityFileIngestionUpdate, PublicActivityFileIngestionsUpdate>>,
  Assert<Equal<keyof ActivityTrainingEffectRow, keyof PublicActivityTrainingEffectsRow>>,
  Assert<Equal<keyof ActivityTrainingEffectInsert, keyof PublicActivityTrainingEffectsInsert>>,
  Assert<Equal<keyof ActivityTrainingEffectUpdate, keyof PublicActivityTrainingEffectsUpdate>>,
  Assert<Equal<DailyTrainingLoadRow, PublicDailyTrainingLoadRow>>,
  Assert<Equal<DailyTrainingLoadInsert, PublicDailyTrainingLoadInsert>>,
  Assert<Equal<DailyTrainingLoadUpdate, PublicDailyTrainingLoadUpdate>>,
  Assert<Equal<AthleteRecalculationQueueRow, PublicAthleteRecalculationQueueRow>>,
  Assert<Equal<AthleteRecalculationQueueInsert, PublicAthleteRecalculationQueueInsert>>,
  Assert<Equal<AthleteRecalculationQueueUpdate, PublicAthleteRecalculationQueueUpdate>>,
  Assert<Equal<ThresholdEvidenceRow, PublicThresholdEvidenceRow>>,
  Assert<Equal<ThresholdEvidenceInsert, PublicThresholdEvidenceInsert>>,
  Assert<Equal<ThresholdEvidenceUpdate, PublicThresholdEvidenceUpdate>>,
  Assert<Equal<keyof PlannedSessionRow, keyof PublicPlannedSessionsRow>>,
  Assert<Equal<keyof PlannedSessionInsert, keyof PublicPlannedSessionsInsert>>,
  Assert<Equal<keyof PlannedSessionUpdate, keyof PublicPlannedSessionsUpdate>>,
  Assert<Equal<ProfileAthleteStateRow, PublicProfileAthleteStateRow>>,
  Assert<Equal<ProfileAthleteStateInsert, PublicProfileAthleteStateInsert>>,
  Assert<Equal<ProfileAthleteStateUpdate, PublicProfileAthleteStateUpdate>>,
];
const generatedTypeParity: GeneratedTypeParity = Array.from(
  { length: 21 },
  () => true,
) as GeneratedTypeParity;
assert.equal(generatedTypeParity.every(Boolean), true);

const generatedContracts = [
  [
    activityFileIngestions,
    publicActivityFileIngestionsRowSchema,
    publicActivityFileIngestionsInsertSchema,
    publicActivityFileIngestionsUpdateSchema,
  ],
  [
    activityTrainingEffects,
    publicActivityTrainingEffectsRowSchema,
    publicActivityTrainingEffectsInsertSchema,
    publicActivityTrainingEffectsUpdateSchema,
  ],
  [
    dailyTrainingLoad,
    publicDailyTrainingLoadRowSchema,
    publicDailyTrainingLoadInsertSchema,
    publicDailyTrainingLoadUpdateSchema,
  ],
  [
    athleteRecalculationQueue,
    publicAthleteRecalculationQueueRowSchema,
    publicAthleteRecalculationQueueInsertSchema,
    publicAthleteRecalculationQueueUpdateSchema,
  ],
  [
    thresholdEvidence,
    publicThresholdEvidenceRowSchema,
    publicThresholdEvidenceInsertSchema,
    publicThresholdEvidenceUpdateSchema,
  ],
  [
    plannedSessions,
    publicPlannedSessionsRowSchema,
    publicPlannedSessionsInsertSchema,
    publicPlannedSessionsUpdateSchema,
  ],
  [
    profileAthleteState,
    publicProfileAthleteStateRowSchema,
    publicProfileAthleteStateInsertSchema,
    publicProfileAthleteStateUpdateSchema,
  ],
] as const;

for (const [table, selectSchema, insertSchema, updateSchema] of generatedContracts) {
  const tableName = getTableName(table);
  const config = getTableConfig(table);
  assert.ok(config.checks.length > 0, `${tableName} must enforce its finite states and values`);
  assert.ok(
    config.foreignKeys.length > 0,
    `${tableName} must anchor ownership or source identity with a foreign key`,
  );
  assert.ok(config.indexes.length > 0, `${tableName} must index its documented read or claim path`);

  const tableFields = Object.keys(getTableColumns(table)).sort();
  for (const [operation, schema] of [
    ["select", selectSchema],
    ["insert", insertSchema],
    ["update", updateSchema],
  ] as const) {
    assert.deepEqual(
      Object.keys(schema.shape).sort(),
      tableFields,
      `${tableName} ${operation} validation must be generated from every Drizzle field`,
    );
  }
}

function foreignKey(table: PgTable, name: string) {
  const constraint = getTableConfig(table).foreignKeys.find(
    (candidate) => candidate.reference().name === name,
  );
  assert.ok(constraint, `${getTableName(table)} must declare ${name}`);
  const reference = constraint.reference();
  return {
    columns: reference.columns.map((column) => column.name),
    foreignTable: getTableName(reference.foreignTable),
    foreignColumns: reference.foreignColumns.map((column) => column.name),
    onDelete: constraint.onDelete,
  };
}

assert.deepEqual(
  foreignKey(activityTrainingEffects, "activity_training_effects_analysis_revision_fkey"),
  {
    columns: ["activity_id", "profile_id", "activity_analysis_revision"],
    foreignTable: "activity_analysis_revisions",
    foreignColumns: ["activity_id", "profile_id", "revision"],
    onDelete: "cascade",
  },
);

assert.deepEqual(foreignKey(thresholdEvidence, "threshold_evidence_activity_owner_fkey"), {
  columns: ["activity_id", "profile_id"],
  foreignTable: "activities",
  foreignColumns: ["id", "profile_id"],
  onDelete: "cascade",
});

assert.deepEqual(
  foreignKey(activityFileIngestions, "activity_file_ingestions_integration_profile_fkey"),
  {
    columns: ["integration_id", "profile_id"],
    foreignTable: "integrations",
    foreignColumns: ["id", "profile_id"],
    onDelete: "restrict",
  },
);

assert.deepEqual(foreignKey(plannedSessions, "planned_sessions_completed_activity_owner_fkey"), {
  columns: ["completed_activity_id", "profile_id"],
  foreignTable: "activities",
  foreignColumns: ["id", "profile_id"],
  onDelete: "restrict",
});

assert.deepEqual(foreignKey(plannedSessions, "planned_sessions_group_event_fkey"), {
  columns: ["group_event_id"],
  foreignTable: "group_events",
  foreignColumns: ["id"],
  onDelete: "set null",
});

const queueConfig = getTableConfig(athleteRecalculationQueue);
assert.equal(queueConfig.primaryKeys.length, 0);
assert.equal(
  queueConfig.columns.find((column) => column.name === "profile_id")?.primary,
  true,
  "one athlete must have at most one coalesced recalculation row",
);
assert.deepEqual(
  Object.keys(getTableColumns(athleteRecalculationQueue)).sort(),
  [
    "contract_version",
    "earliest_affected_at",
    "earliest_affected_planning_date",
    "idempotency_key",
    "profile_id",
    "reasons",
    "requested_at",
    "source_revision",
    "updated_at",
  ],
  "the coalesced queue must contain pending work only; claims, retries, and publication live in profile_athlete_state",
);
const athleteStateColumns = getTableColumns(profileAthleteState);
for (const column of [
  "source_revision",
  "published_revision",
  "lease_token",
  "lease_expires_at",
  "retry_after",
  "consecutive_failures",
] as const) {
  assert.ok(athleteStateColumns[column], `profile_athlete_state must own ${column}`);
}

const dailyLoadConfig = getTableConfig(dailyTrainingLoad);
assert.deepEqual(
  dailyLoadConfig.primaryKeys[0]?.columns.map((column) => column.name),
  ["profile_id", "planning_date", "source_revision"],
  "daily snapshots must retain independently addressable source revisions",
);

const thresholdEvidenceConfig = getTableConfig(thresholdEvidence);
assert.ok(
  thresholdEvidenceConfig.uniqueConstraints.some(
    (constraint) => constraint.name === "threshold_evidence_profile_category_activity_unique",
  ),
  "one athlete/category lifecycle must receive at most one evidence row from an activity",
);

const plannedConfig = getTableConfig(plannedSessions);
const plannedSessionColumns = getTableColumns(plannedSessions);
assert.deepEqual(plannedSessionSourceKindEnum.enumValues, ["direct", "training_plan"]);
for (const column of [
  "source_session_id",
  "resolution_manifest",
  "prescription_captured_at",
] as const) {
  assert.ok(plannedSessionColumns[column], `planned_sessions must own ${column}`);
}
for (const removedColumn of [
  "source_session_key",
  "series_id",
  "occurrence_key",
  "prescription_structure",
  "prescription_structure_hash",
  "adaptation_resolution",
  "prescription_quantification",
] as const) {
  assert.equal(
    removedColumn in plannedSessionColumns,
    false,
    `planned_sessions must not retain ${removedColumn}`,
  );
}
assert.ok(
  plannedConfig.checks.some((constraint) => constraint.name === "planned_sessions_source_check"),
  "planned sessions must constrain source provenance to direct or training-plan identity",
);
assert.ok(
  plannedConfig.checks.some(
    (constraint) => constraint.name === "planned_sessions_prescription_check",
  ),
  "planned sessions must bind the resolution manifest to its activity-plan identity",
);
assert.ok(
  plannedConfig.uniqueConstraints.some(
    (constraint) => constraint.name === "planned_sessions_profile_idempotency_unique",
  ),
  "planned-session source identity must be unique per athlete",
);
assert.ok(
  plannedConfig.indexes.some(
    (index) =>
      index.config.name === "planned_sessions_profile_group_event_unique" && index.config.unique,
  ),
  "one profile must link at most one planned session to a group event",
);

const ingestionIndexNames = new Set(
  getTableConfig(activityFileIngestions).indexes.map((index) => index.config.name),
);
assert.ok(ingestionIndexNames.has("idx_activity_file_ingestions_activity_profile"));
assert.ok(
  !ingestionIndexNames.has("idx_activity_file_ingestions_activity_id"),
  "the left-prefix composite activity index makes the single-column activity index redundant",
);

assert.equal(
  "claim_token" in getTableColumns(activityFileIngestions),
  false,
  "direct ingestion operations must not carry a server worker claim",
);
assert.equal(
  "recovery_context" in getTableColumns(activityFileIngestions),
  false,
  "client/provider retries must resubmit current input rather than persist recovery payloads",
);
assert.equal(
  "activityIngestionJobs" in schemaTables,
  false,
  "generic server-side ingestion jobs must remain deferred",
);

console.log("Pre-launch schema preparation static contract tests passed.");
