import { describe, expect, it } from "vitest";
import {
  describeActivityPlanLoadAvailability,
  formatActivityPlanHeadlineMetric,
} from "./activity-plan-metric-presentation";

describe("load availability explanations", () => {
  it.each([
    ["threshold_missing", "calibration was not supplied to this estimate"],
    ["activity_data_missing", "cannot calculate load from the current activity inputs"],
    ["incomplete_members", "only part of this activity"],
    ["unexpected_reason", "did not return a complete estimate"],
  ])("explains %s without exposing raw reason codes", (reason, text) => {
    expect(
      describeActivityPlanLoadAvailability({
        key: "common_load",
        label: "Load",
        status: "unavailable",
        value: null,
        unit: "score",
        reason,
        provenance: null,
      }),
    ).toContain(text);
  });
  it("has no warning for a complete zero load", () => {
    expect(
      describeActivityPlanLoadAvailability({
        key: "common_load",
        label: "Load",
        status: "available",
        value: 0,
        unit: "score",
        reason: null,
        provenance: "estimated",
      }),
    ).toBeNull();
  });
});

describe("formatActivityPlanHeadlineMetric", () => {
  it.each([
    ["distance", 5_000, "meters", "5 km"],
    ["elapsed_duration", 3_600, "seconds", "1h"],
  ] as const)("renders complete authored %s without a marker", (key, value, unit, expected) => {
    expect(
      formatActivityPlanHeadlineMetric(
        { key, label: key, status: "available", value, unit, reason: null, provenance: "authored" },
        key,
      ),
    ).toBe(expected);
  });

  it.each([
    ["distance", 5_000, "meters", "~5 km"],
    ["elapsed_duration", 3_600, "seconds", "~1h"],
    ["common_load", 64, "score", "~64"],
    ["objective_intensity", 2_439 / 3_500, "ratio", "~0.70"],
  ] as const)("marks complete derived/calculated %s", (key, value, unit, expected) => {
    expect(
      formatActivityPlanHeadlineMetric(
        {
          key,
          label: key,
          status: "available",
          value,
          unit,
          reason: null,
          provenance: "estimated",
        },
        key,
      ),
    ).toBe(expected);
  });

  it.each([
    "distance",
    "elapsed_duration",
    "common_load",
    "objective_intensity",
  ] as const)("hides partial or unavailable %s evidence", (key) => {
    expect(
      formatActivityPlanHeadlineMetric(
        {
          key,
          label: key,
          status: "partial",
          value: 12,
          unit:
            key === "distance"
              ? "meters"
              : key === "elapsed_duration"
                ? "seconds"
                : key === "common_load"
                  ? "score"
                  : "ratio",
          reason: "incomplete_members",
          provenance: "estimated",
        },
        key,
      ),
    ).toBe("—");
    expect(
      formatActivityPlanHeadlineMetric(
        {
          key,
          label: key,
          status: "unavailable",
          value: null,
          unit:
            key === "distance"
              ? "meters"
              : key === "elapsed_duration"
                ? "seconds"
                : key === "common_load"
                  ? "score"
                  : "ratio",
          reason: "not_available",
          provenance: null,
        },
        key,
      ),
    ).toBe("—");
  });
});
