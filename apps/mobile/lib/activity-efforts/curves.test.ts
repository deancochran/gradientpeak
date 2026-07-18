import { describe, expect, it } from "vitest";
import {
  type ActivityEffortCurveRow,
  buildBestActivityEffortCurve,
  formatActivityEffortPresentationValue,
  getActivityEffortCurveBest,
  getActivityEffortObservationStatus,
} from "./curves";

const observedEffort: ActivityEffortCurveRow = {
  id: "observed",
  activity_id: null,
  activity_category: "bike",
  effort_type: "power",
  recorded_at: "2026-03-01T00:00:00.000Z",
  duration_seconds: 3600,
  value: 300,
  unit: "W",
  source: "manual",
  provenance: {
    trusted: true,
    observation_type: "observed",
    entered_by: "athlete",
  },
};

describe("activity effort curves", () => {
  it("presents run and swim speeds as pace", () => {
    expect(
      formatActivityEffortPresentationValue({
        ...observedEffort,
        activity_category: "run",
        effort_type: "speed",
        value: 4,
      }),
    ).toBe("4:10/km");
    expect(
      formatActivityEffortPresentationValue({
        ...observedEffort,
        activity_category: "swim",
        effort_type: "speed",
        value: 1.25,
      }),
    ).toBe("1:20/100m");
  });

  it("passes activity identity when classifying trusted imported observations", () => {
    const imported = {
      ...observedEffort,
      activity_id: "activity-imported",
      source: "imported",
      method: "activity_file_best_effort",
      provenance: {
        derived_from: "activity_file_stream",
        activity_id: "activity-imported",
      },
    };

    expect(getActivityEffortObservationStatus(imported)).toBe("observed");
    expect(
      getActivityEffortObservationStatus({
        ...imported,
        activity_id: "different-activity",
      }),
    ).toBe("review");
  });

  it("excludes modeled, review, and invalid records from observed curves and bests", () => {
    const modeled = {
      ...observedEffort,
      id: "historical-derived-4240",
      value: 4240,
      source: "derived",
      method: "onboarding_modeled_curve",
    };
    const review = { ...observedEffort, id: "review", value: 700 };
    const invalid = { ...observedEffort, id: "invalid", value: 0 };
    const records = [observedEffort, modeled, review, invalid];

    expect(getActivityEffortObservationStatus(modeled)).toBe("modeled");
    expect(getActivityEffortObservationStatus(review)).toBe("review");
    expect(getActivityEffortObservationStatus(invalid)).toBe("invalid");
    expect(buildBestActivityEffortCurve(records)).toEqual([
      { effortId: "observed", label: "1h 00m", duration: 3600, value: 300 },
    ]);
    expect(getActivityEffortCurveBest(records)?.id).toBe("observed");
  });

  it("recognizes onboarding modeled anchors even when legacy provenance omitted source", () => {
    expect(
      getActivityEffortObservationStatus({
        ...observedEffort,
        source: null,
        method: "onboarding_modeled_curve",
      }),
    ).toBe("modeled");
  });
});
