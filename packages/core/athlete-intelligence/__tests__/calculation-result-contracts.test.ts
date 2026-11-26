import { describe, expect, it } from "vitest";

import {
  calculationReasonCodeSchema,
  calculationResultSchema,
  estimatedResult,
  observedResult,
  unavailableResult,
} from "../calculation-result-contracts";

const sourceId = "activity:ride-1";

describe("calculation result contracts", () => {
  it("retains an observed result's exact raw value and parses constructor output", () => {
    const result = observedResult({
      rawValue: 287.125,
      unit: "W",
      sourceId,
      uncertainty: 0,
    });

    expect(result.estimate).toBe(287.125);
    expect(calculationResultSchema.parse(result)).toEqual(result);
  });

  it.each([
    { unit: null, contributingSourceIds: [sourceId] },
    { unit: "W", contributingSourceIds: [] },
  ])("rejects an observed result without a unit or source", (fields) => {
    expect(
      calculationResultSchema.safeParse({
        estimate: 287,
        uncertainty: 0,
        state: "observed",
        missingDataState: "none",
        reasonCodes: [],
        ...fields,
      }).success,
    ).toBe(false);
  });

  it("requires every estimated-result field and parses constructor output", () => {
    const result = estimatedResult({
      estimate: 300,
      unit: "W",
      uncertainty: 0.25,
      reasonCodes: ["modeled_from_efforts"],
      contributingSourceIds: [sourceId],
    });

    expect(calculationResultSchema.parse(result)).toEqual(result);
    expect(result.reasonCodes).toEqual(["modeled_from_efforts"]);
  });

  it.each([
    "estimate",
    "uncertainty",
    "reasonCodes",
    "contributingSourceIds",
  ])("rejects an estimated result without %s", (field) => {
    const candidate: Record<string, unknown> = {
      estimate: 300,
      unit: "W",
      uncertainty: 0.25,
      state: "estimated",
      missingDataState: "none",
      reasonCodes: ["modeled_from_efforts"],
      contributingSourceIds: [sourceId],
    };
    delete candidate[field];

    expect(calculationResultSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "unknown",
    "insufficient_evidence",
    "unsupported",
  ])("rejects a numeric estimate for the %s state", (state) => {
    expect(
      calculationResultSchema.safeParse({
        estimate: 1,
        unit: "W",
        uncertainty: 1,
        state,
        missingDataState: state === "unsupported" ? "unsupported_input" : "required_data_missing",
        reasonCodes: ["not_available"],
        contributingSourceIds: [],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["observed", "partial"],
    ["estimated", "required_data_missing"],
    ["unknown", "none"],
    ["insufficient_evidence", "incompatible_data"],
    ["unsupported", "partial"],
  ])("rejects invalid %s and %s combinations", (state, missingDataState) => {
    expect(
      calculationResultSchema.safeParse({
        estimate: state === "observed" || state === "estimated" ? 1 : null,
        unit: state === "observed" || state === "estimated" ? "W" : null,
        uncertainty: 0.5,
        state,
        missingDataState,
        reasonCodes: ["test_reason"],
        contributingSourceIds: [sourceId],
      }).success,
    ).toBe(false);
  });

  it("rejects uncertainty outside the bounded range transitively", () => {
    expect(() =>
      estimatedResult({
        estimate: 300,
        unit: "W",
        uncertainty: 1.01,
        reasonCodes: ["modeled_from_efforts"],
        contributingSourceIds: [sourceId],
      }),
    ).toThrow();
  });

  it.each([
    "modeled_from_efforts",
    "source2_missing",
  ])("accepts machine-readable reason code %s", (reasonCode) => {
    expect(calculationReasonCodeSchema.parse(reasonCode)).toBe(reasonCode);
  });

  it.each([
    "UPPER_CASE",
    "2bad",
    "has-hyphen",
    "has space",
    "",
  ])("rejects unstable reason code %s", (reasonCode) => {
    expect(calculationReasonCodeSchema.safeParse(reasonCode).success).toBe(false);
  });

  it("constructs schema-safe unavailable results", () => {
    const results = [
      unavailableResult({
        state: "unknown",
        missingDataState: "required_data_missing",
        uncertainty: 1,
        reasonCodes: ["not_available"],
      }),
      unavailableResult({
        state: "insufficient_evidence",
        missingDataState: "partial",
        uncertainty: 0.75,
        reasonCodes: ["limited_history"],
        contributingSourceIds: [sourceId],
      }),
      unavailableResult({
        state: "unsupported",
        missingDataState: "incompatible_data",
        uncertainty: 1,
        reasonCodes: ["incompatible_modality"],
      }),
    ];

    for (const result of results) {
      expect(result.estimate).toBeNull();
      expect(calculationResultSchema.parse(result)).toEqual(result);
    }
  });
});
