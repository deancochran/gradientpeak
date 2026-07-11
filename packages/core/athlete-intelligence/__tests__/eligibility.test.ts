import { describe, expect, it } from "vitest";

import { resolveFieldEvidenceEligibility } from "../eligibility";
import type { EvidenceItem } from "../evidence-contracts";

const asOf = "2026-07-10T12:00:00.000Z";

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    athleteId: "athlete-1",
    sourceId: "activity:provider:item-1",
    lineageGroupId: "activity:provider:session-1",
    observedAt: "2026-07-09T12:00:00.000Z",
    rawObservation: { value: 3600, unit: "seconds" },
    sport: "run",
    modality: "duration",
    sourceType: "activity",
    qualityState: "known",
    validityState: "valid",
    compatibilityState: "compatible",
    ...overrides,
  };
}

describe("field evidence eligibility", () => {
  it("accepts only known, valid, compatible evidence at or before asOf without changing raw input", () => {
    const input = evidence();
    const result = resolveFieldEvidenceEligibility({ evidence: input, asOf, requiredSport: "run" });

    expect(result).toMatchObject({
      eligible: true,
      sourceId: input.sourceId,
      lineageGroupId: input.lineageGroupId,
    });
    expect(input.rawObservation.value).toBe(3600);
  });

  it.each([
    ["invalid", evidence({ validityState: "invalid" }), "evidence_invalid"],
    ["future", evidence({ observedAt: "2026-07-11T12:00:00.000Z" }), "evidence_future_observation"],
    [
      "incompatible",
      evidence({ compatibilityState: "incompatible_unit" }),
      "evidence_incompatible_unit",
    ],
    ["unknown quality", evidence({ qualityState: "unknown" }), "evidence_value_unknown"],
  ] as const)("rejects %s evidence with an explicit source and reason", (_label, input, reasonCode) => {
    expect(resolveFieldEvidenceEligibility({ evidence: input, asOf })).toEqual({
      eligible: false,
      sourceId: input.sourceId,
      lineageGroupId: input.lineageGroupId,
      reasonCode,
    });
  });

  it("requires an exact sport match when a calculation has a sport boundary", () => {
    expect(
      resolveFieldEvidenceEligibility({
        evidence: evidence({ sport: "bike" }),
        asOf,
        requiredSport: "run",
      }),
    ).toMatchObject({ eligible: false, reasonCode: "evidence_incompatible_sport" });
    expect(
      resolveFieldEvidenceEligibility({
        evidence: evidence({ sport: null }),
        asOf,
        requiredSport: "run",
      }),
    ).toMatchObject({ eligible: false, reasonCode: "evidence_sport_missing" });
  });
});
