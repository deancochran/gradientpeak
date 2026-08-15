import { activityEfforts, activitySegments } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { type ThresholdImpact, thresholdEffortId } from "../../repositories/threshold-repository";
import { reconcileThresholdsWithProfileLockHeld } from "../performance-model/reconcile-thresholds";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type EffortInsert = typeof activityEfforts.$inferInsert;
type EffortRow = typeof activityEfforts.$inferSelect;

const GENERATED_EFFORT_METHOD = "activity_file_best_effort";

export interface GeneratedActivityLthrEvidence {
  valueBpm: number;
  recordedAt: Date;
  calculationVersion: string;
  provenance: {
    activity_id: string;
    segment_id: string;
    derived_from: "activity_file_best_effort";
    source_series: "heart_rate";
    source_effort_calculation_version: string;
    exact_window_start_timestamp_seconds: number;
    exact_window_end_timestamp_seconds: number;
    duration_seconds: number;
    window_coverage: 1;
    hr_coverage?: number;
    supporting_output_coverage?: number;
    maximum_gap_seconds?: number;
    output_coefficient_of_variation?: number;
    supporting_output_value?: number;
    grade_coverage?: number;
    extraction_status: "available" | "partial";
    extraction_reason: "source_incomplete" | null;
  };
}

export interface GeneratedActivityEvidenceInput {
  activityId: string;
  profileId: string;
  efforts: EffortInsert[];
  detectedLTHR: GeneratedActivityLthrEvidence | null;
  preInvalidatedCalibrationIdentities?: ThresholdImpact[];
  deferPerformanceCalibration?: boolean;
  now: Date;
}

export async function acquireActivityEvidenceProfileLock(
  tx: Pick<TransactionClient, "execute">,
  profileId: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
}

function effortIdentity(
  effort: Pick<
    EffortInsert,
    | "segment_id"
    | "activity_category"
    | "effort_type"
    | "source_series"
    | "duration_seconds"
    | "distance_meters"
    | "source_artifact_id"
    | "source_revision"
    | "start_offset_ms"
    | "end_offset_ms"
    | "unit"
    | "method"
  >,
) {
  return JSON.stringify([
    effort.segment_id ?? null,
    effort.activity_category,
    effort.effort_type,
    effort.source_series,
    effort.duration_seconds,
    effort.distance_meters ?? null,
    effort.source_artifact_id,
    effort.source_revision,
    effort.start_offset_ms,
    effort.end_offset_ms,
    effort.unit,
    effort.method ?? null,
  ]);
}

function bindGeneratedEffortObservationId(
  effort: EffortInsert,
  observationId: string,
): EffortInsert {
  const provenance = effort.provenance;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
    throw new Error("Generated activity effort requires object provenance");
  }
  if (!("source_series" in provenance) || provenance.source_series !== effort.source_series) {
    throw new Error("Generated activity effort source-series identity must match provenance");
  }
  return {
    ...effort,
    id: observationId,
    provenance: { ...provenance, observation_id: observationId },
  };
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

function hasSamePostgresRealValue(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.000001, Math.abs(right) * 0.000005);
}

function hasSameEffortEvidence(left: EffortRow, right: EffortInsert): boolean {
  return (
    left.profile_id === right.profile_id &&
    left.activity_id === right.activity_id &&
    left.segment_id === right.segment_id &&
    left.recorded_at.getTime() === right.recorded_at.getTime() &&
    left.activity_category === right.activity_category &&
    left.effort_type === right.effort_type &&
    left.source_series === right.source_series &&
    left.duration_seconds === right.duration_seconds &&
    left.distance_meters === (right.distance_meters ?? null) &&
    left.source_artifact_id === right.source_artifact_id &&
    left.source_revision === right.source_revision &&
    left.start_offset_ms === right.start_offset_ms &&
    left.end_offset_ms === right.end_offset_ms &&
    left.window_coverage === right.window_coverage &&
    left.max_gap_seconds === right.max_gap_seconds &&
    left.unit === right.unit &&
    hasSamePostgresRealValue(left.value, right.value) &&
    left.source === right.source &&
    left.method === right.method &&
    left.calculation_version === right.calculation_version &&
    left.quality_score === (right.quality_score ?? null) &&
    canonicalJson(left.provenance) === canonicalJson(right.provenance)
  );
}

export function planGeneratedActivityEvidenceReconciliation(input: {
  existingEfforts: EffortRow[];
  generated: GeneratedActivityEvidenceInput;
}) {
  const generatedEfforts = input.existingEfforts
    .filter((effort) => effort.method === GENERATED_EFFORT_METHOD && effort.source === "imported")
    .sort(
      (left, right) =>
        effortIdentity(left).localeCompare(effortIdentity(right)) ||
        left.id.localeCompare(right.id),
    );
  const availableByIdentity = new Map<string, EffortRow[]>();
  for (const effort of generatedEfforts) {
    const identity = effortIdentity(effort);
    availableByIdentity.set(identity, [...(availableByIdentity.get(identity) ?? []), effort]);
  }

  const effortDeleteIds: string[] = [];
  const effortInserts: EffortInsert[] = [];
  const reconciledEfforts: EffortInsert[] = [];
  const effortMaterialTimes: Date[] = [];
  for (const desired of input.generated.efforts) {
    const existing = availableByIdentity.get(effortIdentity(desired))?.shift();
    const retainedValues = existing ? bindGeneratedEffortObservationId(desired, existing.id) : null;
    const normalizedRetainedValues = retainedValues
      ? {
          ...retainedValues,
          activity_id: input.generated.activityId,
          profile_id: input.generated.profileId,
          source: "imported" as const,
          method: GENERATED_EFFORT_METHOD,
        }
      : null;
    if (
      existing &&
      normalizedRetainedValues &&
      hasSameEffortEvidence(existing, normalizedRetainedValues)
    ) {
      reconciledEfforts.push(normalizedRetainedValues);
      continue;
    }

    const observationId = desired.id;
    const values = {
      ...bindGeneratedEffortObservationId(desired, observationId),
      activity_id: input.generated.activityId,
      profile_id: input.generated.profileId,
      source: "imported" as const,
      method: GENERATED_EFFORT_METHOD,
      created_at: desired.created_at ?? input.generated.now,
    };
    if (existing) {
      throw new Error("Activity effort replay diverged from immutable source revision");
    } else {
      effortInserts.push(values);
      reconciledEfforts.push(values);
      effortMaterialTimes.push(desired.recorded_at);
    }
  }

  const effortDeletes = [...availableByIdentity.values()].flat();
  if (effortDeletes.length > 0) {
    throw new Error("Activity effort replay omitted immutable source-revision evidence");
  }
  return {
    effortDeleteIds,
    effortInserts,
    reconciledEfforts,
    effortMaterialRecordedAt:
      effortMaterialTimes.length === 0
        ? null
        : new Date(Math.min(...effortMaterialTimes.map((value) => value.getTime()))),
  };
}

export async function reconcileGeneratedActivityEvidence(
  tx: TransactionClient,
  input: GeneratedActivityEvidenceInput,
) {
  await acquireActivityEvidenceProfileLock(tx, input.profileId);
  return reconcileGeneratedActivityEvidenceWithProfileLockHeld(tx, input);
}

export async function reconcileGeneratedActivityEvidenceWithProfileLockHeld(
  tx: TransactionClient,
  input: GeneratedActivityEvidenceInput,
) {
  const sourceRows = await tx
    .select({
      segmentId: activitySegments.id,
      sourceArtifactId: activitySegments.source_artifact_id,
      sourceRevision: activitySegments.segment_revision,
    })
    .from(activitySegments)
    .where(
      and(
        eq(activitySegments.activity_id, input.activityId),
        eq(activitySegments.profile_id, input.profileId),
      ),
    );
  const sources = new Map(sourceRows.map((source) => [source.segmentId, source]));
  const boundEfforts = input.efforts.map((effort) => {
    const source = sources.get(effort.segment_id);
    if (!source?.sourceArtifactId) {
      throw new Error("Generated activity effort has no accepted source identity");
    }
    const id = thresholdEffortId({
      activityId: input.activityId,
      segmentId: effort.segment_id,
      sourceArtifactId: source.sourceArtifactId,
      sourceRevision: source.sourceRevision,
      effortType: effort.effort_type,
      sourceSeries: effort.source_series,
      startOffsetMs: effort.start_offset_ms,
      endOffsetMs: effort.end_offset_ms,
      method: effort.method,
      calculationVersion: effort.calculation_version,
    });
    return {
      ...bindGeneratedEffortObservationId(effort, id),
      id,
      activity_id: input.activityId,
      profile_id: input.profileId,
      source_artifact_id: source.sourceArtifactId,
      source_revision: source.sourceRevision,
      created_at: input.now,
    } satisfies EffortInsert;
  });
  const existingEfforts = await tx
    .select()
    .from(activityEfforts)
    .where(
      and(
        eq(activityEfforts.activity_id, input.activityId),
        eq(activityEfforts.profile_id, input.profileId),
      ),
    );
  const plan = planGeneratedActivityEvidenceReconciliation({
    existingEfforts,
    generated: { ...input, efforts: boundEfforts },
  });

  if (plan.effortInserts.length) await tx.insert(activityEfforts).values(plan.effortInserts);
  const calibrationReconciliation = input.deferPerformanceCalibration
    ? null
    : await reconcileThresholdsWithProfileLockHeld(tx, {
        profileId: input.profileId,
        activityId: input.activityId,
        // Analysis allocates provisional observation IDs. Calibration diagnostics
        // must cite the canonical retained/inserted IDs selected by reconciliation,
        // otherwise an identical artifact replay would diverge immutable evidence.
        efforts: plan.reconciledEfforts,
        ...(input.preInvalidatedCalibrationIdentities === undefined
          ? {}
          : { preInvalidatedIdentities: input.preInvalidatedCalibrationIdentities }),
        now: input.now,
      });

  return { ...plan, calibrationReconciliation };
}
