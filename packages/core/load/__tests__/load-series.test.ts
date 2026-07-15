import { describe, expect, it } from "vitest";
import type { LoadDayObservation } from "../load-series";
import {
  buildLoadSeries,
  evaluateLoadSeries,
  loadDayObservationSchema,
  loadSeriesIdentityForActivityTss,
  loadSeriesIdentitySchema,
  sameLoadSeriesIdentity,
} from "../load-series";

const tssIdentity = {
  sport: "cycling",
  family: "tss" as const,
  method: "normalized_power",
  version: "1",
  sourceDefinition: "first_party:ftp-250",
};

describe("load-series contracts", () => {
  it("keeps threshold calibration out of stable TSS series identity", () => {
    const first = loadSeriesIdentityForActivityTss({
      sport: "bike",
      method: "power_threshold",
      source: "activity_analysis",
      version: "1",
      calibration: { type: "ftp_watts", value: 250 },
    });
    const recalibrated = loadSeriesIdentityForActivityTss({
      sport: "bike",
      method: "power_threshold",
      source: "activity_analysis",
      version: "1",
      calibration: { type: "ftp_watts", value: 275 },
    });

    expect(first).toEqual({
      sport: "bike",
      family: "tss",
      method: "power_threshold",
      sourceDefinition: "activity_analysis",
      version: "1",
    });
    expect(sameLoadSeriesIdentity(first, recalibrated)).toBe(true);
  });

  it("parses a complete exact identity", () => {
    expect(loadSeriesIdentitySchema.parse(tssIdentity)).toEqual(tssIdentity);
    expect(loadSeriesIdentitySchema.safeParse({ ...tssIdentity, version: "" }).success).toBe(false);
    expect(loadSeriesIdentitySchema.safeParse({ ...tssIdentity, sport: "all" }).success).toBe(
      false,
    );
  });

  it.each([
    [{ ...tssIdentity, family: "trimp" as const }, "family"],
    [{ ...tssIdentity, family: "external_work_kj" as const }, "family"],
    [{ ...tssIdentity, sport: "running" }, "sport"],
    [{ ...tssIdentity, method: "provider_tss" }, "method"],
    [{ ...tssIdentity, version: "2" }, "version"],
    [{ ...tssIdentity, sourceDefinition: "provider:threshold-250" }, "source"],
  ] as const)("treats a changed identity as incompatible", (other, _dimension) => {
    expect(sameLoadSeriesIdentity(tssIdentity, other)).toBe(false);
  });

  it("refuses to flatten observations with mixed identities", () => {
    const result = buildLoadSeries([
      { identity: tssIdentity, date: "2026-07-10", state: "observed", value: 50 },
      {
        identity: { ...tssIdentity, family: "trimp" },
        date: "2026-07-11",
        state: "observed",
        value: 50,
      },
    ]);
    expect(result).toEqual({ status: "unavailable", reason: "mixed_identities" });
  });

  it("allows only an explicit known-zero day to carry zero as no work", () => {
    expect(
      loadDayObservationSchema.parse({ date: "2026-07-11", state: "known_zero", value: 0 }),
    ).toEqual({
      date: "2026-07-11",
      state: "known_zero",
      value: 0,
    });
    expect(
      loadDayObservationSchema.safeParse({ date: "2026-07-11", state: "unknown", value: 0 })
        .success,
    ).toBe(false);
  });

  it.each([
    ["unknown", null, "unknown_days"],
    ["partial", 10, "partial_days"],
  ] as const)("keeps %s days ineligible rather than coercing them to zero", (state, value, reason) => {
    const incompleteDay: LoadDayObservation =
      state === "unknown"
        ? { date: "2026-07-07", state, value: null }
        : { date: "2026-07-07", state, value };
    const result = evaluateLoadSeries(
      {
        identity: tssIdentity,
        observations: [
          ...Array.from({ length: 6 }, (_, index) => ({
            date: `2026-07-0${index + 1}`,
            state: "observed" as const,
            value: 20,
          })),
          incompleteDay,
        ],
      },
      7,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(reason);
    expect(result.coverage.compatibleDays).toBe(6);
  });
});
