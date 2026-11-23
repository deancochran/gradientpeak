import { describe, expect, it } from "vitest";
import type { LoadDayObservation } from "../load-series";
import {
  buildLoadSeries,
  evaluateLoadSeries,
  loadDayObservationSchema,
  loadSeriesIdentityForAvailableCommonLoad,
  loadSeriesIdentitySchema,
  sameLoadSeriesIdentity,
} from "../load-series";

const loadIdentity = {
  activity_category: "all",
  family: "common_load" as const,
  method: "normalized_power",
  version: "1",
  sourceDefinition: "first_party:ftp-250",
};

describe("load-series contracts", () => {
  it("gives available Common Load its own stable family identity", () => {
    const bike = {
      status: "available",
      model: "gradientpeak_relative_load",
      version: "1",
      activity_category: "bike",
      method: "power_threshold",
      quality: {
        source: "observed_effort",
        observed_at: "2026-07-01T00:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
      },
      thresholdEvidence: null,
      sessionRpeEvidence: null,
      evidenceFingerprint: "calibration:ftp-1",
      computedAsOf: "2026-07-01T00:00:00.000Z",
      contributingDurationSeconds: 3600,
      load: 75,
      intensity: 0.8,
      estimated: false,
    } as const;
    const identity = loadSeriesIdentityForAvailableCommonLoad(bike);
    const otherAdapter = loadSeriesIdentityForAvailableCommonLoad({
      ...bike,
      activity_category: "run",
      method: "run_pace_threshold",
    });

    expect(identity).toEqual({
      activity_category: "all",
      family: "common_load",
      method: "gradientpeak_relative_load",
      version: "1",
      sourceDefinition: "gradientpeak_relative_load",
    });
    expect(sameLoadSeriesIdentity(identity, otherAdapter)).toBe(true);
  });

  it("parses a complete exact identity", () => {
    expect(loadSeriesIdentitySchema.parse(loadIdentity)).toEqual(loadIdentity);
    expect(loadSeriesIdentitySchema.safeParse({ ...loadIdentity, version: "" }).success).toBe(
      false,
    );
    expect(loadSeriesIdentitySchema.safeParse({ ...loadIdentity, family: "trimp" }).success).toBe(
      false,
    );
    expect(
      loadSeriesIdentitySchema.safeParse({
        ...loadIdentity,
        activity_category: "all",
        family: "common_load",
      }).success,
    ).toBe(true);
    expect(
      loadSeriesIdentitySchema.safeParse({ ...loadIdentity, activity_category: "cycling" }).success,
    ).toBe(false);
  });

  it.each([
    [{ ...loadIdentity, family: "trimp" as const }, "family"],
    [{ ...loadIdentity, family: "external_work_kj" as const }, "family"],
    [{ ...loadIdentity, activity_category: "running" }, "activity_category"],
    [{ ...loadIdentity, method: "provider_load" }, "method"],
    [{ ...loadIdentity, version: "2" }, "version"],
    [{ ...loadIdentity, sourceDefinition: "provider:threshold-250" }, "source"],
  ] as const)("treats a changed identity as incompatible", (other, _dimension) => {
    expect(sameLoadSeriesIdentity(loadIdentity, other)).toBe(false);
  });

  it("refuses to flatten observations with mixed identities", () => {
    const result = buildLoadSeries([
      { identity: loadIdentity, date: "2026-07-10", state: "observed", value: 50 },
      {
        identity: { ...loadIdentity, family: "trimp", activity_category: "cycling" },
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
        identity: loadIdentity,
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
