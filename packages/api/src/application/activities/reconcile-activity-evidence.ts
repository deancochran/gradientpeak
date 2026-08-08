import { randomUUID } from "node:crypto";
import { SWIMMING_CSS_SOURCE_EFFORT_METHOD } from "@repo/core";
import { activityEfforts, profileMetrics } from "@repo/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { reconcileSwimmingCssProtocolEvidenceWithProfileLockHeld } from "../performance-model/reconcile-swimming-css-protocol-evidence";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type EffortInsert = typeof activityEfforts.$inferInsert;
type EffortRow = typeof activityEfforts.$inferSelect;
type MetricRow = typeof profileMetrics.$inferSelect;

const GENERATED_EFFORT_METHOD = "activity_file_best_effort";
const GENERATED_LTHR_METHOD = "activity_file_lthr_detection";

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
    extraction_status: "available" | "partial";
    extraction_reason: "source_incomplete" | null;
  };
}

export interface GeneratedActivityEvidenceInput {
  activityId: string;
  profileId: string;
  efforts: EffortInsert[];
  detectedLTHR: GeneratedActivityLthrEvidence | null;
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
    | "duration_seconds"
    | "distance_meters"
    | "unit"
    | "method"
  >,
) {
  return JSON.stringify([
    effort.segment_id ?? null,
    effort.activity_category,
    effort.effort_type,
    effort.duration_seconds,
    effort.distance_meters ?? null,
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
    left.duration_seconds === right.duration_seconds &&
    left.distance_meters === (right.distance_meters ?? null) &&
    left.start_offset === (right.start_offset ?? null) &&
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
  existingMetrics: MetricRow[];
  generated: GeneratedActivityEvidenceInput;
}) {
  const generatedEfforts = input.existingEfforts
    .filter(
      (effort) =>
        (effort.method === GENERATED_EFFORT_METHOD ||
          effort.method === SWIMMING_CSS_SOURCE_EFFORT_METHOD) &&
        effort.source === "imported",
    )
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
          method:
            desired.method === SWIMMING_CSS_SOURCE_EFFORT_METHOD
              ? SWIMMING_CSS_SOURCE_EFFORT_METHOD
              : GENERATED_EFFORT_METHOD,
        }
      : null;
    if (
      existing &&
      normalizedRetainedValues &&
      hasSameEffortEvidence(existing, normalizedRetainedValues)
    ) {
      continue;
    }

    const observationId = desired.id && desired.id !== existing?.id ? desired.id : randomUUID();
    const values = {
      ...bindGeneratedEffortObservationId(desired, observationId),
      activity_id: input.generated.activityId,
      profile_id: input.generated.profileId,
      source: "imported" as const,
      method:
        desired.method === SWIMMING_CSS_SOURCE_EFFORT_METHOD
          ? SWIMMING_CSS_SOURCE_EFFORT_METHOD
          : GENERATED_EFFORT_METHOD,
      created_at: desired.created_at ?? input.generated.now,
    };
    if (existing) {
      effortDeleteIds.push(existing.id);
      effortInserts.push(values);
      effortMaterialTimes.push(existing.recorded_at, desired.recorded_at);
    } else {
      effortInserts.push(values);
      effortMaterialTimes.push(desired.recorded_at);
    }
  }

  const effortDeletes = [...availableByIdentity.values()].flat();
  effortDeleteIds.push(...effortDeletes.map((effort) => effort.id));
  effortMaterialTimes.push(...effortDeletes.map((effort) => effort.recorded_at));
  const generatedMetrics = input.existingMetrics
    .filter(
      (metric) =>
        metric.metric_type === "lthr" &&
        metric.method === GENERATED_LTHR_METHOD &&
        metric.source === "derived",
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const retainedMetric = generatedMetrics[0];
  const metricDeleteIds = generatedMetrics
    .slice(input.generated.detectedLTHR === null ? 0 : 1)
    .map(({ id }) => id);
  const metricValues = input.generated.detectedLTHR
    ? {
        profile_id: input.generated.profileId,
        metric_type: "lthr" as const,
        value: input.generated.detectedLTHR.valueBpm,
        unit: "bpm",
        recorded_at: input.generated.detectedLTHR.recordedAt,
        reference_activity_id: input.generated.activityId,
        source: "derived" as const,
        method: GENERATED_LTHR_METHOD,
        calculation_version: input.generated.detectedLTHR.calculationVersion,
        provenance: input.generated.detectedLTHR.provenance,
        updated_at: input.generated.now,
      }
    : null;

  return {
    effortDeleteIds,
    effortInserts,
    effortMaterialRecordedAt:
      effortMaterialTimes.length === 0
        ? null
        : new Date(Math.min(...effortMaterialTimes.map((value) => value.getTime()))),
    metricDeleteIds,
    metricInsert:
      metricValues && !retainedMetric
        ? {
            ...metricValues,
            id: randomUUID(),
            created_at: input.generated.now,
          }
        : null,
    metricUpdate:
      metricValues && retainedMetric ? { id: retainedMetric.id, values: metricValues } : null,
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
  const [existingEfforts, existingMetrics] = await Promise.all([
    tx
      .select()
      .from(activityEfforts)
      .where(
        and(
          eq(activityEfforts.activity_id, input.activityId),
          eq(activityEfforts.profile_id, input.profileId),
        ),
      ),
    tx
      .select()
      .from(profileMetrics)
      .where(
        and(
          eq(profileMetrics.reference_activity_id, input.activityId),
          eq(profileMetrics.profile_id, input.profileId),
          eq(profileMetrics.metric_type, "lthr"),
        ),
      ),
  ]);
  const plan = planGeneratedActivityEvidenceReconciliation({
    existingEfforts,
    existingMetrics,
    generated: input,
  });

  if (plan.effortDeleteIds.length) {
    await tx.delete(activityEfforts).where(inArray(activityEfforts.id, plan.effortDeleteIds));
  }
  if (plan.effortInserts.length) await tx.insert(activityEfforts).values(plan.effortInserts);
  const reconcilesSwimmingCss = [...existingEfforts, ...input.efforts].some(
    (effort) => effort.method === SWIMMING_CSS_SOURCE_EFFORT_METHOD,
  );
  if (reconcilesSwimmingCss) {
    await reconcileSwimmingCssProtocolEvidenceWithProfileLockHeld(tx, {
      activityId: input.activityId,
      profileId: input.profileId,
      now: input.now,
    });
  }
  if (plan.metricUpdate) {
    await tx
      .update(profileMetrics)
      .set(plan.metricUpdate.values)
      .where(eq(profileMetrics.id, plan.metricUpdate.id));
  }
  if (plan.metricInsert) await tx.insert(profileMetrics).values(plan.metricInsert);
  if (plan.metricDeleteIds.length) {
    await tx.delete(profileMetrics).where(inArray(profileMetrics.id, plan.metricDeleteIds));
  }

  return plan;
}
