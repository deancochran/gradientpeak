import { describe, it, expect } from "vitest";
import {
  derivePowerCurveFromFTP,
  estimateWPrime,
  estimatePowerForDuration,
  STANDARD_POWER_DURATIONS,
} from "../power-curve";

describe("derivePowerCurveFromFTP", () => {
  it("should generate 10 power efforts from FTP", () => {
    const ftp = 250;
    const curve = derivePowerCurveFromFTP(ftp);

    expect(curve).toHaveLength(10);
    expect(curve.length).toBe(STANDARD_POWER_DURATIONS.length);
  });

  it("should have 60-minute effort close to FTP", () => {
    const ftp = 250;
    const curve = derivePowerCurveFromFTP(ftp);

    const sixtyMinEffort = curve.find((e) => e.duration_seconds === 3600);
    expect(sixtyMinEffort).toBeDefined();
    // 60-min includes W'/3600, so slightly higher than FTP
    expect(sixtyMinEffort!.value).toBeCloseTo(256, 0); // 250 + 20000/3600 ≈ 256
  });

  it("should have 5-second effort significantly higher than FTP", () => {
    const ftp = 250;
    const curve = derivePowerCurveFromFTP(ftp);

    const fiveSecEffort = curve.find((e) => e.duration_seconds === 5);
    expect(fiveSecEffort).toBeDefined();
    expect(fiveSecEffort!.value).toBeGreaterThan(1000);
    expect(fiveSecEffort!.value).toBe(4250); // 250 + 20000/5
  });

  it("should use custom W' if provided", () => {
    const ftp = 250;
    const wPrime = 25000; // Higher anaerobic capacity
    const curve = derivePowerCurveFromFTP(ftp, wPrime);

    const fiveSecEffort = curve.find((e) => e.duration_seconds === 5);
    expect(fiveSecEffort).toBeDefined();
    expect(fiveSecEffort!.value).toBe(5250); // 250 + 25000/5
  });

  it("should have correct format for all efforts", () => {
    const ftp = 250;
    const curve = derivePowerCurveFromFTP(ftp);

    curve.forEach((effort) => {
      expect(effort.effort_type).toBe("power");
      expect(effort.unit).toBe("watts");
      expect(effort.activity_category).toBe("bike");
      expect(effort.value).toBeGreaterThan(0);
      expect(effort.duration_seconds).toBeGreaterThan(0);
    });
  });

  it("should have shorter durations produce higher power", () => {
    const ftp = 250;
    const curve = derivePowerCurveFromFTP(ftp);

    // Power should decrease as duration increases (except FTP at 60m)
    for (let i = 0; i < curve.length - 1; i++) {
      expect(curve[i]!.value).toBeGreaterThanOrEqual(curve[i + 1]!.value);
    }
  });

  it("should throw error for invalid FTP", () => {
    expect(() => derivePowerCurveFromFTP(0)).toThrow(
      "FTP must be greater than 0",
    );
    expect(() => derivePowerCurveFromFTP(-100)).toThrow(
      "FTP must be greater than 0",
    );
  });

  it("should throw error for negative W'", () => {
    expect(() => derivePowerCurveFromFTP(250, -1000)).toThrow(
      "W' (anaerobic capacity) must be non-negative",
    );
  });

  it("should work with W' = 0", () => {
    const ftp = 250;
    const curve = derivePowerCurveFromFTP(ftp, 0);

    // All efforts should equal FTP when W' = 0
    curve.forEach((effort) => {
      expect(effort.value).toBe(250);
    });
  });
});

describe("estimateWPrime", () => {
  it("should estimate higher W' for males than females", () => {
    const weight = 70;
    const maleWPrime = estimateWPrime(weight, "male", "recreational");
    const femaleWPrime = estimateWPrime(weight, "female", "recreational");

    expect(maleWPrime).toBeGreaterThan(femaleWPrime);
  });

  it("should estimate higher W' for trained athletes", () => {
    const weight = 70;
    const recWPrime = estimateWPrime(weight, "male", "recreational");
    const trainedWPrime = estimateWPrime(weight, "male", "trained");
    const eliteWPrime = estimateWPrime(weight, "male", "elite");

    expect(trainedWPrime).toBeGreaterThan(recWPrime);
    expect(eliteWPrime).toBeGreaterThan(trainedWPrime);
  });

  it("should scale W' with weight", () => {
    const lightWPrime = estimateWPrime(60, "male", "recreational");
    const heavyWPrime = estimateWPrime(80, "male", "recreational");

    expect(heavyWPrime).toBeGreaterThan(lightWPrime);
    expect(heavyWPrime / lightWPrime).toBeCloseTo(80 / 60, 1);
  });

  it("should return reasonable values for 70kg recreational male", () => {
    const wPrime = estimateWPrime(70, "male", "recreational");
    expect(wPrime).toBeGreaterThan(15000);
    expect(wPrime).toBeLessThan(20000);
  });

  it("should throw error for invalid weight", () => {
    expect(() => estimateWPrime(0, "male", "recreational")).toThrow(
      "Weight must be greater than 0",
    );
    expect(() => estimateWPrime(-10, "male", "recreational")).toThrow(
      "Weight must be greater than 0",
    );
  });
});

describe("estimatePowerForDuration", () => {
  it("should calculate power for specific duration", () => {
    const ftp = 250;
    const wPrime = 20000;

    const power5min = estimatePowerForDuration(ftp, wPrime, 300);
    expect(power5min).toBe(317); // 250 + 20000/300

    const power20min = estimatePowerForDuration(ftp, wPrime, 1200);
    expect(power20min).toBe(267); // 250 + 20000/1200
  });

  it("should match curve values", () => {
    const ftp = 250;
    const wPrime = 20000;
    const curve = derivePowerCurveFromFTP(ftp, wPrime);

    const fiveMinEffort = curve.find((e) => e.duration_seconds === 300);
    expect(fiveMinEffort).toBeDefined();
    const calculatedPower = estimatePowerForDuration(ftp, wPrime, 300);

    expect(calculatedPower).toBe(fiveMinEffort!.value);
  });

  it("should throw error for invalid inputs", () => {
    expect(() => estimatePowerForDuration(0, 20000, 300)).toThrow();
    expect(() => estimatePowerForDuration(250, 20000, 0)).toThrow();
    expect(() => estimatePowerForDuration(250, -1000, 300)).toThrow();
  });
});
