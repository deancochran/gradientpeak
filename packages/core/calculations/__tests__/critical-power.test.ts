import { describe, it, expect } from "vitest";
import {
  calculateSeasonBestCurve,
  calculateCriticalPower,
} from "../critical-power";
import type { BestEffort } from "../../schemas/activity_efforts";

// Helper to create mock efforts
const createEffort = (
  duration: number,
  value: number,
  overrides: Partial<BestEffort> = {},
): BestEffort => ({
  id: "mock-id",
  activity_id: "mock-activity",
  profile_id: "mock-profile",
  activity_category: "bike",
  effort_type: "power",
  duration_seconds: duration,
  value,
  unit: "watts",
  recorded_at: new Date().toISOString(),
  ...overrides,
});

describe("calculateSeasonBestCurve", () => {
  it("should filter out non-bike activities", () => {
    const efforts = [
      createEffort(60, 300, { activity_category: "bike" }),
      createEffort(60, 400, { activity_category: "run" }),
    ];
    const result = calculateSeasonBestCurve(efforts);
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(300);
  });

  it("should filter out non-power efforts", () => {
    const efforts = [
      createEffort(60, 300, { effort_type: "power" }),
      createEffort(60, 10, { effort_type: "speed" }),
    ];
    const result = calculateSeasonBestCurve(efforts);
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(300);
  });

  it("should filter out old efforts", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const recent = new Date("2023-12-01T12:00:00Z").toISOString(); // 30 days ago
    const old = new Date("2023-09-01T12:00:00Z").toISOString(); // 120 days ago

    const efforts = [
      createEffort(60, 300, { recorded_at: recent }),
      createEffort(60, 400, { recorded_at: old }),
    ];

    const result = calculateSeasonBestCurve(efforts, { now, days: 90 });
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(300);
  });

  it("should find the max value for each duration", () => {
    const efforts = [
      createEffort(60, 300),
      createEffort(60, 350), // Better 1 min
      createEffort(300, 250),
      createEffort(300, 240),
    ];

    const result = calculateSeasonBestCurve(efforts);
    expect(result).toHaveLength(2);

    const best1Min = result.find((e) => e.duration_seconds === 60);
    const best5Min = result.find((e) => e.duration_seconds === 300);

    expect(best1Min!.value).toBe(350);
    expect(best5Min!.value).toBe(250);
  });
});

describe("calculateCriticalPower", () => {
  it("should return null if insufficient data (less than 2 points in valid range)", () => {
    // Only 1 point in range (3m - 30m)
    const curve = [createEffort(300, 300)];
    const result = calculateCriticalPower(curve);
    expect(result).toBeNull();
  });

  it("should calculate CP and W' correctly for perfect data", () => {
    // Model: CP = 250, W' = 15000
    // P = 250 + 15000/t
    const curve = [
      createEffort(180, 250 + 15000 / 180), // 3 min
      createEffort(300, 250 + 15000 / 300), // 5 min
      createEffort(600, 250 + 15000 / 600), // 10 min
      createEffort(1200, 250 + 15000 / 1200), // 20 min
    ];

    const result = calculateCriticalPower(curve);
    expect(result).not.toBeNull();
    expect(result!.cp).toBe(250);
    expect(result!.wPrime).toBe(15000);
    expect(result!.error).toBeGreaterThan(0.99); // Should be perfect fit
  });

  it("should ignore efforts outside the 3m-30m range", () => {
    // Model: CP = 250, W' = 15000
    const curve = [
      createEffort(60, 1000), // 1 min (Anaerobic skew, ignored)
      createEffort(180, 250 + 15000 / 180), // 3 min (Included)
      createEffort(300, 250 + 15000 / 300), // 5 min (Included)
      createEffort(3600, 200), // 60 min (Aerobic drift, ignored)
    ];

    const result = calculateCriticalPower(curve);
    expect(result).not.toBeNull();
    // Should match the 3m and 5m points exactly
    expect(result!.cp).toBe(250);
    expect(result!.wPrime).toBe(15000);
  });
});
