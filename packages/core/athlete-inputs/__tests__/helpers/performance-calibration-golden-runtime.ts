import {
  type CriticalPowerEvaluation,
  evaluateCriticalPower,
  type ObservedCriticalPowerEffort,
} from "../../../calculations/critical-power";
import type {
  DirectThresholdMetricObservation,
  ResolveCanonicalThresholdsInput,
  ThresholdActivityEffortObservation,
} from "../../canonical-thresholds";
import type {
  GoldenEvaluation,
  GoldenEvidence,
  GoldenScenario,
  performanceCalibrationGoldenScenarios,
} from "../fixtures/performance-calibration-goldens";

export type PerformanceCalibrationGapCode =
  | "resolver-missing-aging-use-case-policy"
  | "resolver-missing-calibration-envelope"
  | "resolver-missing-clear-lifecycle"
  | "resolver-missing-critical-speed"
  | "resolver-missing-effective-available-time"
  | "resolver-missing-freshness-policy"
  | "resolver-missing-last-known-envelope"
  | "resolver-missing-lock-expiry"
  | "resolver-missing-lthr-max-hr"
  | "resolver-missing-protocol-gates"
  | "resolver-missing-provenance-lineage"
  | "resolver-missing-same-activity-exclusion"
  | "load-lthr-resolver-boundary"
  | "outer-api-web-mobile-parity";

export type GoldenScenarioId = (typeof performanceCalibrationGoldenScenarios)[number]["id"];

export interface GoldenCoverageManifestEntry {
  id: GoldenScenarioId;
  status: "partial" | "blocked";
  gaps: readonly PerformanceCalibrationGapCode[];
}

/** Kept in catalog order: a new golden must add an executable coverage disposition. */
export const performanceCalibrationCoverageManifest = [
  {
    id: "locked_override_precedence_and_expiry",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-lock-expiry",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "stale_override_with_fresh_observed_evidence",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-lock-expiry",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "validated_performance_improvement",
    status: "partial",
    gaps: ["resolver-missing-calibration-envelope", "resolver-missing-provenance-lineage"],
  },
  {
    id: "validated_lthr_decline",
    status: "blocked",
    gaps: ["resolver-missing-lthr-max-hr", "resolver-missing-protocol-gates"],
  },
  {
    id: "accepted_threshold_aligned_lthr",
    status: "blocked",
    gaps: [
      "resolver-missing-lthr-max-hr",
      "resolver-missing-protocol-gates",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "abstained_threshold_aligned_lthr",
    status: "blocked",
    gaps: ["resolver-missing-lthr-max-hr", "resolver-missing-protocol-gates"],
  },
  {
    id: "duplicate_efforts_one_lineage",
    status: "partial",
    gaps: ["resolver-missing-calibration-envelope", "resolver-missing-provenance-lineage"],
  },
  {
    id: "provider_seed_replaced_by_observed",
    status: "partial",
    gaps: ["resolver-missing-calibration-envelope", "resolver-missing-provenance-lineage"],
  },
  {
    id: "validated_css_vs_generic_swim",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-protocol-gates",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "accepted_critical_power_fit",
    status: "partial",
    gaps: ["resolver-missing-calibration-envelope", "resolver-missing-provenance-lineage"],
  },
  {
    id: "abstained_critical_power_fit",
    status: "partial",
    gaps: ["resolver-missing-calibration-envelope", "resolver-missing-provenance-lineage"],
  },
  {
    id: "accepted_running_critical_speed_fit",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-critical-speed",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "abstained_running_critical_speed_fit",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-critical-speed",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "measured_max_hr_over_age_prior",
    status: "blocked",
    gaps: ["resolver-missing-lthr-max-hr"],
  },
  { id: "age_prior_only", status: "blocked", gaps: ["resolver-missing-lthr-max-hr"] },
  {
    id: "historical_effective_time_boundary",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-effective-available-time",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "delayed_import_availability_boundary",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-effective-available-time",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "equal_timestamp_independent_evidence",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-effective-available-time",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "same_activity_lineage_exclusion",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-same-activity-exclusion",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "stale_direct_calibration_hr_fallback",
    status: "blocked",
    gaps: ["resolver-missing-lthr-max-hr", "load-lthr-resolver-boundary"],
  },
  { id: "no_evidence", status: "partial", gaps: ["resolver-missing-calibration-envelope"] },
  {
    id: "partial_evidence",
    status: "partial",
    gaps: ["resolver-missing-calibration-envelope", "resolver-missing-critical-speed"],
  },
  {
    id: "explicit_clear_reveals_fallback",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-clear-lifecycle",
      "resolver-missing-provenance-lineage",
    ],
  },
  {
    id: "exact_freshness_boundaries",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-freshness-policy",
      "resolver-missing-last-known-envelope",
    ],
  },
  { id: "cross_sport_lthr_rejection", status: "blocked", gaps: ["resolver-missing-lthr-max-hr"] },
  {
    id: "ordinary_peak_hr_lower_bound",
    status: "blocked",
    gaps: ["resolver-missing-lthr-max-hr", "resolver-missing-protocol-gates"],
  },
  {
    id: "aging_evidence_use_case_gate",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "resolver-missing-aging-use-case-policy",
      "resolver-missing-freshness-policy",
    ],
  },
  {
    id: "api_web_mobile_parity",
    status: "partial",
    gaps: [
      "resolver-missing-calibration-envelope",
      "outer-api-web-mobile-parity",
      "resolver-missing-provenance-lineage",
    ],
  },
] as const satisfies readonly GoldenCoverageManifestEntry[];

interface RetainedEvidence {
  sourceId: string;
  lineageGroupId: string;
  method: string;
  effectiveFrom: string;
  availableAt: string;
}

export interface GoldenRuntimeAdapter {
  input: ResolveCanonicalThresholdsInput;
  retainedEvidence: readonly RetainedEvidence[];
  unsupportedEvidence: readonly { sourceId: string; gap: PerformanceCalibrationGapCode }[];
  criticalPowerEvaluation: CriticalPowerEvaluation | null;
}

function directMetric(evidence: GoldenEvidence): DirectThresholdMetricObservation | null {
  if (evidence.measurement.kind !== "scalar") return null;
  const threshold =
    evidence.calibrationType === "cycling_ftp"
      ? "cycling_ftp"
      : evidence.calibrationType === "running_threshold_pace"
        ? "running_threshold_pace"
        : evidence.calibrationType === "swimming_css"
          ? "swimming_css"
          : null;
  if (threshold === null) return null;
  const source =
    evidence.source === "manual_override"
      ? "manual"
      : evidence.source === "validated_test"
        ? "validated_test"
        : evidence.source === "provider_seed"
          ? "provider"
          : evidence.source === "modeled_seed"
            ? "modeled"
            : null;
  if (source === null) return null;
  return {
    threshold,
    value: evidence.measurement.value,
    observedAt: evidence.observedAt,
    source,
    calculationVersion: evidence.method,
    locked: evidence.source === "manual_override" && evidence.lockedUntil !== undefined,
  };
}

function activityEffort(evidence: GoldenEvidence): ThresholdActivityEffortObservation | null {
  if (evidence.measurement.kind !== "effort") return null;
  if (evidence.calibrationType === "cycling_ftp" && evidence.measurement.unit === "W") {
    return {
      activity_category: "bike",
      metric: "power",
      value: evidence.measurement.value,
      durationSeconds: evidence.measurement.durationSeconds,
      observedAt: evidence.observedAt,
      observationKind: "actual",
      evidence: "imported_activity_stream",
    };
  }
  if (
    (evidence.calibrationType === "running_critical_speed" ||
      evidence.calibrationType === "running_threshold_pace") &&
    evidence.measurement.unit === "m"
  ) {
    return {
      activity_category: "run",
      metric: "speed",
      value: evidence.measurement.value / evidence.measurement.durationSeconds,
      durationSeconds: evidence.measurement.durationSeconds,
      observedAt: evidence.observedAt,
      observationKind: "actual",
      evidence: "imported_activity_stream",
    };
  }
  if (evidence.calibrationType === "swimming_css" && evidence.measurement.unit === "m") {
    return {
      activity_category: "swim",
      metric: "speed",
      value: evidence.measurement.value / evidence.measurement.durationSeconds,
      durationSeconds: evidence.measurement.durationSeconds,
      observedAt: evidence.observedAt,
      observationKind: "actual",
      evidence: "imported_activity_stream",
    };
  }
  return null;
}

function criticalPowerEffort(evidence: GoldenEvidence): ObservedCriticalPowerEffort | null {
  if (
    evidence.calibrationType !== "cycling_critical_power" ||
    evidence.measurement.kind !== "effort" ||
    evidence.measurement.unit !== "W" ||
    evidence.activityId === undefined
  ) {
    return null;
  }
  return {
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: evidence.measurement.durationSeconds,
    value: evidence.measurement.value,
    unit: "watts",
    recorded_at: evidence.observedAt,
    activity_id: evidence.activityId,
    source: "imported",
    method: "activity_file_best_effort",
    provenance: { activity_id: evidence.activityId, derived_from: "activity_file_stream" },
  };
}

function unsupportedGap(evidence: GoldenEvidence): PerformanceCalibrationGapCode {
  if (evidence.calibrationType === "lthr" || evidence.calibrationType === "max_hr") {
    return "resolver-missing-lthr-max-hr";
  }
  if (evidence.calibrationType === "running_critical_speed") {
    return "resolver-missing-critical-speed";
  }
  if (evidence.source === "clear") return "resolver-missing-clear-lifecycle";
  if (evidence.measurement.kind === "swim_trial") return "resolver-missing-protocol-gates";
  return "resolver-missing-provenance-lineage";
}

/**
 * Adapts only values accepted by today's Core contracts. Every fixture datum is retained or
 * recorded as a typed missing boundary; expected golden values are never an input to this adapter.
 */
export function adaptGoldenScenario(
  scenario: GoldenScenario,
  evaluation: GoldenEvaluation,
): GoldenRuntimeAdapter {
  const retainedEvidence = scenario.evidence.map((evidence) => ({
    sourceId: evidence.sourceId,
    lineageGroupId: evidence.lineageGroupId,
    method: evidence.method,
    effectiveFrom: evidence.effectiveFrom,
    availableAt: evidence.availableAt,
  }));
  const directMetrics: DirectThresholdMetricObservation[] = [];
  const activityEfforts: ThresholdActivityEffortObservation[] = [];
  const unsupportedEvidence: { sourceId: string; gap: PerformanceCalibrationGapCode }[] = [];
  const cpEfforts: ObservedCriticalPowerEffort[] = [];

  for (const evidence of scenario.evidence) {
    const direct = directMetric(evidence);
    if (direct !== null) {
      directMetrics.push(direct);
      continue;
    }
    const effort = activityEffort(evidence);
    if (effort !== null) {
      activityEfforts.push(effort);
      continue;
    }
    const cpEffort = criticalPowerEffort(evidence);
    if (cpEffort !== null) {
      cpEfforts.push(cpEffort);
      continue;
    }
    unsupportedEvidence.push({ sourceId: evidence.sourceId, gap: unsupportedGap(evidence) });
  }
  if (scenario.profileContext) {
    unsupportedEvidence.push({
      sourceId: scenario.profileContext.dateOfBirthSourceId,
      gap: "resolver-missing-lthr-max-hr",
    });
  }

  const criticalPowerEvaluation = cpEfforts.length === 0 ? null : evaluateCriticalPower(cpEfforts);
  const criticalPower =
    criticalPowerEvaluation?.status === "accepted"
      ? {
          valueWatts: criticalPowerEvaluation.model.cp,
          observedAt: scenario.evidence.reduce(
            (latest, evidence) => (evidence.observedAt > latest ? evidence.observedAt : latest),
            scenario.evidence[0]?.observedAt ?? evaluation.asOf,
          ),
          evidenceFingerprint: cpEfforts.map((effort) => effort.activity_id).join("|"),
          calculationVersion: "critical_power_2p_v1",
        }
      : null;

  return {
    input: {
      now: evaluation.asOf,
      freshnessWindowMs: 84 * 24 * 60 * 60 * 1000,
      directMetrics,
      activityEfforts,
      criticalPower,
    },
    retainedEvidence,
    unsupportedEvidence,
    criticalPowerEvaluation,
  };
}
