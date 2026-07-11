import { describe, expect, it } from "vitest";
import type { LoadDayObservation, LoadSeries } from "../load-series";
import { computeAcwr, computeExternalWorkKj, computeMonotony, computeTrimp } from "../workload";

const identity = {
  sport: "cycling",
  family: "tss" as const,
  method: "normalized_power",
  version: "1",
  sourceDefinition: "first_party:ftp-250",
};

function series(values: Array<number | "unknown" | "partial">): LoadSeries {
  return {
    identity,
    observations: values.map((value, index): LoadDayObservation => {
      const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
      if (value === "unknown") return { date, state: "unknown", value: null };
      if (value === "partial") return { date, state: "partial", value: 5 };
      if (value === 0) return { date, state: "known_zero", value: 0 };
      return { date, state: "observed", value };
    }),
  };
}

describe("safe workload calculations", () => {
  it("computes ACWR only from 28 compatible days of one identity", () => {
    const result = computeAcwr(series([...Array(21).fill(50), ...Array(7).fill(100)]));
    expect(result.value).toBeCloseTo(1.6, 5);
    expect(result.identity).toEqual(identity);
    expect(result.coverage?.ratio).toBe(1);
  });

  it.each([
    [Array(27).fill(50), "insufficient_coverage"],
    [[...Array(27).fill(50), "unknown"], "unknown_days"],
    [[...Array(27).fill(50), "partial"], "partial_days"],
  ] as const)("abstains from ACWR for inadequate compatible coverage", (values, reason) => {
    const result = computeAcwr(series([...values]));
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe(reason);
  });

  it("counts explicit known-zero days as compatible without treating unknown as zero", () => {
    const result = computeMonotony(series([0, 10, 20, 30, 40, 50, 60]));
    expect(result.value).not.toBeNull();
    expect(result.coverage?.knownZeroDays).toBe(1);
  });

  it("abstains from monotony when the seven-day window is truncated", () => {
    const result = computeMonotony(series([10, 20, 30, 40, 50, 60]));
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("insufficient_coverage");
  });

  it("makes identity-less numeric compatibility calls unavailable", () => {
    expect(computeAcwr(Array(28).fill(50), 28).reasonCode).toBe("identity_required");
    expect(computeMonotony(Array(7).fill(50), 7).reasonCode).toBe("identity_required");
  });

  it("never uses power as a fallback for missing or low-quality HR TRIMP", () => {
    const trimp = computeTrimp({
      coverageDays: 28,
      durationSeconds: 1800,
      avgPowerWatts: 200,
      hrSampleCount: 5,
      hrCoverageRatio: 0.5,
    });
    expect(trimp.value).toBeNull();
    expect(trimp.reasonCode).toBe("hr_quality_low");
  });

  it("exposes power-derived external work separately", () => {
    const work = computeExternalWorkKj({
      coverageDays: 1,
      durationSeconds: 1800,
      avgPowerWatts: 200,
    });
    expect(work.value).toBe(360);
    expect(work.source).toBe("power");
  });
});
