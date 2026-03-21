import { describe, expect, it } from "vitest";
import {
  calculateTrainingIntensityFactor,
  calculateTrainingTSS,
  calculateTSSFromPower,
  estimateTSS,
  getTrainingIntensityZone,
} from "../tss";

describe("load tss", () => {
  it("calculates power-based TSS for one hour at ftp", () => {
    const powerStream = Array(3601).fill(250);
    const timestamps = Array.from({ length: 3601 }, (_, index) => index);

    const result = calculateTSSFromPower({ powerStream, timestamps, ftp: 250 });

    expect(result.tss).toBe(100);
    expect(result.normalizedPower).toBe(250);
    expect(result.intensityFactor).toBe(1);
    expect(result.variabilityIndex).toBe(1);
  });

  it("provides small reusable intensity helpers", () => {
    expect(calculateTrainingIntensityFactor(250, 250)).toBe(1);
    expect(calculateTrainingTSS(3600, 1)).toBe(100);
    expect(estimateTSS(60, "moderate")).toBeCloseTo(64, 5);
    expect(getTrainingIntensityZone(0.9)).toBe("threshold");
  });
});
