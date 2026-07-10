import { describe, expect, it } from "vitest";

import {
  athleteMetricRoleByType,
  athleteMetricRoleSchema,
  athleteMetricTypeSchema,
  evidenceEligibilitySchema,
  evidenceExclusionReasonCodeSchema,
  evidenceItemSchema,
  rawObservationSchema,
  resolveEvidenceEligibility,
} from "../evidence-contracts";

const observedAt = "2026-07-10T10:00:00.000Z";
const asOf = "2026-07-10T11:00:00.000Z";

function evidence(overrides: Record<string, unknown> = {}) {
  return evidenceItemSchema.parse({
    athleteId: "athlete-1",
    sourceId: "metric:external:ftp:2026-07-10",
    lineageGroupId: "metric:ftp-history",
    observedAt,
    rawObservation: { value: 250, unit: "W" },
    sport: "cycling",
    modality: "power",
    sourceType: "profile_metric",
    qualityState: "known",
    validityState: "valid",
    compatibilityState: "compatible",
    ...overrides,
  });
}

describe("evidence contracts", () => {
  it("keeps unknown evidence distinct from numeric zero", () => {
    const unknown = resolveEvidenceEligibility({
      evidence: evidence({ rawObservation: { value: null, unit: "W" } }),
      asOf,
    });
    const zero = resolveEvidenceEligibility({
      evidence: evidence({ rawObservation: { value: 0, unit: "W" } }),
      asOf,
    });

    expect(unknown).toEqual({ eligible: false, reasonCode: "evidence_value_unknown" });
    expect(zero).toMatchObject({
      eligible: true,
      evidence: { rawObservation: { value: 0, unit: "W" } },
    });
  });

  it("excludes a missing unit with a machine-readable reason", () => {
    expect(
      resolveEvidenceEligibility({
        evidence: evidence({ rawObservation: { value: 250, unit: null } }),
        asOf,
      }),
    ).toEqual({ eligible: false, reasonCode: "evidence_unit_unknown" });
  });

  it.each([
    [{ validityState: "invalid" }, "evidence_invalid"],
    [{ validityState: "unknown" }, "evidence_value_unknown"],
    [{ validityState: "insufficient" }, "evidence_insufficient"],
    [{ qualityState: "insufficient" }, "evidence_insufficient"],
    [{ qualityState: "unknown" }, "evidence_value_unknown"],
    [{ compatibilityState: "incompatible_unit" }, "evidence_incompatible_unit"],
    [{ compatibilityState: "incompatible_modality" }, "evidence_incompatible_modality"],
    [{ compatibilityState: "unsupported" }, "evidence_unsupported"],
  ])("excludes %j evidence", (override, reasonCode) => {
    expect(resolveEvidenceEligibility({ evidence: evidence(override), asOf })).toEqual({
      eligible: false,
      reasonCode,
    });
  });

  it("excludes observations after asOf without temporal leakage", () => {
    expect(
      resolveEvidenceEligibility({
        evidence: evidence({ observedAt: "2026-07-10T11:00:00.001Z" }),
        asOf,
      }),
    ).toEqual({ eligible: false, reasonCode: "evidence_future_observation" });
  });

  it("excludes evidence explicitly marked as a future observation", () => {
    expect(
      resolveEvidenceEligibility({
        evidence: evidence({ validityState: "future_observation" }),
        asOf,
      }),
    ).toEqual({ eligible: false, reasonCode: "evidence_future_observation" });
  });

  it("allows an observation exactly equal to asOf", () => {
    const result = resolveEvidenceEligibility({
      evidence: evidence({ observedAt: asOf }),
      asOf,
    });

    expect(result.eligible).toBe(true);
  });

  it("returns valid compatible evidence with the original raw value and unit", () => {
    const item = evidence();
    const result = resolveEvidenceEligibility({ evidence: item, asOf });

    expect(result).toMatchObject({
      eligible: true,
      evidence: { rawObservation: { value: 250, unit: "W" } },
    });
    expect(evidenceEligibilitySchema.parse(result)).toEqual(result);
  });

  it("freezes raw observations and never mutates or freshness-weights them", () => {
    const item = evidence();
    const before = { ...item.rawObservation };

    resolveEvidenceEligibility({ evidence: item, asOf });

    expect(Object.isFrozen(item.rawObservation)).toBe(true);
    expect(item.rawObservation).toEqual(before);
    expect("freshness" in item.rawObservation).toBe(false);
    expect(rawObservationSchema.safeParse({ value: 250, unit: "W", freshness: 0.5 }).success).toBe(
      false,
    );
  });

  it("rejects malformed observations and non-machine exclusion reasons", () => {
    expect(rawObservationSchema.safeParse({ value: Number.NaN, unit: "W" }).success).toBe(false);
    expect(evidenceExclusionReasonCodeSchema.safeParse("Evidence Invalid").success).toBe(false);
  });
});

describe("athlete metric roles", () => {
  it("maps every approved metric to its exact approved role", () => {
    expect(athleteMetricRoleByType).toEqual({
      ftp: "direct_threshold_evidence",
      lthr: "threshold_intensity_context",
      max_hr: "heart_rate_normalization",
      resting_hr: "recovery_baseline_context",
      vo2_max: "aerobic_high_intensity_context",
      weight_kg: "watts_per_kilogram_input",
      hrv_rmssd: "readiness_context",
      sleep_hours: "readiness_context",
      stress_score: "constraint_context",
      soreness_level: "constraint_context",
      wellness_score: "constraint_context",
      age_years: "adaptation_recovery_context",
    });
    expect(Object.keys(athleteMetricRoleByType)).toEqual(athleteMetricTypeSchema.options);
    expect(
      Object.values(athleteMetricRoleByType).every(
        (role) => athleteMetricRoleSchema.safeParse(role).success,
      ),
    ).toBe(true);
  });

  it("does not promote recovery, wellness, or demographic context to direct evidence", () => {
    expect(athleteMetricRoleByType.hrv_rmssd).toBe("readiness_context");
    expect(athleteMetricRoleByType.sleep_hours).toBe("readiness_context");
    expect(athleteMetricRoleByType.stress_score).toBe("constraint_context");
    expect(athleteMetricRoleByType.soreness_level).toBe("constraint_context");
    expect(athleteMetricRoleByType.wellness_score).toBe("constraint_context");
    expect(athleteMetricRoleByType.age_years).toBe("adaptation_recovery_context");
  });
});
