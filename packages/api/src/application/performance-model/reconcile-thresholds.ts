import { getCalendarDateInIanaZone } from "@repo/core";
import {
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  type PersistedThresholdEvidence,
} from "@repo/core/athlete-derived-state";
import {
  ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
  ACTIVITY_FILE_LTHR_EFFORT_METHOD,
  BEST_EFFORT_CALCULATION_VERSION,
  type BestEffortExtractionResult,
  bestEffortExtractionResultSchema,
  selectExactBestEffortWindow,
} from "@repo/core/calculations";
import {
  getThresholdActivityCategoryPolicies,
  getThresholdActivityCategoryPolicy,
  selectThresholdCandidate,
  type ThresholdActivityCategory,
  type ThresholdEvaluation,
  type ThresholdExactWindowObservation,
  type ThresholdMetric,
  type ThresholdSelectionResult,
} from "@repo/core/performance-calibration";
import { activities, activityEfforts, thresholds } from "@repo/db";
import { and, asc, eq, gt, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { DrizzleTransactionClient, getRequiredDb } from "../../db";
import { createDrizzleAthleteDerivedStateRepository } from "../../infrastructure/repositories";
import { markAthleteStateDirty } from "../../repositories/athlete-state-repository";
import {
  claimDeferredThresholdCalibration,
  completeDeferredThresholdCalibration,
  enqueueDeferredThresholdCalibration,
  insertThresholdEvaluation,
  planThresholdEvaluationPersistence,
  readThresholdEvidenceSources,
  rebuildThresholdChainWithProfileLockHeld,
  retryDeferredThresholdCalibration,
  type ThresholdEffortLink,
  type ThresholdIdentity,
  type ThresholdImpact,
  thresholdEvaluationId,
} from "../../repositories/threshold-repository";
import { replaceThresholdEvidence } from "../athlete-intelligence/replace-threshold-evidence";
import {
  buildAthleteRecalculationRequest,
  requestAthleteRecalculation,
} from "../athlete-intelligence/request-athlete-recalculation";

type EffortInsert = typeof activityEfforts.$inferInsert;
const FULL_THRESHOLD_HISTORY_HORIZON = new Date("9999-12-31T23:59:59.999Z");
const DEFERRED_CALIBRATION_LEASE_MILLISECONDS = 5 * 60_000;
type DbClient = ReturnType<typeof getRequiredDb>;

type ThresholdHistoryRow = Pick<
  typeof thresholds.$inferSelect,
  "id" | "evaluation_id" | "value" | "confidence" | "effective_at" | "supersedes_id"
>;

async function queueThresholdRecalculation(
  tx: DrizzleTransactionClient,
  input: { profileId: string; effectiveAt: Date; sourceRevision: number; now: Date },
) {
  const repository = createDrizzleAthleteDerivedStateRepository(tx);
  const state = await repository.lockPublicationState({ profileId: input.profileId });
  if (!state) throw new Error("Athlete publication state is unavailable for threshold change");
  await requestAthleteRecalculation({
    repository,
    profileId: input.profileId,
    request: buildAthleteRecalculationRequest({
      profileId: input.profileId,
      earliestAffectedAt: input.effectiveAt.toISOString(),
      earliestAffectedPlanningDate: getCalendarDateInIanaZone(
        input.effectiveAt.toISOString(),
        state.planningTimezone,
      ),
      sourceRevision: input.sourceRevision,
      reasons: ["threshold_changed"],
      requestedAt: input.now.toISOString(),
    }),
  });
}

async function readThresholdHistory(
  tx: DrizzleTransactionClient,
  input: { profileId: string; identity: ThresholdIdentity },
): Promise<ThresholdHistoryRow[]> {
  return tx
    .select({
      id: thresholds.id,
      evaluation_id: thresholds.evaluation_id,
      value: thresholds.value,
      confidence: thresholds.confidence,
      effective_at: thresholds.effective_at,
      supersedes_id: thresholds.supersedes_id,
    })
    .from(thresholds)
    .where(
      and(
        eq(thresholds.profile_id, input.profileId),
        eq(thresholds.activity_category, input.identity.activityCategory),
        eq(thresholds.metric, input.identity.metric),
      ),
    )
    .orderBy(asc(thresholds.effective_at), asc(thresholds.id));
}

function thresholdHistoryRowsEqual(left: ThresholdHistoryRow, right: ThresholdHistoryRow) {
  return (
    left.id === right.id &&
    left.evaluation_id === right.evaluation_id &&
    left.value === right.value &&
    left.confidence === right.confidence &&
    left.effective_at.getTime() === right.effective_at.getTime() &&
    left.supersedes_id === right.supersedes_id
  );
}

export function earliestThresholdHistoryChange(
  before: readonly ThresholdHistoryRow[],
  after: readonly ThresholdHistoryRow[],
) {
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    const previous = before[index];
    const next = after[index];
    if (previous && next && thresholdHistoryRowsEqual(previous, next)) continue;
    const timestamps = [previous?.effective_at, next?.effective_at].filter(
      (value): value is Date => value !== undefined,
    );
    return timestamps.length === 0
      ? null
      : new Date(Math.min(...timestamps.map((value) => value.getTime())));
  }
  return null;
}

async function rebuildThresholdHistoryAndScheduleRefresh(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    identity: ThresholdIdentity;
    asOf: Date;
    now: Date;
    fallbackChangedFromAt: Date;
  },
) {
  const { fallbackChangedFromAt, ...rebuildInput } = input;
  const before = await readThresholdHistory(tx, rebuildInput);
  const rebuilt = await rebuildThresholdChainWithProfileLockHeld(tx, rebuildInput);
  if (!rebuilt.changed) return rebuilt;
  const after = await readThresholdHistory(tx, rebuildInput);
  const changedFromAt = earliestThresholdHistoryChange(before, after) ?? fallbackChangedFromAt;
  const sourceRevision = await markAthleteStateDirty(tx, {
    profileId: input.profileId,
    effectiveAt: changedFromAt,
    now: input.now,
  });
  await queueThresholdRecalculation(tx, {
    profileId: input.profileId,
    effectiveAt: changedFromAt,
    sourceRevision,
    now: input.now,
  });
  return { ...rebuilt, changedFromAt };
}

type ThresholdSeries = {
  seriesId: string;
  ownershipVerified: boolean;
  extraction: BestEffortExtractionResult;
};

function attemptFromSelection(
  selection: ThresholdSelectionResult,
  measuredEvidenceIds: ReadonlySet<string> = new Set(),
) {
  if (selection.status === "qualified") {
    const attempt = selection.attempts.find(
      ({ role, evaluation }) =>
        role === selection.selectedRole && evaluation.status === "qualified",
    );
    if (!attempt || attempt.evaluation.status !== "qualified") {
      throw new Error("Core threshold selection omitted its qualified attempt");
    }
    return attempt;
  }
  const attempt =
    selection.attempts.find(
      ({ evidenceIds, evaluation }) =>
        evaluation.diagnostics.selectedSeriesId !== null &&
        evidenceIds.length === 1 &&
        measuredEvidenceIds.has(evidenceIds[0] ?? ""),
    ) ?? selection.attempts[0];
  if (!attempt) throw new Error("Core threshold selection omitted rejection diagnostics");
  return attempt;
}

function evaluationFromSelection(
  selection: ThresholdSelectionResult,
  measuredEvidenceIds: ReadonlySet<string> = new Set(),
): ThresholdEvaluation {
  return attemptFromSelection(selection, measuredEvidenceIds).evaluation;
}

function extractionObservations(input: {
  activityId: string;
  seriesId: string;
  ownershipVerified: boolean;
  extraction: BestEffortExtractionResult;
  exactWindowSeconds: number;
}): ThresholdExactWindowObservation[] {
  if (input.extraction.metric === "heart_rate") return [];
  const metric = input.extraction.metric;
  const selected = selectExactBestEffortWindow(input.extraction, input.exactWindowSeconds);
  const evidenceId = (ordinal: number) =>
    `attempt:${ordinal}:${input.seriesId.slice(0, 220)}:${input.exactWindowSeconds}`;
  const observation = (
    ordinal: number,
    result: BestEffortExtractionResult["results"][number],
  ): ThresholdExactWindowObservation => {
    if (result.status === "unavailable") {
      return {
        evidenceId: evidenceId(ordinal),
        activityId: input.activityId,
        seriesId: input.seriesId,
        metric,
        sourceAccepted: true,
        ownershipVerified: input.ownershipVerified,
        availability: "incomplete",
        durationSeconds: result.durationSeconds,
        value: 0,
        startTimestampSeconds: 0,
        endTimestampSeconds: result.durationSeconds,
        windowCoverage: input.extraction.diagnostics.sourceTimeCoverage,
        maximumGapSeconds: input.extraction.maxGapSeconds,
      };
    }
    return {
      evidenceId: evidenceId(ordinal),
      activityId: input.activityId,
      seriesId: input.seriesId,
      metric,
      sourceAccepted: true,
      ownershipVerified: input.ownershipVerified,
      availability: result.status === "partial" ? "incomplete" : "available",
      durationSeconds: result.durationSeconds,
      value: result.value,
      startTimestampSeconds: result.startTimestampSeconds,
      endTimestampSeconds: result.endTimestampSeconds,
      windowCoverage: result.windowCoverage,
      maximumGapSeconds: input.extraction.maxGapSeconds,
    };
  };

  if (selected.status === "found") return [observation(0, selected.result)];
  if (selected.status === "ambiguous") {
    return input.extraction.results
      .filter(({ durationSeconds }) => durationSeconds === input.exactWindowSeconds)
      .map((result, ordinal) => observation(ordinal, result));
  }
  return [
    {
      evidenceId: evidenceId(0),
      activityId: input.activityId,
      seriesId: input.seriesId,
      metric,
      sourceAccepted: true,
      ownershipVerified: input.ownershipVerified,
      availability: "available",
      durationSeconds: input.exactWindowSeconds + 1,
      value: 0,
      startTimestampSeconds: 0,
      endTimestampSeconds: input.exactWindowSeconds + 1,
      windowCoverage: input.extraction.diagnostics.sourceTimeCoverage,
      maximumGapSeconds: input.extraction.maxGapSeconds,
    },
  ];
}

function activityThresholdSelection(input: {
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  series: ThresholdSeries[];
}): { selection: ThresholdSelectionResult; measuredEvidenceIds: Set<string> } {
  const policy = getThresholdActivityCategoryPolicy(input.activityCategory, input.metric);
  const observations = input.series.flatMap(({ seriesId, ownershipVerified, extraction }) =>
    extractionObservations({
      activityId: "activity",
      seriesId,
      ownershipVerified,
      extraction,
      exactWindowSeconds: policy.exactWindowSeconds,
    }),
  );
  const measuredEvidenceIds = new Set(
    input.series.flatMap(({ seriesId, extraction }) => {
      const selected = selectExactBestEffortWindow(extraction, policy.exactWindowSeconds);
      if (selected.status !== "found" || selected.result.status === "unavailable") return [];
      return extractionObservations({
        activityId: "activity",
        seriesId,
        ownershipVerified: true,
        extraction,
        exactWindowSeconds: policy.exactWindowSeconds,
      }).map(({ evidenceId }) => evidenceId);
    }),
  );
  return {
    selection: selectThresholdCandidate({
      activityCategory: input.activityCategory,
      metric: input.metric,
      observations,
    }),
    measuredEvidenceIds,
  };
}

export function selectActivityThreshold(input: {
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  series: ThresholdSeries[];
}): ThresholdSelectionResult {
  return activityThresholdSelection(input).selection;
}

/** The only threshold qualifier: API adapts source evidence, Core decides qualification. */
export function evaluateActivityThreshold(input: {
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  series: ThresholdSeries[];
}): ThresholdEvaluation {
  const { selection, measuredEvidenceIds } = activityThresholdSelection(input);
  return evaluationFromSelection(selection, measuredEvidenceIds);
}

function effortProvenance(effort: EffortInsert): Record<string, unknown> | null {
  return effort.provenance !== null &&
    typeof effort.provenance === "object" &&
    !Array.isArray(effort.provenance)
    ? (effort.provenance as Record<string, unknown>)
    : null;
}

function observationsForEfforts(input: {
  profileId: string;
  activityId: string;
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  efforts: readonly EffortInsert[];
  sources: Array<{
    segmentId: string;
    sourceRevision: number;
  }>;
}): ThresholdExactWindowObservation[] {
  const policy = getThresholdActivityCategoryPolicy(input.activityCategory, input.metric);
  const sources = new Map(input.sources.map((source) => [source.segmentId, source.sourceRevision]));
  return input.efforts.flatMap((effort) => {
    const provenance = effortProvenance(effort);
    const sourceRevision = sources.get(effort.segment_id);
    const sourceSeries = effort.source_series;
    const metric =
      sourceSeries === "power"
        ? "power"
        : sourceSeries === "grade_adjusted_speed"
          ? "grade_adjusted_speed"
          : sourceSeries === "raw_speed" || sourceSeries === "swim_speed"
            ? "speed"
            : sourceSeries === "heart_rate"
              ? "heart_rate"
              : null;
    const hasCanonicalMethod =
      input.metric === "lthr"
        ? effort.method === ACTIVITY_FILE_LTHR_EFFORT_METHOD &&
          effort.calculation_version === ACTIVITY_FILE_LTHR_CALCULATION_VERSION
        : effort.method === "activity_file_best_effort" &&
          effort.calculation_version === BEST_EFFORT_CALCULATION_VERSION;
    if (
      typeof effort.id !== "string" ||
      effort.profile_id !== input.profileId ||
      effort.activity_id !== input.activityId ||
      effort.activity_category !== input.activityCategory ||
      sourceRevision === undefined ||
      effort.source_revision !== sourceRevision ||
      effort.duration_seconds !== policy.exactWindowSeconds ||
      !hasCanonicalMethod ||
      metric === null ||
      provenance?.source_series !== sourceSeries ||
      typeof effort.value !== "number" ||
      typeof effort.window_coverage !== "number" ||
      typeof effort.max_gap_seconds !== "number" ||
      typeof provenance?.exact_window_start_timestamp_seconds !== "number" ||
      typeof provenance.exact_window_end_timestamp_seconds !== "number"
    ) {
      return [];
    }
    return [
      {
        evidenceId: effort.id,
        activityId: effort.activity_id,
        seriesId: `${effort.segment_id}:${metric}`,
        metric,
        sourceAccepted: true,
        ownershipVerified: true,
        availability: provenance.extraction_status === "partial" ? "incomplete" : "available",
        durationSeconds: effort.duration_seconds,
        value: effort.value,
        startTimestampSeconds: provenance.exact_window_start_timestamp_seconds,
        endTimestampSeconds: provenance.exact_window_end_timestamp_seconds,
        windowCoverage: effort.window_coverage,
        maximumGapSeconds: effort.max_gap_seconds,
      } satisfies ThresholdExactWindowObservation,
    ];
  });
}

function effortLinkForEvidenceId(
  evidenceId: string | null,
  efforts: readonly EffortInsert[],
): ThresholdEffortLink | null {
  if (evidenceId === null) return null;
  const effort = efforts.find(({ id }) => id === evidenceId);
  if (!effort || typeof effort.id !== "string") return null;
  if (
    effort.effort_type !== "power" &&
    effort.effort_type !== "speed" &&
    effort.effort_type !== "heart_rate"
  )
    return null;
  if (
    effort.source_series !== "power" &&
    effort.source_series !== "grade_adjusted_speed" &&
    effort.source_series !== "raw_speed" &&
    effort.source_series !== "swim_speed" &&
    effort.source_series !== "heart_rate"
  ) {
    return null;
  }
  return {
    effortId: effort.id,
    activityId: effort.activity_id,
    sourceRevision: effort.source_revision,
    effortType: effort.effort_type,
    sourceSeries: effort.source_series,
    role: "primary",
    ordinal: 0,
  };
}

function extractionsFromSummary(summary: unknown): BestEffortExtractionResult[] {
  if (summary === null || typeof summary !== "object" || Array.isArray(summary)) return [];
  const extractions = (summary as { bestEffortExtractions?: unknown }).bestEffortExtractions;
  if (!Array.isArray(extractions)) return [];
  return extractions.flatMap((extraction) => {
    const parsed = bestEffortExtractionResultSchema.safeParse(extraction);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Accepted-file extension: evaluate, persist, rebuild, and dirty under the profile fence. */
export async function reconcileThresholdsWithProfileLockHeld(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    activityId: string;
    efforts: EffortInsert[];
    preInvalidatedIdentities?: ThresholdImpact[];
    thresholdRebuildAsOf?: Date;
    now: Date;
  },
) {
  // Both the source read and the insert trigger use PostgreSQL's clock. A
  // caller's app clock therefore cannot promote future device evidence early.
  const sources = (
    await readThresholdEvidenceSources(tx, {
      ...input,
      eligibleAtDatabaseNow: true,
    })
  ).filter((source): source is typeof source & { finishedAt: Date } => source.finishedAt !== null);
  if (sources.length === 0) await enqueueDeferredThresholdCalibration(tx, input);
  const impacts = new Map(
    (input.preInvalidatedIdentities ?? []).map((impact) => [
      `${impact.activityCategory}/${impact.metric}`,
      impact,
    ]),
  );
  const evaluated = new Map<string, ThresholdIdentity>();
  const persistedEvidence: PersistedThresholdEvidence[] = [];
  const sourcesByActivityCategory = new Map<ThresholdActivityCategory, typeof sources>();
  for (const source of sources) {
    if (
      source.activityCategory !== "bike" &&
      source.activityCategory !== "run" &&
      source.activityCategory !== "swim"
    ) {
      continue;
    }
    sourcesByActivityCategory.set(source.activityCategory, [
      ...(sourcesByActivityCategory.get(source.activityCategory) ?? []),
      source,
    ]);
  }
  for (const [activityCategory, categorySources] of sourcesByActivityCategory) {
    const firstSource = categorySources[0];
    if (!firstSource || categorySources.some(({ sourceArtifactId }) => sourceArtifactId === null)) {
      continue;
    }
    for (const policy of getThresholdActivityCategoryPolicies(activityCategory)) {
      const identity: ThresholdIdentity = { activityCategory, metric: policy.metric };
      const measuredObservations = observationsForEfforts({
        profileId: input.profileId,
        activityId: input.activityId,
        activityCategory,
        metric: policy.metric,
        efforts: input.efforts,
        sources: categorySources.map((source) => ({
          segmentId: source.segmentId,
          sourceRevision: source.sourceRevision,
        })),
      });
      const measuredSeries = new Set(
        measuredObservations.map(({ seriesId, metric }) => `${seriesId}\u0000${metric}`),
      );
      const extractionAttempts =
        policy.metric === "lthr"
          ? []
          : categorySources.flatMap((source) =>
              extractionsFromSummary(source.summary).flatMap((extraction) => {
                if (extraction.metric === "heart_rate") return [];
                const metric = extraction.metric;
                const seriesId = `${source.segmentId}:${metric}`;
                if (measuredSeries.has(`${seriesId}\u0000${metric}`)) return [];
                return extractionObservations({
                  activityId: input.activityId,
                  seriesId,
                  ownershipVerified: true,
                  extraction,
                  exactWindowSeconds: policy.exactWindowSeconds,
                });
              }),
            );
      const observations = [...measuredObservations, ...extractionAttempts];
      const selection = selectThresholdCandidate({
        activityCategory,
        metric: policy.metric,
        observations,
      });
      const measuredEvidenceIds = new Set(measuredObservations.map(({ evidenceId }) => evidenceId));
      const selectedAttempt = attemptFromSelection(selection, measuredEvidenceIds);
      const evaluation = selectedAttempt.evaluation;
      const id = thresholdEvaluationId({
        profileId: input.profileId,
        sourceActivityId: input.activityId,
        sourceRevision: firstSource.sourceRevision,
        identity,
        method: policy.method,
        policyVersion: policy.policyVersion,
      });
      const selectedMeasuredEvidenceId =
        selection.status === "qualified"
          ? selection.selectedEvidenceId
          : selectedAttempt.evidenceIds.length === 1 &&
              selectedAttempt.evaluation.diagnostics.selectedSeriesId !== null &&
              measuredEvidenceIds.has(selectedAttempt.evidenceIds[0] ?? "")
            ? (selectedAttempt.evidenceIds[0] ?? null)
            : null;
      const ownEffort = effortLinkForEvidenceId(selectedMeasuredEvidenceId, input.efforts);
      if (evaluation.status === "qualified" && ownEffort === null) {
        throw new Error("Qualified threshold evaluation must link its exact-window effort");
      }
      const persistence = await planThresholdEvaluationPersistence(tx, {
        id,
        profileId: input.profileId,
        identity,
        evaluation,
        selection,
        sourceActivityId: input.activityId,
        observedAt: firstSource.finishedAt,
        primaryEffort: ownEffort,
      });
      await insertThresholdEvaluation(tx, {
        id,
        profileId: input.profileId,
        identity,
        evaluation,
        selection,
        persistedValue: persistence.persistedValue,
        sourceActivityId: input.activityId,
        sourceRevision: firstSource.sourceRevision,
        observedAt: firstSource.finishedAt,
        effortLinks: persistence.effortLinks,
        now: input.now,
      });
      if (selection.status === "qualified") {
        persistedEvidence.push({
          contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
          profileId: input.profileId,
          calculationVersion: "threshold-v1",
          confidence: 1,
          evidence: {
            ...selection.candidate,
            evidenceId: selection.selectedEvidenceId,
            activityId: input.activityId,
            observedAt: firstSource.finishedAt.toISOString(),
          },
          lifecycle: { status: "active", invalidatedAt: null },
        });
      }
      evaluated.set(`${identity.activityCategory}/${identity.metric}`, identity);
    }
  }

  await replaceThresholdEvidence({
    repository: createDrizzleAthleteDerivedStateRepository(tx),
    profileId: input.profileId,
    activityId: input.activityId,
    evidence: persistedEvidence,
  });

  let changed = false;
  for (const identity of new Map(
    [
      ...evaluated.values(),
      ...[...impacts.values()].map(({ activityCategory, metric }) => ({
        activityCategory,
        metric,
      })),
    ].map((identity) => [`${identity.activityCategory}/${identity.metric}`, identity]),
  ).values()) {
    const latestSourceAt =
      input.thresholdRebuildAsOf ??
      sources.reduce(
        (latest, source) => (source.finishedAt > latest ? source.finishedAt : latest),
        input.now,
      );
    const impact = impacts.get(`${identity.activityCategory}/${identity.metric}`);
    const rebuilt = await rebuildThresholdHistoryAndScheduleRefresh(tx, {
      profileId: input.profileId,
      identity,
      asOf: latestSourceAt,
      now: input.now,
      fallbackChangedFromAt: impact?.effectiveAt ?? latestSourceAt,
    });
    if (rebuilt.changed || impact) {
      changed = true;
      if (!rebuilt.changed && impact) {
        const sourceRevision = await markAthleteStateDirty(tx, {
          profileId: input.profileId,
          effectiveAt: impact.effectiveAt,
          now: input.now,
        });
        await queueThresholdRecalculation(tx, {
          profileId: input.profileId,
          effectiveAt: impact.effectiveAt,
          sourceRevision,
          now: input.now,
        });
      }
    }
  }
  return {
    changed,
    identities: [...evaluated.values()],
    deferredIdentities: [] as ThresholdIdentity[],
  };
}

const HISTORY_FINALIZATION_PAGE_SIZE = 128;

/**
 * Provider-neutral accepted-history finalization. Deferred imports persist their
 * immutable effort evidence first; this pass evaluates activities in canonical
 * `(finished_at, id)` order so threshold history is independent of fetch pages.
 */
export async function finalizeThresholdsAfterHistoryImport(
  tx: DrizzleTransactionClient,
  input: { profileId: string; asOf: Date; now: Date },
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.profileId}, 0))`);
  let changed = false;
  let cursor: { finishedAt: Date; id: string } | undefined;
  for (;;) {
    const page = await tx
      .select({ id: activities.id, finishedAt: activities.finished_at })
      .from(activities)
      .where(
        and(
          eq(activities.profile_id, input.profileId),
          isNotNull(activities.finished_at),
          lte(activities.finished_at, input.asOf),
          cursor
            ? or(
                gt(activities.finished_at, cursor.finishedAt),
                and(eq(activities.finished_at, cursor.finishedAt), gt(activities.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(activities.finished_at), asc(activities.id))
      .limit(HISTORY_FINALIZATION_PAGE_SIZE);
    if (page.length === 0) break;
    const efforts = await tx
      .select()
      .from(activityEfforts)
      .where(
        inArray(
          activityEfforts.activity_id,
          page.map(({ id }) => id),
        ),
      );
    const effortsByActivity = new Map<string, EffortInsert[]>();
    for (const effort of efforts) {
      effortsByActivity.set(effort.activity_id, [
        ...(effortsByActivity.get(effort.activity_id) ?? []),
        effort,
      ]);
    }
    for (const activity of page) {
      if (activity.finishedAt === null) continue;
      const reconciled = await reconcileThresholdsWithProfileLockHeld(tx, {
        profileId: input.profileId,
        activityId: activity.id,
        efforts: effortsByActivity.get(activity.id) ?? [],
        thresholdRebuildAsOf: FULL_THRESHOLD_HISTORY_HORIZON,
        now: input.now,
      });
      changed = reconciled.changed || changed;
    }
    const last = page.at(-1);
    if (!last || page.length < HISTORY_FINALIZATION_PAGE_SIZE) break;
    const lastFinishedAt = last.finishedAt;
    if (lastFinishedAt === null) break;
    cursor = { finishedAt: lastFinishedAt, id: last.id };
  }

  const identities = (["bike", "run", "swim"] as const).flatMap((activityCategory) =>
    getThresholdActivityCategoryPolicies(activityCategory).map(
      ({ metric }) => ({ activityCategory, metric }) satisfies ThresholdIdentity,
    ),
  );
  for (const identity of identities) {
    const rebuilt = await rebuildThresholdHistoryAndScheduleRefresh(tx, {
      profileId: input.profileId,
      asOf: FULL_THRESHOLD_HISTORY_HORIZON,
      now: input.now,
      identity,
      fallbackChangedFromAt: input.asOf,
    });
    if (!rebuilt.changed) continue;
    changed = true;
  }
  return { changed, identities };
}

/**
 * Promotes persisted future-clock source revisions through the same fenced
 * reconciliation path as an immediate accepted activity. Claim timing, lease
 * recovery, completion, and retry backoff are all database-clock based.
 */
export async function processDueDeferredThresholdCalibrations(
  db: DbClient,
  input: { limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(input.limit ?? 5, 50));
  const result = { completed: 0, failed: 0, processed: 0 };
  for (let index = 0; index < limit; index += 1) {
    const claim = await claimDeferredThresholdCalibration(db, {
      leaseMilliseconds: DEFERRED_CALIBRATION_LEASE_MILLISECONDS,
    });
    if (!claim) break;
    result.processed += 1;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${claim.profileId}, 0))`,
        );
        const sources = await readThresholdEvidenceSources(tx, {
          profileId: claim.profileId,
          activityId: claim.activityId,
          eligibleAtDatabaseNow: true,
        });
        // A replacement/deletion must never let a stale claimed revision
        // evaluate the activity's newer evidence.
        if (
          sources.length === 0 ||
          sources.some((source) => source.sourceRevision !== claim.sourceRevision)
        ) {
          if (!(await completeDeferredThresholdCalibration(tx, claim))) {
            throw new Error("Deferred threshold calibration claim was lost");
          }
          return;
        }
        const efforts = await tx
          .select()
          .from(activityEfforts)
          .where(
            and(
              eq(activityEfforts.profile_id, claim.profileId),
              eq(activityEfforts.activity_id, claim.activityId),
              eq(activityEfforts.source_revision, claim.sourceRevision),
            ),
          );
        const clock = await tx.execute(sql`select clock_timestamp() as now`);
        const now = clock.rows[0]?.now;
        if (!(now instanceof Date)) throw new Error("Database clock did not return a timestamp");
        await reconcileThresholdsWithProfileLockHeld(tx, {
          profileId: claim.profileId,
          activityId: claim.activityId,
          efforts,
          now,
        });
        if (!(await completeDeferredThresholdCalibration(tx, claim))) {
          throw new Error("Deferred threshold calibration claim was lost");
        }
      });
      result.completed += 1;
    } catch (error) {
      result.failed += 1;
      await retryDeferredThresholdCalibration(
        db,
        claim,
        error instanceof Error ? error.name : "deferred_threshold_calibration_failed",
      );
    }
  }
  return result;
}
