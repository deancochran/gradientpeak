import { describe, expect, it } from "vitest";
import {
  computeAcwr,
  computeMonotony,
  computeTrimp,
  getSparseHistoryStatus,
} from "../workload";

describe("workload", () => {
  describe("getSparseHistoryStatus", () => {
    it("returns insufficient_history for less than 7 days", () => {
      expect(getSparseHistoryStatus(0)).toBe("insufficient_history");
      expect(getSparseHistoryStatus(6)).toBe("insufficient_history");
    });

    it("returns provisional between 7 and 27 days", () => {
      expect(getSparseHistoryStatus(7)).toBe("provisional");
      expect(getSparseHistoryStatus(27)).toBe("provisional");
    });

    it("returns stable at 28+ days", () => {
      expect(getSparseHistoryStatus(28)).toBe("stable");
      expect(getSparseHistoryStatus(42)).toBe("stable");
    });
  });

  describe("computeTrimp", () => {
    it("uses hr source when hr quality and inputs are sufficient", () => {
      const result = computeTrimp({
        coverageDays: 28,
        durationSeconds: 3600,
        avgHeartRateBpm: 150,
        restingHeartRateBpm: 60,
        maxHeartRateBpm: 190,
        hrSampleCount: 120,
        hrCoverageRatio: 0.9,
      });

      expect(result.source).toBe("hr");
      expect(result.value).not.toBeNull();
      expect(result.status).toBe("stable");
      expect(result.requiredDays).toBe(7);
    });

    it("falls back to power proxy when hr quality is below threshold", () => {
      const result = computeTrimp({
        coverageDays: 10,
        durationSeconds: 1800,
        avgPowerWatts: 200,
        hrSampleCount: 5,
        hrCoverageRatio: 0.5,
      });

      expect(result.source).toBe("power_proxy");
      expect(result.value).toBe(360);
      expect(result.status).toBe("provisional");
      expect(result.reasonCode).toBe("hr_quality_low");
    });

    it("returns null without valid hr or power proxy inputs", () => {
      const result = computeTrimp({
        coverageDays: 3,
        durationSeconds: 0,
        hrSampleCount: 2,
        hrCoverageRatio: 0.2,
      });

      expect(result.value).toBeNull();
      expect(result.status).toBe("insufficient_history");
      expect(result.reasonCode).toBe("hr_quality_low");
    });
  });

  describe("computeAcwr", () => {
    it("computes acute/chronic workload ratio", () => {
      const dailyLoads = Array(21).fill(50).concat(Array(7).fill(100));
      const result = computeAcwr(dailyLoads, 28);

      expect(result.status).toBe("stable");
      expect(result.requiredDays).toBe(28);
      expect(result.value).toBeCloseTo(1.6, 5);
    });

    it("returns null when chronic load is zero", () => {
      const result = computeAcwr(Array(28).fill(0), 12);

      expect(result.value).toBeNull();
      expect(result.reasonCode).toBe("chronic_load_zero");
      expect(result.status).toBe("provisional");
    });
  });

  describe("computeMonotony", () => {
    it("computes monotony using 7-day mean and standard deviation", () => {
      const result = computeMonotony([10, 20, 30, 40, 50, 60, 70], 28);

      expect(result.status).toBe("stable");
      expect(result.requiredDays).toBe(7);
      expect(result.value).not.toBeNull();
      expect(result.value!).toBeGreaterThan(0);
    });

    it("returns null for zero-variance data to avoid infinity", () => {
      const result = computeMonotony(Array(7).fill(42), 7);

      expect(result.value).toBeNull();
      expect(result.reasonCode).toBe("zero_variance");
    });
  });
});
