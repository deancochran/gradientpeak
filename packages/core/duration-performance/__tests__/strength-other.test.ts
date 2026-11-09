import { describe, expect, it } from "vitest";

import {
  type CanonicalSessionPerformanceEvidence,
  calculateStrengthOtherPerformance,
  canonicalStrengthRepeatProtocolEvidenceSchema,
  strengthOtherPerformanceModelSchema,
} from "../strength-other";
import {
  OTHER_PERFORMANCE_FIXTURE_V1 as otherFixture,
  sessionEvidenceFixture,
  STRENGTH_PERFORMANCE_FIXTURE_V1 as strengthFixture,
} from "./fixtures/duration-performance-v1";
import { independentSessionReference } from "./support/independent-reference";

function expectAvailable<T extends { status: string; value: unknown }>(
  outcome: T,
): asserts outcome is T & { status: "available"; value: Exclude<T["value"], null> } {
  expect(outcome.status).toBe("available");
}

describe("strength and other evidence concepts", () => {
  it("calculates repetition volume, density, and repetition-RPE load without a power curve", () => {
    const model = calculateStrengthOtherPerformance(strengthFixture.input);
    expect(strengthOtherPerformanceModelSchema.parse(model)).toEqual(model);
    expectAvailable(model.metrics.strengthVolume);
    expect(model.metrics.strengthVolume.value.totalRepetitions).toBe(
      strengthFixture.expected.totalRepetitions,
    );
    expectAvailable(model.metrics.strengthDensity);
    expect(model.metrics.strengthDensity.value.repetitionsPerActiveMinute).toBeCloseTo(
      strengthFixture.expected.repetitionsPerActiveMinute,
      12,
    );
    expectAvailable(model.metrics.strengthRepetitionSessionLoad);
    expect(model.metrics.strengthRepetitionSessionLoad.value.totalRepetitionRpePoints).toBe(
      strengthFixture.expected.repetitionRpePoints,
    );
    expect(model.metrics.generalDurationSessionLoad).toMatchObject({
      status: "unavailable",
      reasons: ["duration_rpe_fallback_not_used_when_repetition_evidence_available"],
    });
    expectAvailable(model.metrics.repeatability);
    expect(model.metrics.repeatability.value.basis).toBe("fixed_resistance_repetitions");
    if (model.metrics.repeatability.value.basis === "fixed_resistance_repetitions") {
      expect(model.metrics.repeatability.value.resistance).toEqual({
        kind: "fixed_external_load",
        loadKilograms: 80,
      });
      expect(model.metrics.repeatability.value.finalRepetitionRetentionRatio).toBe(
        strengthFixture.expected.finalRepetitionRetentionRatio,
      );
    }
    expect(model).not.toHaveProperty("powerCurve");
    expect(model).not.toHaveProperty("threshold");
  });

  it("agrees with independent session math", () => {
    const reference = independentSessionReference({
      sessions: [
        { repetitions: 50, rpe: 7, activeDurationSeconds: 1_800 },
        { repetitions: 60, rpe: 8, activeDurationSeconds: 2_400 },
      ],
    });
    const model = calculateStrengthOtherPerformance(strengthFixture.input);
    expectAvailable(model.metrics.strengthVolume);
    expectAvailable(model.metrics.strengthDensity);
    expectAvailable(model.metrics.strengthRepetitionSessionLoad);
    expect(model.metrics.strengthVolume.value.totalRepetitions).toBe(reference.repetitions);
    expect(model.metrics.strengthDensity.value.repetitionsPerActiveMinute).toBeCloseTo(
      reference.repetitionsPerActiveMinute,
      12,
    );
    expect(model.metrics.strengthRepetitionSessionLoad.value.totalRepetitionRpePoints).toBe(
      reference.repetitionRpePoints,
    );
  });

  it("uses duration-RPE only as the general fallback and keeps strength concepts unavailable", () => {
    const model = calculateStrengthOtherPerformance(otherFixture.input);
    expect(model.metrics.strengthVolume).toMatchObject({
      status: "unavailable",
      reasons: ["not_applicable_to_other_category"],
    });
    expect(model.metrics.strengthDensity.status).toBe("unavailable");
    expect(model.metrics.strengthRepetitionSessionLoad.status).toBe("unavailable");
    expectAvailable(model.metrics.generalDurationSessionLoad);
    expect(model.metrics.generalDurationSessionLoad.value.totalMinuteRpePoints).toBe(
      otherFixture.expected.minuteRpePoints,
    );
    expectAvailable(model.metrics.repeatability);
    expect(model.metrics.repeatability.value.basis).toBe("fixed_duration_rpe_drift");
    if (model.metrics.repeatability.value.basis === "fixed_duration_rpe_drift") {
      expect(model.metrics.repeatability.value.rpeDrift).toBe(otherFixture.expected.rpeDrift);
    }
  });

  it("withholds repeatability without exact bout/recovery protocol evidence", () => {
    const withoutProtocol = calculateStrengthOtherPerformance({
      ...strengthFixture.input,
      repeatedEffortProtocols: [],
    });
    expect(withoutProtocol.metrics.repeatability).toMatchObject({
      status: "unavailable",
      reasons: ["repeatability_protocol_evidence_missing"],
    });

    const protocol = strengthFixture.input.repeatedEffortProtocols[0];
    if (!protocol || protocol.activityCategory !== "strength") {
      throw new Error("Strength fixture requires strength repeat protocol evidence");
    }
    expect(
      canonicalStrengthRepeatProtocolEvidenceSchema.safeParse({
        ...protocol,
        recoveries: protocol.recoveries.slice(0, 1),
      }).success,
    ).toBe(false);
  });

  it("abstains on category mixing and truncated reads", () => {
    const otherObservation = sessionEvidenceFixture({
      evidenceId: "mixed-other-session",
      activityId: "mixed-other-activity",
      category: "other",
      rpe: 5,
      activeDurationSeconds: 1_800,
      repetitions: null,
    });
    const mixed = calculateStrengthOtherPerformance({
      ...strengthFixture.input,
      observations: [...strengthFixture.input.observations, otherObservation],
    });
    expect(mixed.metrics.strengthVolume).toMatchObject({
      status: "unavailable",
      reasons: ["mixed_activity_category_evidence"],
    });

    const truncated = calculateStrengthOtherPerformance({
      ...strengthFixture.input,
      evidenceReadCoverage: { state: "truncated", reason: "query_limit_reached" },
    });
    expect(truncated.metrics.strengthVolume).toMatchObject({
      status: "unavailable",
      reasons: ["evidence_read_truncated"],
    });
  });

  it("keeps volume available while marking density partial for incomplete timing", () => {
    const first = strengthFixture.input.observations[0];
    if (!first || first.duration.status === "unavailable") {
      throw new Error("Strength fixture requires timed session evidence");
    }
    const partialTiming: CanonicalSessionPerformanceEvidence = {
      ...first,
      duration: {
        status: "partial",
        activeDurationSeconds: first.duration.activeDurationSeconds,
        unit: "seconds",
        reason: "source_incomplete",
      },
    };
    const model = calculateStrengthOtherPerformance({
      ...strengthFixture.input,
      observations: [partialTiming, ...strengthFixture.input.observations.slice(1)],
    });
    expect(model.metrics.strengthVolume.status).toBe("available");
    expect(model.metrics.strengthRepetitionSessionLoad.status).toBe("available");
    expect(model.metrics.strengthDensity).toMatchObject({
      status: "partial",
      reasons: ["partial_session_timing_evidence"],
      confidence: "low",
    });
  });

  it("marks strength aggregates partial when a source session omits repetitions", () => {
    const first = strengthFixture.input.observations[0];
    const second = strengthFixture.input.observations[1];
    if (!first || !second) {
      throw new Error("Strength fixture requires two session observations");
    }
    const missingRepetitions: CanonicalSessionPerformanceEvidence = {
      ...second,
      repetitions: {
        status: "unavailable",
        count: null,
        unit: "repetitions",
        reason: "not_observed",
      },
    };
    const model = calculateStrengthOtherPerformance({
      ...strengthFixture.input,
      observations: [first, missingRepetitions],
    });

    for (const outcome of [
      model.metrics.strengthVolume,
      model.metrics.strengthDensity,
      model.metrics.strengthRepetitionSessionLoad,
    ]) {
      expect(outcome).toMatchObject({
        status: "partial",
        reasons: ["partial_repetition_evidence"],
      });
      expect(outcome.sourceEvidenceIds).toEqual(["strength-session-1", "strength-session-2"]);
    }
  });

  it("marks duration-RPE fallback partial when an eligible session lacks timing", () => {
    const missingTiming = sessionEvidenceFixture({
      evidenceId: "other-session-without-timing",
      activityId: "other-activity-without-timing",
      category: "other",
      rpe: 5,
      activeDurationSeconds: null,
      repetitions: null,
    });
    const model = calculateStrengthOtherPerformance({
      ...otherFixture.input,
      observations: [...otherFixture.input.observations, missingTiming],
    });

    expect(model.metrics.generalDurationSessionLoad).toMatchObject({
      status: "partial",
      reasons: ["partial_session_timing_evidence"],
      sourceEvidenceIds: ["other-session-1", "other-session-without-timing"],
    });
  });
});
