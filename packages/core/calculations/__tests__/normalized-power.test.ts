import { describe, expect, it } from "vitest";
import { calculateNormalizedPower } from "../normalized-power";

describe("Normalized Power", () => {
  it("should return 0 for empty stream", () => {
    expect(calculateNormalizedPower([])).toBe(0);
  });

  it("should return average power for constant effort", () => {
    const stream = Array(60).fill(200);
    expect(calculateNormalizedPower(stream)).toBeCloseTo(200, 1);
  });

  it("should return higher NP for variable effort", () => {
    // 300s at 100W, 300s at 300W
    const stream = [...Array(300).fill(100), ...Array(300).fill(300)];
    const avg = 200;
    const np = calculateNormalizedPower(stream);
    expect(np).toBeGreaterThan(avg);
  });
});
