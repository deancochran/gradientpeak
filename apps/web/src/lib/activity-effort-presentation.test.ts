import { describe, expect, it } from "vitest";
import {
  type ActivityEffortPresentationRow,
  buildObservedDurationCurve,
  filterEffortsByRange,
  formatActivityEffortCurveDisplayValue,
  formatActivityEffortDisplayValue,
  getActivityEffortCurveValue,
  getActivityEffortDisplayUnitLabel,
  getEffortHistoryForDuration,
} from "./activity-effort-presentation";

const observedProvenance = { observation_type: "observed", trusted: true };

function effort(
  overrides: Partial<ActivityEffortPresentationRow> = {},
): ActivityEffortPresentationRow {
  return {
    activity_category: "bike",
    duration_seconds: 60,
    effort_type: "power",
    id: "effort",
    provenance: observedProvenance,
    recorded_at: "2026-07-14T12:00:00.000Z",
    source: "manual",
    unit: "watts",
    value: 300,
    ...overrides,
  };
}

describe("activity effort presentation", () => {
  it("builds a duration/performance curve from observed best values only", () => {
    const curve = buildObservedDurationCurve([
      effort({ id: "observed-slower", value: 280 }),
      effort({ id: "observed-best", value: 320 }),
      effort({
        duration_seconds: 300,
        id: "derived",
        provenance: { observation_type: "derived" },
        source: "estimated",
        value: 500,
      }),
      effort({
        duration_seconds: 1200,
        id: "review",
        provenance: null,
        source: "manual",
        value: 350,
      }),
      effort({ duration_seconds: 300, id: "observed-300", value: 260 }),
    ]);

    expect(curve).toEqual([
      { durationSeconds: 60, id: "observed-best", label: "1m 00s", value: 320 },
      { durationSeconds: 300, id: "observed-300", label: "5m 00s", value: 260 },
    ]);
  });

  it("keeps selected-duration history separate and newest first", () => {
    expect(
      getEffortHistoryForDuration(
        [
          effort({ id: "older", recorded_at: "2026-07-01T12:00:00.000Z" }),
          effort({ id: "other-duration", duration_seconds: 300 }),
          effort({ id: "newer", recorded_at: "2026-07-10T12:00:00.000Z" }),
        ],
        60,
      ).map((row) => row.id),
    ).toEqual(["newer", "older"]);
  });

  it("filters by a deterministic evidence range without changing row provenance", () => {
    const recent = effort({ id: "recent", source: "provider" });
    const old = effort({ id: "old", recorded_at: "2026-06-01T12:00:00.000Z" });

    expect(filterEffortsByRange([recent, old], 30, new Date("2026-07-20T12:00:00.000Z"))).toEqual([
      recent,
    ]);
    expect(recent.source).toBe("provider");
    expect(recent.provenance).toBe(observedProvenance);
  });

  it("formats swim speed as pace per 100 metres", () => {
    expect(
      formatActivityEffortDisplayValue(
        effort({
          activity_category: "swim",
          effort_type: "speed",
          value: 1.25,
        }),
      ),
    ).toBe("1:20 /100m");
  });

  it("formats run speed and curve values as pace per kilometre", () => {
    expect(
      formatActivityEffortDisplayValue(
        effort({ activity_category: "run", effort_type: "speed", value: 4 }),
      ),
    ).toBe("4:10 /km");
    expect(getActivityEffortCurveValue("run", "speed", 4)).toBe(250);
    expect(getActivityEffortCurveValue("swim", "speed", 1.25)).toBe(80);
    expect(getActivityEffortCurveValue("bike", "power", 320)).toBe(320);
  });

  it("converts running and swim pace rows and chart values for imperial viewers", () => {
    expect(
      formatActivityEffortDisplayValue(
        effort({ activity_category: "run", effort_type: "speed", value: 4 }),
        "imperial",
      ),
    ).toBe("6:42 /mi");
    expect(
      formatActivityEffortDisplayValue(
        effort({ activity_category: "swim", effort_type: "speed", value: 1.25 }),
        "imperial",
      ),
    ).toBe("1:13 /100yd");
    const imperialRunCurveValue = getActivityEffortCurveValue("run", "speed", 4, "imperial");
    expect(imperialRunCurveValue).toBeCloseTo(402.34, 2);
    expect(
      formatActivityEffortCurveDisplayValue({
        activityCategory: "run",
        effortType: "speed",
        unitSystem: "imperial",
        value: imperialRunCurveValue,
      }),
    ).toBe("6:42 /mi");
    expect(getActivityEffortDisplayUnitLabel("swim", "speed", "imperial")).toBe("/100yd");
  });

  it("formats heart-rate effort values in bpm", () => {
    expect(
      formatActivityEffortDisplayValue(
        effort({ activity_category: "bike", effort_type: "heart_rate", unit: "bpm", value: 165 }),
      ),
    ).toBe("165 bpm");
  });
});
