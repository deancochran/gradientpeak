import { describe, expect, it } from "vitest";
import { buildPerformanceModelSnapshotFixture } from "../../testing/performance-model";

import { calculateCriticalPowerCapability } from "../policies/critical-power-capability";

describe("critical power capability", () => {
  it("projects distinct CP and reserve outputs from the canonical cycling model", () => {
    const performanceModel = buildPerformanceModelSnapshotFixture();
    const result = calculateCriticalPowerCapability({ model: { performanceModel } });

    expect(result.criticalPowerWatts).toMatchObject({
      state: "estimated",
      unit: "watts",
      reasonCodes: ["canonical_cycling_duration_performance_model"],
    });
    expect(result.criticalPowerWatts.estimate).toBeCloseTo(240);
    expect(result.wPrimeJoules).toMatchObject({
      state: "estimated",
      unit: "joules",
      estimate: 24_000,
      reasonCodes: ["canonical_cycling_duration_performance_model"],
    });
    expect(result.criticalPowerWatts.contributingSourceIds.length).toBeGreaterThan(0);
  });

  it("fails closed instead of rebuilding CP when the canonical model is absent", () => {
    expect(calculateCriticalPowerCapability({ model: {} })).toMatchObject({
      criticalPowerWatts: {
        state: "insufficient_evidence",
        reasonCodes: ["canonical_performance_model_unavailable"],
      },
      wPrimeJoules: {
        state: "insufficient_evidence",
        reasonCodes: ["canonical_performance_model_unavailable"],
      },
    });
  });

  it("preserves canonical evidence identity and confidence", () => {
    const performanceModel = buildPerformanceModelSnapshotFixture();
    const criticalPower = performanceModel.categories.bike.parameters.criticalPower;
    const reserve = performanceModel.categories.bike.parameters.anaerobicReserve;
    const result = calculateCriticalPowerCapability({ model: { performanceModel } });

    expect(result.criticalPowerWatts.contributingSourceIds).toEqual([
      ...new Set(
        [...criticalPower.sourceEvidenceIds, ...reserve.sourceEvidenceIds].map(
          (evidenceId) => `effort:${evidenceId}:value`,
        ),
      ),
    ]);
    expect(result.criticalPowerWatts.uncertainty).toBe(0.1);
  });

  it("returns unsupported outside cycling without relabeling CP as FTP", () => {
    const result = calculateCriticalPowerCapability({
      model: { performanceModel: buildPerformanceModelSnapshotFixture() },
      targetActivityCategory: "run",
    });
    expect(result.criticalPowerWatts).toMatchObject({
      state: "unsupported",
      reasonCodes: ["critical_power_only_supported_for_bike"],
    });
    expect(result).not.toHaveProperty("ftp");
  });
});
