import { completedSegmentSummarySchema } from "@repo/core";
import { activities, activitySegments } from "@repo/db";
import { and, asc, eq } from "drizzle-orm";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  projectCanonicalCompletedObservationLoads,
} from "../../lib/activity-analysis";
import { markAthleteStateDirty } from "../../repositories/athlete-state-repository";

function confidenceForQuality(value: "high" | "low" | "medium" | "unknown") {
  return value === "high" ? 0.95 : value === "medium" ? 0.8 : value === "low" ? 0.6 : 0.5;
}

function earliestEffectiveAt(...values: Array<Date | null | undefined>) {
  const instants = values.filter((value): value is Date => value !== null && value !== undefined);
  return instants.length === 0
    ? null
    : new Date(Math.min(...instants.map((value) => value.getTime())));
}

export function resolveAthleteStateMaterialEffectiveAt(input: {
  activityFinishedAt: Date;
  activityMaterialChanged: boolean;
  effortMaterialRecordedAt?: Date | null;
}) {
  const effortEffectiveAt = input.effortMaterialRecordedAt
    ? new Date(
        Math.max(input.activityFinishedAt.getTime(), input.effortMaterialRecordedAt.getTime()),
      )
    : null;
  return earliestEffectiveAt(
    input.activityMaterialChanged ? input.activityFinishedAt : null,
    effortEffectiveAt,
  );
}

export async function materializeActivityAthleteStateEvidence(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    activityId: string;
    computedAt: Date;
    contextDb: DrizzleQueryExecutor;
    canonicalEvidenceMaterialChanged?: boolean;
    deferAthleteStateRefresh?: boolean;
    effortMaterialRecordedAt?: Date | null;
  },
) {
  const [activity] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .limit(1);
  if (!activity) throw new Error("Athlete state activity evidence is unavailable");
  const segments = await tx
    .select()
    .from(activitySegments)
    .where(
      and(
        eq(activitySegments.activity_id, input.activityId),
        eq(activitySegments.profile_id, input.profileId),
      ),
    )
    .orderBy(asc(activitySegments.ordinal));
  const summaries = await buildActivitySegmentDerivedSummaries({
    store: createActivityAnalysisStore(input.contextDb),
    profileId: input.profileId,
    activities: [{ ...activity, segments }],
    computedAsOf: input.computedAt,
  });
  const availableLoads = projectCanonicalCompletedObservationLoads(summaries).filter(
    (observation) => observation.commonLoad.status === "available",
  );
  if (availableLoads.length === 0) {
    const activityProjectionChanged = activity.athlete_state_common_load !== null;
    const activityMaterialChanged =
      activityProjectionChanged || input.canonicalEvidenceMaterialChanged === true;
    const effectiveAt = resolveAthleteStateMaterialEffectiveAt({
      activityFinishedAt: activity.finished_at,
      activityMaterialChanged,
      ...(input.effortMaterialRecordedAt !== undefined
        ? { effortMaterialRecordedAt: input.effortMaterialRecordedAt }
        : {}),
    });
    const materialChanged = effectiveAt !== null;
    if (activityProjectionChanged) {
      await tx
        .update(activities)
        .set({
          athlete_state_common_load: null,
          athlete_state_activity_category: null,
          athlete_state_evidence_confidence: null,
          athlete_state_capability_distance_meters: null,
          athlete_state_capability_duration_minutes: null,
          athlete_state_input_version: null,
          athlete_state_computed_at: null,
        })
        .where(
          and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)),
        );
    }
    if (effectiveAt !== null && !input.deferAthleteStateRefresh) {
      await markAthleteStateDirty(tx, {
        profileId: input.profileId,
        effectiveAt,
        now: input.computedAt,
      });
    }
    return { commonLoad: null, confidence: null, effectiveAt, materialChanged };
  }
  const primary = [...availableLoads].sort(
    (left, right) =>
      (right.commonLoad.status === "available" ? right.commonLoad.load : 0) -
      (left.commonLoad.status === "available" ? left.commonLoad.load : 0),
  )[0];
  if (!primary || primary.commonLoad.status !== "available")
    throw new Error("Canonical activity Common Load lost provenance");
  let commonLoad = 0;
  let confidence = 1;
  for (const observation of availableLoads) {
    if (observation.commonLoad.status !== "available") continue;
    commonLoad += observation.commonLoad.load;
    confidence = Math.min(
      confidence,
      confidenceForQuality(observation.commonLoad.quality.confidence),
    );
  }
  let capabilityDistanceMeters: number | null = null;
  let capabilityDurationMinutes: number | null = null;
  for (const segment of segments) {
    if (
      segment.role !== "activity" ||
      segment.activity_category !== primary.commonLoad.activity_category
    )
      continue;
    const summary = completedSegmentSummarySchema.parse(segment.summary);
    capabilityDistanceMeters = Math.max(capabilityDistanceMeters ?? 0, summary.distanceMeters ?? 0);
    const timing = summary.timing;
    const durationMs =
      "movingMs" in timing && timing.movingMs !== undefined
        ? timing.movingMs
        : "activeMs" in timing && timing.activeMs !== undefined
          ? timing.activeMs
          : segment.end_offset_ms - segment.start_offset_ms;
    capabilityDurationMinutes = Math.max(capabilityDurationMinutes ?? 0, durationMs / 60_000);
  }
  const activityMaterialChanged =
    input.canonicalEvidenceMaterialChanged === true ||
    activity.athlete_state_common_load !== commonLoad ||
    activity.athlete_state_activity_category !== primary.commonLoad.activity_category ||
    activity.athlete_state_evidence_confidence !== confidence ||
    activity.athlete_state_capability_distance_meters !== capabilityDistanceMeters ||
    activity.athlete_state_capability_duration_minutes !== capabilityDurationMinutes ||
    activity.athlete_state_input_version !== "canonical-activity-state-v1";
  const effectiveAt = resolveAthleteStateMaterialEffectiveAt({
    activityFinishedAt: activity.finished_at,
    activityMaterialChanged,
    ...(input.effortMaterialRecordedAt !== undefined
      ? { effortMaterialRecordedAt: input.effortMaterialRecordedAt }
      : {}),
  });
  const materialChanged = effectiveAt !== null;
  if (effectiveAt === null) return { commonLoad, confidence, effectiveAt, materialChanged };
  await tx
    .update(activities)
    .set({
      athlete_state_common_load: commonLoad,
      athlete_state_activity_category: primary.commonLoad.activity_category,
      athlete_state_evidence_confidence: confidence,
      athlete_state_capability_distance_meters: capabilityDistanceMeters,
      athlete_state_capability_duration_minutes: capabilityDurationMinutes,
      athlete_state_input_version: "canonical-activity-state-v1",
      athlete_state_computed_at: input.computedAt,
    })
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)));
  if (!input.deferAthleteStateRefresh) {
    await markAthleteStateDirty(tx, {
      profileId: input.profileId,
      effectiveAt,
      now: input.computedAt,
    });
  }
  return { commonLoad, confidence, effectiveAt, materialChanged };
}
