import { describe, expect, it } from "vitest";
import { derivePowerCurveFromFTP, estimatePowerForDuration, estimateWPrime } from "../power-curve";

describe("derivePowerCurveFromFTP", () => {
  it("returns only a modeled 60-minute FTP threshold anchor", () => {
    expect(derivePowerCurveFromFTP(250)).toEqual([
      {
        duration_seconds: 3_600,
        effort_type: "power",
        value: 250,
        unit: "watts",
        activity_category: "bike",
      },
    ]);
  });

  it.each([
    0,
    -100,
    3_001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid FTP %s", (ftp) => {
    expect(() => derivePowerCurveFromFTP(ftp)).toThrow("FTP must be between 1 and 3000 watts");
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
  const observedModel = {
    source: "observed-curve-fit" as const,
    cp: 250,
    wPrime: 20_000,
    fitMinDurationSeconds: 180,
    fitMaxDurationSeconds: 1_200,
  };

  it("predicts within an explicit observed fit span", () => {
    expect(estimatePowerForDuration(observedModel, 300)).toBe(317);
    expect(estimatePowerForDuration(observedModel, 1_200)).toBe(267);
  });

  it("rejects extrapolation outside the fit span and absolute CP domain", () => {
    expect(() => estimatePowerForDuration(observedModel, 179)).toThrow("observed fit span");
    expect(() => estimatePowerForDuration(observedModel, 1_201)).toThrow("observed fit span");
    expect(() =>
      estimatePowerForDuration({ ...observedModel, fitMinDurationSeconds: 60 }, 120),
    ).toThrow("observed fit span");
  });

  it("rejects invalid CP/W' parameters", () => {
    expect(() => estimatePowerForDuration({ ...observedModel, wPrime: 0 }, 300)).toThrow();
    expect(() =>
      estimatePowerForDuration({ ...observedModel, fitMinDurationSeconds: Number.NaN }, 300),
    ).toThrow("valid observed CP/W' fit");
  });
});
