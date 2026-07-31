import { describe, expect, it } from "vitest";
import { derivePowerCurveFromFTP, estimatePowerForDuration } from "../power-curve";

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
