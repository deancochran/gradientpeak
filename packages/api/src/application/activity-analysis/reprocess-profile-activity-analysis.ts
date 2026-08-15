import type { AthletePerformanceTargetFacts } from "@repo/core";
import { activities, activitySegments, type DrizzleDbClient, profiles } from "@repo/db";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { withRepeatableReadSnapshot } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  type ActivityWithSegments,
  buildActivitySegmentDerivedSummaries,
  type SegmentDerivedSummary,
} from "../../lib/activity-analysis";
import {
  type ActivityAnalysisSegmentLoadProjection,
  activityAnalysisFingerprint,
  appendActivityAnalysisRevision,
  lockProfileActivityAnalysisScope,
  readMatchingActivityAnalysisRevision,
} from "../../repositories/activity-analysis-revision-repository";
import {
  claimNextAthleteState,
  failAthleteStateClaim,
  markAthleteStateDirty,
} from "../../repositories/athlete-state-repository";
import { materializeActivityAthleteStateEvidence } from "../athlete-intelligence/athlete-state-evidence";
import {
  ATHLETE_STATE_LEASE_MILLISECONDS,
  rebuildClaimedAthleteState,
} from "../athlete-intelligence/athlete-state-worker";

const TARGET_BATCH_SIZE = 500;

export type ProfileActivityAnalysisReprocessInput = {
  profileId: string;
  apply: boolean;
  confirmProfileId?: string;
  from?: Date;
  to?: Date;
  now?: Date;
};

export type ProfileActivityAnalysisReprocessResult = {
  mode: "apply" | "dry_run";
  profileId: string;
  scopedActivities: number;
  evaluatedSegments: number;
  changedActivities: number;
  appendedRevisions: number;
  availableSegments: number;
  partialSegments: number;
  unavailableSegments: number;
  unavailableReasons: Record<string, number>;
  athleteStateRebuild: "blocked" | "completed" | "failed" | "not_needed" | "not_requested";
};

type Evaluation = Omit<ProfileActivityAnalysisReprocessResult, "athleteStateRebuild" | "mode"> & {
  candidates: Array<{
    activity: ActivityWithSegments;
    performanceTargets: AthletePerformanceTargetFacts;
    projection: ActivityAnalysisSegmentLoadProjection;
    targetFingerprint: string;
    outputFingerprint: string;
  }>;
};

function buildProjection(
  summaries: SegmentDerivedSummary[],
): ActivityAnalysisSegmentLoadProjection {
  return {
    version: 1,
    segments: summaries.map((summary) => {
      const observation = summary.observationQuantification.members[0];
      if (!observation || summary.observationQuantification.members.length !== 1) {
        throw new Error("Activity analysis segment must contain exactly one observation");
      }
      return {
        segmentId: summary.segment_id,
        activityCategory: summary.activity_category,
        commonLoad: observation.commonLoad,
      };
    }),
  };
}

async function readCurrentTargets(
  db: Parameters<typeof createActivityAnalysisStore>[0],
  profileId: string,
  scopedActivities: ActivityWithSegments[],
) {
  const store = createActivityAnalysisStore(db);
  if (!store.getPerformanceTargetsForRequests) {
    throw new Error("Historical activity performance target batch reader is unavailable");
  }
  const result = new Map<string, AthletePerformanceTargetFacts>();
  for (let offset = 0; offset < scopedActivities.length; offset += TARGET_BATCH_SIZE) {
    const batch = scopedActivities.slice(offset, offset + TARGET_BATCH_SIZE);
    const snapshots = await store.getPerformanceTargetsForRequests({
      requests: batch.map((activity) => ({
        profileId,
        asOf: activity.started_at,
        activityIdToExclude: activity.id,
      })),
    });
    if (snapshots.length !== batch.length) {
      throw new Error("Historical activity performance target batch returned an invalid count");
    }
    batch.forEach((activity, index) => {
      const snapshot = snapshots[index];
      if (!snapshot || snapshot.athleteId !== profileId) {
        throw new Error("Historical activity performance target owner mismatch");
      }
      result.set(activity.id, snapshot);
    });
  }
  return result;
}

async function evaluate(
  db: Parameters<typeof createActivityAnalysisStore>[0],
  input: ProfileActivityAnalysisReprocessInput,
  now: Date,
): Promise<Evaluation> {
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);
  if (!profile) throw new Error("Profile not found");
  const scopedRows = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        input.from ? gte(activities.started_at, input.from) : undefined,
        input.to ? lt(activities.started_at, input.to) : undefined,
      ),
    )
    .orderBy(asc(activities.started_at), asc(activities.id));
  const segmentRows =
    scopedRows.length === 0
      ? []
      : await db
          .select()
          .from(activitySegments)
          .where(
            and(
              eq(activitySegments.profile_id, input.profileId),
              inArray(
                activitySegments.activity_id,
                scopedRows.map((activity) => activity.id),
              ),
            ),
          )
          .orderBy(asc(activitySegments.activity_id), asc(activitySegments.ordinal));
  const activitiesWithSegments = scopedRows.map((activity) => ({
    ...activity,
    segments: segmentRows.filter(
      (segment) =>
        segment.activity_id === activity.id &&
        segment.profile_id === input.profileId &&
        segment.segment_revision === activity.segments_revision,
    ),
  }));
  const targetsByActivityId = await readCurrentTargets(db, input.profileId, activitiesWithSegments);
  const summaries = await buildActivitySegmentDerivedSummaries({
    store: createActivityAnalysisStore(db),
    profileId: input.profileId,
    activities: activitiesWithSegments,
    computedAsOf: now,
    performanceTargetsByActivityId: targetsByActivityId,
  });
  const summariesByActivity = new Map<string, SegmentDerivedSummary[]>();
  for (const summary of summaries) {
    summariesByActivity.set(summary.activity_id, [
      ...(summariesByActivity.get(summary.activity_id) ?? []),
      summary,
    ]);
  }
  const candidates: Evaluation["candidates"] = [];
  const unavailableReasons: Record<string, number> = {};
  let availableSegments = 0;
  let partialSegments = 0;
  let unavailableSegments = 0;
  for (const activity of activitiesWithSegments) {
    const activitySummaries = summariesByActivity.get(activity.id) ?? [];
    if (activitySummaries.length === 0) continue;
    const projection = buildProjection(activitySummaries);
    for (const segment of projection.segments) {
      if (segment.commonLoad.status === "available") {
        availableSegments += 1;
      } else if (segment.commonLoad.status === "partial") {
        partialSegments += 1;
      } else {
        unavailableSegments += 1;
        const reason = segment.commonLoad.reason;
        unavailableReasons[reason] = (unavailableReasons[reason] ?? 0) + 1;
      }
    }
    const performanceTargets = targetsByActivityId.get(activity.id);
    if (!performanceTargets) throw new Error("Activity target snapshot was omitted");
    const targetFingerprint = activityAnalysisFingerprint(performanceTargets);
    const outputFingerprint = activityAnalysisFingerprint(projection);
    const existing = await readMatchingActivityAnalysisRevision(db, {
      activityId: activity.id,
      profileId: input.profileId,
      sourceSegmentsRevision: activity.segments_revision,
    });
    // Idempotence compares only with the current head. Earlier matching content
    // remains historical evidence and must not suppress an A -> B -> A append.
    const changed =
      !existing ||
      existing.targetFingerprint !== targetFingerprint ||
      existing.outputFingerprint !== outputFingerprint;
    if (changed) {
      candidates.push({
        activity,
        performanceTargets,
        projection,
        targetFingerprint,
        outputFingerprint,
      });
    }
  }
  return {
    profileId: input.profileId,
    scopedActivities: activitiesWithSegments.length,
    evaluatedSegments: summaries.length,
    changedActivities: candidates.length,
    appendedRevisions: 0,
    availableSegments,
    partialSegments,
    unavailableSegments,
    unavailableReasons,
    candidates,
  };
}

export async function reprocessProfileActivityAnalysis(
  db: DrizzleDbClient,
  input: ProfileActivityAnalysisReprocessInput,
): Promise<ProfileActivityAnalysisReprocessResult> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Reprocess time is invalid");
  if (input.from && !Number.isFinite(input.from.getTime())) throw new Error("From date is invalid");
  if (input.to && !Number.isFinite(input.to.getTime())) throw new Error("To date is invalid");
  if (input.from && input.to && input.from >= input.to) {
    throw new Error("From date must be before to date");
  }
  if (input.apply && input.confirmProfileId !== input.profileId) {
    throw new Error("Apply requires a confirmation profile ID that exactly matches the profile ID");
  }
  if (!input.apply && input.confirmProfileId !== undefined) {
    throw new Error("A confirmation profile ID is only valid when applying changes");
  }
  if (!input.apply) {
    const evaluation = await evaluate(db, input, now);
    const { candidates: _candidates, ...result } = evaluation;
    return { ...result, mode: "dry_run", athleteStateRebuild: "not_requested" };
  }
  const applied = await withRepeatableReadSnapshot(
    db,
    async (tx) => {
      await lockProfileActivityAnalysisScope(tx, input.profileId);
      const evaluation = await evaluate(tx, input, now);
      for (const candidate of evaluation.candidates) {
        await appendActivityAnalysisRevision(tx, {
          activityId: candidate.activity.id,
          profileId: input.profileId,
          sourceSegmentsRevision: candidate.activity.segments_revision ?? 1,
          performanceTargets: candidate.performanceTargets,
          targetFingerprint: candidate.targetFingerprint,
          segmentLoadProjection: candidate.projection,
          outputFingerprint: candidate.outputFingerprint,
          computedAt: now,
        });
      }
      const materialEffectiveTimes: Date[] = [];
      for (const candidate of evaluation.candidates) {
        const materialized = await materializeActivityAthleteStateEvidence(tx, {
          profileId: input.profileId,
          activityId: candidate.activity.id,
          computedAt: now,
          contextDb: tx,
          deferAthleteStateRefresh: true,
        });
        if (materialized.materialChanged && materialized.effectiveAt) {
          materialEffectiveTimes.push(materialized.effectiveAt);
        }
      }
      if (materialEffectiveTimes.length > 0) {
        const earliest = new Date(
          Math.min(...materialEffectiveTimes.map((value) => value.getTime())),
        );
        await markAthleteStateDirty(tx, { profileId: input.profileId, effectiveAt: earliest, now });
      }
      const { candidates: _candidates, ...result } = evaluation;
      return {
        ...result,
        appendedRevisions: evaluation.candidates.length,
        requiresAthleteStateRebuild: materialEffectiveTimes.length > 0,
      };
    },
    { accessMode: "read write" },
  );
  const { requiresAthleteStateRebuild, ...result } = applied;
  if (!requiresAthleteStateRebuild) {
    return { ...result, mode: "apply", athleteStateRebuild: "not_needed" };
  }
  const claim = await claimNextAthleteState(db, {
    now,
    leaseMilliseconds: ATHLETE_STATE_LEASE_MILLISECONDS,
    profileId: input.profileId,
  });
  if (!claim) return { ...result, mode: "apply", athleteStateRebuild: "blocked" };
  try {
    const published = await rebuildClaimedAthleteState({ db, claim, now });
    return {
      ...result,
      mode: "apply",
      athleteStateRebuild: published ? "completed" : "blocked",
    };
  } catch (error) {
    await failAthleteStateClaim(db, {
      claim,
      now,
      failureCode: error instanceof Error ? error.name : "activity_analysis_rebuild_failed",
    });
    return { ...result, mode: "apply", athleteStateRebuild: "failed" };
  }
}
