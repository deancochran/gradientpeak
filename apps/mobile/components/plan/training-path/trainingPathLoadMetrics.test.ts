import { describe, expect, it } from "vitest";
import { buildTrainingPathLoadMetrics } from "./trainingPathLoadMetrics";

describe("buildTrainingPathLoadMetrics", () => {
  it("does not relabel or compare legacy TSS values as common Load", () => {
    expect(
      buildTrainingPathLoadMetrics({
        completedLoadTss: 60,
        plannedLoadTss: 80,
        targetLoadTss: 100,
        tentativePlannedLoadTss: 20,
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

  it("shows known zero only when the effective result says it is known", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "known_zero",
        effectiveLoad: 0,
        effectiveIntensity: null,
      }),
    ).toEqual([
      { label: "Load", value: "0" },
      { label: "Intensity", value: "—" },
    ]);
  });

  it("leads selected summaries with effective Load and RMS Intensity", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "complete",
        effectiveLoad: 86.4,
        effectiveIntensity: 0.78,
        effectiveCompletedLoad: 42,
        effectiveRemainingLoad: 44.4,
        effectiveTentativeLoad: 12,
        targetLoadTss: 80,
      }),
    ).toEqual([
      { label: "Load", value: "86" },
      { label: "Intensity", value: "Moderate · 0.78" },
      { label: "Completed", value: "42" },
      { label: "Remaining", value: "44" },
      { label: "Tentative", value: "12" },
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
      { label: "Load", value: "42 incomplete" },
      { label: "Intensity", value: "Moderate · 0.70 incomplete" },
      { label: "Completed", value: "Unavailable" },
    ]);
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "unavailable",
        effectiveLoad: null,
        effectiveIntensity: null,
      }),
    ).toEqual([
      { label: "Load", value: "Unavailable" },
      { label: "Intensity", value: "Unavailable" },
    ]);
  });
});
