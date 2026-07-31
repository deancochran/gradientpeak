import { describe, expect, it } from "vitest";
import {
  calculateSeasonBestCurve,
  evaluateCriticalPower,
  type ObservedCriticalPowerEffort,
  selectCanonicalCriticalPowerEfforts,
} from "../critical-power";

const createEffort = (
  duration: number,
  value: number,
  overrides: Partial<ObservedCriticalPowerEffort> = {},
): ObservedCriticalPowerEffort => {
  const activityId = overrides.activity_id ?? `activity-${duration}`;
  return {
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: duration,
    value,
    unit: "watts",
    recorded_at: "2026-07-01T00:00:00.000Z",
    activity_id: activityId,
    source: "imported",
    method: "activity_file_best_effort",
    provenance: { activity_id: activityId, derived_from: "activity_file_stream" },
    ...overrides,
  };
};

describe("critical power", () => {
  it("selects deterministic canonical efforts", () => {
    const selected = selectCanonicalCriticalPowerEfforts([
      createEffort(300, 320),
      createEffort(300, 325, { activity_id: "stronger" }),
      createEffort(1_200, 275),
    ]);
    expect(selected.map((effort) => effort.value)).toEqual([325, 275]);
  });

  it("filters a season-best curve", () => {
    expect(
      calculateSeasonBestCurve([
        createEffort(60, 300),
        createEffort(60, 400, { activity_category: "run" }),
      ]).map((effort) => effort.value),
    ).toEqual([300]);
  });

  it("returns an accepted fit with rSquared diagnostics", () => {
    const evaluation = evaluateCriticalPower(
      [180, 300, 600, 1_200].map((duration) => createEffort(duration, 250 + 15_000 / duration)),
    );
    expect(evaluation).toMatchObject({ status: "accepted" });
    if (evaluation.status === "accepted") {
      expect(evaluation.model).toMatchObject({
        cp: 250,
        wPrime: 15_000,
        source: "observed-curve-fit",
      });
      expect(evaluation.model.rSquared).toBeGreaterThan(0.99);
      expect(evaluation.model).not.toHaveProperty("error");
    }
  });

  it("returns an explicit abstention instead of a null compatibility result", () => {
    expect(evaluateCriticalPower([createEffort(180, 330), createEffort(1_200, 260)])).toEqual({
      status: "abstained",
      reason: "insufficient-points",
    });
  });
});
