import { describe, expect, it } from "vitest";
import { assembleAthleteState } from "../athlete-state";
import type { CalculationResult } from "../calculation-result-contracts";
import { requestScopedAthletePlanningContextSchema } from "../planning-context";
import { buildAthleteIntelligenceModel } from "./model-fixture-builder";

const result = (sourceIds = ["activity:ride-1"]): CalculationResult => ({
  estimate: 1,
  unit: "score",
  uncertainty: 0.1,
  state: "estimated",
  missingDataState: "none",
  reasonCodes: ["derived_from_history"],
  contributingSourceIds: sourceIds,
});
const channel = (identityInputs: unknown, value = result()) => ({
  result: value,
  coverageDomain: "activities" as const,
  policy: { policy: "activity-readiness", version: "v1" },
  identityInputs,
});
function input() {
  const unsupported: CalculationResult = {
    estimate: null,
    unit: null,
    uncertainty: 1,
    state: "unsupported",
    missingDataState: "unsupported_input",
    reasonCodes: ["policy_not_available"],
    contributingSourceIds: [],
  };
  return {
    model: buildAthleteIntelligenceModel(),
    internalResponse: channel({ value: 1 }),
    externalWork: [{ sport: "run", loadIdentity: "trimp:v1", ...channel({ loads: [1, 2] }) }],
    mechanicalExposure: channel(null, unsupported),
    strengthExposure: channel(null, unsupported),
    wellnessContext: channel({ value: 1 }),
    calendarContext: { ...channel({ timezone: "UTC" }), coverageDomain: "schedules" as const },
    policyVersions: [{ policy: "activity-readiness", version: "v1" }],
    limitations: [],
    generatedAt: "2026-07-12T09:00:00.000Z",
  };
}

describe("planning context", () => {
  it("accepts UTC and area/alias TZDB names but rejects fixed abbreviations", () => {
    for (const timezone of ["UTC", "America/New_York", "US/Eastern"])
      expect(requestScopedAthletePlanningContextSchema.safeParse({ timezone }).success).toBe(true);
    for (const timezone of ["EST", "CST", "Not/AZone"])
      expect(requestScopedAthletePlanningContextSchema.safeParse({ timezone }).success).toBe(false);
  });
});

describe("assembleAthleteState", () => {
  it("derives genuine coverage and explicit sport/load identity", () => {
    const state = assembleAthleteState(input());
    expect(state.externalWork[0]).toMatchObject({
      sport: "run",
      loadIdentity: "trimp:v1",
      coverage: { state: "complete", sourceIds: ["activity:ride-1"] },
    });
    expect(state.externalWork[0]).not.toHaveProperty("sourceIds");
    expect(state.mechanicalExposure).toMatchObject({
      result: { state: "unsupported" },
      coverage: { state: "unknown" },
    });
    expect(state.mechanicalExposure.coverage).not.toHaveProperty("estimate");
  });

  it("marks complete reads with insufficient policy evidence partial and truncated reads partial", () => {
    const sparse = input();
    sparse.internalResponse = channel("sparse", {
      estimate: null,
      unit: null,
      uncertainty: 1,
      state: "insufficient_evidence",
      missingDataState: "partial",
      reasonCodes: ["history_sparse"],
      contributingSourceIds: ["activity:ride-1"],
    });
    expect(assembleAthleteState(sparse).internalResponse.coverage).toMatchObject({
      state: "partial",
      reasonCodes: ["history_sparse"],
    });
    const truncated = input();
    truncated.model = buildAthleteIntelligenceModel({
      readCoverage: {
        ...truncated.model.readCoverage,
        activities: { state: "truncated", reason: "query_limit_reached" },
      },
    });
    expect(assembleAthleteState(truncated).externalWork[0]?.coverage).toMatchObject({
      state: "partial",
      reasonCodes: expect.arrayContaining(["activities_read_query_limit_reached"]),
    });
  });

  it("fingerprints the complete result, genuine coverage, raw/calibration inputs, and policy", () => {
    const base = input();
    base.internalResponse = channel({ raw: [1, 2], calibration: 1 });
    const identity = assembleAthleteState(base).internalResponse.calculationIdentity;
    for (const changed of [
      channel({ raw: [1, 3], calibration: 1 }),
      channel({ raw: [1, 2], calibration: 2 }),
      {
        ...channel({ raw: [1, 2], calibration: 1 }),
        policy: { policy: "activity-readiness", version: "v2" },
      },
      channel({ raw: [1, 2], calibration: 1 }, { ...result(), estimate: 2 }),
      channel({ raw: [1, 2], calibration: 1 }, { ...result(), uncertainty: 0.2 }),
      channel(
        { raw: [1, 2], calibration: 1 },
        {
          estimate: null,
          unit: null,
          uncertainty: 1,
          state: "insufficient_evidence",
          missingDataState: "partial",
          reasonCodes: ["history_sparse"],
          contributingSourceIds: ["activity:ride-1"],
        },
      ),
    ]) {
      const candidate = input();
      candidate.internalResponse = changed;
      expect(assembleAthleteState(candidate).internalResponse.calculationIdentity).not.toBe(
        identity,
      );
    }
    const changedWindow = input();
    changedWindow.internalResponse = channel({ raw: [1, 2], calibration: 1 });
    changedWindow.model = buildAthleteIntelligenceModel({
      activityWindow: { ...changedWindow.model.activityWindow, from: "2026-06-11T12:00:00.000Z" },
    });
    expect(assembleAthleteState(changedWindow).internalResponse.calculationIdentity).not.toBe(
      identity,
    );

    const changedCoverage = input();
    changedCoverage.internalResponse = channel({ raw: [1, 2], calibration: 1 });
    changedCoverage.model = buildAthleteIntelligenceModel({
      readCoverage: {
        ...changedCoverage.model.readCoverage,
        activities: { state: "truncated", reason: "query_limit_reached" },
      },
    });
    expect(assembleAthleteState(changedCoverage).internalResponse.calculationIdentity).not.toBe(
      identity,
    );
  });

  it("fingerprints complete canonical referenced evidence when the summarized result is constant", () => {
    const withFingerprintEvidence = () => {
      const value = input();
      const source = value.model.evidenceRegistry["activity:ride-1"];
      if (!source) throw new Error("Fixture source is missing");
      value.model.evidenceRegistry["manual:fingerprint"] = {
        ...source,
        sourceId: "manual:fingerprint",
        lineageGroupId: "manual-test:fingerprint",
        modality: "manual",
        sourceType: "manual_observation",
      };
      value.internalResponse = channel({ summarized: true }, result(["manual:fingerprint"]));
      return value;
    };
    const base = withFingerprintEvidence();
    const summarizedResult = assembleAthleteState(base).internalResponse;

    for (const evidenceChange of [
      { qualityState: "unknown" as const },
      { validityState: "invalid" as const },
      { compatibilityState: "unsupported" as const },
      { rawObservation: { value: 7, unit: "score" } },
      { lineageGroupId: "manual-test:changed-fingerprint" },
    ]) {
      const candidate = withFingerprintEvidence();
      const evidence = candidate.model.evidenceRegistry["manual:fingerprint"];
      if (!evidence) throw new Error("Fingerprint evidence is missing");
      candidate.model.evidenceRegistry["manual:fingerprint"] = { ...evidence, ...evidenceChange };
      const changed = assembleAthleteState(candidate).internalResponse;
      expect(changed.result).toEqual(summarizedResult.result);
      expect(changed.coverage).toEqual(summarizedResult.coverage);
      expect(changed.calculationIdentity).not.toBe(summarizedResult.calculationIdentity);
    }
  });

  it("rejects nonexistent and mismatched sources and canonicalizes duplicate lineage stably", () => {
    const missing = input();
    missing.internalResponse = channel(null, result(["activity:missing"]));
    expect(() => assembleAthleteState(missing)).toThrow(/unknown evidence source/);

    const mismatched = input();
    const mismatchedSource = mismatched.model.evidenceRegistry["activity:ride-1"];
    if (!mismatchedSource) throw new Error("Fixture source is missing");
    mismatched.model.evidenceRegistry["activity:other-athlete"] = {
      ...mismatchedSource,
      sourceId: "activity:other-athlete",
      athleteId: "athlete-2",
    };
    mismatched.internalResponse = channel(null, result(["activity:other-athlete"]));
    expect(() => assembleAthleteState(mismatched)).toThrow();

    const lineage = input();
    const lineageSource = lineage.model.evidenceRegistry["activity:ride-1"];
    if (!lineageSource) throw new Error("Fixture source is missing");
    lineage.model.evidenceRegistry["activity:a-canonical"] = {
      ...lineageSource,
      sourceId: "activity:a-canonical",
    };
    lineage.internalResponse = channel(null, result(["activity:ride-1", "activity:a-canonical"]));
    const forward = assembleAthleteState(lineage).internalResponse;
    lineage.internalResponse = channel(null, result(["activity:a-canonical", "activity:ride-1"]));
    const reverse = assembleAthleteState(lineage).internalResponse;
    expect(forward.coverage.sourceIds).toEqual(["activity:a-canonical"]);
    expect(forward.result.contributingSourceIds).toEqual(["activity:a-canonical"]);
    expect(reverse.calculationIdentity).toBe(forward.calculationIdentity);
  });
});
