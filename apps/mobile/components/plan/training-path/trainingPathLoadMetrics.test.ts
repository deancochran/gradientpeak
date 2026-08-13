import { describe, expect, it } from "vitest";
import { buildTrainingPathLoadMetrics } from "./trainingPathLoadMetrics";

describe("buildTrainingPathLoadMetrics", () => {
  it("does not reinterpret unversioned planning values as Common Load", () => {
    expect(
      buildTrainingPathLoadMetrics({
        completedLoad: 60,
        plannedLoad: 80,
        targetLoad: 100,
      }),
    ).toEqual([]);
  });

  it("reports unavailable completed load without treating it as zero", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "unavailable",
        effectiveLoad: null,
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toContainEqual({ label: "Completed", value: "Unavailable" });
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveLoad: 35,
        effectiveIntensity: 0.6,
        effectiveCompletedLoad: 35,
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toContainEqual({ label: "Completed", value: "35 + unavailable" });
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "unavailable",
        effectiveLoad: null,
        completedLoadUnavailable: true,
      }),
    ).toContainEqual({ label: "Completed", value: "Unavailable" });
  });

  it("preserves the unavailable suffix for a week summary", () => {
    expect(
      buildTrainingPathLoadMetrics({
        completedLoadUnavailable: true,
        effectiveCompletedLoad: 35,
        effectiveIntensity: 0.6,
        effectiveLoad: 35,
        effectiveLoadStatus: "partial",
      }),
    ).toContainEqual({ label: "Completed", value: "35 + unavailable" });
  });

  it("shows known zero only when the effective result says it is known", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "known_zero",
        effectiveLoad: 0,
        effectiveIntensity: null,
      }),
    ).toEqual([
      { label: "Common Load", value: "0" },
      { label: "Normalized intensity", value: "—" },
    ]);
  });

  it("leads selected summaries with Common Load and normalized intensity", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "complete",
        effectiveLoad: 86.4,
        effectiveIntensity: 0.78,
        effectiveCompletedLoad: 42,
        effectiveRemainingLoad: 44.4,
        targetLoad: 80,
      }),
    ).toEqual([
      { label: "Common Load", value: "86" },
      { label: "Normalized intensity", value: "Moderate · 0.78" },
      { label: "Completed", value: "42" },
      { label: "Remaining", value: "44" },
    ]);
  });

  it("announces partial and unavailable effective values without converting them to zero", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveLoad: 42,
        effectiveIntensity: 0.7,
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toEqual([
      { label: "Common Load", value: "42 incomplete" },
      { label: "Normalized intensity", value: "Moderate · 0.70 incomplete" },
      { label: "Completed", value: "Unavailable" },
    ]);
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "unavailable",
        effectiveLoad: null,
        effectiveIntensity: null,
      }),
    ).toEqual([
      { label: "Common Load", value: "Unavailable" },
      { label: "Normalized intensity", value: "Unavailable" },
    ]);
  });
});
