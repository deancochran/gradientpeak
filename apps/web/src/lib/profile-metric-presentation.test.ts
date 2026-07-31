import { profileMetricTypes } from "@repo/core/athlete-inputs";
import { describe, expect, it } from "vitest";
import {
  formatObservationSource,
  formatProfileMetricDisplayValue,
  hasCanonicalProfileMetricCoverage,
  isManualProfileMetric,
  profileMetricGroups,
  profileMetricOptions,
} from "./profile-metric-presentation";

describe("profile metric presentation", () => {
  it("exposes every canonical metric exactly once in the requested groups", () => {
    expect(profileMetricGroups.map((group) => group.label)).toEqual([
      "Load Calibration",
      "Supporting Physiology",
      "Recovery",
      "Body/Aerobic",
    ]);
    expect(profileMetricOptions.map((metric) => metric.type).sort()).toEqual(
      [...profileMetricTypes].sort(),
    );
    expect(hasCanonicalProfileMetricCoverage()).toBe(true);
  });

  it("formats activity-category threshold paces in athlete-facing units", () => {
    expect(
      formatProfileMetricDisplayValue({
        metric_type: "threshold_pace_seconds_per_km",
        value: 270,
      }),
    ).toBe("4:30 /km");
    expect(
      formatProfileMetricDisplayValue({ metric_type: "css_seconds_per_100m", value: 95 }),
    ).toBe("1:35 /100m");
    expect(
      formatProfileMetricDisplayValue({
        metric_type: "threshold_pace_seconds_per_km",
        preferredUnitSystem: "imperial",
        value: 270,
      }),
    ).toBe("7:15 /mi");
    expect(
      formatProfileMetricDisplayValue({
        metric_type: "weight_kg",
        preferredUnitSystem: "imperial",
        value: 70,
      }),
    ).toBe("154.3 lb");
  });

  it("does not present unknown provenance as manual evidence", () => {
    expect(isManualProfileMetric(null)).toBe(false);
    expect(formatObservationSource(null)).toBe("Unknown source");
    expect(isManualProfileMetric("manual")).toBe(true);
  });
});
