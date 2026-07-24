import { activities, activitySegments } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import {
  acquireActivityEvidenceProfileLock,
  reconcileGeneratedActivityEvidenceWithProfileLockHeld,
} from "../activities/reconcile-activity-evidence";
import {
  analyzeParsedActivityFile,
  type ParsedActivityFileForAnalysis,
} from "./analyze-parsed-activity-file";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export interface ParsedActivityEvidenceReplayItem {
  activityId: string;
  activityType: string;
  parsedData: ParsedActivityFileForAnalysis;
}

export interface ActivityEvidenceReconciliationCounts {
  activityUpdates: number;
  effortDeletes: number;
  effortInserts: number;
  effortUpdates: number;
  metricDeletes: number;
  metricInserts: number;
  metricUpdates: number;
  segmentUpdates: number;
}

class DryRunProfileRollback extends Error {
  constructor(readonly results: ActivityEvidenceReconciliationCounts[]) {
    super("Rollback successful activity evidence dry-run");
  }
}

async function reconcileParsedActivityFileEvidenceWithProfileLockHeld(
  tx: TransactionClient,
  input: ParsedActivityEvidenceReplayItem & { profileId: string },
): Promise<ActivityEvidenceReconciliationCounts> {
  const analysis = await analyzeParsedActivityFile(tx, {
    activityId: input.activityId,
    profileId: input.profileId,
    parsedData: input.parsedData,
    refreshWeather: false,
  });
  const plan = await reconcileGeneratedActivityEvidenceWithProfileLockHeld(tx, {
    activityId: input.activityId,
    profileId: input.profileId,
    efforts: analysis.effortsToInsert,
    detectedLTHR: analysis.detectedLTHR,
    activityCompletedAt: analysis.activityCompletedAt,
    now: new Date(),
  });
  // These are derived projections from retained bytes. They deliberately do not
  // change the artifact, provider identity, or source linkage. Segment summaries
  // are the durable inputs to modern common-Load evidence fingerprints.
  await tx
    .update(activities)
    .set({
      active_ms: analysis.summaryValues.active_ms,
      aerobic_decoupling: analysis.summaryValues.aerobic_decoupling,
      avg_cadence: analysis.summaryValues.avg_cadence,
      avg_heart_rate: analysis.summaryValues.avg_heart_rate,
      avg_power: analysis.summaryValues.avg_power,
      avg_speed_mps: analysis.summaryValues.avg_speed_mps,
      avg_temperature: analysis.summaryValues.avg_temperature,
      calories: analysis.summaryValues.calories,
      distance_meters: analysis.summaryValues.distance_meters,
      efficiency_factor: analysis.summaryValues.efficiency_factor,
      elevation_gain_meters: analysis.summaryValues.elevation_gain_meters,
      elapsed_ms: analysis.summaryValues.elapsed_ms,
      max_cadence: analysis.summaryValues.max_cadence,
      max_heart_rate: analysis.summaryValues.max_heart_rate,
      max_power: analysis.summaryValues.max_power,
      max_speed_mps: analysis.summaryValues.max_speed_mps,
      moving_ms: analysis.summaryValues.moving_ms,
      normalized_graded_speed_mps: analysis.summaryValues.normalized_graded_speed_mps,
      normalized_power: analysis.summaryValues.normalized_power,
      normalized_speed_mps: analysis.summaryValues.normalized_speed_mps,
      timing_coverage: analysis.summaryValues.timing_coverage,
      updated_at: new Date(),
    })
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)));

  for (const segment of analysis.segmentSet.segments) {
    const timing = segment.summary.timing;
    await tx
      .update(activitySegments)
      .set({
        active_ms: "activeMs" in timing ? (timing.activeMs ?? null) : null,
        moving_ms: "movingMs" in timing ? (timing.movingMs ?? null) : null,
        summary: segment.summary,
        timing_coverage: timing.timingCoverage,
      })
      .where(
        and(
          eq(activitySegments.id, segment.id),
          eq(activitySegments.activity_id, input.activityId),
          eq(activitySegments.profile_id, input.profileId),
        ),
      );
  }

  return {
    activityUpdates: 1,
    effortDeletes: plan.effortDeleteIds.length,
    effortInserts: plan.effortInserts.length,
    effortUpdates: plan.effortUpdates.length,
    metricDeletes: plan.metricDeleteIds.length,
    metricInserts: plan.metricInsert ? 1 : 0,
    metricUpdates: plan.metricUpdate ? 1 : 0,
    segmentUpdates: analysis.segmentSet.segments.length,
  };
}

export async function replayParsedActivityFileEvidenceProfile(
  db: DbClient,
  input: {
    profileId: string;
    activities: ParsedActivityEvidenceReplayItem[];
    write: boolean;
  },
): Promise<ActivityEvidenceReconciliationCounts[]> {
  try {
    return await db.transaction(async (tx) => {
      await acquireActivityEvidenceProfileLock(tx, input.profileId);
      const results: ActivityEvidenceReconciliationCounts[] = [];
      for (const activity of input.activities) {
        results.push(
          await reconcileParsedActivityFileEvidenceWithProfileLockHeld(tx, {
            ...activity,
            profileId: input.profileId,
          }),
        );
      }
      if (!input.write) throw new DryRunProfileRollback(results);
      return results;
    });
  } catch (error) {
    if (error instanceof DryRunProfileRollback) return error.results;
    throw error;
  }
}

export async function reconcileParsedActivityFileEvidence(
  db: DbClient,
  input: {
    activityId: string;
    profileId: string;
    activityType: string;
    parsedData: ParsedActivityFileForAnalysis;
    write: boolean;
  },
) {
  const [result] = await replayParsedActivityFileEvidenceProfile(db, {
    profileId: input.profileId,
    activities: [input],
    write: input.write,
  });
  if (!result) throw new Error("Activity evidence replay returned no result");
  return result;
}
