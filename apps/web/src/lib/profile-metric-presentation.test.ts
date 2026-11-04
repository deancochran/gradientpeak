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
      "Supporting Physiology",
      "Recovery",
      "Body/Aerobic",
    ]);
    expect(profileMetricOptions.map((metric) => metric.type).sort()).toEqual(
      [...profileMetricTypes].sort(),
    );
    expect(hasCanonicalProfileMetricCoverage()).toBe(true);
  });

  it("formats canonical profile metrics in athlete-facing units", () => {
    expect(formatProfileMetricDisplayValue({ metric_type: "max_hr", value: 195 })).toBe("195 bpm");
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
