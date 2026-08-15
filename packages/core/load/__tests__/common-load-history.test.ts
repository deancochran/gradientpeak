import {
  commonLoadHistoryResultSchema as historyResultSchemaFromRoot,
  replayCommonLoadHistory as replayFromRoot,
} from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  aggregateCommonLoad,
  COMMON_LOAD_FORECAST_BASIS,
  COMMON_LOAD_FORECAST_POLICY_VERSION,
  COMMON_LOAD_HISTORY_BASIS,
  COMMON_LOAD_HISTORY_CALCULATION_MODEL,
  COMMON_LOAD_HISTORY_CALCULATION_VERSION,
  COMMON_LOAD_HISTORY_MATURE_DAYS,
  COMMON_LOAD_HISTORY_POLICY_VERSION,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadHistoryDayObservation,
  type CommonLoadMethod,
  type CommonLoadResult,
  commonLoadHistoryDayObservationSchema,
  commonLoadHistoryReplayInputSchema,
  commonLoadHistoryResultSchema,
  commonLoadResultSchema,
  projectCommonLoadTrend,
  replayCommonLoadHistory,
} from "../index";
import { commonLoadHistoryV1SyntheticFixture } from "./fixtures/common-load-history-v1";

const planningDate = "2026-07-21";
const historyAsOf = "2026-07-21T12:00:00.000Z";
const computedAsOf = "2026-07-20T12:00:00.000Z";

function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function available(
  load: number,
  activity_category: "bike" | "run" = "bike",
  method: CommonLoadMethod = activity_category === "bike"
    ? "power_threshold"
    : "run_pace_threshold",
): CommonLoadResult {
  const intensity = Math.sqrt(load / 100);
  const thresholdEvidence =
    activity_category === "bike"
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
    activity_category,
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
      evidence_fingerprint: `quality-${activity_category}`,
    },
    thresholdEvidence: {
      ...thresholdEvidence,
      source: "validated_test",
      observedAt: computedAsOf,
      validAt: computedAsOf,
      freshness: "current",
      calculationVersion: "threshold-v1",
      sourceFingerprint: `threshold-${activity_category}`,
    },
    evidenceFingerprint: `activity-${activity_category}`,
    computedAsOf,
    estimated: false,
  });
}

function unavailableActivity(): CommonLoadResult {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: "run",
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
    calculatedAsOf: historyAsOf,
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

function replayInput(
  observations: CommonLoadHistoryDayObservation[],
  planningTimezone = "America/Los_Angeles",
) {
  return {
    basis: COMMON_LOAD_HISTORY_BASIS,
    calculationIdentity: {
      model: COMMON_LOAD_HISTORY_CALCULATION_MODEL,
      version: COMMON_LOAD_HISTORY_CALCULATION_VERSION,
      asOf: historyAsOf,
    },
    currentPlanningDate: planningDate,
    planningTimezone,
    observations,
  };
}

function replay(
  observations: CommonLoadHistoryDayObservation[],
  planningTimezone = "America/Los_Angeles",
) {
  return replayCommonLoadHistory(replayInput(observations, planningTimezone));
}

function completeAggregate(load: number) {
  const aggregate = aggregateCommonLoad([available(load)]);
  if (aggregate.status !== "complete") throw new Error("Complete fixture aggregate expected");
  return aggregate;
}

function observationsForDailyLoads(
  dailyLoads: readonly { date: string; load: number }[],
): CommonLoadHistoryDayObservation[] {
  return dailyLoads.map(
    (day): CommonLoadHistoryDayObservation =>
      day.load === 0
        ? {
            state: "known_zero",
            date: day.date,
            model: COMMON_RELATIVE_LOAD_MODEL,
            version: COMMON_RELATIVE_LOAD_VERSION,
            calculatedAsOf: historyAsOf,
            coverageStatus: "complete",
            evidenceFingerprints: [`fixture:${day.date}:known-zero`],
          }
        : {
            state: "observed",
            date: day.date,
            model: COMMON_RELATIVE_LOAD_MODEL,
            version: COMMON_RELATIVE_LOAD_VERSION,
            calculatedAsOf: historyAsOf,
            coverageStatus: "complete",
            aggregate: completeAggregate(day.load),
            evidenceFingerprints: [`fixture:${day.date}:load:${day.load}`],
          },
  );
}

function expectWithin(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
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
        basis: COMMON_LOAD_HISTORY_BASIS,
        calculationIdentity: {
          model: COMMON_LOAD_HISTORY_CALCULATION_MODEL,
          version: COMMON_LOAD_HISTORY_CALCULATION_VERSION,
          asOf: historyAsOf,
        },
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
    const days = knownZeroDays().map((day, index) =>
      index === 40 ? { ...day, date: "2026-01-01" } : day,
    );

    expect(replay(days)).toMatchObject({
      status: "unavailable",
      reason: "nonconsecutive_history",
      context: {
        observationIndex: 0,
        expectedDate: "2026-04-28",
        actualDate: "2026-01-01",
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
    const result = replay(observedDays(100));
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

  it("matches the literal independently calculated v1 synthetic fixture", () => {
    const result = replay(
      observationsForDailyLoads(commonLoadHistoryV1SyntheticFixture.dailyLoads),
      commonLoadHistoryV1SyntheticFixture.planningTimezone,
    );
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Available fixture history expected");

    expect(result.policyVersion).toBe(commonLoadHistoryV1SyntheticFixture.policyVersion);
    expect(result.identity).toMatchObject({
      basis: commonLoadHistoryV1SyntheticFixture.basis,
      calculationIdentity: commonLoadHistoryV1SyntheticFixture.historyCalculation,
    });
    for (const expectedPoint of commonLoadHistoryV1SyntheticFixture.expectedPoints) {
      const actual = result.points.find((point) => point.date === expectedPoint.date);
      if (actual === undefined) throw new Error(`Missing fixture point ${expectedPoint.date}`);
      expect(actual.dailyLoad).toBe(expectedPoint.dailyLoad);
      expectWithin(
        actual.longTermLoad,
        expectedPoint.longTermLoad,
        commonLoadHistoryV1SyntheticFixture.absoluteTolerance,
      );
      expectWithin(
        actual.recentLoad,
        expectedPoint.recentLoad,
        commonLoadHistoryV1SyntheticFixture.absoluteTolerance,
      );
      expectWithin(
        actual.loadBalance,
        expectedPoint.loadBalance,
        commonLoadHistoryV1SyntheticFixture.absoluteTolerance,
      );
    }
  });

  it("replays the same facts, version, and as-of identity exactly on every invocation", () => {
    const observations = observationsForDailyLoads(commonLoadHistoryV1SyntheticFixture.dailyLoads);

    expect(replay(observations)).toEqual(replay(observations));
  });

  it("decays both states on an evidenced zero-load day", () => {
    const result = replay(
      observationsForDailyLoads(commonLoadHistoryV1SyntheticFixture.dailyLoads),
    );
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Available fixture history expected");
    const impulse = result.points.find((point) => point.date === "2026-06-09");
    const nextZero = result.points.find((point) => point.date === "2026-06-10");

    expect(nextZero?.dailyLoad).toBe(0);
    expect(nextZero?.longTermLoad).toBeLessThan(impulse?.longTermLoad ?? 0);
    expect(nextZero?.recentLoad).toBeLessThan(impulse?.recentLoad ?? 0);
  });

  it("never lowers a current or later state when one complete daily input is larger", () => {
    const baselineLoads = commonLoadHistoryV1SyntheticFixture.dailyLoads;
    const baseline = replay(observationsForDailyLoads(baselineLoads));
    expect(baseline.status).toBe("available");
    if (baseline.status !== "available") throw new Error("Available baseline expected");

    for (const testCase of [
      { date: "2026-04-28", increment: 1 },
      { date: "2026-06-09", increment: 25 },
      { date: "2026-07-20", increment: 100 },
    ]) {
      const largerLoads = baselineLoads.map((day) =>
        day.date === testCase.date ? { ...day, load: day.load + testCase.increment } : day,
      );
      const larger = replay(observationsForDailyLoads(largerLoads));
      expect(larger.status).toBe("available");
      if (larger.status !== "available") throw new Error("Available larger-input history expected");
      const changedIndex = larger.points.findIndex((point) => point.date === testCase.date);
      expect(changedIndex).toBeGreaterThanOrEqual(0);
      for (let index = changedIndex; index < larger.points.length; index += 1) {
        const baselinePoint = baseline.points[index];
        const largerPoint = larger.points[index];
        if (baselinePoint === undefined || largerPoint === undefined) {
          throw new Error("Aligned replay points expected");
        }
        expect(largerPoint.longTermLoad).toBeGreaterThanOrEqual(baselinePoint.longTermLoad);
        expect(largerPoint.recentLoad).toBeGreaterThanOrEqual(baselinePoint.recentLoad);
      }
    }
  });

  it("matches an independent recurrence for bounded deterministic daily sequences", () => {
    const dates = commonLoadHistoryV1SyntheticFixture.dailyLoads.map((day) => day.date);
    const sequences = [
      commonLoadHistoryV1SyntheticFixture.dailyLoads.map((day) => day.load),
      dates.map((_, index) => (index * 37) % 101),
      dates.map((_, index) => (index % 9 === 0 ? 120 : index % 3 === 0 ? 15 : 0)),
    ];

    for (const loads of sequences) {
      const result = replay(
        observationsForDailyLoads(dates.map((date, index) => ({ date, load: loads[index] ?? 0 }))),
      );
      expect(result.status).toBe("available");
      if (result.status !== "available") throw new Error("Available property replay expected");
      let expectedLongTerm = 0;
      let expectedRecent = 0;
      for (const [index, load] of loads.entries()) {
        expectedLongTerm += (1 - Math.exp(-1 / 42)) * (load - expectedLongTerm);
        expectedRecent += (1 - Math.exp(-1 / 7)) * (load - expectedRecent);
        const actual = result.points[index];
        if (actual === undefined) throw new Error("Replay point expected");
        expectWithin(actual.longTermLoad, expectedLongTerm, 1e-12);
        expectWithin(actual.recentLoad, expectedRecent, 1e-12);
        expectWithin(actual.loadBalance, expectedLongTerm - expectedRecent, 1e-12);
      }
    }
  });

  it("uses longer replay history to establish a mature baseline while retaining an 84-day chart", () => {
    const observations = Array.from({ length: COMMON_LOAD_HISTORY_MATURE_DAYS }, (_, index) => ({
      state: "known_zero" as const,
      date: addDays(planningDate, -COMMON_LOAD_HISTORY_MATURE_DAYS + index),
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      calculatedAsOf: historyAsOf,
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

  it("accepts a complete mixed-category common aggregate", () => {
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

    const result = replay(days);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected available history");
    expect(result.points.at(-1)?.dailyLoad).toBe(149);
  });

  it("uses finite partial Load but rejects unavailable observations before recurrence", () => {
    const partialAggregate = aggregateCommonLoad([available(100), unavailableActivity()]);
    expect(partialAggregate.status).toBe("partial");
    const partialDays = knownZeroDays().map(
      (day, index): CommonLoadHistoryDayObservation =>
        index === 20 ? { ...day, state: "observed", aggregate: partialAggregate } : day,
    );
    const partialResult = replay(partialDays, "UTC");
    expect(partialResult.status).toBe("available");
    if (partialResult.status !== "available") throw new Error("Expected available history");
    expect(partialResult.points[20]?.dailyLoad).toBe(100);

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
    expect(replay(unavailableDays, "UTC")).toMatchObject({
      status: "unavailable",
      reason: "incomplete_observation",
      context: { observationState: "unavailable", observationReason: "source_incomplete" },
    });

    const unavailableAggregate = aggregateCommonLoad([unavailableActivity()]);
    expect(unavailableAggregate.status).toBe("unavailable");
    const unavailableAggregateDays = knownZeroDays().map((day, index) =>
      index === 20 ? { ...day, state: "observed" as const, aggregate: unavailableAggregate } : day,
    );
    expect(replay(unavailableAggregateDays)).toMatchObject({
      status: "unavailable",
      reason: "incomplete_observation",
      context: { observationState: "observed", observationReason: "common_load_unavailable" },
    });

    expect(
      replay(
        knownZeroDays().map((day, index) =>
          index === 20 ? { ...day, coverageStatus: "partial" as const } : day,
        ),
      ),
    ).toMatchObject({
      status: "unavailable",
      reason: "incomplete_observation",
      context: { observationState: "known_zero", observationReason: "partial_source_day" },
    });
  });

  it("propagates missing and partial evidence at deterministic replay boundaries", () => {
    const complete = observationsForDailyLoads(commonLoadHistoryV1SyntheticFixture.dailyLoads);
    for (const index of [0, 41, 83]) {
      const missing = complete.filter((_, observationIndex) => observationIndex !== index);
      expect(replay(missing)).toMatchObject({
        status: "unavailable",
        reason: "insufficient_history",
        context: { receivedDays: 83 },
      });

      const partial = complete.map(
        (day, observationIndex): CommonLoadHistoryDayObservation =>
          observationIndex === index ? { ...day, coverageStatus: "partial" } : day,
      );
      expect(replay(partial)).toMatchObject({
        status: "unavailable",
        reason: "incomplete_observation",
        context: { observationReason: "partial_source_day" },
      });
    }
  });

  it("does not admit a partial available result through the public output schema", () => {
    const availableResult = replay(knownZeroDays());
    expect(availableResult.status).toBe("available");
    if (availableResult.status !== "available") throw new Error("Available history expected");

    expect(
      commonLoadHistoryResultSchema.safeParse({
        ...availableResult,
        coverageStatus: "partial",
      }).success,
    ).toBe(false);
    expect(
      commonLoadHistoryResultSchema.safeParse({
        ...availableResult,
        maturity: {
          ...availableResult.maturity,
          status: "provisional",
          coverage: { completeDays: 83, partialDays: 1, ratio: 83 / 84 },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate date and evidence identities before aggregation", () => {
    const complete = observationsForDailyLoads(commonLoadHistoryV1SyntheticFixture.dailyLoads);
    const duplicateDate = complete.map((day, index) =>
      index === 1 ? { ...day, date: complete[0]?.date ?? "" } : day,
    );
    expect(replay(duplicateDate)).toMatchObject({
      status: "unavailable",
      reason: "duplicate_observation_identity",
      context: { identityKind: "date" },
    });

    const firstEvidence = complete[0]?.evidenceFingerprints[0];
    if (firstEvidence === undefined) throw new Error("Fixture evidence identity expected");
    const duplicateEvidence = complete.map((day, index) =>
      index === 1 ? { ...day, evidenceFingerprints: [firstEvidence] } : day,
    );
    expect(replay(duplicateEvidence)).toMatchObject({
      status: "unavailable",
      reason: "duplicate_observation_identity",
      context: { identityKind: "evidence_fingerprint" },
    });
  });

  it("rejects incompatible history calculation versions before replay", () => {
    const input = replayInput(knownZeroDays());
    expect(
      replayCommonLoadHistory({
        ...input,
        calculationIdentity: { ...input.calculationIdentity, version: "2" },
      }),
    ).toEqual({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "incompatible_history_version",
      context: {
        expectedModel: COMMON_LOAD_HISTORY_CALCULATION_MODEL,
        expectedVersion: COMMON_LOAD_HISTORY_CALCULATION_VERSION,
        actualModel: COMMON_LOAD_HISTORY_CALCULATION_MODEL,
        actualVersion: "2",
      },
    });
  });

  it("rejects mixed calculation as-of identities and evidence calculated after as-of", () => {
    const earlier = knownZeroDays().map((day, index) =>
      index === 10 ? { ...day, calculatedAsOf: "2026-07-21T11:59:59.000Z" } : day,
    );
    expect(replay(earlier)).toMatchObject({
      status: "unavailable",
      reason: "incompatible_calculation_identity",
      context: { date: earlier[10]?.date, expectedAsOf: historyAsOf },
    });

    const later = knownZeroDays().map((day, index) =>
      index === 10 ? { ...day, calculatedAsOf: "2026-07-21T12:00:00.001Z" } : day,
    );
    expect(replay(later)).toMatchObject({
      status: "unavailable",
      reason: "evidence_after_as_of",
      context: { date: later[10]?.date, asOf: historyAsOf },
    });
  });

  it("keeps planned forecast output structurally separate from completed history", () => {
    const historyInput = replayInput(knownZeroDays());
    const forecast = projectCommonLoadTrend({
      baseline: { date: "2026-07-20", longTermLoad: 40, recentLoad: 50 },
      days: [{ date: "2026-07-21", state: "available", load: 70 }],
    });

    expect(forecast).toMatchObject({
      basis: COMMON_LOAD_FORECAST_BASIS,
      policyVersion: COMMON_LOAD_FORECAST_POLICY_VERSION,
    });
    expect(
      commonLoadHistoryReplayInputSchema.safeParse({
        ...historyInput,
        basis: forecast.basis,
      }).success,
    ).toBe(false);
    expect(replay(knownZeroDays())).toMatchObject({
      status: "available",
      identity: { basis: COMMON_LOAD_HISTORY_BASIS },
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
    expect(replay(knownZeroDays(), "Not/A_Timezone")).toMatchObject({
      status: "unavailable",
      reason: "invalid_input",
    });
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

    expect(replay(days, "UTC")).toMatchObject({ status: "unavailable", reason: "invalid_input" });
  });
});
