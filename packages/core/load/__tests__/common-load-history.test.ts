import {
  commonLoadHistoryResultSchema as historyResultSchemaFromRoot,
  replayCommonLoadHistory as replayFromRoot,
} from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  aggregateCommonLoad,
  COMMON_LOAD_HISTORY_MATURE_DAYS,
  COMMON_LOAD_HISTORY_POLICY_VERSION,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadHistoryDayObservation,
  type CommonLoadMethod,
  type CommonLoadResult,
  commonLoadHistoryDayObservationSchema,
  commonLoadHistoryResultSchema,
  commonLoadResultSchema,
  replayCommonLoadHistory,
} from "../index";

const planningDate = "2026-07-21";
const computedAsOf = "2026-07-20T12:00:00.000Z";

function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function available(
  load: number,
  sport: "bike" | "run" = "bike",
  method: CommonLoadMethod = sport === "bike" ? "power_threshold" : "run_pace_threshold",
): CommonLoadResult {
  const intensity = Math.sqrt(load / 100);
  const thresholdEvidence =
    sport === "bike"
      ? { type: "ftp_watts" as const, value: 250, unit: "watts" as const }
      : {
          type: "threshold_speed_mps" as const,
          value: 4,
          unit: "meters_per_second" as const,
        };
  return commonLoadResultSchema.parse({
    status: "available",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport,
    method,
    load,
    intensity,
    contributingDurationSeconds: 3600,
    quality: {
      source: "validated_test",
      observed_at: computedAsOf,
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: `quality-${sport}`,
    },
    thresholdEvidence: {
      ...thresholdEvidence,
      source: "validated_test",
      observedAt: computedAsOf,
      validAt: computedAsOf,
      freshness: "current",
      calculationVersion: "threshold-v1",
      sourceFingerprint: `threshold-${sport}`,
    },
    evidenceFingerprint: `activity-${sport}`,
    computedAsOf,
    estimated: false,
  });
}

function unavailableActivity(): CommonLoadResult {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport: "run",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf,
    contributingDurationSeconds: null,
    reason: "activity_data_missing",
  });
}

function knownZeroDays(count = 84, startOffset = -84): CommonLoadHistoryDayObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    state: "known_zero" as const,
    date: addDays(planningDate, startOffset + index),
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    coverageStatus: "complete" as const,
    evidenceFingerprints: [`source-${String(index).padStart(2, "0")}`],
  }));
}

function observedDays(load: number): CommonLoadHistoryDayObservation[] {
  const aggregate = aggregateCommonLoad([available(load)]);
  if (aggregate.status !== "complete") throw new Error("Expected complete test aggregate");
  return knownZeroDays().map((day, index) => ({
    ...day,
    state: "observed" as const,
    aggregate,
    evidenceFingerprints: [`activity-${index}`, `source-${index}`],
  }));
}

function replay(observations: CommonLoadHistoryDayObservation[]) {
  return replayCommonLoadHistory({
    currentPlanningDate: planningDate,
    planningTimezone: "America/Los_Angeles",
    observations,
  });
}

describe("common Load history v1 replay", () => {
  it("exports the same intentional public contract from the package root and load subpath", () => {
    expect(replayFromRoot).toBe(replayCommonLoadHistory);
    expect(historyResultSchemaFromRoot).toBe(commonLoadHistoryResultSchema);
  });

  it("replays 84 known-zero complete days to exact zero states", () => {
    const result = replay(knownZeroDays());

    expect(result).toEqual({
      status: "available",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      coverageStatus: "complete",
      maturity: {
        status: "establishing_baseline",
        replayedDays: 84,
        requiredMatureDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
        coverage: { completeDays: 84, partialDays: 0, ratio: 1 },
      },
      identity: {
        policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
        planningTimezone: "America/Los_Angeles",
        startDate: "2026-04-28",
        endDate: "2026-07-20",
        commonLoad: {
          model: COMMON_RELATIVE_LOAD_MODEL,
          version: COMMON_RELATIVE_LOAD_VERSION,
        },
        evidenceFingerprints: knownZeroDays().flatMap((day) => day.evidenceFingerprints),
      },
      points: knownZeroDays().map((day) => ({
        date: day.date,
        coverageStatus: "complete",
        dailyLoad: 0,
        longTermLoad: 0,
        recentLoad: 0,
        loadBalance: 0,
      })),
    });
  });

  it("returns deterministic insufficiency for 83 days", () => {
    expect(replay(knownZeroDays(83, -83))).toEqual({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "insufficient_history",
      context: { requiredDays: 84, receivedDays: 83 },
    });
  });

  it("rejects a missing/nonconsecutive profile-local date", () => {
    const days = knownZeroDays().map((day, index, allDays) =>
      index === 40 ? { ...day, date: allDays[41]?.date ?? "" } : day,
    );

    expect(replay(days)).toMatchObject({
      status: "unavailable",
      reason: "nonconsecutive_history",
      context: {
        observationIndex: 40,
        expectedDate: "2026-06-07",
        actualDate: "2026-06-08",
      },
    });
  });

  it("never admits the current planning day into complete history", () => {
    expect(replay(knownZeroDays(84, -83))).toEqual({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "current_day_included",
      context: { date: planningDate },
    });
  });

  it("matches exact v1 constant-load recurrence fixtures without rounding", () => {
    const result = replayCommonLoadHistory({
      currentPlanningDate: planningDate,
      planningTimezone: "America/Los_Angeles",
      observations: observedDays(100),
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected available history");

    expect(result.points.at(-1)).toMatchObject({
      date: "2026-07-20",
      coverageStatus: "complete",
      dailyLoad: 100,
    });
    expect(result.points.at(-1)?.longTermLoad).toBeCloseTo(86.46647167633867, 12);
    expect(result.points.at(-1)?.recentLoad).toBeCloseTo(99.99938557876466, 12);
    expect(result.points.at(-1)?.loadBalance).toBeCloseTo(-13.532913902425989, 12);
  });

  it("uses longer replay history to establish a mature baseline while retaining an 84-day chart", () => {
    const observations = Array.from({ length: COMMON_LOAD_HISTORY_MATURE_DAYS }, (_, index) => ({
      state: "known_zero" as const,
      date: addDays(planningDate, -COMMON_LOAD_HISTORY_MATURE_DAYS + index),
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      coverageStatus: "complete" as const,
      evidenceFingerprints: [`source-${index}`],
    }));
    const result = replay(observations);

    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected available history");
    expect(result.maturity).toEqual({
      status: "mature",
      replayedDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
      requiredMatureDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
      coverage: { completeDays: COMMON_LOAD_HISTORY_MATURE_DAYS, partialDays: 0, ratio: 1 },
    });
    expect(result.points).toHaveLength(84);
    expect(result.points[0]?.date).toBe("2026-04-28");
  });

  it("accepts a complete mixed-sport common aggregate", () => {
    const mixedAggregate = aggregateCommonLoad([available(100, "bike"), available(49, "run")]);
    expect(mixedAggregate.status).toBe("complete");
    const days = knownZeroDays().map(
      (day, index): CommonLoadHistoryDayObservation =>
        index === 83
          ? {
              ...day,
              state: "observed",
              aggregate: mixedAggregate,
              evidenceFingerprints: ["run-evidence", "bike-evidence"],
            }
          : day,
    );

    const result = replayCommonLoadHistory({
      currentPlanningDate: planningDate,
      planningTimezone: "America/Los_Angeles",
      observations: days,
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected available history");
    expect(result.points.at(-1)?.dailyLoad).toBe(149);
  });

  it("retains partial common Load coverage for fitness and fatigue projection inputs", () => {
    const partialAggregate = aggregateCommonLoad([available(100), unavailableActivity()]);
    expect(partialAggregate.status).toBe("partial");
    const partialDays = knownZeroDays().map(
      (day, index): CommonLoadHistoryDayObservation =>
        index === 20 ? { ...day, state: "observed", aggregate: partialAggregate } : day,
    );
    const partialResult = replayCommonLoadHistory({
      currentPlanningDate: planningDate,
      planningTimezone: "UTC",
      observations: partialDays,
    });
    expect(partialResult).toMatchObject({ status: "available", coverageStatus: "partial" });
    if (partialResult.status !== "available")
      throw new Error("Expected partial common Load history");
    expect(partialResult.maturity).toEqual({
      status: "provisional",
      replayedDays: 84,
      requiredMatureDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
      coverage: { completeDays: 83, partialDays: 1, ratio: 83 / 84 },
    });
    if (partialAggregate.status !== "partial") {
      throw new Error("Expected partial common Load aggregate");
    }
    expect(partialResult.points[20]).toMatchObject({
      coverageStatus: "partial",
      dailyLoad: partialAggregate.load,
    });

    // Long-term Load, Recent Load, and Load Balance remain source values for
    // fitness, fatigue, and form projections even when their coverage is partial.
    expect(partialResult.points.at(-1)).toMatchObject({
      longTermLoad: expect.any(Number),
      recentLoad: expect.any(Number),
      loadBalance: expect.any(Number),
    });

    // An unavailable day is distinct from a partial numeric aggregate and cannot
    // be silently converted to a zero-load projection input.

    const unavailableDays = knownZeroDays().map(
      (day, index): CommonLoadHistoryDayObservation =>
        index === 20
          ? {
              ...day,
              state: "unavailable",
              reason: "source_incomplete",
              evidenceFingerprints: [],
            }
          : day,
    );
    expect(
      replayCommonLoadHistory({
        currentPlanningDate: planningDate,
        planningTimezone: "UTC",
        observations: unavailableDays,
      }),
    ).toMatchObject({
      status: "unavailable",
      reason: "incomplete_observation",
      context: { observationState: "unavailable", observationReason: "source_incomplete" },
    });
  });

  it.each([
    ["other_relative_load", COMMON_RELATIVE_LOAD_VERSION],
    [COMMON_RELATIVE_LOAD_MODEL, "2"],
  ])("rejects mixed declared common identity %s@%s before arithmetic", (model, version) => {
    const days = knownZeroDays().map((day, index) =>
      index === 12 ? { ...day, model, version } : day,
    );
    const mismatchedDay = days[12];
    if (mismatchedDay === undefined) throw new Error("Expected mismatch fixture day");

    expect(replay(days)).toMatchObject({
      status: "unavailable",
      reason: "incompatible_model_version",
      context: {
        date: mismatchedDay.date,
        expectedModel: COMMON_RELATIVE_LOAD_MODEL,
        expectedVersion: COMMON_RELATIVE_LOAD_VERSION,
        actualModel: model,
        actualVersion: version,
      },
    });
  });

  it("canonicalizes day and evidence order into one deterministic identity", () => {
    const forward = knownZeroDays().map((day) => ({
      ...day,
      evidenceFingerprints: [`z-${day.date}`, `a-${day.date}`],
    }));
    const reverse = [...forward]
      .reverse()
      .map((day) => ({ ...day, evidenceFingerprints: [...day.evidenceFingerprints].reverse() }));

    const first = replay(forward);
    const second = replay(reverse);
    expect(first.status).toBe("available");
    expect(second.status).toBe("available");
    if (first.status !== "available" || second.status !== "available") {
      throw new Error("Expected available histories");
    }
    expect(first.identity).toEqual(second.identity);
    expect(first.points).toEqual(second.points);
    expect(first.identity.evidenceFingerprints.slice(0, 2)).toEqual([
      "a-2026-04-28",
      "z-2026-04-28",
    ]);
  });

  it("validates profile-local dates, planning timezones, and strict observation shape", () => {
    expect(
      commonLoadHistoryDayObservationSchema.safeParse({
        ...knownZeroDays()[0],
        date: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      replayCommonLoadHistory({
        currentPlanningDate: planningDate,
        planningTimezone: "Not/A_Timezone",
        observations: knownZeroDays(),
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_input" });
  });

  it.each([
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid observed daily Load %s", (load) => {
    const aggregate = aggregateCommonLoad([available(100)]);
    if (aggregate.status !== "complete") throw new Error("Expected complete aggregate");
    const days = observedDays(100).map(
      (day, index): CommonLoadHistoryDayObservation =>
        index === 0 && day.state === "observed"
          ? { ...day, aggregate: { ...aggregate, load } }
          : day,
    );

    expect(
      replayCommonLoadHistory({
        currentPlanningDate: planningDate,
        planningTimezone: "UTC",
        observations: days,
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_input" });
  });
});
