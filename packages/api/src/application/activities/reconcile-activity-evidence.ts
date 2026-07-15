import { randomUUID } from "node:crypto";
import { activityEfforts, profileMetrics } from "@repo/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type EffortInsert = typeof activityEfforts.$inferInsert;
type EffortRow = typeof activityEfforts.$inferSelect;
type MetricRow = typeof profileMetrics.$inferSelect;

const GENERATED_EFFORT_METHOD = "activity_file_best_effort";
const GENERATED_LTHR_METHOD = "activity_file_lthr_detection";

export interface GeneratedActivityEvidenceInput {
  activityId: string;
  profileId: string;
  efforts: EffortInsert[];
  detectedLTHR: number | null;
  activityCompletedAt: Date;
  now: Date;
}

export async function acquireActivityEvidenceProfileLock(
  tx: Pick<TransactionClient, "execute">,
  profileId: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
}

function effortIdentity(
  effort: Pick<EffortInsert, "activity_category" | "effort_type" | "duration_seconds" | "unit">,
) {
  return [effort.activity_category, effort.effort_type, effort.duration_seconds, effort.unit].join(
    ":",
  );
}

export function planGeneratedActivityEvidenceReconciliation(input: {
  existingEfforts: EffortRow[];
  existingMetrics: MetricRow[];
  generated: GeneratedActivityEvidenceInput;
}) {
  const generatedEfforts = input.existingEfforts.filter(
    (effort) => effort.method === GENERATED_EFFORT_METHOD && effort.source === "imported",
  );
  const availableByIdentity = new Map<string, EffortRow[]>();
  for (const effort of generatedEfforts) {
    const identity = effortIdentity(effort);
    availableByIdentity.set(identity, [...(availableByIdentity.get(identity) ?? []), effort]);
  }

  const effortUpdates: Array<{ id: string; values: EffortInsert }> = [];
  const effortInserts: EffortInsert[] = [];
  for (const desired of input.generated.efforts) {
    const existing = availableByIdentity.get(effortIdentity(desired))?.shift();
    const values = {
      ...desired,
      activity_id: input.generated.activityId,
      profile_id: input.generated.profileId,
      source: "imported" as const,
      method: GENERATED_EFFORT_METHOD,
      updated_at: input.generated.now,
    };
    if (existing) {
      effortUpdates.push({ id: existing.id, values });
    } else {
      effortInserts.push({
        ...values,
        id: desired.id ?? randomUUID(),
        created_at: desired.created_at ?? input.generated.now,
      });
    }
  }

  const effortDeleteIds = [...availableByIdentity.values()].flat().map((effort) => effort.id);
  const generatedMetrics = input.existingMetrics.filter(
    (metric) =>
      metric.metric_type === "lthr" &&
      metric.method === GENERATED_LTHR_METHOD &&
      metric.source === "derived",
  );
  const retainedMetric = generatedMetrics[0];
  const metricDeleteIds = generatedMetrics
    .slice(input.generated.detectedLTHR ? 1 : 0)
    .map(({ id }) => id);
  const metricValues = input.generated.detectedLTHR
    ? {
        profile_id: input.generated.profileId,
        metric_type: "lthr" as const,
        value: input.generated.detectedLTHR,
        unit: "bpm",
        recorded_at: input.generated.activityCompletedAt,
        reference_activity_id: input.generated.activityId,
        source: "derived" as const,
        method: GENERATED_LTHR_METHOD,
        calculation_version: "activity-file-lthr-v1",
        provenance: {
          activity_id: input.generated.activityId,
          derived_from: "activity_file_stream",
        },
        updated_at: input.generated.now,
      }
    : null;

  return {
    effortDeleteIds,
    effortInserts,
    effortUpdates,
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

  for (const update of plan.effortUpdates) {
    const { id: _ignoredId, created_at: _ignoredCreatedAt, ...values } = update.values;
    await tx.update(activityEfforts).set(values).where(eq(activityEfforts.id, update.id));
  }
  if (plan.effortInserts.length) await tx.insert(activityEfforts).values(plan.effortInserts);
  if (plan.effortDeleteIds.length) {
    await tx.delete(activityEfforts).where(inArray(activityEfforts.id, plan.effortDeleteIds));
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
