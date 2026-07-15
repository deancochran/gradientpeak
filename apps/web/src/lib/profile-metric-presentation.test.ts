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

  it("formats sport threshold paces in athlete-facing units", () => {
    expect(
      formatProfileMetricDisplayValue({
        metric_type: "threshold_pace_seconds_per_km",
        value: 270,
      }),
    ).toBe("4:30 /km");
    expect(
      formatProfileMetricDisplayValue({ metric_type: "css_seconds_per_100m", value: 95 }),
    ).toBe("1:35 /100m");
  });

  it("does not present legacy unknown provenance as manual evidence", () => {
    expect(isManualProfileMetric(null)).toBe(false);
    expect(formatObservationSource(null)).toBe("Legacy / unknown");
    expect(isManualProfileMetric("manual")).toBe(true);
  });
});
