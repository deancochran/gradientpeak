import { buildTrainingPathLoadMetrics } from "./trainingPathLoadMetrics";

describe("buildTrainingPathLoadMetrics", () => {
  it("shows finite workload and intensity without exposing incomplete evidence", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveLoad: 42,
        effectiveIntensity: 0.7,
      }),
    ).toEqual([
      { label: "Common Load", value: "42" },
      { label: "Normalized intensity", value: "Moderate · 0.70" },
      { label: "Remaining", value: "—" },
    ]);
  });

  it("shows a known completed-load subtotal without a partial label", () => {
    expect(
      buildTrainingPathLoadMetrics({
        effectiveLoadStatus: "partial",
        effectiveCompletedLoadStatus: "partial",
        effectiveCompletedLoad: 24,
      }),
    ).toContainEqual({ label: "Completed", value: "24" });
  });
});
