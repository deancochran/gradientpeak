import { describe, expect, it } from "vitest";
import { calculateAvailableCommonLoad } from "../../load/common-relative-load";
import { getHrZoneIndexFromThresholdPercent } from "../../zones/hr";
import { getPowerZoneIndexFromFtpPercent } from "../../zones/power";
import {
  type CanonicalThresholdType,
  canonicalThresholdTypes,
  getEligibleThresholdValue,
  resolveCanonicalThresholds,
} from "../canonical-thresholds";
import {
  performanceCalibrationGoldenScenarios,
  performanceCalibrationPolicyV1Golden,
} from "./fixtures/performance-calibration-goldens";
import {
  adaptGoldenScenario,
  performanceCalibrationCoverageManifest,
} from "./helpers/performance-calibration-golden-runtime";

function scenario(id: string) {
  const found = performanceCalibrationGoldenScenarios.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing golden scenario: ${id}`);
  return found;
}

function evaluation(scenarioId: string, evaluationId: string) {
  const found = scenario(scenarioId).evaluations.find((candidate) => candidate.id === evaluationId);
  if (!found) throw new Error(`Missing golden evaluation: ${scenarioId}:${evaluationId}`);
  return found;
}

function resolve(scenarioId: string, evaluationId: string) {
  const golden = scenario(scenarioId);
  const runtime = adaptGoldenScenario(golden, evaluation(scenarioId, evaluationId));
  return { runtime, resolved: resolveCanonicalThresholds(runtime.input) };
}

type EvaluationDisposition =
  | {
      key: string;
      kind: "resolver";
      threshold: CanonicalThresholdType;
      expected: { value: number | null; source: string; stale: boolean; eligibilityReason: string };
    }
  | {
      key: string;
      kind: "critical-power";
      status: "accepted" | "abstained";
      cp?: number;
      reason?: string;
    }
  | {
      key: string;
      kind: "blocked";
      gap: "resolver-missing-lthr-max-hr";
      unsupportedSourceId?: string;
    };

/** Current production behavior only; these are not copied from golden expected payloads. */
const evaluationDispositions = [
  {
    key: "locked_override_precedence_and_expiry:one-minute-before-expiry",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "manual", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "locked_override_precedence_and_expiry:at-expiry",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "manual", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "stale_override_with_fresh_observed_evidence:fresh-observed-selected",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: {
      value: 285,
      source: "observed_effort",
      stale: false,
      eligibilityReason: "eligible",
    },
  },
  {
    key: "validated_performance_improvement:newer-test-selected",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 270, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "validated_lthr_decline:lower-newer-lthr-selected",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "metric:run-lthr-new",
  },
  {
    key: "accepted_threshold_aligned_lthr:aligned-lthr-estimate-selected",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "metric:bike-lthr-aligned",
  },
  {
    key: "abstained_threshold_aligned_lthr:aligned-intensity-outside-policy-abstains",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "metric:bike-lthr-too-hard",
  },
  {
    key: "duplicate_efforts_one_lineage:one-lineage-remains-insufficient",
    kind: "critical-power",
    status: "abstained",
    reason: "insufficient-points",
  },
  {
    key: "provider_seed_replaced_by_observed:observed-wins",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: {
      value: 285,
      source: "observed_effort",
      stale: false,
      eligibilityReason: "eligible",
    },
  },
  {
    key: "validated_css_vs_generic_swim:qualified-css-selected",
    kind: "resolver",
    threshold: "swimming_css",
    expected: { value: 95, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "accepted_critical_power_fit:cp-250-selected",
    kind: "critical-power",
    status: "accepted",
    cp: 250,
  },
  {
    key: "abstained_critical_power_fit:one-lineage-abstains",
    kind: "critical-power",
    status: "abstained",
    reason: "insufficient-independent-activities",
  },
  {
    key: "accepted_running_critical_speed_fit:critical-speed-4mps",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: {
      value: 239.99999999999997,
      source: "observed_effort",
      stale: false,
      eligibilityReason: "eligible",
    },
  },
  {
    key: "abstained_running_critical_speed_fit:partial-curve-abstains",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: { value: null, source: "unknown", stale: false, eligibilityReason: "unknown" },
  },
  {
    key: "measured_max_hr_over_age_prior:measured-run-max-selected",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "metric:run-max-hr-test",
  },
  {
    key: "age_prior_only:age-prior-estimate",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "metric:dob-only",
  },
  {
    key: "historical_effective_time_boundary:activity-before-effective-time",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "historical_effective_time_boundary:activity-at-effective-time",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "historical_effective_time_boundary:activity-after-effective-time",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "delayed_import_availability_boundary:calculated-before-import",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "delayed_import_availability_boundary:recalculated-after-import",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "equal_timestamp_independent_evidence:equal-time-independent-selected",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "same_activity_lineage_exclusion:same-lineage-excluded-even-at-equality",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: {
      value: 285,
      source: "observed_effort",
      stale: false,
      eligibilityReason: "eligible",
    },
  },
  {
    key: "stale_direct_calibration_hr_fallback:hr-fallback-load",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "metric:fresh-bike-lthr",
  },
  {
    key: "no_evidence:unknown-without-evidence",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: null, source: "unknown", stale: false, eligibilityReason: "unknown" },
  },
  {
    key: "partial_evidence:partial-remains-insufficient",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: { value: null, source: "unknown", stale: false, eligibilityReason: "unknown" },
  },
  {
    key: "explicit_clear_reveals_fallback:provider-visible-after-clear",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 260, source: "manual", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "exact_freshness_boundaries:exactly-42-days-is-fresh",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "exact_freshness_boundaries:after-42-days-is-aging",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "exact_freshness_boundaries:exactly-84-days-is-aging",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "exact_freshness_boundaries:after-84-days-is-stale",
    kind: "resolver",
    threshold: "cycling_ftp",
    expected: { value: null, source: "unknown", stale: false, eligibilityReason: "unknown" },
  },
  {
    key: "cross_sport_lthr_rejection:run-lthr-cannot-calibrate-bike",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "metric:run-lthr-cross-sport",
  },
  {
    key: "ordinary_peak_hr_lower_bound:ordinary-peak-selected-as-lower-bound",
    kind: "blocked",
    gap: "resolver-missing-lthr-max-hr",
    unsupportedSourceId: "effort:ordinary-bike-peak-hr",
  },
  {
    key: "aging_evidence_use_case_gate:aging-zones-eligible",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "aging_evidence_use_case_gate:aging-planning-ineligible",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
  {
    key: "api_web_mobile_parity:cross-consumer-presentation",
    kind: "resolver",
    threshold: "running_threshold_pace",
    expected: { value: 250, source: "validated_test", stale: false, eligibilityReason: "eligible" },
  },
] as const satisfies readonly EvaluationDisposition[];

describe("performance calibration golden Core boundaries", () => {
  it("has one ordered partial or blocked manifest entry for every golden", () => {
    expect(performanceCalibrationCoverageManifest.map(({ id }) => id)).toEqual(
      performanceCalibrationGoldenScenarios.map(({ id }) => id),
    );
    expect(performanceCalibrationCoverageManifest).toHaveLength(28);
    expect(
      performanceCalibrationCoverageManifest.filter((entry) => entry.status === "partial"),
    ).toHaveLength(20);
    expect(
      performanceCalibrationCoverageManifest.filter((entry) => entry.status === "blocked"),
    ).toHaveLength(8);
    for (const entry of performanceCalibrationCoverageManifest) {
      expect(entry.gaps.length, entry.id).toBeGreaterThan(0);
      if (entry.status === "partial") {
        expect(entry.gaps).toContain("resolver-missing-calibration-envelope");
      }
    }
  });

  it("has an ordered current-production or blocked disposition for every evaluation", () => {
    const fixtureKeys = performanceCalibrationGoldenScenarios.flatMap((golden) =>
      golden.evaluations.map((goldenEvaluation) => `${golden.id}:${goldenEvaluation.id}`),
    );
    expect(evaluationDispositions.map(({ key }) => key)).toEqual(fixtureKeys);
    expect(evaluationDispositions).toHaveLength(36);
    expect(canonicalThresholdTypes).toEqual([
      "cycling_ftp",
      "running_threshold_pace",
      "swimming_css",
    ]);

    for (const disposition of evaluationDispositions) {
      const [scenarioId, evaluationId] = disposition.key.split(":");
      if (!scenarioId || !evaluationId)
        throw new Error(`Invalid disposition key: ${disposition.key}`);
      const runtime = adaptGoldenScenario(
        scenario(scenarioId),
        evaluation(scenarioId, evaluationId),
      );
      expect(runtime.retainedEvidence).toHaveLength(scenario(scenarioId).evidence.length);
      const resolved = resolveCanonicalThresholds(runtime.input);

      if (disposition.kind === "resolver") {
        expect(resolved[disposition.threshold]).toMatchObject(disposition.expected);
      } else if (disposition.kind === "critical-power") {
        if (disposition.status === "accepted") {
          expect(runtime.criticalPowerEvaluation).toMatchObject({
            status: "accepted",
            model: { cp: disposition.cp },
          });
        } else {
          expect(runtime.criticalPowerEvaluation).toEqual({
            status: "abstained",
            reason: disposition.reason,
          });
        }
      } else {
        expect(canonicalThresholdTypes).not.toContain("lthr");
        expect(canonicalThresholdTypes).not.toContain("max_hr");
        if ("unsupportedSourceId" in disposition) {
          expect(runtime.unsupportedEvidence).toContainEqual({
            sourceId: disposition.unsupportedSourceId,
            gap: disposition.gap,
          });
        } else {
          expect(runtime.unsupportedEvidence).toEqual([]);
        }
      }
    }
  });

  it("executes supported FTP precedence and unknown outcomes without copying golden expected payloads", () => {
    expect(
      resolve("stale_override_with_fresh_observed_evidence", "fresh-observed-selected").resolved
        .cycling_ftp.value,
    ).toBe(285);
    expect(
      resolve("validated_performance_improvement", "newer-test-selected").resolved.cycling_ftp
        .value,
    ).toBe(270);
    expect(
      resolve("provider_seed_replaced_by_observed", "observed-wins").resolved.cycling_ftp.value,
    ).toBe(285);
    expect(resolve("no_evidence", "unknown-without-evidence").resolved.cycling_ftp).toMatchObject({
      value: null,
      source: "unknown",
      eligibilityReason: "unknown",
    });
  });

  it("runs the CSS scalar result while preserving the unimplemented protocol gate as evidence", () => {
    const result = resolve("validated_css_vs_generic_swim", "qualified-css-selected");
    expect(result.resolved.swimming_css.value).toBe(95);
    expect(result.runtime.unsupportedEvidence).toContainEqual({
      sourceId: "effort:css-test-400",
      gap: "resolver-missing-protocol-gates",
    });
    expect(result.runtime.input.activityEfforts).toHaveLength(1);
    const genericOnly = resolveCanonicalThresholds({
      ...result.runtime.input,
      directMetrics: [],
    });
    expect(genericOnly.swimming_css.value).toBeCloseTo(100 / (1560 / 1200), 8);
  });

  it("chains an accepted CP fit into canonical cycling-power fallback and preserves one-lineage abstention", () => {
    const accepted = resolve("accepted_critical_power_fit", "cp-250-selected");
    expect(accepted.runtime.criticalPowerEvaluation).toMatchObject({
      status: "accepted",
      model: { cp: 250 },
    });
    expect(accepted.resolved.cycling_power).toMatchObject({ kind: "critical_power", value: 250 });

    const abstained = resolve("abstained_critical_power_fit", "one-lineage-abstains");
    expect(abstained.runtime.criticalPowerEvaluation).toEqual({
      status: "abstained",
      reason: "insufficient-independent-activities",
    });
  });

  it("proves the real resolver eligibility boundary for the golden FTP", () => {
    const { resolved } = resolve("validated_performance_improvement", "newer-test-selected");
    const ftp = getEligibleThresholdValue(resolved.cycling_ftp);
    expect(ftp).toBe(270);
    if (ftp === null) throw new Error("Expected eligible FTP from the resolver");
    const observedAt = resolved.cycling_ftp.observedAt;
    if (observedAt === null) throw new Error("Resolved FTP must retain its observedAt timestamp");
    expect(observedAt).toBe("2026-07-20T12:00:00.000Z");
  });

  it("runs an independent legacy Common Load owner-boundary check through a test-owned bridge", () => {
    const { resolved } = resolve("validated_performance_improvement", "newer-test-selected");
    const ftp = getEligibleThresholdValue(resolved.cycling_ftp);
    if (ftp === null) throw new Error("Expected eligible FTP from the resolver");
    const observedAt = resolved.cycling_ftp.observedAt;
    if (observedAt === null) throw new Error("Resolved FTP must retain its observedAt timestamp");
    const thresholdLevelActivityPowerWatts = ftp;
    const intensity = thresholdLevelActivityPowerWatts / ftp;

    // Core currently lacks the calibration envelope needed to transport resolver freshness and
    // provenance into legacy Load. This test-owned bridge proves only the Load owner boundary.
    const load = calculateAvailableCommonLoad({
      activity_category: "bike",
      method: "power_threshold",
      quality: {
        source: resolved.cycling_ftp.source,
        observed_at: observedAt,
        confidence: resolved.cycling_ftp.confidence,
        stale: resolved.cycling_ftp.stale,
        estimate: resolved.cycling_ftp.estimate,
        calculation_version: resolved.cycling_ftp.calculationVersion,
        evidence_fingerprint: "golden:validated_performance_improvement",
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: ftp,
        unit: "watts",
        source: resolved.cycling_ftp.source,
        observedAt,
        validAt: "2026-07-20T12:00:00.000Z",
        freshness: "current",
        calculationVersion: resolved.cycling_ftp.calculationVersion,
        sourceFingerprint: "golden:validated_performance_improvement",
      },
      evidenceFingerprint: "golden:validated_performance_improvement:load",
      computedAsOf: "2026-07-30T12:00:00.000Z",
      estimated: resolved.cycling_ftp.estimate,
      contributingDurationSeconds: 3600,
      intensity,
    });
    expect(load).toMatchObject({ status: "available", load: 100, intensity: 1 });
    expect(
      performanceCalibrationCoverageManifest.find(
        (entry) => entry.id === "validated_performance_improvement",
      )?.gaps,
    ).toContain("resolver-missing-calibration-envelope");
  });

  it("executes every accepted FTP and LTHR zone boundary example", () => {
    for (const golden of performanceCalibrationPolicyV1Golden.zones.classificationGoldens
      .cyclingFtp) {
      expect(getPowerZoneIndexFromFtpPercent(golden.percent) + 1).toBe(golden.zone);
    }
    for (const golden of performanceCalibrationPolicyV1Golden.zones.classificationGoldens
      .sportLthr) {
      expect(getHrZoneIndexFromThresholdPercent(golden.percent) + 1).toBe(golden.zone);
    }
  });

  it("keeps currently unimplemented lifecycle and temporal mismatches visible", () => {
    const lockPreExpiry = resolve(
      "locked_override_precedence_and_expiry",
      "one-minute-before-expiry",
    ).resolved.cycling_ftp.value;
    const lockAtExpiry = resolve("locked_override_precedence_and_expiry", "at-expiry").resolved
      .cycling_ftp.value;
    expect(lockPreExpiry).toBe(250);
    expect(lockAtExpiry).toBe(lockPreExpiry);
    expect(
      resolve("historical_effective_time_boundary", "activity-before-effective-time").resolved
        .cycling_ftp.value,
    ).toBe(250);
    expect(
      resolve("delayed_import_availability_boundary", "calculated-before-import").resolved
        .running_threshold_pace.value,
    ).toBe(250);
    expect(
      resolve("equal_timestamp_independent_evidence", "equal-time-independent-selected").resolved
        .cycling_ftp.value,
    ).toBe(250);
    expect(
      resolve("same_activity_lineage_exclusion", "same-lineage-excluded-even-at-equality").resolved
        .cycling_ftp.value,
    ).toBe(285);
    expect(
      resolve("explicit_clear_reveals_fallback", "provider-visible-after-clear").resolved
        .cycling_ftp.value,
    ).toBe(260);
    expect(
      resolve("exact_freshness_boundaries", "after-42-days-is-aging").resolved.cycling_ftp,
    ).toMatchObject({ value: 250, stale: false });
    expect(
      resolve("aging_evidence_use_case_gate", "aging-planning-ineligible").resolved
        .running_threshold_pace,
    ).toMatchObject({ value: 250, stale: false });
    expect(
      resolve("exact_freshness_boundaries", "after-84-days-is-stale").resolved.cycling_ftp,
    ).toMatchObject({ value: null, eligibilityReason: "unknown" });
    expect(
      performanceCalibrationCoverageManifest.find(
        (entry) => entry.id === "exact_freshness_boundaries",
      ),
    ).toMatchObject({
      gaps: [
        "resolver-missing-calibration-envelope",
        "resolver-missing-freshness-policy",
        "resolver-missing-last-known-envelope",
      ],
    });
  });

  it("exposes current exact-1200 run behavior instead of a critical-speed fit", () => {
    expect(
      resolve("accepted_running_critical_speed_fit", "critical-speed-4mps").resolved
        .running_threshold_pace.value,
    ).toBeCloseTo(240, 8);
    expect(
      resolve("abstained_running_critical_speed_fit", "partial-curve-abstains").resolved
        .running_threshold_pace.value,
    ).toBeNull();
    expect(
      resolve("partial_evidence", "partial-remains-insufficient").resolved.running_threshold_pace
        .value,
    ).toBeNull();
  });

  it("records current duplicate-lineage CP and Core parity behavior", () => {
    expect(
      resolve("duplicate_efforts_one_lineage", "one-lineage-remains-insufficient").runtime
        .criticalPowerEvaluation,
    ).toEqual({ status: "abstained", reason: "insufficient-points" });
    expect(
      resolve("api_web_mobile_parity", "cross-consumer-presentation").resolved
        .running_threshold_pace.value,
    ).toBe(250);
  });

  it("does not construct an LTHR resolver result for the blocked HR fallback Load golden", () => {
    const result = resolve("stale_direct_calibration_hr_fallback", "hr-fallback-load");
    expect(result.resolved.cycling_ftp).toMatchObject({
      value: null,
      eligibilityReason: "unknown",
    });
    expect(result.runtime.unsupportedEvidence).toContainEqual({
      sourceId: "metric:fresh-bike-lthr",
      gap: "resolver-missing-lthr-max-hr",
    });
    expect(
      performanceCalibrationCoverageManifest.find(
        (entry) => entry.id === "stale_direct_calibration_hr_fallback",
      ),
    ).toMatchObject({
      status: "blocked",
      gaps: ["resolver-missing-lthr-max-hr", "load-lthr-resolver-boundary"],
    });
  });
});
