import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  type AthleteStateBaseline,
  advanceAthleteStateTo,
  advanceObservedAthleteState,
  athleteStateBaselineSchema,
  dailyAggregateCommonLoadSchema,
  getCalendarDateInIanaZone,
  projectAthletePerformanceTargetFacts,
} from "@repo/core";
import type { profilePerformanceEstimates } from "@repo/db";
import type { getRequiredDb } from "../../db";
import { createAthletePerformanceModelRepository } from "../../repositories/athlete-performance-model-repository";
import {
  type AthleteStateClaim,
  claimNextAthleteState,
  failAthleteStateClaim,
  publishAthleteState,
  readAthleteStateEvidencePage,
  renewAthleteStateClaim,
} from "../../repositories/athlete-state-repository";
import { getAthletePerformanceModelAsOf } from "../performance-model/get-athlete-performance-model-as-of";

type DbClient = ReturnType<typeof getRequiredDb>;
const PAGE_SIZE = 100;
export const ATHLETE_STATE_LEASE_MILLISECONDS = 5 * 60_000;

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
  claim: AthleteStateClaim,
  now: Date,
  capabilities: AthleteStateBaseline["capabilities"],
) {
  const performanceModel = await getAthletePerformanceModelAsOf(
    { athleteId: claim.profileId, asOf: now },
    createAthletePerformanceModelRepository(db),
  );
  const targets = projectAthletePerformanceTargetFacts(performanceModel);
  const confidenceNumber = (value: "high" | "medium" | "low" | "unavailable") =>
    value === "high" ? 0.9 : value === "medium" ? 0.75 : value === "low" ? 0.6 : 0;
  const estimates: Array<typeof profilePerformanceEstimates.$inferInsert> = [];
  const appendTarget = (input: {
    activityCategory: "bike" | "run" | "swim";
    capabilityKind: string;
    fact: {
      status: "available" | "partial" | "unavailable";
      value: number | null;
      unit: string;
      confidence: "high" | "medium" | "low" | "unavailable";
      evidenceTime: { observedFrom: string | null; observedThrough: string | null };
    };
  }) => {
    if (input.fact.status === "unavailable" || input.fact.value === null) return;
    estimates.push({
      profile_id: claim.profileId,
      capability_kind: input.capabilityKind,
      activity_category: input.activityCategory,
      value: input.fact.value,
      unit: input.fact.unit,
      confidence: confidenceNumber(input.fact.confidence),
      effective_at: new Date(input.fact.evidenceTime.observedThrough ?? now.toISOString()),
      evidence_window_start_at: input.fact.evidenceTime.observedFrom
        ? new Date(input.fact.evidenceTime.observedFrom)
        : null,
      evidence_window_end_at: input.fact.evidenceTime.observedThrough
        ? new Date(input.fact.evidenceTime.observedThrough)
        : null,
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      source_revision: claim.sourceRevision,
      target_fact: input.fact,
      computed_at: now,
    });
  };
  appendTarget({
    activityCategory: "bike",
    capabilityKind: "bike_ftp",
    fact: targets.cycling.planningThresholdPower,
  });
  appendTarget({
    activityCategory: "run",
    capabilityKind: "run_threshold_pace",
    fact: targets.running.planningThresholdPace,
  });
  appendTarget({
    activityCategory: "swim",
    capabilityKind: "swim_css",
    fact: targets.swimming.css,
  });
  for (const activityCategory of ["bike", "run", "swim"] as const) {
    for (const [capabilityKind, fact] of [
      [`${activityCategory}_lthr`, targets.heartRate[activityCategory].lthr],
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
        evidence_window_start_at: new Date(fact.observedAt),
        evidence_window_end_at: new Date(fact.observedAt),
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
  return { estimates };
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
  const performance = await buildCurrentEstimates(
    input.db,
    input.claim,
    input.now,
    state.capabilities,
  );
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
    estimates: performance.estimates,
    now: input.now,
  });
}

export class AthleteStateWorkerService {
  constructor(private readonly input: { db: DbClient }) {}

  async processDueJobs(input: { limit?: number; now?: Date } = {}) {
    const limit = Math.max(1, Math.min(input.limit ?? 5, 50));
    const result = { completed: 0, failed: 0, processed: 0 };
    for (let index = 0; index < limit; index += 1) {
      const now = input.now ?? new Date();
      const claim = await claimNextAthleteState(this.input.db, {
        now,
        leaseMilliseconds: ATHLETE_STATE_LEASE_MILLISECONDS,
      });
      if (!claim) break;
      result.processed += 1;
      try {
        const published = await rebuildClaimedAthleteState({
          db: this.input.db,
          claim,
          now,
        });
        if (published) result.completed += 1;
        else result.failed += 1;
      } catch (error) {
        result.failed += 1;
        if (!(error instanceof AthleteStateLeaseLostError)) {
          await failAthleteStateClaim(this.input.db, {
            claim,
            now,
            failureCode: error instanceof Error ? error.name : "athlete_state_failed",
          });
        }
      }
    }
    return result;
  }
}
