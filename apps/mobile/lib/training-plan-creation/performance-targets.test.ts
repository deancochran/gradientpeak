import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { describe, expect, it } from "vitest";
import {
  resolveMobilePlanningPerformanceTargets,
  shouldReplaceMobilePlanningAthleteContext,
} from "./performance-targets";

const asOf = "2026-06-01T00:00:00.000Z";

describe("resolveMobilePlanningPerformanceTargets", () => {
  it("preserves an owner-only canonical snapshot and its evidence identity", () => {
    const snapshot = buildPerformanceTargetFactsFixture({
      asOf,
      planningThresholdPowerWatts: 250,
    });

    expect(
      resolveMobilePlanningPerformanceTargets({
        snapshot,
        fallbackAsOf: "2026-06-02T00:00:00.000Z",
      }),
    ).toBe(snapshot);
    expect(snapshot.cycling.planningThresholdPower.sourceEvidenceIds).toEqual([
      "planning-threshold-power-evidence",
    ]);
  });

  it("uses an explicit unavailable snapshot instead of a numeric fallback on query failure", () => {
    const snapshot = resolveMobilePlanningPerformanceTargets({
      snapshot: null,
      fallbackAsOf: asOf,
    });

    expect(snapshot.asOf).toBe(asOf);
    expect(snapshot.cycling.planningThresholdPower).toMatchObject({
      status: "unavailable",
      value: null,
    });
    expect(snapshot.running.planningThresholdPace.value).toBeNull();
    expect(snapshot.swimming.css.value).toBeNull();
    expect(snapshot.heartRate.bike.lthr.valueBpm).toBeNull();
  });

  it("hydrates initially and on unavailable-to-canonical recovery, but not on refetch", () => {
    expect(
      shouldReplaceMobilePlanningAthleteContext({
        hydratedSource: null,
        nextSource: "unavailable",
      }),
    ).toBe(true);
    expect(
      shouldReplaceMobilePlanningAthleteContext({
        hydratedSource: "unavailable",
        nextSource: "canonical",
      }),
    ).toBe(true);
    expect(
      shouldReplaceMobilePlanningAthleteContext({
        hydratedSource: "canonical",
        nextSource: "canonical",
      }),
    ).toBe(false);
    expect(
      shouldReplaceMobilePlanningAthleteContext({
        hydratedSource: "canonical",
        nextSource: "unavailable",
      }),
    ).toBe(false);
  });
});
