import { describe, expect, it } from "vitest";
import { buildCanonicalDailyLoads, buildWorkloadEnvelopes } from "../workload";

const start = new Date("2026-02-01T00:00:00.000Z");
const end = new Date("2026-02-28T00:00:00.000Z");
const allDates = Array.from(
  { length: 28 },
  (_, index) => `2026-02-${String(index + 1).padStart(2, "0")}`,
);
const bikeIdentity = {
  sport: "bike" as const,
  method: "power_threshold" as const,
  source: "activity_analysis" as const,
  version: "1" as const,
  calibration: { type: "ftp_watts" as const, value: 250 },
};
const runIdentity = {
  sport: "run" as const,
  method: "run_pace_threshold" as const,
  source: "activity_analysis" as const,
  version: "1" as const,
  calibration: { type: "threshold_speed_mps" as const, value: 4 },
};

describe("workload utils", () => {
  it("keeps same-day TRIMP and TSS in separate identity series", () => {
    const result = buildCanonicalDailyLoads(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          sport: "cycling",
          trimp: 100,
          tss: 50,
          tss_identity: bikeIdentity,
          load_method: "heart_rate_reserve",
          load_version: "1",
          load_source_definition: "activity_analysis",
        },
      ],
      start,
      start,
    );

    expect(result.source).toBe("mixed");
    expect(result.dailyLoads).toEqual([]);
    expect(result.series.map(({ identity }) => identity.family)).toEqual(["trimp", "tss"]);
    expect(buildWorkloadEnvelopes([], start, end).acwr.value).toBeNull();
  });

  it("sums compatible same-day observations without flattening identities", () => {
    const result = buildCanonicalDailyLoads(
      [
        { started_at: "2026-02-01T08:00:00.000Z", tss: 30, tss_identity: bikeIdentity },
        { started_at: "2026-02-01T12:00:00.000Z", tss: 20, tss_identity: bikeIdentity },
      ],
      start,
      start,
    );

    expect(result.series).toHaveLength(1);
    expect(result.series[0]?.observations).toEqual([
      { date: "2026-02-01", state: "observed", value: 50 },
    ]);
  });

  it("returns unavailable rather than numeric workload for mixed sports", () => {
    const activities = allDates.flatMap((date) => [
      { started_at: `${date}T06:00:00.000Z`, tss: 50, tss_identity: bikeIdentity },
      { started_at: `${date}T18:00:00.000Z`, tss: 25, tss_identity: runIdentity },
    ]);
    const workload = buildWorkloadEnvelopes(activities, start, end);

    expect(workload.acwr).toMatchObject({ value: null, reasonCode: "mixed_identities" });
    expect(workload.monotony).toMatchObject({ value: null, reasonCode: "mixed_identities" });
  });

  it("returns unavailable when a load method changes", () => {
    const activities = allDates.map((date, index) => ({
      started_at: `${date}T06:00:00.000Z`,
      tss: 40 + index,
      tss_identity:
        index < 14
          ? bikeIdentity
          : {
              ...bikeIdentity,
              method: "heart_rate_reserve" as const,
              calibration: {
                type: "heart_rate_reserve_bpm" as const,
                resting: 50,
                maximum: 190,
              },
            },
    }));

    expect(buildWorkloadEnvelopes(activities, start, end).acwr).toMatchObject({
      value: null,
      reasonCode: "mixed_identities",
    });
  });

  it("returns unavailable when the threshold calibration changes", () => {
    const activities = allDates.map((date, index) => ({
      started_at: `${date}T06:00:00.000Z`,
      tss: 40 + index,
      tss_identity: {
        ...bikeIdentity,
        calibration: { type: "ftp_watts" as const, value: index < 14 ? 250 : 275 },
      },
    }));

    expect(buildWorkloadEnvelopes(activities, start, end).acwr).toMatchObject({
      value: null,
      reasonCode: "mixed_identities",
    });
  });

  it("distinguishes missing days from explicit known rest coverage", () => {
    const activity = [
      {
        started_at: "2026-02-28T06:00:00.000Z",
        tss: 50,
        tss_identity: bikeIdentity,
      },
    ];
    const missing = buildWorkloadEnvelopes(activity, start, end);
    const covered = buildWorkloadEnvelopes(activity, start, end, {
      knownRestDates: allDates.slice(0, -1),
    });

    expect(missing.acwr).toMatchObject({ value: null, reasonCode: "unknown_days" });
    expect(covered.acwr.reasonCode).not.toBe("unknown_days");
    expect(covered.acwr.coverageDays).toBe(28);
    expect(covered.acwr.identity).toMatchObject({
      sport: "bike",
      family: "tss",
      method: "power_threshold",
      version: "1",
      sourceDefinition: 'activity_analysis:{"type":"ftp_watts","value":250}',
    });
  });

  it("computes a fully identified TRIMP series without requiring a TSS identity", () => {
    const activities = allDates.map((date, index) => ({
      started_at: `${date}T06:00:00.000Z`,
      sport: "run",
      trimp: 40 + index,
      load_method: "heart_rate_reserve",
      load_version: "1",
      load_source_definition: "activity_analysis",
    }));
    const workload = buildWorkloadEnvelopes(activities, start, end);

    expect(workload.acwr.value).toBeTypeOf("number");
    expect(workload.acwr.identity).toMatchObject({
      sport: "run",
      family: "trimp",
      method: "heart_rate_reserve",
      version: "1",
      sourceDefinition: "activity_analysis",
    });
    expect(workload.monotony.value).toBeTypeOf("number");
  });

  it("supports current router TSS-only inputs through canonical identity", () => {
    const activities = allDates.map((date, index) => ({
      started_at: `${date}T06:00:00.000Z`,
      tss: 40 + index,
      tss_identity: bikeIdentity,
    }));
    const workload = buildWorkloadEnvelopes(activities, start, end);

    expect(workload.acwr.value).toBeTypeOf("number");
    expect(workload.acwr.source).toBe("tss");
    expect(workload.monotony.value).toBeTypeOf("number");
  });
});
