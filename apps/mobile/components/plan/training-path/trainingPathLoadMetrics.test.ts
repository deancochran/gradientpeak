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
    ).toContainEqual({ label: "Completed", value: "—" });
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveLoad: 35,
        effectiveIntensity: 0.6,
        effectiveCompletedLoad: 35,
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toContainEqual({ label: "Completed", value: "35" });
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "unavailable",
        effectiveLoad: null,
        completedLoadUnavailable: true,
      }),
    ).toContainEqual({ label: "Completed", value: "—" });
  });

  it("shows a finite week subtotal without an incomplete-evidence suffix", () => {
    expect(
      buildTrainingPathLoadMetrics({
        completedLoadUnavailable: true,
        effectiveCompletedLoad: 35,
        effectiveIntensity: 0.6,
        effectiveLoad: 35,
        effectiveLoadStatus: "partial",
      }),
    ).toContainEqual({ label: "Completed", value: "35" });
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
      { label: "Remaining", value: "0" },
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

  it("shows finite effective values without exposing their internal partial status", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveLoad: 42,
        effectiveIntensity: 0.7,
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toEqual([
      { label: "Common Load", value: "42" },
      { label: "Normalized intensity", value: "Moderate · 0.70" },
      { label: "Completed", value: "—" },
      { label: "Remaining", value: "—" },
    ]);
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "unavailable",
        effectiveLoad: null,
        effectiveIntensity: null,
      }),
    ).toEqual([
      { label: "Common Load", value: "—" },
      { label: "Normalized intensity", value: "—" },
      { label: "Remaining", value: "—" },
    ]);
  });

  it("keeps unavailable and partial planned values distinct from known zero", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "complete",
        effectiveLoad: 0,
        effectiveIntensity: 0,
        effectiveRemainingLoad: null,
        recommendedLoadStatus: "partial",
        recommendedLoad: 30,
      }),
    ).toEqual(
      expect.arrayContaining([
        { label: "Remaining", value: "—" },
        { label: "Target", value: "30" },
      ]),
    );
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveLoad: 20,
        effectiveIntensity: 0.5,
        effectiveRemainingLoad: 20,
        effectiveRemainingLoadStatus: "partial",
      }),
    ).toContainEqual({ label: "Remaining", value: "20" });
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "complete",
        effectiveLoad: 0,
        effectiveIntensity: 0,
        effectiveRemainingLoad: 0,
        effectiveRemainingLoadStatus: "known_zero",
      }),
    ).toContainEqual({ label: "Remaining", value: "0" });
  });

  it("uses a restored planned subtotal when effective remaining Load is null", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveRemainingLoad: null,
        effectiveRemainingLoadStatus: "unavailable",
        plannedLoad: 60,
        plannedLoadStatus: "partial",
      }),
    ).toContainEqual({ label: "Remaining", value: "60" });
  });
});
