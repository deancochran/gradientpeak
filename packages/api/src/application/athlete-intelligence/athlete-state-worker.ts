import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  type AthleteStateBaseline,
  advanceAthleteStateTo,
  advanceObservedAthleteState,
  athleteStateBaselineSchema,
  dailyAggregateCommonLoadSchema,
  getCalendarDateInIanaZone,
} from "@repo/core";
import {
  type ActivityTrainingEffect,
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  type DailyTrainingLoad,
  dailyTrainingLoadSchema,
} from "@repo/core/athlete-derived-state";
import type { profilePerformanceEstimates } from "@repo/db";
import type { DrizzleTransactionClient, getRequiredDb } from "../../db";
import { createDrizzleAthleteDerivedStateRepository } from "../../infrastructure/repositories";
import { enqueueWahooRelativeTargetRefreshes } from "../../lib/provider-sync/planned-activities/refresh-wahoo-relative-target-activities";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import { createAthletePerformanceModelRepository } from "../../repositories/athlete-performance-model-repository";
import {
  type AthleteStateClaim,
  claimNextAthleteState,
  failAthleteStateClaim,
  publishAthleteState,
  readAthleteStateEvidencePage,
  releaseAthleteStateClaim,
  renewAthleteStateClaim,
} from "../../repositories/athlete-state-repository";
import {
  AnalysisRefreshFenceError,
  reprocessProfileActivityAnalysis,
} from "../activity-analysis/reprocess-profile-activity-analysis";
import { reconcileOnboardingStatus } from "../onboarding/readiness";
import { createAthletePerformanceTargetFactsReader } from "../performance-model/get-athlete-performance-model-as-of";
import { publishAthleteDailyLoad } from "./publish-athlete-daily-load";
import { readCachedPublishedAthletePerformanceTargets } from "./published-athlete-state";

type DbClient = ReturnType<typeof getRequiredDb>;
const PAGE_SIZE = 100;
export const ATHLETE_STATE_LEASE_MILLISECONDS = 5 * 60_000;
const ACTIVITY_ANALYSIS_REFRESH_LEASE_MILLISECONDS = 30 * 60_000;
const DERIVED_EFFECT_PAGE_SIZE = 500;

export class AthleteStateLeaseLostError extends Error {
  override readonly name = "AthleteStateLeaseLostError";
}

async function renewClaimOrThrow(
  db: DbClient,
  claim: AthleteStateClaim,
  leaseMilliseconds: number,
) {
  if (!(await renewAthleteStateClaim(db, { claim, leaseMilliseconds }))) {
    throw new AthleteStateLeaseLostError("Athlete-state replay lease was lost");
  }
}

export function planningLocalDate(instant: Date, timeZone: string) {
  return getCalendarDateInIanaZone(instant.toISOString(), timeZone);
}

export function safeDailyEvidenceInstant(latestObservedAt: Date, now: Date) {
  return latestObservedAt.getTime() > now.getTime() ? now : latestObservedAt;
}

export function addDailyAthleteStateCommonLoad(current: number, next: number) {
  return dailyAggregateCommonLoadSchema.parse(current + next);
}

function buildRevisionedDailyLoads(input: {
  profileId: string;
  sourceRevision: number;
  effects: ActivityTrainingEffect[];
  fallbackAt: string;
}) {
  const groups = new Map<string, ActivityTrainingEffect[]>();
  for (const effect of input.effects) {
    groups.set(effect.planningDate, [...(groups.get(effect.planningDate) ?? []), effect]);
  }
  const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  let state = initialState(
    {
      profileId: input.profileId,
      sourceRevision: input.sourceRevision,
      leaseToken: "00000000-0000-4000-8000-000000000000",
      planningTimezone: "UTC",
      dirtyFromAt: null,
      activityAnalysisCursor: null,
    },
    orderedGroups[0]?.[1][0]?.effectiveAt ?? input.fallbackAt,
  );
  let previousDay = orderedGroups[0]?.[0] ?? input.fallbackAt.slice(0, 10);
  const days: DailyTrainingLoad[] = [];
  for (const [planningDate, effects] of orderedGroups) {
    const latest = effects.at(-1);
    const first = effects[0];
    if (!latest || !first) continue;
    const commonLoad = effects.reduce(
      (total, effect) => addDailyAthleteStateCommonLoad(total, effect.stimulus.commonLoad),
      0,
    );
    const confidence = Math.min(...effects.map((effect) => effect.stimulus.evidenceConfidence));
    const stimulus =
      effects.length === 1
        ? first.stimulus
        : {
            kind: "observed" as const,
            sourceId: `athlete-day:${planningDate}`,
            occurredAt: latest.effectiveAt,
            activityCategory: "other" as const,
            commonLoad,
            evidenceConfidence: confidence,
            capabilityObservation: null,
          };
    state = advanceObservedAthleteState({
      baseline: state,
      planningDays: { fromDay: previousDay, toDay: planningDate },
      stimulus: { ...stimulus, commonLoad },
    }).state;
    previousDay = planningDate;
    days.push(
      dailyTrainingLoadSchema.parse({
        contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
        profileId: input.profileId,
        planningDate,
        sourceRevision: input.sourceRevision,
        commonLoad,
        fitness: state.longTermLoad,
        fatigue: state.recentLoad,
        form: state.loadBalance,
        readiness: null,
        coverage: {
          status: "complete",
          contributingActivityCount: effects.length,
          omittedActivityCount: 0,
        },
        calculationVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      }),
    );
  }
  return { days, state };
}

/** Rebuilds only the revisioned daily-load projection owned by the Phase 2 queue. */
export class AthleteDerivedStateWorkerService {
  constructor(
    private readonly input: {
      db: DbClient;
      repository?: AthleteDerivedStateRepositoryPort;
    },
  ) {}

  async processDueJobs(input: { limit?: number; now?: Date } = {}) {
    const limit = Math.max(1, Math.min(input.limit ?? 5, 50));
    const result = { completed: 0, failed: 0, processed: 0 };
    const repository =
      this.input.repository ?? createDrizzleAthleteDerivedStateRepository(this.input.db);
    for (let index = 0; index < limit; index += 1) {
      const now = input.now ?? new Date();
      const claimToken = crypto.randomUUID();
      const item = await repository.claimNextRecalculation({
        claimToken,
        claimedAt: now.toISOString(),
        leaseExpiresAt: new Date(now.getTime() + ATHLETE_STATE_LEASE_MILLISECONDS).toISOString(),
      });
      if (!item) break;
      result.processed += 1;
      try {
        const publication = await repository.lockPublicationState({
          profileId: item.request.profileId,
        });
        if (!publication) throw new Error("Athlete publication state disappeared");
        if (item.request.sourceRevision < publication.sourceRevision) {
          const completed = await repository.transitionRecalculation({
            profileId: item.request.profileId,
            transition: {
              action: "complete",
              claimToken,
              completedAt: now.toISOString(),
              resultingPublishedRevision: publication.publishedRevision,
            },
          });
          if (completed.status !== "completed") throw new AthleteStateLeaseLostError();
          result.completed += 1;
          continue;
        }
        if (item.request.sourceRevision > publication.sourceRevision) {
          throw new Error("Athlete recalculation revision is ahead of publication state");
        }
        if (publication.publishedRevision === item.request.sourceRevision) {
          const completed = await repository.transitionRecalculation({
            profileId: item.request.profileId,
            transition: {
              action: "complete",
              claimToken,
              completedAt: now.toISOString(),
              resultingPublishedRevision: item.request.sourceRevision,
            },
          });
          if (completed.status !== "completed") throw new AthleteStateLeaseLostError();
          result.completed += 1;
          continue;
        }
        const effects: ActivityTrainingEffect[] = [];
        let after:
          | { effectiveAt: string; activityId: string; activityAnalysisRevision: number }
          | undefined;
        for (;;) {
          const page = await repository.listActivityTrainingEffects({
            profileId: item.request.profileId,
            fromEffectiveAt: "1970-01-01T00:00:00.000Z",
            throughSourceRevision: item.request.sourceRevision,
            limit: DERIVED_EFFECT_PAGE_SIZE,
            ...(after === undefined ? {} : { after }),
          });
          effects.push(...page.items);
          const last = page.items.at(-1);
          if (!page.hasMore || !last) break;
          after = {
            effectiveAt: last.effectiveAt,
            activityId: last.activityId,
            activityAnalysisRevision: last.activityAnalysisRevision,
          };
          const renewed = await repository.transitionRecalculation({
            profileId: item.request.profileId,
            transition: {
              action: "renew",
              claimToken,
              renewedAt: now.toISOString(),
              leaseExpiresAt: new Date(Date.now() + ATHLETE_STATE_LEASE_MILLISECONDS).toISOString(),
            },
          });
          if (renewed.status !== "updated") throw new AthleteStateLeaseLostError();
        }
        const rebuilt = buildRevisionedDailyLoads({
          profileId: item.request.profileId,
          sourceRevision: item.request.sourceRevision,
          effects,
          fallbackAt: item.request.earliestAffectedAt,
        });
        const latestEffect = effects.at(-1);
        const published = await publishAthleteDailyLoad({
          repository,
          profileId: item.request.profileId,
          fromPlanningDate:
            rebuilt.days[0]?.planningDate ?? item.request.earliestAffectedPlanningDate,
          expectedPublishedRevision: publication.publishedRevision,
          targetPublishedRevision: item.request.sourceRevision,
          claimToken,
          days: rebuilt.days,
          state: {
            computedAt: latestEffect?.effectiveAt ?? item.request.earliestAffectedAt,
            fitness: rebuilt.state.longTermLoad,
            fatigue: rebuilt.state.recentLoad,
            evidenceConfidence: rebuilt.state.evidenceConfidence,
            coverageStartAt: effects[0]?.effectiveAt ?? null,
            coverageEndAt: latestEffect?.effectiveAt ?? null,
            lastActivityAt: latestEffect?.effectiveAt ?? null,
            calculationVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
            capabilities: rebuilt.state.capabilities,
          },
        });
        if (published.status !== "published") throw new AthleteStateLeaseLostError();
        const completed = await repository.transitionRecalculation({
          profileId: item.request.profileId,
          transition: {
            action: "complete",
            claimToken,
            completedAt: now.toISOString(),
            resultingPublishedRevision: published.publishedRevision,
          },
        });
        if (completed.status !== "completed") throw new AthleteStateLeaseLostError();
        result.completed += 1;
        await reconcileOnboardingStatus({
          db: this.input.db,
          profileId: item.request.profileId,
        }).catch(() => undefined);
      } catch (error) {
        result.failed += 1;
        if (!(error instanceof AthleteStateLeaseLostError)) {
          await repository
            .transitionRecalculation({
              profileId: item.request.profileId,
              transition: {
                action: "retry",
                claimToken,
                failureCode: "internal",
                failedAt: now.toISOString(),
                nextAttemptAt: new Date(now.getTime() + 60_000).toISOString(),
              },
            })
            .catch(() => undefined);
        }
      }
    }
    return result;
  }
}

function initialState(claim: AthleteStateClaim, asOf: string): AthleteStateBaseline {
  return athleteStateBaselineSchema.parse({
    contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    athleteId: claim.profileId,
    stateRevision: claim.sourceRevision,
    asOf,
    longTermLoad: 0,
    recentLoad: 0,
    loadBalance: 0,
    evidenceConfidence: 0,
    capabilities: [],
    athleteAgeYears: null,
  });
}

async function buildCurrentEstimates(
  db: DbClient,
  transaction: DrizzleTransactionClient,
  claim: AthleteStateClaim,
  now: Date,
  capabilities: AthleteStateBaseline["capabilities"],
) {
  const targets = await createAthletePerformanceTargetFactsReader(
    createAthletePerformanceModelRepository(db),
    transaction,
  )({
    actorProfileId: claim.profileId,
    asOf: now,
  });
  const estimates: Array<typeof profilePerformanceEstimates.$inferInsert> = [];
  for (const activityCategory of ["bike", "run", "swim"] as const) {
    const fact = targets.thresholds[activityCategory];
    if (fact.status !== "available") continue;
    estimates.push({
      profile_id: claim.profileId,
      capability_kind: fact.metric === "power" ? "threshold_power" : "threshold_speed",
      activity_category: activityCategory,
      value: fact.value,
      unit: fact.unit,
      confidence: fact.confidence,
      effective_at: new Date(fact.effectiveAt),
      evidence_window_start_at: new Date(fact.effectiveAt),
      evidence_window_end_at: new Date(fact.effectiveAt),
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      source_revision: claim.sourceRevision,
      target_fact: fact,
      computed_at: now,
    });
  }
  for (const activityCategory of ["bike", "run", "swim"] as const) {
    for (const [capabilityKind, fact] of [
      [`${activityCategory}_max_hr`, targets.heartRate[activityCategory].maxHr],
    ] as const) {
      if (fact.status !== "available") continue;
      estimates.push({
        profile_id: claim.profileId,
        capability_kind: capabilityKind,
        activity_category: activityCategory,
        value: fact.valueBpm,
        unit: "bpm",
        confidence: 0.8,
        effective_at: new Date(fact.observedAt),
        evidence_window_start_at: fact.observedAt ? new Date(fact.observedAt) : null,
        evidence_window_end_at: fact.observedAt ? new Date(fact.observedAt) : null,
        algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
        source_revision: claim.sourceRevision,
        target_fact: fact,
        computed_at: now,
      });
    }
  }
  for (const capability of capabilities) {
    const effectiveAt = new Date(capability.observedAt);
    if (capability.longestDistanceMeters !== null && capability.longestDistanceMeters > 0) {
      estimates.push({
        profile_id: claim.profileId,
        capability_kind: "longest_distance",
        activity_category: capability.activityCategory,
        value: capability.longestDistanceMeters,
        unit: "meters",
        confidence: capability.evidenceConfidence,
        effective_at: effectiveAt,
        evidence_window_start_at: null,
        evidence_window_end_at: now,
        algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
        source_revision: claim.sourceRevision,
        computed_at: now,
      });
    }
    if (capability.longestDurationMinutes !== null && capability.longestDurationMinutes > 0) {
      estimates.push({
        profile_id: claim.profileId,
        capability_kind: "longest_duration",
        activity_category: capability.activityCategory,
        value: capability.longestDurationMinutes,
        unit: "minutes",
        confidence: capability.evidenceConfidence,
        effective_at: effectiveAt,
        evidence_window_start_at: null,
        evidence_window_end_at: now,
        algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
        source_revision: claim.sourceRevision,
        computed_at: now,
      });
    }
  }
  return { estimates, targets };
}

export async function rebuildClaimedAthleteState(input: {
  db: DbClient;
  claim: AthleteStateClaim;
  now: Date;
}) {
  let cursor: { finishedAt: Date; id: string } | null = null;
  let state: AthleteStateBaseline | null = null;
  let statePlanningDay: string | null = null;
  let day: string | null = null;
  let dayLoad = 0;
  let dayConfidence = 1;
  let dayLatestObservedAt: Date | null = null;
  let coverageStartAt: Date | null = null;
  let coverageEndAt: Date | null = null;
  const capabilities = new Map<string, AthleteStateBaseline["capabilities"][number]>();

  const flush = () => {
    if (!day || !dayLatestObservedAt) return;
    const observedDay = day;
    const occurredAt = safeDailyEvidenceInstant(dayLatestObservedAt, input.now).toISOString();
    if (!state) {
      state = initialState(input.claim, occurredAt);
      statePlanningDay = observedDay;
    }
    state = advanceObservedAthleteState({
      baseline: state,
      planningDays: { fromDay: statePlanningDay ?? observedDay, toDay: observedDay },
      stimulus: {
        kind: "observed",
        sourceId: `athlete-state-day:${day}`,
        occurredAt,
        activityCategory: "other",
        commonLoad: dayLoad,
        evidenceConfidence: dayConfidence,
        capabilityObservation: null,
      },
    }).state;
    statePlanningDay = observedDay;
    day = null;
    dayLoad = 0;
    dayConfidence = 1;
    dayLatestObservedAt = null;
  };

  while (true) {
    const page = await readAthleteStateEvidencePage(input.db, {
      profileId: input.claim.profileId,
      cursor,
      limit: PAGE_SIZE,
      notAfter: input.now,
    });
    for (const row of page) {
      cursor = { finishedAt: row.finishedAt, id: row.id };
      coverageStartAt ??= row.finishedAt;
      coverageEndAt = row.finishedAt;
      const activityDay = planningLocalDate(row.finishedAt, input.claim.planningTimezone);
      if (day !== activityDay) {
        flush();
        day = activityDay;
      }
      dayLoad = addDailyAthleteStateCommonLoad(dayLoad, row.commonLoad);
      dayConfidence = Math.min(dayConfidence, row.evidenceConfidence);
      dayLatestObservedAt = row.finishedAt;
      const existing = capabilities.get(row.activityCategory);
      capabilities.set(row.activityCategory, {
        activityCategory: row.activityCategory,
        longestDistanceMeters: Math.max(
          existing?.longestDistanceMeters ?? 0,
          row.capabilityDistanceMeters ?? 0,
        ),
        longestDurationMinutes: Math.max(
          existing?.longestDurationMinutes ?? 0,
          row.capabilityDurationMinutes ?? 0,
        ),
        observedAt:
          !existing || row.finishedAt.toISOString() > existing.observedAt
            ? row.finishedAt.toISOString()
            : existing.observedAt,
        evidenceConfidence: Math.max(existing?.evidenceConfidence ?? 0, row.evidenceConfidence),
      });
    }
    if (page.length < PAGE_SIZE) break;
    await renewClaimOrThrow(input.db, input.claim, ATHLETE_STATE_LEASE_MILLISECONDS);
  }
  flush();
  state ??= initialState(input.claim, input.now.toISOString());
  statePlanningDay ??= planningLocalDate(new Date(state.asOf), input.claim.planningTimezone);
  state = athleteStateBaselineSchema.parse({
    ...state,
    capabilities: [...capabilities.values()],
  });
  if (Date.parse(state.asOf) < input.now.getTime())
    state = advanceAthleteStateTo(state, input.now.toISOString(), {
      fromDay: statePlanningDay,
      toDay: planningLocalDate(input.now, input.claim.planningTimezone),
    }).state;
  await renewClaimOrThrow(input.db, input.claim, ATHLETE_STATE_LEASE_MILLISECONDS);
  const publishedCapabilities = state.capabilities;
  let publicationContext:
    | {
        performance: Awaited<ReturnType<typeof buildCurrentEstimates>>;
        beforePublishedTargets: Awaited<
          ReturnType<typeof readCachedPublishedAthletePerformanceTargets>
        >;
      }
    | undefined;
  return publishAthleteState(input.db, {
    claim: input.claim,
    state: {
      fitness: state.longTermLoad,
      fatigue: state.recentLoad,
      evidenceConfidence: state.evidenceConfidence,
      coverageStartAt,
      coverageEndAt,
      lastActivityAt: coverageEndAt,
      algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    },
    estimates: async (tx) => {
      const performance = await buildCurrentEstimates(
        input.db,
        tx,
        input.claim,
        input.now,
        publishedCapabilities,
      );
      const beforePublishedTargets = await readCachedPublishedAthletePerformanceTargets({
        db: tx,
        profileId: input.claim.profileId,
        now: input.now,
      });
      publicationContext = { performance, beforePublishedTargets };
      return performance.estimates;
    },
    now: input.now,
    // The queue rows are written only after the fenced snapshot update and become
    // visible atomically with it. A failed enqueue rolls the publication back.
    afterPublishInTransaction: async (tx) => {
      if (!publicationContext) {
        throw new Error("Athlete-state publication context was not prepared");
      }
      await enqueueWahooRelativeTargetRefreshes({
        afterTargetFacts: publicationContext.performance.targets,
        beforeTargetFacts: publicationContext.beforePublishedTargets,
        db: input.db,
        now: input.now,
        profileId: input.claim.profileId,
        transaction: tx,
      });
    },
  });
}

export class AthleteStateWorkerService {
  constructor(private readonly input: { db: DbClient }) {}

  async processDueJobs(input: { limit?: number; now?: Date } = {}) {
    const limit = Math.max(1, Math.min(input.limit ?? 5, 50));
    const result = { completed: 0, failed: 0, processed: 0 };
    claimSlots: for (let index = 0; index < limit; index += 1) {
      const now = input.now ?? new Date();
      if ("$client" in this.input.db) {
        const derived = await new AthleteDerivedStateWorkerService(this.input).processDueJobs({
          limit: 1,
          now,
        });
        if (derived.processed > 0) {
          result.processed += derived.processed;
          result.completed += derived.completed;
          result.failed += derived.failed;
          continue;
        }
      }
      let continuationProfileId: string | undefined;
      for (;;) {
        const claim = await claimNextAthleteState(this.input.db, {
          now,
          leaseMilliseconds: ATHLETE_STATE_LEASE_MILLISECONDS,
          ...(continuationProfileId === undefined ? {} : { profileId: continuationProfileId }),
        });
        if (!claim) {
          if (continuationProfileId === undefined) break claimSlots;
          break;
        }
        result.processed += 1;
        try {
          if (claim.dirtyFromAt !== null && claim.dirtyFromAt.getTime() <= now.getTime()) {
            await renewClaimOrThrow(
              this.input.db,
              claim,
              ACTIVITY_ANALYSIS_REFRESH_LEASE_MILLISECONDS,
            );
            const refresh = await reprocessProfileActivityAnalysis(this.input.db, {
              profileId: claim.profileId,
              apply: true,
              confirmProfileId: claim.profileId,
              from: claim.dirtyFromAt,
              now,
              claimedAthleteState: claim,
            });
            if (refresh.durableRefresh === "continued") {
              // The batch transaction released this claim and persisted its cursor. Reclaim the
              // same profile now rather than waiting for the scheduler's next polling interval.
              continuationProfileId = claim.profileId;
              continue;
            }
            await renewClaimOrThrow(this.input.db, claim, ATHLETE_STATE_LEASE_MILLISECONDS);
          }
          const published = await rebuildClaimedAthleteState({
            db: this.input.db,
            claim,
            now,
          });
          if (published) {
            result.completed += 1;
            await reconcileOnboardingStatus({
              db: this.input.db,
              profileId: claim.profileId,
            }).catch(() => undefined);
          } else result.failed += 1;
        } catch (error) {
          result.failed += 1;
          if (
            error instanceof AthleteStateLeaseLostError ||
            error instanceof AnalysisRefreshFenceError
          ) {
            await releaseAthleteStateClaim(this.input.db, { claim, now }).catch(() => false);
          } else {
            await failAthleteStateClaim(this.input.db, {
              claim,
              now,
              failureCode: error instanceof Error ? error.name : "athlete_state_failed",
            });
          }
        }
        break;
      }
    }
    return result;
  }
}
