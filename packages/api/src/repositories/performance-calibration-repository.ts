import { randomUUID } from "node:crypto";
import { CYCLING_DURATION_PERFORMANCE_POLICY } from "@repo/core";
import { BEST_EFFORT_CALCULATION_VERSION } from "@repo/core/calculations";
import {
  type CalibrationCandidate,
  type CalibrationIdentity,
  type CalibrationRecord,
  calibrationRecordSchema,
  calibrationSelectionDiagnosticsSchema,
  getCalibrationRegistryEntry,
  PERFORMANCE_CALIBRATION_POLICY_VERSION,
  selectCalibration,
} from "@repo/core/performance-calibration";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  performanceCalibrationEvidence,
  performanceCalibrationModelInputs,
  performanceCalibrationSelectionEvidence,
  performanceCalibrations,
  profileAthleteState,
  profilePerformanceEstimates,
} from "@repo/db";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../db";

const CANDIDATE_LIMIT = 64;
const BIKE_MODEL_EFFORT_QUERY_LIMIT = CYCLING_DURATION_PERFORMANCE_POLICY.maximumInputEfforts + 1;

/**
 * Complete, bounded profile-history input for threshold-power reconciliation.
 * Every row is tied to the current accepted profile-owned source revision.
 */
export async function readBikeCalibrationModelEfforts(
  db: DrizzleQueryExecutor,
  input: { profileId: string; asOf: Date },
) {
  const cutoff = new Date(
    input.asOf.getTime() - CYCLING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays * 86_400_000,
  );
  const rows = await db
    .select({
      id: activityEfforts.id,
      profile_id: activityEfforts.profile_id,
      activity_id: activityEfforts.activity_id,
      segment_id: activityEfforts.segment_id,
      recorded_at: activityEfforts.recorded_at,
      activity_category: activityEfforts.activity_category,
      effort_type: activityEfforts.effort_type,
      duration_seconds: activityEfforts.duration_seconds,
      start_offset: activityEfforts.start_offset,
      unit: activityEfforts.unit,
      value: activityEfforts.value,
      source: activityEfforts.source,
      method: activityEfforts.method,
      calculation_version: activityEfforts.calculation_version,
      provenance: activityEfforts.provenance,
      segment_revision: activitySegments.segment_revision,
      source_artifact_id: activitySegments.source_artifact_id,
      source_artifact_digest: activityArtifacts.digest,
    })
    .from(activityEfforts)
    .innerJoin(
      activitySegments,
      and(
        eq(activitySegments.id, activityEfforts.segment_id),
        eq(activitySegments.activity_id, activityEfforts.activity_id),
        eq(activitySegments.profile_id, activityEfforts.profile_id),
        eq(activitySegments.activity_category, activityEfforts.activity_category),
      ),
    )
    .innerJoin(
      activities,
      and(
        eq(activities.id, activityEfforts.activity_id),
        eq(activities.profile_id, activityEfforts.profile_id),
        eq(activities.segments_revision, activitySegments.segment_revision),
      ),
    )
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, activityEfforts.activity_id),
        eq(activityArtifactLinks.artifact_id, activitySegments.source_artifact_id),
        eq(activityArtifactLinks.profile_id, activityEfforts.profile_id),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
        eq(activityArtifacts.availability, "accepted"),
      ),
    )
    .where(
      and(
        eq(activityEfforts.profile_id, input.profileId),
        eq(activityEfforts.activity_category, "bike"),
        eq(activityEfforts.effort_type, "power"),
        eq(activityEfforts.source, "imported"),
        eq(activityEfforts.method, "activity_file_best_effort"),
        eq(activityEfforts.calculation_version, BEST_EFFORT_CALCULATION_VERSION),
        gte(activityEfforts.recorded_at, cutoff),
        lte(activityEfforts.recorded_at, input.asOf),
        lte(activities.finished_at, input.asOf),
      ),
    )
    .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.id))
    .limit(BIKE_MODEL_EFFORT_QUERY_LIMIT);
  return {
    rows: rows.slice(0, CYCLING_DURATION_PERFORMANCE_POLICY.maximumInputEfforts),
    truncated: rows.length === BIKE_MODEL_EFFORT_QUERY_LIMIT,
  };
}

export function buildCalibrationSelectionEvidenceLinks(input: {
  calibrationId: string;
  profileId: string;
  identity: CalibrationIdentity;
  selectedEvidenceIds: readonly string[];
}) {
  if (input.selectedEvidenceIds.length === 0) {
    throw new Error("Selected calibration history requires normalized supporting evidence");
  }
  if (new Set(input.selectedEvidenceIds).size !== input.selectedEvidenceIds.length) {
    throw new Error("Selected calibration supporting evidence must be unique");
  }
  return input.selectedEvidenceIds.map((evidenceId, ordinal) => ({
    calibration_id: input.calibrationId,
    evidence_id: evidenceId,
    profile_id: input.profileId,
    metric_key: input.identity.metricKey,
    activity_category: input.identity.activityCategory,
    ordinal,
  }));
}

export type CalibrationEvidenceWrite = {
  id?: string;
  profileId: string;
  identity: CalibrationIdentity;
  value: number | null;
  observedAt: Date;
  activityId: string;
  segmentId: string;
  segmentRevision: number;
  sourceArtifactId: string;
  state: "candidate" | "rejected";
  rejectionReason: typeof performanceCalibrationEvidence.$inferInsert.rejection_reason;
  sourceSemantics: "measured" | "derived";
  diagnostics: unknown;
  modelSourceEffortIds: string[];
  now: Date;
};

type CalibrationModelInputWrite = typeof performanceCalibrationModelInputs.$inferInsert;

async function buildCalibrationModelInputSnapshots(
  tx: DrizzleTransactionClient,
  input: CalibrationEvidenceWrite,
  calibrationEvidenceId: string,
): Promise<CalibrationModelInputWrite[]> {
  if (input.modelSourceEffortIds.length === 0) return [];
  if (
    input.identity.metricKey !== "threshold_power" ||
    input.identity.activityCategory !== "bike"
  ) {
    throw new Error("Only bike threshold model evidence can retain model inputs");
  }
  if (new Set(input.modelSourceEffortIds).size !== input.modelSourceEffortIds.length) {
    throw new Error("Calibration model source efforts must be unique");
  }
  const read = await readBikeCalibrationModelEfforts(tx, {
    profileId: input.profileId,
    asOf: input.observedAt,
  });
  const rowsById = new Map(read.rows.map((row) => [row.id, row]));
  return input.modelSourceEffortIds.map((effortId, ordinal) => {
    const row = rowsById.get(effortId);
    if (!row || row.source_artifact_id === null) {
      throw new Error("Calibration model input is not a current accepted profile effort");
    }
    return {
      calibration_evidence_id: calibrationEvidenceId,
      effort_id: row.id,
      profile_id: input.profileId,
      metric_key: input.identity.metricKey,
      activity_category: input.identity.activityCategory,
      activity_id: row.activity_id,
      segment_id: row.segment_id,
      segment_revision: row.segment_revision,
      source_artifact_id: row.source_artifact_id,
      source_artifact_digest: row.source_artifact_digest,
      observed_at: row.recorded_at,
      duration_seconds: row.duration_seconds,
      value: row.value,
      calculation_version: row.calculation_version,
      ordinal,
    };
  });
}

function sameCalibrationModelInputs(
  existing: Array<typeof performanceCalibrationModelInputs.$inferSelect>,
  desired: CalibrationModelInputWrite[],
) {
  return (
    existing.length === desired.length &&
    existing.every((row, index) => {
      const expected = desired[index];
      return (
        expected !== undefined &&
        row.calibration_evidence_id === expected.calibration_evidence_id &&
        row.effort_id === expected.effort_id &&
        row.profile_id === expected.profile_id &&
        row.metric_key === expected.metric_key &&
        row.activity_category === expected.activity_category &&
        row.activity_id === expected.activity_id &&
        row.segment_id === expected.segment_id &&
        row.segment_revision === expected.segment_revision &&
        row.source_artifact_id === expected.source_artifact_id &&
        row.source_artifact_digest === expected.source_artifact_digest &&
        row.observed_at.getTime() === expected.observed_at.getTime() &&
        row.duration_seconds === expected.duration_seconds &&
        row.value === expected.value &&
        row.calculation_version === expected.calculation_version &&
        row.ordinal === expected.ordinal
      );
    })
  );
}

function currentCalibrationModelInputsPredicate() {
  return sql`not exists (
    select 1
    from ${performanceCalibrationModelInputs} model_input
    where model_input.calibration_evidence_id = ${performanceCalibrationEvidence.id}
      and not exists (
        select 1
        from ${activities} model_activity
        join ${activitySegments} model_segment
          on model_segment.id = model_input.segment_id
         and model_segment.activity_id = model_input.activity_id
         and model_segment.profile_id = model_input.profile_id
         and model_segment.segment_revision = model_input.segment_revision
         and model_segment.source_artifact_id = model_input.source_artifact_id
        join ${activityEfforts} model_effort
          on model_effort.id = model_input.effort_id
         and model_effort.activity_id = model_input.activity_id
         and model_effort.segment_id = model_input.segment_id
         and model_effort.profile_id = model_input.profile_id
        join ${activityArtifactLinks} model_source_link
          on model_source_link.activity_id = model_input.activity_id
         and model_source_link.artifact_id = model_input.source_artifact_id
         and model_source_link.profile_id = model_input.profile_id
         and model_source_link.role = 'source'
         and model_source_link.is_current = true
        join ${activityArtifacts} model_artifact
          on model_artifact.id = model_input.source_artifact_id
         and model_artifact.profile_id = model_input.profile_id
         and model_artifact.digest = model_input.source_artifact_digest
         and model_artifact.availability = 'accepted'
        where model_activity.id = model_input.activity_id
          and model_activity.profile_id = model_input.profile_id
          and model_activity.segments_revision = model_input.segment_revision
      )
  )`;
}

function rowToCalibrationRecord(
  row: typeof performanceCalibrations.$inferSelect,
): CalibrationRecord {
  return calibrationRecordSchema.parse({
    id: row.id,
    identity: { metricKey: row.metric_key, activityCategory: row.activity_category },
    value: row.value,
    unit: row.unit,
    effectiveAt: row.effective_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    policyVersion: row.policy_version,
    selectionDiagnostics: row.selection_diagnostics,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function differencePaths(left: unknown, right: unknown, path = "diagnostics"): string[] {
  if (canonicalJson(left) === canonicalJson(right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    return Array.from({ length }, (_, index) =>
      differencePaths(left[index], right[index], `${path}[${index}]`),
    ).flat();
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) =>
      differencePaths(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`,
      ),
    );
  }
  return [path];
}

function sameEvidence(
  existing: typeof performanceCalibrationEvidence.$inferSelect,
  desired: CalibrationEvidenceWrite,
) {
  return evidenceDifferences(existing, desired).length === 0;
}

function evidenceDifferences(
  existing: typeof performanceCalibrationEvidence.$inferSelect,
  desired: CalibrationEvidenceWrite,
) {
  const fields: string[] = [];
  if (existing.profile_id !== desired.profileId) fields.push("profile_id");
  if (existing.activity_category !== desired.identity.activityCategory) {
    fields.push("activity_category");
  }
  if (existing.metric_key !== desired.identity.metricKey) fields.push("metric_key");
  if (existing.value !== desired.value) fields.push("value");
  if (existing.unit !== getCalibrationRegistryEntry(desired.identity)?.canonicalUnit) {
    fields.push("unit");
  }
  if (existing.observed_at.getTime() !== desired.observedAt.getTime()) fields.push("observed_at");
  if (existing.source_artifact_id !== desired.sourceArtifactId) fields.push("source_artifact_id");
  if (existing.state !== desired.state) fields.push("state");
  if (existing.rejection_reason !== desired.rejectionReason) fields.push("rejection_reason");
  if (existing.source_semantics !== desired.sourceSemantics) fields.push("source_semantics");
  if (canonicalJson(existing.diagnostics) !== canonicalJson(desired.diagnostics)) {
    fields.push(...differencePaths(existing.diagnostics, desired.diagnostics));
  }
  return fields;
}

/** Immutable idempotent insert; a divergent replay of one source/policy identity fails closed. */
export async function insertCalibrationEvidenceEvaluation(
  tx: DrizzleTransactionClient,
  input: CalibrationEvidenceWrite,
) {
  const registry = getCalibrationRegistryEntry(input.identity);
  if (!registry) throw new Error("Calibration identity is not enabled");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.profileId}, 0))`);
  const [acceptedSource] = await tx
    .select({ id: activitySegments.id })
    .from(activitySegments)
    .innerJoin(
      activities,
      and(
        eq(activities.id, activitySegments.activity_id),
        eq(activities.profile_id, activitySegments.profile_id),
      ),
    )
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, activitySegments.activity_id),
        eq(activityArtifactLinks.artifact_id, activitySegments.source_artifact_id),
        eq(activityArtifactLinks.profile_id, activitySegments.profile_id),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
        eq(activityArtifacts.availability, "accepted"),
      ),
    )
    .where(
      and(
        eq(activitySegments.id, input.segmentId),
        eq(activitySegments.activity_id, input.activityId),
        eq(activitySegments.profile_id, input.profileId),
        eq(activitySegments.activity_category, input.identity.activityCategory),
        eq(activitySegments.segment_revision, input.segmentRevision),
        eq(activitySegments.source_artifact_id, input.sourceArtifactId),
        eq(activities.segments_revision, input.segmentRevision),
      ),
    )
    .limit(1);
  if (!acceptedSource) {
    throw new Error("Calibration evidence source is not the accepted profile-owned revision");
  }
  const id = input.id ?? randomUUID();
  const desiredModelInputs = await buildCalibrationModelInputSnapshots(tx, input, id);
  const [inserted] = await tx
    .insert(performanceCalibrationEvidence)
    .values({
      id,
      profile_id: input.profileId,
      metric_key: input.identity.metricKey,
      activity_category: input.identity.activityCategory,
      value: input.value,
      unit: registry.canonicalUnit,
      observed_at: input.observedAt,
      activity_id: input.activityId,
      segment_id: input.segmentId,
      segment_revision: input.segmentRevision,
      source_artifact_id: input.sourceArtifactId,
      state: input.state,
      rejection_reason: input.rejectionReason,
      policy_version: registry.policyVersion,
      source_semantics: input.sourceSemantics,
      diagnostics: input.diagnostics,
      created_at: input.now,
    })
    .onConflictDoNothing({
      target: [
        performanceCalibrationEvidence.activity_id,
        performanceCalibrationEvidence.segment_id,
        performanceCalibrationEvidence.segment_revision,
        performanceCalibrationEvidence.source_artifact_id,
        performanceCalibrationEvidence.metric_key,
        performanceCalibrationEvidence.policy_version,
      ],
    })
    .returning();
  if (inserted) {
    if (desiredModelInputs.length > 0) {
      const modelInputs = await tx
        .insert(performanceCalibrationModelInputs)
        .values(desiredModelInputs)
        .returning({ effortId: performanceCalibrationModelInputs.effort_id });
      if (modelInputs.length !== desiredModelInputs.length) {
        throw new Error("Calibration model inputs were not fully persisted");
      }
    }
    return { row: inserted, inserted: true } as const;
  }
  const [existing] = await tx
    .select()
    .from(performanceCalibrationEvidence)
    .where(
      and(
        eq(performanceCalibrationEvidence.activity_id, input.activityId),
        eq(performanceCalibrationEvidence.segment_id, input.segmentId),
        eq(performanceCalibrationEvidence.segment_revision, input.segmentRevision),
        eq(performanceCalibrationEvidence.source_artifact_id, input.sourceArtifactId),
        eq(performanceCalibrationEvidence.metric_key, input.identity.metricKey),
        eq(performanceCalibrationEvidence.policy_version, registry.policyVersion),
      ),
    )
    .limit(1);
  if (!existing || !sameEvidence(existing, input)) {
    const fields = existing ? evidenceDifferences(existing, input).join(",") : "missing_row";
    throw new Error(
      `Calibration evidence identity replay diverged from immutable evaluation (${fields})`,
    );
  }
  const desiredExistingModelInputs = await buildCalibrationModelInputSnapshots(
    tx,
    input,
    existing.id,
  );
  const existingModelInputs = await tx
    .select()
    .from(performanceCalibrationModelInputs)
    .where(eq(performanceCalibrationModelInputs.calibration_evidence_id, existing.id))
    .orderBy(asc(performanceCalibrationModelInputs.ordinal));
  if (!sameCalibrationModelInputs(existingModelInputs, desiredExistingModelInputs)) {
    throw new Error("Calibration model input replay diverged from immutable evaluation");
  }
  return { row: existing, inserted: false } as const;
}

/** Explicitly invalidates no-longer-accepted source revisions without deleting audit evidence. */
export async function invalidateCalibrationEvidenceForActivitySources(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    activityId: string;
    acceptedSources: Array<{
      segmentId: string;
      segmentRevision: number;
      sourceArtifactId: string;
    }>;
    now: Date;
    reason: string;
  },
) {
  const acceptedSources = JSON.stringify(
    input.acceptedSources.map((source) => ({
      segment_id: source.segmentId,
      segment_revision: source.segmentRevision,
      source_artifact_id: source.sourceArtifactId,
    })),
  );
  const rows = await tx
    .update(performanceCalibrationEvidence)
    .set({ state: "invalidated", invalidated_at: input.now, invalidation_reason: input.reason })
    .where(
      and(
        eq(performanceCalibrationEvidence.profile_id, input.profileId),
        eq(performanceCalibrationEvidence.state, "candidate"),
        sql`(
          (
            ${performanceCalibrationEvidence.activity_id} = ${input.activityId}::uuid
            and not exists (
              select 1
              from jsonb_to_recordset(${acceptedSources}::jsonb) as accepted_source(
                segment_id uuid,
                segment_revision bigint,
                source_artifact_id uuid
              )
              where accepted_source.segment_id = ${performanceCalibrationEvidence.segment_id}
                and accepted_source.segment_revision = ${performanceCalibrationEvidence.segment_revision}
                and accepted_source.source_artifact_id = ${performanceCalibrationEvidence.source_artifact_id}
            )
          )
          or exists (
            select 1
            from ${performanceCalibrationModelInputs} model_input
            where model_input.calibration_evidence_id = ${performanceCalibrationEvidence.id}
              and model_input.activity_id = ${input.activityId}::uuid
              and not exists (
                select 1
                from jsonb_to_recordset(${acceptedSources}::jsonb) as accepted_source(
                  segment_id uuid,
                  segment_revision bigint,
                  source_artifact_id uuid
                )
                where accepted_source.segment_id = model_input.segment_id
                  and accepted_source.segment_revision = model_input.segment_revision
                  and accepted_source.source_artifact_id = model_input.source_artifact_id
              )
          )
        )`,
      ),
    )
    .returning({
      metricKey: performanceCalibrationEvidence.metric_key,
      activityCategory: performanceCalibrationEvidence.activity_category,
    });
  const identities = rows.flatMap((row) => {
    if (
      row.activityCategory !== "bike" &&
      row.activityCategory !== "run" &&
      row.activityCategory !== "swim"
    ) {
      return [];
    }
    const identity: CalibrationIdentity = {
      metricKey: row.metricKey,
      activityCategory: row.activityCategory,
    };
    return getCalibrationRegistryEntry(identity) ? [identity] : [];
  });
  return [
    ...new Map(
      identities.map((identity) => [
        `${identity.metricKey}/${identity.activityCategory}`,
        identity,
      ]),
    ).values(),
  ];
}

/** Invalidates every active candidate before activity rejection/deletion or source replacement. */
export async function invalidateAllCalibrationEvidenceForActivity(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    activityId: string;
    now: Date;
    reason: string;
  },
) {
  const rows = await tx
    .update(performanceCalibrationEvidence)
    .set({ state: "invalidated", invalidated_at: input.now, invalidation_reason: input.reason })
    .where(
      and(
        eq(performanceCalibrationEvidence.profile_id, input.profileId),
        eq(performanceCalibrationEvidence.state, "candidate"),
        sql`(
          ${performanceCalibrationEvidence.activity_id} = ${input.activityId}::uuid
          or exists (
            select 1
            from ${performanceCalibrationModelInputs} model_input
            where model_input.calibration_evidence_id = ${performanceCalibrationEvidence.id}
              and model_input.activity_id = ${input.activityId}::uuid
          )
        )`,
      ),
    )
    .returning({
      metricKey: performanceCalibrationEvidence.metric_key,
      activityCategory: performanceCalibrationEvidence.activity_category,
    });
  const identities = rows.flatMap((row) => {
    if (
      row.activityCategory !== "bike" &&
      row.activityCategory !== "run" &&
      row.activityCategory !== "swim"
    ) {
      return [];
    }
    const identity: CalibrationIdentity = {
      metricKey: row.metricKey,
      activityCategory: row.activityCategory,
    };
    return getCalibrationRegistryEntry(identity) ? [identity] : [];
  });
  return [
    ...new Map(
      identities.map((identity) => [
        `${identity.metricKey}/${identity.activityCategory}`,
        identity,
      ]),
    ).values(),
  ];
}

async function readCandidates(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    identity: CalibrationIdentity;
    asOf: Date;
    excludedActivityId?: string;
  },
): Promise<CalibrationCandidate[]> {
  const rows = await db
    .select({
      id: performanceCalibrationEvidence.id,
      activityId: performanceCalibrationEvidence.activity_id,
      observedAt: performanceCalibrationEvidence.observed_at,
      value: performanceCalibrationEvidence.value,
      metricKey: performanceCalibrationEvidence.metric_key,
      activityCategory: performanceCalibrationEvidence.activity_category,
    })
    .from(performanceCalibrationEvidence)
    .innerJoin(
      activities,
      and(
        eq(activities.id, performanceCalibrationEvidence.activity_id),
        eq(activities.profile_id, performanceCalibrationEvidence.profile_id),
        eq(activities.finished_at, performanceCalibrationEvidence.observed_at),
      ),
    )
    .innerJoin(
      activitySegments,
      and(
        eq(activitySegments.id, performanceCalibrationEvidence.segment_id),
        eq(activitySegments.activity_id, performanceCalibrationEvidence.activity_id),
        eq(activitySegments.profile_id, performanceCalibrationEvidence.profile_id),
        eq(activitySegments.segment_revision, performanceCalibrationEvidence.segment_revision),
        eq(activitySegments.segment_revision, activities.segments_revision),
        eq(activitySegments.source_artifact_id, performanceCalibrationEvidence.source_artifact_id),
      ),
    )
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, performanceCalibrationEvidence.activity_id),
        eq(activityArtifactLinks.artifact_id, performanceCalibrationEvidence.source_artifact_id),
        eq(activityArtifactLinks.profile_id, performanceCalibrationEvidence.profile_id),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
        eq(activityArtifacts.availability, "accepted"),
      ),
    )
    .where(
      and(
        eq(performanceCalibrationEvidence.profile_id, input.profileId),
        eq(performanceCalibrationEvidence.metric_key, input.identity.metricKey),
        eq(performanceCalibrationEvidence.activity_category, input.identity.activityCategory),
        eq(performanceCalibrationEvidence.state, "candidate"),
        sql`${performanceCalibrationEvidence.invalidated_at} is null`,
        eq(performanceCalibrationEvidence.policy_version, PERFORMANCE_CALIBRATION_POLICY_VERSION),
        currentCalibrationModelInputsPredicate(),
        lte(performanceCalibrationEvidence.observed_at, input.asOf),
        lte(activities.finished_at, input.asOf),
        input.excludedActivityId === undefined
          ? undefined
          : ne(performanceCalibrationEvidence.activity_id, input.excludedActivityId),
      ),
    )
    .orderBy(
      desc(performanceCalibrationEvidence.observed_at),
      desc(performanceCalibrationEvidence.id),
    )
    .limit(CANDIDATE_LIMIT);
  return rows.map((row) => {
    if (row.value === null) throw new Error("Candidate calibration evidence has no value");
    if (
      row.metricKey !== input.identity.metricKey ||
      row.activityCategory !== input.identity.activityCategory
    ) {
      throw new Error("Candidate calibration evidence does not match the requested identity");
    }
    return {
      id: row.id,
      activityId: row.activityId,
      observedAt: row.observedAt.toISOString(),
      value: row.value,
      state: "candidate" as const,
      invalidatedAt: null,
    };
  });
}

async function readAcceptedSelectedEvidence(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    calibrationId: string;
    identity: CalibrationIdentity;
    asOf: Date;
    excludedActivityId?: string;
  },
) {
  return db
    .select({
      id: performanceCalibrationEvidence.id,
      activityId: performanceCalibrationEvidence.activity_id,
      ordinal: performanceCalibrationSelectionEvidence.ordinal,
      linkMetricKey: performanceCalibrationSelectionEvidence.metric_key,
      linkActivityCategory: performanceCalibrationSelectionEvidence.activity_category,
      evidenceMetricKey: performanceCalibrationEvidence.metric_key,
      evidenceActivityCategory: performanceCalibrationEvidence.activity_category,
    })
    .from(performanceCalibrationSelectionEvidence)
    .innerJoin(
      performanceCalibrationEvidence,
      and(
        eq(performanceCalibrationEvidence.id, performanceCalibrationSelectionEvidence.evidence_id),
        eq(
          performanceCalibrationEvidence.profile_id,
          performanceCalibrationSelectionEvidence.profile_id,
        ),
        eq(
          performanceCalibrationEvidence.metric_key,
          performanceCalibrationSelectionEvidence.metric_key,
        ),
        eq(
          performanceCalibrationEvidence.activity_category,
          performanceCalibrationSelectionEvidence.activity_category,
        ),
      ),
    )
    .innerJoin(
      activities,
      and(
        eq(activities.id, performanceCalibrationEvidence.activity_id),
        eq(activities.profile_id, performanceCalibrationEvidence.profile_id),
        eq(activities.finished_at, performanceCalibrationEvidence.observed_at),
      ),
    )
    .innerJoin(
      activitySegments,
      and(
        eq(activitySegments.id, performanceCalibrationEvidence.segment_id),
        eq(activitySegments.activity_id, performanceCalibrationEvidence.activity_id),
        eq(activitySegments.profile_id, performanceCalibrationEvidence.profile_id),
        eq(activitySegments.segment_revision, performanceCalibrationEvidence.segment_revision),
        eq(activitySegments.segment_revision, activities.segments_revision),
        eq(activitySegments.source_artifact_id, performanceCalibrationEvidence.source_artifact_id),
      ),
    )
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, performanceCalibrationEvidence.activity_id),
        eq(activityArtifactLinks.artifact_id, performanceCalibrationEvidence.source_artifact_id),
        eq(activityArtifactLinks.profile_id, performanceCalibrationEvidence.profile_id),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
        eq(activityArtifacts.availability, "accepted"),
      ),
    )
    .where(
      and(
        eq(performanceCalibrationSelectionEvidence.profile_id, input.profileId),
        eq(performanceCalibrationSelectionEvidence.calibration_id, input.calibrationId),
        eq(performanceCalibrationSelectionEvidence.metric_key, input.identity.metricKey),
        eq(
          performanceCalibrationSelectionEvidence.activity_category,
          input.identity.activityCategory,
        ),
        eq(performanceCalibrationEvidence.state, "candidate"),
        sql`${performanceCalibrationEvidence.invalidated_at} is null`,
        eq(performanceCalibrationEvidence.policy_version, PERFORMANCE_CALIBRATION_POLICY_VERSION),
        currentCalibrationModelInputsPredicate(),
        lte(performanceCalibrationEvidence.observed_at, input.asOf),
        lte(activities.finished_at, input.asOf),
        input.excludedActivityId === undefined
          ? undefined
          : ne(performanceCalibrationEvidence.activity_id, input.excludedActivityId),
      ),
    )
    .orderBy(asc(performanceCalibrationSelectionEvidence.ordinal))
    .limit(64);
}

/** Latest effective row whose cited candidate evidence is still accepted/current. */
export async function readCalibrationAsOf(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    identity: CalibrationIdentity;
    asOf: Date;
    excludedActivityId?: string;
  },
): Promise<CalibrationRecord | null> {
  const rows = await db
    .select()
    .from(performanceCalibrations)
    .where(
      and(
        eq(performanceCalibrations.profile_id, input.profileId),
        eq(performanceCalibrations.metric_key, input.identity.metricKey),
        eq(performanceCalibrations.activity_category, input.identity.activityCategory),
        eq(performanceCalibrations.policy_version, PERFORMANCE_CALIBRATION_POLICY_VERSION),
        lte(performanceCalibrations.effective_at, input.asOf),
      ),
    )
    .orderBy(
      desc(performanceCalibrations.effective_at),
      desc(performanceCalibrations.created_at),
      desc(performanceCalibrations.id),
    )
    .limit(16);
  for (const row of rows) {
    const diagnostics = calibrationSelectionDiagnosticsSchema.parse(row.selection_diagnostics);
    if (diagnostics.selectedEvidenceIds.length === 0) {
      // Every persisted selection must retain at least one normalized evidence edge.
      continue;
    }
    const accepted = await readAcceptedSelectedEvidence(db, {
      profileId: input.profileId,
      calibrationId: row.id,
      identity: input.identity,
      asOf: input.asOf,
      ...(input.excludedActivityId === undefined
        ? {}
        : { excludedActivityId: input.excludedActivityId }),
    });
    const acceptedIds = accepted.map(({ id }) => id);
    if (
      diagnostics.selectedEvidenceIds.length === acceptedIds.length &&
      diagnostics.selectedEvidenceIds.every((id, index) => acceptedIds[index] === id) &&
      accepted.every(
        (candidate) =>
          candidate.linkMetricKey === input.identity.metricKey &&
          candidate.linkActivityCategory === input.identity.activityCategory &&
          candidate.evidenceMetricKey === input.identity.metricKey &&
          candidate.evidenceActivityCategory === input.identity.activityCategory,
      ) &&
      (input.excludedActivityId === undefined ||
        accepted.every(
          (candidate) =>
            !diagnostics.selectedEvidenceIds.includes(candidate.id) ||
            candidate.activityId !== input.excludedActivityId,
        ))
    ) {
      return rowToCalibrationRecord(row);
    }
  }
  return null;
}

async function readLatestCalibrationHistoryRow(
  db: DrizzleQueryExecutor,
  input: { profileId: string; identity: CalibrationIdentity },
) {
  const [row] = await db
    .select({ id: performanceCalibrations.id, effectiveAt: performanceCalibrations.effective_at })
    .from(performanceCalibrations)
    .where(
      and(
        eq(performanceCalibrations.profile_id, input.profileId),
        eq(performanceCalibrations.metric_key, input.identity.metricKey),
        eq(performanceCalibrations.activity_category, input.identity.activityCategory),
        eq(performanceCalibrations.policy_version, PERFORMANCE_CALIBRATION_POLICY_VERSION),
      ),
    )
    .orderBy(
      desc(performanceCalibrations.effective_at),
      desc(performanceCalibrations.created_at),
      desc(performanceCalibrations.id),
    )
    .limit(1);
  return row ?? null;
}

export type CalibrationResolutionDisposition = "changed" | "unchanged" | "deferred_newer_history";

/** Resolves one identity and appends each newly selected immutable history row. Caller owns profile lock. */
export async function resolveCalibrationWithProfileLockHeld(
  tx: DrizzleTransactionClient,
  input: { profileId: string; identity: CalibrationIdentity; asOf: Date; now: Date },
) {
  // node-postgres transaction clients permit only one active query. Keep these
  // dependent identity reads sequential rather than multiplexing client.query().
  const candidates = await readCandidates(tx, input);
  const current = await readCalibrationAsOf(tx, input);
  const latestHistory = await readLatestCalibrationHistoryRow(tx, input);
  if (latestHistory && latestHistory.effectiveAt.getTime() > input.asOf.getTime()) {
    return {
      changed: false,
      calibration: current,
      disposition: "deferred_newer_history" as const satisfies CalibrationResolutionDisposition,
      deferredByCalibrationId: latestHistory.id,
      deferredByEffectiveAt: latestHistory.effectiveAt,
    };
  }
  const selection = selectCalibration({
    identity: input.identity,
    asOf: input.asOf.toISOString(),
    candidates,
    current,
    nextId: randomUUID(),
  });
  if (selection.state === "unavailable" || current?.id === selection.calibration.id) {
    return {
      changed: false,
      calibration: selection.state === "unavailable" ? null : selection.calibration,
      disposition: "unchanged" as const satisfies CalibrationResolutionDisposition,
    };
  }
  const calibration = selection.calibration;
  const candidateIds = new Set(candidates.map(({ id }) => id));
  if (
    calibration.selectionDiagnostics.selectedEvidenceIds.some(
      (evidenceId) => !candidateIds.has(evidenceId),
    )
  ) {
    throw new Error("Selected calibration evidence does not match the resolved identity");
  }
  await tx.insert(performanceCalibrations).values({
    id: calibration.id,
    profile_id: input.profileId,
    metric_key: calibration.identity.metricKey,
    activity_category: calibration.identity.activityCategory,
    value: calibration.value,
    unit: calibration.unit,
    effective_at: new Date(calibration.effectiveAt),
    expires_at: new Date(calibration.expiresAt),
    policy_version: calibration.policyVersion,
    selection_diagnostics: calibration.selectionDiagnostics,
    supersedes_id: latestHistory?.id ?? null,
    created_at: input.now,
  });
  const selectedEvidenceIds = calibration.selectionDiagnostics.selectedEvidenceIds;
  const desiredLinks = buildCalibrationSelectionEvidenceLinks({
    calibrationId: calibration.id,
    profileId: input.profileId,
    identity: calibration.identity,
    selectedEvidenceIds,
  });
  const links = await tx
    .insert(performanceCalibrationSelectionEvidence)
    .values(desiredLinks)
    .returning({ evidenceId: performanceCalibrationSelectionEvidence.evidence_id });
  if (links.length !== selectedEvidenceIds.length) {
    throw new Error("Selected calibration evidence links were not fully persisted");
  }
  return {
    changed: true,
    calibration,
    disposition: "changed" as const satisfies CalibrationResolutionDisposition,
  };
}

export async function readCalibrationEvidenceSource(
  tx: DrizzleQueryExecutor,
  input: { profileId: string; activityId: string },
) {
  const sources = await tx
    .select({
      finishedAt: activities.finished_at,
      segmentsRevision: activities.segments_revision,
      segmentId: activitySegments.id,
      activityCategory: activitySegments.activity_category,
      sourceArtifactId: activitySegments.source_artifact_id,
    })
    .from(activities)
    .innerJoin(
      activitySegments,
      and(
        eq(activitySegments.activity_id, activities.id),
        eq(activitySegments.profile_id, activities.profile_id),
        eq(activitySegments.role, "activity"),
        eq(activitySegments.segment_revision, activities.segments_revision),
      ),
    )
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, activities.id),
        eq(activityArtifactLinks.profile_id, activities.profile_id),
        eq(activityArtifactLinks.artifact_id, activitySegments.source_artifact_id),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, input.profileId),
        eq(activityArtifacts.availability, "accepted"),
      ),
    )
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .orderBy(asc(activitySegments.ordinal))
    .limit(64);
  return sources;
}

export async function readCalibrationRowsForIdentities(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    identities: CalibrationIdentity[];
    asOf: Date;
    excludedActivityId?: string;
  },
) {
  const [rows] = await readCalibrationRowsBatch(db, [
    {
      profileId: input.profileId,
      identities: input.identities,
      asOf: input.asOf,
      ...(input.excludedActivityId === undefined
        ? {}
        : { excludedActivityId: input.excludedActivityId }),
    },
  ]);
  return rows ?? [];
}

const calibrationBatchRowSchema = z.object({
  ordinal: z.coerce.number().int().nonnegative(),
  id: z.string().uuid(),
  metric_key: z.enum(["threshold_power", "threshold_speed", "threshold_heart_rate"]),
  activity_category: z.enum(["bike", "run", "swim"]),
  value: z.coerce.number().positive(),
  unit: z.enum(["watts", "meters_per_second", "beats_per_minute"]),
  effective_at: z.coerce.date(),
  expires_at: z.coerce.date(),
  policy_version: z.string().min(1),
  selection_diagnostics: z.unknown(),
});

/** Set-based current-source as-of resolver used by historical batch analysis. */
export async function readCalibrationRowsBatch(
  db: DrizzleQueryExecutor,
  inputs: Array<{
    profileId: string;
    identities: CalibrationIdentity[];
    asOf: Date;
    excludedActivityId?: string;
  }>,
): Promise<CalibrationRecord[][]> {
  if (inputs.length === 0) return [];
  const requests = inputs.map((input, ordinal) => ({
    ordinal,
    profile_id: input.profileId,
    as_of: input.asOf.toISOString(),
    excluded_activity_id: input.excludedActivityId ?? null,
    identity_keys: input.identities.map(
      ({ metricKey, activityCategory }) => `${metricKey}/${activityCategory}`,
    ),
  }));
  const result = await db.execute(sql`
    with requests as materialized (
      select *
      from jsonb_to_recordset(${JSON.stringify(requests)}::jsonb) as request(
        ordinal integer,
        profile_id uuid,
        as_of timestamptz,
        excluded_activity_id uuid,
        identity_keys text[]
      )
    )
    select request.ordinal,
      calibration.id,
      calibration.metric_key,
      calibration.activity_category,
      calibration.value,
      calibration.unit,
      calibration.effective_at,
      calibration.expires_at,
      calibration.policy_version,
      calibration.selection_diagnostics
    from requests request
    cross join lateral (
      select distinct on (candidate.metric_key, candidate.activity_category) candidate.*
      from performance_calibrations candidate
      where candidate.profile_id = request.profile_id
        and candidate.policy_version = ${PERFORMANCE_CALIBRATION_POLICY_VERSION}
        and candidate.effective_at <= request.as_of
        and (candidate.metric_key::text || '/' || candidate.activity_category) = any(request.identity_keys)
        and coalesce((
          select jsonb_agg(link.evidence_id::text order by link.ordinal)
          from performance_calibration_selection_evidence link
          where link.calibration_id = candidate.id
            and link.profile_id = candidate.profile_id
            and link.metric_key = candidate.metric_key
            and link.activity_category = candidate.activity_category
        ), '[]'::jsonb) = coalesce(candidate.selection_diagnostics -> 'selectedEvidenceIds', '[]'::jsonb)
        and not exists (
          select 1
          from performance_calibration_selection_evidence selected
          where selected.calibration_id = candidate.id
            and selected.profile_id = candidate.profile_id
            and selected.metric_key = candidate.metric_key
            and selected.activity_category = candidate.activity_category
            and not exists (
            select 1
            from performance_calibration_evidence evidence
            join activities activity
              on activity.id = evidence.activity_id
             and activity.profile_id = evidence.profile_id
             and activity.finished_at = evidence.observed_at
             and activity.finished_at <= request.as_of
            join activity_segments segment
              on segment.id = evidence.segment_id
             and segment.activity_id = evidence.activity_id
             and segment.profile_id = evidence.profile_id
             and segment.segment_revision = evidence.segment_revision
             and segment.segment_revision = activity.segments_revision
             and segment.source_artifact_id = evidence.source_artifact_id
            join activity_artifact_links source_link
              on source_link.activity_id = evidence.activity_id
             and source_link.artifact_id = evidence.source_artifact_id
             and source_link.profile_id = evidence.profile_id
             and source_link.role = 'source'
             and source_link.is_current = true
            join activity_artifacts artifact
              on artifact.id = source_link.artifact_id
             and artifact.profile_id = source_link.profile_id
             and artifact.availability = 'accepted'
             where evidence.id = selected.evidence_id
               and evidence.profile_id = request.profile_id
               and evidence.metric_key = selected.metric_key
               and evidence.activity_category = selected.activity_category
               and evidence.metric_key = candidate.metric_key
               and evidence.activity_category = candidate.activity_category
               and evidence.state = 'candidate'
               and evidence.invalidated_at is null
               and not exists (
                 select 1
                 from performance_calibration_model_inputs model_input
                 where model_input.calibration_evidence_id = evidence.id
                   and not exists (
                     select 1
                     from activities model_activity
                     join activity_segments model_segment
                       on model_segment.id = model_input.segment_id
                      and model_segment.activity_id = model_input.activity_id
                      and model_segment.profile_id = model_input.profile_id
                      and model_segment.segment_revision = model_input.segment_revision
                      and model_segment.source_artifact_id = model_input.source_artifact_id
                     join activity_efforts model_effort
                       on model_effort.id = model_input.effort_id
                      and model_effort.activity_id = model_input.activity_id
                      and model_effort.segment_id = model_input.segment_id
                      and model_effort.profile_id = model_input.profile_id
                     join activity_artifact_links model_source_link
                       on model_source_link.activity_id = model_input.activity_id
                      and model_source_link.artifact_id = model_input.source_artifact_id
                      and model_source_link.profile_id = model_input.profile_id
                      and model_source_link.role = 'source'
                      and model_source_link.is_current = true
                     join activity_artifacts model_artifact
                       on model_artifact.id = model_input.source_artifact_id
                      and model_artifact.profile_id = model_input.profile_id
                      and model_artifact.digest = model_input.source_artifact_digest
                      and model_artifact.availability = 'accepted'
                     where model_activity.id = model_input.activity_id
                       and model_activity.profile_id = model_input.profile_id
                       and model_activity.segments_revision = model_input.segment_revision
                   )
               )
               and evidence.observed_at <= request.as_of
              and (request.excluded_activity_id is null or evidence.activity_id <> request.excluded_activity_id)
            )
        )
      order by candidate.metric_key, candidate.activity_category,
        candidate.effective_at desc, candidate.created_at desc, candidate.id desc
    ) calibration
    order by request.ordinal, calibration.metric_key, calibration.activity_category
  `);
  const grouped = inputs.map(() => [] as CalibrationRecord[]);
  for (const unknownRow of result.rows) {
    const row = calibrationBatchRowSchema.parse(unknownRow);
    if (!inputs[row.ordinal])
      throw new Error("Calibration batch returned an unknown request ordinal");
    grouped[row.ordinal]?.push(
      calibrationRecordSchema.parse({
        id: row.id,
        identity: { metricKey: row.metric_key, activityCategory: row.activity_category },
        value: row.value,
        unit: row.unit,
        effectiveAt: row.effective_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        policyVersion: row.policy_version,
        selectionDiagnostics: row.selection_diagnostics,
      }),
    );
  }
  return grouped;
}

export async function readDueCalibrationIds(
  tx: DrizzleTransactionClient,
  input: { now: Date; limit: number },
) {
  const result = await tx.execute(sql<{ id: string }>`
    select calibration.id
    from performance_calibrations calibration
    join ${profileAthleteState} athlete_state
      on athlete_state.profile_id = calibration.profile_id
     and athlete_state.source_revision = athlete_state.published_revision
    join ${profilePerformanceEstimates} estimate
      on estimate.profile_id = calibration.profile_id
     and estimate.source_revision = athlete_state.published_revision
     and estimate.capability_kind = calibration.metric_key::text
     and estimate.activity_category = calibration.activity_category
     and estimate.target_fact ->> 'calibrationId' = calibration.id::text
     and estimate.target_fact ->> 'calibrationState' in ('provisional', 'confirmed')
    where calibration.expires_at <= ${input.now}
      and not exists (
        select 1 from performance_calibrations newer
        where newer.profile_id = calibration.profile_id
          and newer.metric_key = calibration.metric_key
          and newer.activity_category = calibration.activity_category
          and newer.effective_at <= ${input.now}
          and (newer.effective_at, newer.created_at, newer.id) >
              (calibration.effective_at, calibration.created_at, calibration.id)
      )
    order by calibration.expires_at, calibration.profile_id, calibration.id
    limit ${input.limit}
    for update of calibration skip locked
  `);
  return result.rows.map((row) => z.object({ id: z.string().uuid() }).parse(row).id);
}

export async function readCalibrationsByIds(tx: DrizzleQueryExecutor, ids: string[]) {
  if (ids.length === 0) return [];
  return tx.select().from(performanceCalibrations).where(inArray(performanceCalibrations.id, ids));
}
