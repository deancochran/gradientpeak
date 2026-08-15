import {
  advanceAthleteStateTo,
  athletePerformanceTargetFactsSchema,
  athleteStateBaselineSchema,
  createUnavailableAthletePerformanceTargetFacts,
  formatDateOnlyInTimeZone,
  heartRateCalibrationFactSchema,
  ianaTimezoneSchema,
  materializeAthletePerformanceTargetFacts,
  performanceThresholdFactSchema,
} from "@repo/core";
import { z } from "zod";
import { type DrizzleQueryExecutor, withRepeatableReadSnapshot } from "../../db";
import {
  type PublishedAthleteStateRead,
  readPublishedAthleteStateSnapshotData,
} from "../../repositories/athlete-state-repository";
import { getAthleteThresholdTargetFactsAsOf } from "../performance-model/get-athlete-performance-model-as-of";

type PublishedAthleteState = NonNullable<PublishedAthleteStateRead["current"]>;

export const projectionFreshnessSchema = z.enum(["fresh", "stale", "unavailable"]);
export const projectionRebuildStatusSchema = z.enum([
  "fresh",
  "pending",
  "rebuilding",
  "failed",
  "unavailable",
]);

function buildPublishedAthleteStateBaseline(profileId: string, current: PublishedAthleteState) {
  const computedAt = current.state.computed_at;
  if (!computedAt) throw new Error("Published athlete state is missing its computation time");
  const categories = [
    ...new Set(current.estimates.map(({ activity_category }) => activity_category)),
  ];
  return athleteStateBaselineSchema.parse({
    contractVersion: current.state.algorithm_version,
    athleteId: profileId,
    stateRevision: current.state.published_revision,
    asOf: computedAt.toISOString(),
    longTermLoad: current.state.fitness,
    recentLoad: current.state.fatigue,
    loadBalance: current.state.fitness - current.state.fatigue,
    evidenceConfidence: current.state.evidence_confidence,
    capabilities: categories.map((activityCategory) => {
      const estimates = current.estimates.filter(
        (estimate) => estimate.activity_category === activityCategory,
      );
      return {
        activityCategory,
        longestDistanceMeters:
          estimates.find(({ capability_kind }) => capability_kind === "longest_distance")?.value ??
          null,
        longestDurationMinutes:
          estimates.find(({ capability_kind }) => capability_kind === "longest_duration")?.value ??
          null,
        observedAt:
          [...estimates]
            .sort((left, right) => right.effective_at.getTime() - left.effective_at.getTime())[0]
            ?.effective_at.toISOString() ?? computedAt.toISOString(),
        evidenceConfidence: Math.max(
          ...estimates.map(({ confidence }) => confidence),
          current.state.evidence_confidence,
        ),
      };
    }),
    athleteAgeYears: null,
  });
}

export type PublishedAthleteStateSnapshot = {
  planningTimezone: string;
  currentPlanningDate: string;
  freshness: "fresh" | "stale" | "unavailable";
  rebuildStatus: "fresh" | "pending" | "rebuilding" | "failed" | "unavailable";
  importStatus: "complete" | "active" | "failed";
  revisions: {
    source: number | null;
    published: number | null;
  };
  coverage: { startAt: string | null; endAt: string | null; lastActivityAt: string | null };
  computedAt: string | null;
  algorithmVersion: string | null;
  baseline: ReturnType<typeof buildPublishedAthleteStateBaseline> | null;
  performanceTargets: z.infer<typeof athletePerformanceTargetFactsSchema> | null;
  estimates: PublishedAthleteState["estimates"];
};

function buildPublishedPerformanceTargets(
  profileId: string,
  computedAt: string,
  estimates: PublishedAthleteState["estimates"],
) {
  const targets = createUnavailableAthletePerformanceTargetFacts(computedAt, profileId);
  for (const estimate of estimates) {
    if (estimate.target_fact === null || estimate.target_fact === undefined) continue;
    const match = /^(bike|run|swim)_max_hr$/.exec(estimate.capability_kind);
    if (!match) continue;
    const category = match[1] as "bike" | "run" | "swim";
    targets.heartRate[category].maxHr = heartRateCalibrationFactSchema.parse(estimate.target_fact);
  }
  return athletePerformanceTargetFactsSchema.parse(targets);
}

/** Cache-only comparison read for outbound refresh diffing; never used as target authority. */
export async function readCachedPublishedAthletePerformanceTargets(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  now: Date;
}) {
  const snapshotData = await readPublishedAthleteStateSnapshotData(input.db, {
    profileId: input.profileId,
  });
  const current = snapshotData?.current;
  const cachedTargets = current
    ? buildPublishedPerformanceTargets(
        input.profileId,
        current.state.computed_at?.toISOString() ?? input.now.toISOString(),
        current.estimates,
      )
    : createUnavailableAthletePerformanceTargetFacts(input.now.toISOString(), input.profileId);
  const cachedThresholds =
    current?.estimates.flatMap((estimate) => {
      const parsed = performanceThresholdFactSchema.safeParse(estimate.target_fact);
      if (!parsed.success || parsed.data.status !== "available") return [];
      if (parsed.data.activityCategory !== estimate.activity_category) return [];
      return [
        {
          id: parsed.data.thresholdId,
          status: "available" as const,
          activityCategory: parsed.data.activityCategory,
          metric: parsed.data.metric,
          unit: parsed.data.unit,
          method: parsed.data.method,
          value: parsed.data.value,
          effectiveAt: parsed.data.effectiveAt,
          policyVersion: parsed.data.policyVersion,
          state: parsed.data.state,
          confidence: parsed.data.confidence,
          sourceEvaluationIds: parsed.data.sourceEvaluationIds,
          sourceEffortIds: parsed.data.sourceEffortIds,
          sourceActivityIds: parsed.data.sourceActivityIds,
        },
      ];
    }) ?? [];
  return materializeAthletePerformanceTargetFacts({
    athleteId: input.profileId,
    asOf: input.now.toISOString(),
    thresholds: cachedThresholds,
    heartRate: cachedTargets.heartRate,
  });
}

/**
 * Reads the one server-owned interpretation of published athlete state used by
 * goal assessment and planning. Repository ownership keeps profile preference,
 * state revision, matching estimates, and the import fence on one SQL snapshot.
 */
async function readPublishedAthleteStateSnapshotInSnapshot(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  now?: Date;
  lockStateForUpdate?: boolean;
  advanceBaselineToReadTime?: boolean;
}): Promise<PublishedAthleteStateSnapshot> {
  const now = input.now ?? new Date();
  const snapshotData = await readPublishedAthleteStateSnapshotData(input.db, {
    profileId: input.profileId,
    ...(input.lockStateForUpdate === undefined
      ? {}
      : { lockStateForUpdate: input.lockStateForUpdate }),
  });
  if (!snapshotData) throw new Error("Profile not found");
  const planningTimezone =
    snapshotData.planningTimezone === null
      ? "UTC"
      : ianaTimezoneSchema.parse(snapshotData.planningTimezone);
  const current = snapshotData.current;
  const blockingImport = snapshotData.blockingImport;
  const importStatus = blockingImport ?? "complete";
  const currentPlanningDate = formatDateOnlyInTimeZone(now, planningTimezone);
  const thresholdFacts = await getAthleteThresholdTargetFactsAsOf(
    { athleteId: input.profileId, asOf: now },
    input.db,
  );
  const cachedTargets = current
    ? buildPublishedPerformanceTargets(
        input.profileId,
        current.state.computed_at?.toISOString() ?? now.toISOString(),
        current.estimates,
      )
    : createUnavailableAthletePerformanceTargetFacts(now.toISOString(), input.profileId);
  const performanceTargets = athletePerformanceTargetFactsSchema.parse({
    ...thresholdFacts,
    heartRate: cachedTargets.heartRate,
  });
  const hasPublishedState = Boolean(
    current && current.state.published_revision > 0 && current.state.computed_at,
  );
  if (!current || !hasPublishedState) {
    return {
      planningTimezone,
      currentPlanningDate,
      freshness: "unavailable",
      rebuildStatus:
        blockingImport === "failed"
          ? "failed"
          : blockingImport === "active"
            ? "pending"
            : current && current.state.source_revision > current.state.published_revision
              ? current.state.last_failure_code
                ? "failed"
                : "pending"
              : "unavailable",
      importStatus,
      revisions: {
        source: current?.state.source_revision ?? null,
        published: current?.state.published_revision ?? null,
      },
      coverage: { startAt: null, endAt: null, lastActivityAt: null },
      computedAt: null,
      algorithmVersion: current?.state.algorithm_version ?? null,
      baseline: null,
      performanceTargets,
      estimates: [],
    };
  }

  const publishedBaseline = buildPublishedAthleteStateBaseline(input.profileId, current);
  const baseline =
    input.advanceBaselineToReadTime === false || Date.parse(publishedBaseline.asOf) >= now.getTime()
      ? publishedBaseline
      : advanceAthleteStateTo(publishedBaseline, now.toISOString(), {
          fromDay: formatDateOnlyInTimeZone(current.state.computed_at as Date, planningTimezone),
          toDay: currentPlanningDate,
        }).state;
  const futureDirty =
    current.state.dirty_from_at !== null && current.state.dirty_from_at.getTime() > now.getTime();
  const freshness =
    blockingImport === null &&
    (current.state.source_revision === current.state.published_revision || futureDirty) &&
    (current.state.dirty_from_at === null || futureDirty)
      ? "fresh"
      : "stale";
  const rebuildStatus =
    blockingImport === "failed"
      ? "failed"
      : blockingImport === "active"
        ? "pending"
        : current.state.lease_token !== null
          ? "rebuilding"
          : current.state.source_revision > current.state.published_revision && !futureDirty
            ? current.state.last_failure_code
              ? "failed"
              : "pending"
            : "fresh";

  return {
    planningTimezone,
    currentPlanningDate,
    freshness,
    rebuildStatus,
    importStatus,
    revisions: {
      source: current.state.source_revision,
      published: current.state.published_revision,
    },
    coverage: {
      startAt: current.state.coverage_start_at?.toISOString() ?? null,
      endAt: current.state.coverage_end_at?.toISOString() ?? null,
      lastActivityAt: current.state.last_activity_at?.toISOString() ?? null,
    },
    computedAt: current.state.computed_at?.toISOString() ?? null,
    algorithmVersion: current.state.algorithm_version,
    baseline,
    performanceTargets,
    estimates: current.estimates,
  };
}

export async function readPublishedAthleteStateSnapshot(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  now?: Date;
  lockStateForUpdate?: boolean;
  advanceBaselineToReadTime?: boolean;
}): Promise<PublishedAthleteStateSnapshot> {
  return withRepeatableReadSnapshot(
    input.db,
    (tx) => readPublishedAthleteStateSnapshotInSnapshot({ ...input, db: tx }),
    { accessMode: input.lockStateForUpdate ? "read write" : "read only" },
  );
}

export type PublishedAthletePerformanceTargetsRead = Awaited<
  ReturnType<typeof readPublishedAthletePerformanceTargets>
>;

type PublishedAthletePerformanceTargetsResult =
  | {
      status: "available" | "stale";
      targets: z.infer<typeof athletePerformanceTargetFactsSchema>;
      publishedRevision: number | null;
    }
  | {
      status: "unavailable";
      targets: z.infer<typeof athletePerformanceTargetFactsSchema>;
      publishedRevision: null;
    };

/** Current provider/runtime projection over canonical threshold truth plus non-threshold cache. */
export async function readPublishedAthletePerformanceTargets(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  now?: Date;
}): Promise<PublishedAthletePerformanceTargetsResult> {
  const snapshot = await readPublishedAthleteStateSnapshot(input);
  const asOf = snapshot.computedAt ?? (input.now ?? new Date()).toISOString();
  const targets =
    snapshot.performanceTargets ??
    createUnavailableAthletePerformanceTargetFacts(asOf, input.profileId);

  if (!snapshot.performanceTargets) {
    return { status: "unavailable" as const, targets, publishedRevision: null };
  }
  return {
    status: "available" as const,
    targets,
    publishedRevision: snapshot.revisions.published,
  };
}
