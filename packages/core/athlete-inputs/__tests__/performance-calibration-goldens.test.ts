import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lineageGroupIdSchema, sourceIdSchema } from "../../athlete-intelligence/lineage";
import type { GoldenScenario } from "./fixtures/performance-calibration-goldens";
import {
  performanceCalibrationGoldenScenarios,
  performanceCalibrationGoldenSha256,
  performanceCalibrationPhase0Checkpoint,
  performanceCalibrationPolicyV1Golden,
} from "./fixtures/performance-calibration-goldens";

const goldenScenarios: readonly GoldenScenario[] = performanceCalibrationGoldenScenarios;

const requiredScenarioIds = [
  "locked_override_precedence_and_expiry",
  "stale_override_with_fresh_observed_evidence",
  "validated_performance_improvement",
  "validated_lthr_decline",
  "accepted_threshold_aligned_lthr",
  "abstained_threshold_aligned_lthr",
  "duplicate_efforts_one_lineage",
  "provider_seed_replaced_by_observed",
  "validated_css_vs_generic_swim",
  "accepted_critical_power_fit",
  "abstained_critical_power_fit",
  "accepted_running_critical_speed_fit",
  "abstained_running_critical_speed_fit",
  "measured_max_hr_over_age_prior",
  "age_prior_only",
  "historical_effective_time_boundary",
  "delayed_import_availability_boundary",
  "equal_timestamp_independent_evidence",
  "same_activity_lineage_exclusion",
  "stale_direct_calibration_hr_fallback",
  "no_evidence",
  "partial_evidence",
  "explicit_clear_reveals_fallback",
  "exact_freshness_boundaries",
  "cross_sport_lthr_rejection",
  "ordinary_peak_hr_lower_bound",
  "aging_evidence_use_case_gate",
  "api_web_mobile_parity",
] as const;

function fixturePayload(): string {
  return JSON.stringify({
    checkpoint: performanceCalibrationPhase0Checkpoint,
    policy: performanceCalibrationPolicyV1Golden,
    scenarios: performanceCalibrationGoldenScenarios,
  });
}

/** Catalog-integrity proof only; Phase 1+ executes these goldens through product boundaries. */
describe("Phase 0 performance calibration golden catalog integrity", () => {
  it("freezes the complete required cross-sport scenario catalog", () => {
    const ids = goldenScenarios.map(({ id }) => id);

    expect(ids).toEqual(requiredScenarioIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses validated source and lineage namespaces with deterministic temporal metadata", () => {
    for (const scenario of goldenScenarios) {
      const sourceIds = new Set<string>();
      if (scenario.profileContext) {
        expect(sourceIdSchema.safeParse(scenario.profileContext.dateOfBirthSourceId).success).toBe(
          true,
        );
        expect(lineageGroupIdSchema.safeParse(scenario.profileContext.lineageGroupId).success).toBe(
          true,
        );
        expect(Number.isFinite(Date.parse(scenario.profileContext.availableAt))).toBe(true);
        expect(
          Number.isFinite(Date.parse(`${scenario.profileContext.dateOfBirth}T00:00:00.000Z`)),
        ).toBe(true);
        sourceIds.add(scenario.profileContext.dateOfBirthSourceId);
      }
      for (const evidence of scenario.evidence) {
        expect(sourceIdSchema.safeParse(evidence.sourceId).success, evidence.sourceId).toBe(true);
        expect(
          lineageGroupIdSchema.safeParse(evidence.lineageGroupId).success,
          evidence.lineageGroupId,
        ).toBe(true);
        expect(sourceIds.has(evidence.sourceId), evidence.sourceId).toBe(false);
        sourceIds.add(evidence.sourceId);

        const observedAt = Date.parse(evidence.observedAt);
        const effectiveFrom = Date.parse(evidence.effectiveFrom);
        const availableAt = Date.parse(evidence.availableAt);
        expect(Number.isFinite(observedAt), evidence.observedAt).toBe(true);
        expect(Number.isFinite(effectiveFrom), evidence.effectiveFrom).toBe(true);
        expect(Number.isFinite(availableAt), evidence.availableAt).toBe(true);
        expect(
          effectiveFrom,
          `${scenario.id}:${evidence.sourceId}:effectiveFrom`,
        ).toBeGreaterThanOrEqual(observedAt);
        expect(
          availableAt,
          `${scenario.id}:${evidence.sourceId}:availableAt`,
        ).toBeGreaterThanOrEqual(observedAt);

        if (evidence.lockedUntil) {
          expect(Date.parse(evidence.lockedUntil)).toBeGreaterThan(effectiveFrom);
        }
        if (evidence.activityId) {
          expect(evidence.lineageGroupId).toBe(`activity:${evidence.activityId}`);
          const activityCompletedAt = evidence.activityCompletedAt;
          expect(activityCompletedAt).toBeDefined();
          if (!activityCompletedAt) throw new Error("Activity evidence requires completion time");
          expect(effectiveFrom).toBeGreaterThanOrEqual(Date.parse(activityCompletedAt));
        }
        if (evidence.method === "running_critical_speed_2p_v1") {
          expect(evidence.surfaceClass).toBeDefined();
        }
      }
    }
  });

  it("freezes complete CSS, LTHR, max-HR, and activity-completion protocol controls", () => {
    const css = goldenScenarios.find(({ id }) => id === "validated_css_vs_generic_swim");
    const cssOperation = css?.evidence.filter(({ operationId }) => operationId === "css-test-1");
    expect(cssOperation).toHaveLength(3);
    expect(new Set(cssOperation?.map(({ lineageGroupId }) => lineageGroupId))).toEqual(
      new Set(["manual-test:css-test-1"]),
    );
    expect(cssOperation?.map(({ measurement }) => measurement.kind).sort()).toEqual([
      "scalar",
      "swim_trial",
      "swim_trial",
    ]);

    const allEvidence = goldenScenarios.flatMap(({ evidence }) => evidence);
    const lthrMeasurements = allEvidence
      .map(({ measurement }) => measurement)
      .filter((measurement) => measurement.kind === "hr_window");
    expect(lthrMeasurements.length).toBeGreaterThan(0);
    for (const measurement of lthrMeasurements) expect(measurement.continuous).toBe(true);

    const thresholdTestMeasurements = lthrMeasurements.filter(
      ({ protocolIntent }) => protocolIntent === "threshold_test",
    );
    expect(thresholdTestMeasurements.length).toBeGreaterThan(0);
    for (const measurement of thresholdTestMeasurements) {
      expect(measurement.totalEffortDurationSeconds).toBe(1800);
      expect(measurement.windowStartOffsetSeconds).toBe(600);
      expect(measurement.durationSeconds).toBe(1200);
    }

    const thresholdAlignedEvidence = allEvidence.filter(
      ({ measurement }) =>
        measurement.kind === "hr_window" &&
        measurement.protocolIntent === "threshold_aligned_activity",
    );
    expect(thresholdAlignedEvidence).toHaveLength(2);
    expect(
      thresholdAlignedEvidence.map(({ measurement }) =>
        measurement.kind === "hr_window" ? measurement.directIntensityRatio : null,
      ),
    ).toEqual([1, 1.0501]);
    for (const evidence of thresholdAlignedEvidence) {
      const { measurement } = evidence;
      if (
        measurement.kind !== "hr_window" ||
        measurement.protocolIntent !== "threshold_aligned_activity"
      ) {
        throw new Error("Expected threshold-aligned HR window");
      }
      expect(measurement.totalEffortDurationSeconds).toBe(1200);
      expect(measurement.windowStartOffsetSeconds).toBe(300);
      expect(measurement.durationSeconds).toBe(900);
      const directCalibration = allEvidence.find(
        ({ sourceId }) => sourceId === measurement.directCalibrationSourceId,
      );
      expect(directCalibration).toBeDefined();
      const activityStartedAt = evidence.activityStartedAt;
      if (!directCalibration || !activityStartedAt) {
        throw new Error("Threshold-aligned LTHR requires prior direct calibration");
      }
      expect(directCalibration.sport).toBe(evidence.sport);
      expect(Date.parse(directCalibration.effectiveFrom)).toBeLessThanOrEqual(
        Date.parse(activityStartedAt),
      );
      expect(Date.parse(directCalibration.availableAt)).toBeLessThanOrEqual(
        Date.parse(activityStartedAt),
      );
    }

    const maxHrMeasurement = goldenScenarios
      .flatMap(({ evidence }) => evidence)
      .map(({ measurement }) => measurement)
      .find((measurement) => measurement.kind === "peak_hr");
    expect(maxHrMeasurement).toMatchObject({
      protocolIntent: "max_hr_test",
      rollingMedianSeconds: 5,
      progressiveProtocol: true,
    });
  });

  it("keeps unavailable outcomes non-numeric and eligible outcomes finite and lineage-deduplicated", () => {
    for (const scenario of goldenScenarios) {
      const evidenceIds = new Set(scenario.evidence.map(({ sourceId }) => sourceId));
      if (scenario.profileContext) evidenceIds.add(scenario.profileContext.dateOfBirthSourceId);
      for (const evaluation of scenario.evaluations) {
        const { expected } = evaluation;
        expect(
          expected.reasonCodes.length,
          `${scenario.id}:${evaluation.id}:reasonCodes`,
        ).toBeGreaterThan(0);
        expect(new Set(expected.contributingLineageGroupIds).size).toBe(
          expected.contributingLineageGroupIds.length,
        );
        for (const sourceId of expected.contributingSourceIds) {
          expect(evidenceIds.has(sourceId), `${scenario.id}:${evaluation.id}:${sourceId}`).toBe(
            true,
          );
        }
        for (const exclusion of expected.excluded) {
          expect(
            evidenceIds.has(exclusion.sourceId),
            `${scenario.id}:${evaluation.id}:${exclusion.sourceId}`,
          ).toBe(true);
        }

        if (expected.availability === "eligible") {
          expect(Number.isFinite(expected.value), `${scenario.id}:${evaluation.id}:value`).toBe(
            true,
          );
          expect(expected.uncertainty).toBeGreaterThanOrEqual(0);
          expect(expected.uncertainty).toBeLessThanOrEqual(1);
          expect(expected.contributingSourceIds.length).toBeGreaterThan(0);
        } else {
          expect(expected.value).toBeNull();
          expect(expected.uncertainty).toBeNull();
          expect(expected.contributingSourceIds).toEqual([]);
          if (expected.freshness === "aging" || expected.freshness === "stale") {
            expect(Number.isFinite(expected.lastKnown.value)).toBe(true);
            expect(expected.lastKnown.contributingSourceIds.length).toBeGreaterThan(0);
            for (const sourceId of expected.lastKnown.contributingSourceIds) {
              expect(evidenceIds.has(sourceId)).toBe(true);
            }
          } else {
            expect("lastKnown" in expected).toBe(false);
          }
        }
      }
    }
  });

  it("keeps the accepted API, web, and mobile expected payloads identical", () => {
    const parityEvaluations = goldenScenarios.flatMap(({ evaluations }) =>
      evaluations.filter(({ consumerPresentation }) => consumerPresentation !== undefined),
    );

    expect(parityEvaluations.length).toBeGreaterThan(0);
    for (const evaluation of parityEvaluations) {
      expect(evaluation.consumerPresentation?.web).toEqual(evaluation.consumerPresentation?.api);
      expect(evaluation.consumerPresentation?.mobile).toEqual(evaluation.consumerPresentation?.api);
    }
  });

  it("matches the reviewed deterministic fixture digest", () => {
    const digest = createHash("sha256").update(fixturePayload()).digest("hex");

    expect(digest).toBe(performanceCalibrationGoldenSha256);
  });
});
