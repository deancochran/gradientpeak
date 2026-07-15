import { describe, expect, it } from "vitest";
import { buildTrainingPathLoadMetrics } from "./trainingPathLoadMetrics";

describe("buildTrainingPathLoadMetrics", () => {
  it("keeps recommended, planned, tentative, and completed values distinct", () => {
    expect(
      buildTrainingPathLoadMetrics({
        completedLoadTss: 60,
        plannedLoadTss: 80,
        targetLoadTss: 100,
        tentativePlannedLoadTss: 20,
      }),
    ).toEqual([
      { label: "Recommended", value: "100 TSS" },
      { label: "Planned", value: "80 TSS" },
      { label: "Tentative", value: "20 TSS" },
      { label: "Completed", value: "60 TSS" },
    ]);
  });

  it("reports unavailable completed load without treating it as zero", () => {
    expect(
      buildTrainingPathLoadMetrics({
        completedLoadTss: 0,
        hasCompletedActivityWithoutLoad: true,
        plannedLoadTss: 50,
        targetLoadTss: 70,
      }),
    ).toContainEqual({ label: "Completed", value: "Unavailable" });
    expect(
      buildTrainingPathLoadMetrics({
        completedLoadTss: 35,
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toContainEqual({ label: "Completed", value: "35 TSS + unavailable" });
    expect(
      buildTrainingPathLoadMetrics({ completedLoadTss: null, completedLoadUnavailable: true }),
    ).toContainEqual({ label: "Completed", value: "Unavailable" });
  });

  it("omits an unavailable recommendation while preserving explicit recommended zero", () => {
    expect(buildTrainingPathLoadMetrics({ plannedLoadTss: 30, targetLoadTss: null })).toEqual([
      { label: "Planned", value: "30 TSS" },
    ]);
    expect(
      buildTrainingPathLoadMetrics({
        hasTargetLoad: false,
        plannedLoadTss: 30,
        targetLoadTss: 0,
      }),
    ).toEqual([{ label: "Planned", value: "30 TSS" }]);
    expect(buildTrainingPathLoadMetrics({ plannedLoadTss: 30, targetLoadTss: 0 })).toContainEqual({
      label: "Recommended",
      value: "0 TSS",
    });
  });

  it("omits completed load in the date-agnostic builder", () => {
    expect(
      buildTrainingPathLoadMetrics(
        { completedLoadTss: 60, plannedLoadTss: 80, targetLoadTss: 100 },
        { includeCompleted: false },
      ),
    ).toEqual([
      { label: "Recommended", value: "100 TSS" },
      { label: "Planned", value: "80 TSS" },
    ]);
  });
});
