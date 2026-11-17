import { type AthletePerformanceTargetFacts, getCalendarDateInIanaZone } from "@repo/core";
import { activities, activitySegments, type DrizzleDbClient, profiles } from "@repo/db";
import { and, asc, eq, gt, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { withProfileFencedRepeatableReadSnapshot } from "../../db";
import {
  createActivityAnalysisStore,
  createDrizzleAthleteDerivedStateRepository,
} from "../../infrastructure/repositories";
import {
  type ActivityWithSegments,
  buildActivitySegmentDerivedSummaries,
  type SegmentDerivedSummary,
} from "../../lib/activity-analysis";
import {
  type ActivityAnalysisSegmentLoadProjection,
  activityAnalysisFingerprint,
  appendActivityAnalysisRevision,
  readMatchingActivityAnalysisRevision,
} from "../../repositories/activity-analysis-revision-repository";
import {
  type AthleteStateClaim,
  advanceClaimedActivityAnalysisRefresh,
  claimNextAthleteState,
  failAthleteStateClaim,
  verifyAthleteStateClaimForAnalysisRefresh,
} from "../../repositories/athlete-state-repository";
import { materializeActivityAthleteStateEvidence } from "../athlete-intelligence/athlete-state-evidence";
import {
  buildAthleteRecalculationRequest,
  requestAthleteRecalculation,
} from "../athlete-intelligence/request-athlete-recalculation";

const TARGET_BATCH_SIZE = 500;
export const ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE = 25;

export type ProfileActivityAnalysisReprocessInput = {
  profileId: string;
  apply: boolean;
  confirmProfileId?: string;
  from?: Date;
  to?: Date;
  now?: Date;
  claimedAthleteState?: AthleteStateClaim;
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
  durableRefresh: "completed" | "continued" | "not_requested";
};

type ReprocessActivity = ActivityWithSegments & typeof activities.$inferSelect;

type Evaluation = Omit<
  ProfileActivityAnalysisReprocessResult,
  "athleteStateRebuild" | "durableRefresh" | "mode"
> & {
  hasMore: boolean;
  nextCursor: { startedAt: Date; activityId: string } | null;
  materializationOnlyActivities: Array<{
    activity: ReprocessActivity;
    summaries: SegmentDerivedSummary[];
  }>;
  candidates: Array<{
    activity: ReprocessActivity;
    performanceTargets: AthletePerformanceTargetFacts;
    projection: ActivityAnalysisSegmentLoadProjection;
    summaries: SegmentDerivedSummary[];
    targetFingerprint: string;
    outputFingerprint: string;
  }>;
};

export class AnalysisRefreshFenceError extends Error {
  override readonly name = "AnalysisRefreshFenceError";
}

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

function hasPersistedAthleteStateEvidence(activity: ReprocessActivity): boolean {
  return (
    activity.athlete_state_common_load !== null ||
    activity.athlete_state_activity_category !== null ||
    activity.athlete_state_evidence_confidence !== null ||
    activity.athlete_state_capability_distance_meters !== null ||
    activity.athlete_state_capability_duration_minutes !== null ||
    activity.athlete_state_input_version !== null ||
    activity.athlete_state_computed_at !== null
  );
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
    const batch = scopedActivities
      .slice(offset, offset + TARGET_BATCH_SIZE)
      .filter(
        (activity): activity is ActivityWithSegments & { started_at: Date } =>
          activity.started_at !== null,
      );
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
  const scopedQuery = db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        isNotNull(activities.started_at),
        input.from ? gte(activities.started_at, input.from) : undefined,
        input.to ? lt(activities.started_at, input.to) : undefined,
        input.claimedAthleteState?.activityAnalysisCursor
          ? or(
              gt(activities.started_at, input.claimedAthleteState.activityAnalysisCursor.startedAt),
              and(
                eq(
                  activities.started_at,
                  input.claimedAthleteState.activityAnalysisCursor.startedAt,
                ),
                gt(activities.id, input.claimedAthleteState.activityAnalysisCursor.activityId),
              ),
            )
          : undefined,
      ),
    );
  const scopedRowsWithLookahead = input.claimedAthleteState
    ? await scopedQuery
        .orderBy(asc(activities.started_at), asc(activities.id))
        .limit(ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE + 1)
    : await scopedQuery.orderBy(asc(activities.started_at), asc(activities.id));
  const hasMore = scopedRowsWithLookahead.length > ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE;
  const scopedRows = (
    hasMore
      ? scopedRowsWithLookahead.slice(0, ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE)
      : scopedRowsWithLookahead
  ).filter(
    (activity): activity is typeof activity & { started_at: Date } => activity.started_at !== null,
  );
  const lastScopedActivity = scopedRows.at(-1);
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
    contextEvidenceScope: "thresholds",
  });
  const summariesByActivity = new Map<string, SegmentDerivedSummary[]>();
  for (const summary of summaries) {
    summariesByActivity.set(summary.activity_id, [
      ...(summariesByActivity.get(summary.activity_id) ?? []),
      summary,
    ]);
  }
  const candidates: Evaluation["candidates"] = [];
  const materializationOnlyActivities: Evaluation["materializationOnlyActivities"] = [];
  const unavailableReasons: Record<string, number> = {};
  let availableSegments = 0;
  let partialSegments = 0;
  let unavailableSegments = 0;
  for (const activity of activitiesWithSegments) {
    const activitySummaries = summariesByActivity.get(activity.id) ?? [];
    if (activitySummaries.length === 0) {
      if (hasPersistedAthleteStateEvidence(activity)) {
        materializationOnlyActivities.push({ activity, summaries: [] });
      }
      continue;
    }
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
        summaries: activitySummaries,
        targetFingerprint,
        outputFingerprint,
      });
    } else if (!hasPersistedAthleteStateEvidence(activity)) {
      materializationOnlyActivities.push({ activity, summaries: activitySummaries });
    }
  }
  return {
    profileId: input.profileId,
    scopedActivities: activitiesWithSegments.length,
    evaluatedSegments: summaries.length,
    changedActivities: candidates.length + materializationOnlyActivities.length,
    appendedRevisions: 0,
    availableSegments,
    partialSegments,
    unavailableSegments,
    unavailableReasons,
    hasMore,
    nextCursor:
      hasMore && lastScopedActivity
        ? { startedAt: lastScopedActivity.started_at, activityId: lastScopedActivity.id }
        : null,
    materializationOnlyActivities,
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
  if (input.claimedAthleteState) {
    const pendingFrom = input.claimedAthleteState.dirtyFromAt;
    if (
      !input.apply ||
      input.claimedAthleteState.profileId !== input.profileId ||
      pendingFrom === null ||
      input.from?.getTime() !== pendingFrom.getTime()
    ) {
      throw new Error("Claimed activity-analysis refresh does not match its pending profile range");
    }
  }
  if (!input.apply) {
    const evaluation = await evaluate(db, input, now);
    const {
      candidates: _candidates,
      materializationOnlyActivities: _materializationOnlyActivities,
      ...result
    } = evaluation;
    const { hasMore: _hasMore, nextCursor: _nextCursor, ...publicResult } = result;
    return {
      ...publicResult,
      mode: "dry_run",
      athleteStateRebuild: "not_requested",
      durableRefresh: "not_requested",
    };
  }
  const applied = await withProfileFencedRepeatableReadSnapshot(
    db,
    input.profileId,
    async (tx) => {
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
      const athleteRepository = createDrizzleAthleteDerivedStateRepository(tx);
      const publicationState = await athleteRepository.lockPublicationState({
        profileId: input.profileId,
      });
      if (!publicationState) throw new Error("Athlete publication state is unavailable");
      const targetSourceRevision =
        input.claimedAthleteState?.sourceRevision ?? publicationState.sourceRevision + 1;
      const materialEffectiveTimes: Date[] = [];
      for (const candidate of evaluation.candidates) {
        const materialized = await materializeActivityAthleteStateEvidence(tx, {
          profileId: input.profileId,
          activityId: candidate.activity.id,
          computedAt: now,
          contextDb: tx,
          canonicalEvidenceMaterialChanged: true,
          deferAthleteStateRefresh: true,
          targetSourceRevision,
          preparedSegmentSummaries: candidate.summaries,
        });
        if (materialized.materialChanged && materialized.effectiveAt) {
          materialEffectiveTimes.push(materialized.effectiveAt);
        }
      }
      for (const { activity, summaries } of evaluation.materializationOnlyActivities) {
        const materialized = await materializeActivityAthleteStateEvidence(tx, {
          profileId: input.profileId,
          activityId: activity.id,
          computedAt: now,
          contextDb: tx,
          deferAthleteStateRefresh: true,
          targetSourceRevision,
          preparedSegmentSummaries: summaries,
        });
        if (materialized.materialChanged && materialized.effectiveAt) {
          materialEffectiveTimes.push(materialized.effectiveAt);
        }
      }
      if (materialEffectiveTimes.length > 0 && !input.claimedAthleteState) {
        const earliest = new Date(
          Math.min(...materialEffectiveTimes.map((value) => value.getTime())),
        );
        await requestAthleteRecalculation({
          repository: athleteRepository,
          profileId: input.profileId,
          request: buildAthleteRecalculationRequest({
            profileId: input.profileId,
            earliestAffectedAt: earliest.toISOString(),
            earliestAffectedPlanningDate: getCalendarDateInIanaZone(
              earliest.toISOString(),
              publicationState.planningTimezone,
            ),
            sourceRevision: targetSourceRevision,
            reasons: ["analysis_replaced"],
            requestedAt: now.toISOString(),
          }),
        });
      }
      if (input.claimedAthleteState) {
        const owned = evaluation.hasMore
          ? evaluation.nextCursor !== null &&
            (await advanceClaimedActivityAnalysisRefresh(tx, {
              claim: input.claimedAthleteState,
              nextCursor: evaluation.nextCursor,
              now,
            }))
          : await verifyAthleteStateClaimForAnalysisRefresh(tx, {
              claim: input.claimedAthleteState,
            });
        if (!owned) {
          throw new AnalysisRefreshFenceError(
            "Activity-analysis refresh lost its athlete-state lease",
          );
        }
      }
      const {
        candidates: _candidates,
        materializationOnlyActivities: _materializationOnlyActivities,
        ...result
      } = evaluation;
      return {
        ...result,
        appendedRevisions: evaluation.candidates.length,
        requiresAthleteStateRebuild: materialEffectiveTimes.length > 0,
      };
    },
    { lockNamespace: 1 },
  );
  const { hasMore, nextCursor: _nextCursor, requiresAthleteStateRebuild, ...result } = applied;
  if (input.claimedAthleteState) {
    return {
      ...result,
      mode: "apply",
      athleteStateRebuild: "not_requested",
      durableRefresh: hasMore ? "continued" : "completed",
    };
  }
  if (!requiresAthleteStateRebuild) {
    return {
      ...result,
      mode: "apply",
      athleteStateRebuild: "not_needed",
      durableRefresh: "not_requested",
    };
  }
  const { ATHLETE_STATE_LEASE_MILLISECONDS, rebuildClaimedAthleteState } = await import(
    "../athlete-intelligence/athlete-state-worker"
  );
  const claim = await claimNextAthleteState(db, {
    now,
    leaseMilliseconds: ATHLETE_STATE_LEASE_MILLISECONDS,
    profileId: input.profileId,
  });
  if (!claim)
    return {
      ...result,
      mode: "apply",
      athleteStateRebuild: "blocked",
      durableRefresh: "not_requested",
    };
  try {
    const published = await rebuildClaimedAthleteState({ db, claim, now });
    return {
      ...result,
      mode: "apply",
      athleteStateRebuild: published ? "completed" : "blocked",
      durableRefresh: "not_requested",
    };
  } catch (error) {
    await failAthleteStateClaim(db, {
      claim,
      now,
      failureCode: error instanceof Error ? error.name : "activity_analysis_rebuild_failed",
    });
    return {
      ...result,
      mode: "apply",
      athleteStateRebuild: "failed",
      durableRefresh: "not_requested",
    };
  }
}
