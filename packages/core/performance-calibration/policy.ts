import {
  type CalibrationCandidate,
  type CalibrationEvidenceDiagnostics,
  type CalibrationEvidenceRejectionReason,
  type CalibrationIdentity,
  type CalibrationRecord,
  calibrationCandidateSchema,
  calibrationEvidenceDiagnosticsSchema,
  calibrationIdentitySchema,
  calibrationRecordSchema,
  calibrationStateForSelection,
} from "./contracts";
import {
  type CalibrationRegistryEntry,
  getCalibrationRegistryEntry,
  PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY,
  PERFORMANCE_CALIBRATION_POLICY_VERSION,
} from "./registry";

const DAY_MS = 86_400_000;

export type CalibrationEvidenceEvaluation =
  | { state: "candidate"; value: number; diagnostics: CalibrationEvidenceDiagnostics }
  | {
      state: "rejected";
      reason: CalibrationEvidenceRejectionReason;
      diagnostics: CalibrationEvidenceDiagnostics;
    };

export type CalibrationEvidenceEvaluationInput = {
  identity: CalibrationIdentity;
  sourceAccepted: boolean;
  candidateValue: number | null;
  streamCoverage: number | null;
  supportingOutputCoverage: number | null;
  maximumGapSeconds: number | null;
  selectedWindowSeconds: number | null;
  outputCoefficientOfVariation: number | null;
  supportingThresholdIdentity: CalibrationIdentity | null;
  supportingThresholdValue: number | null;
  thresholdLike: boolean;
  modelQualitySufficient: boolean;
  modelFailureReason: Extract<
    CalibrationEvidenceRejectionReason,
    "model_history_insufficient" | "model_quality_insufficient"
  > | null;
  modelDiagnostics: CalibrationEvidenceDiagnostics["model"];
  completeCssProtocol: boolean;
  gradeCoverage: number | null;
};

function diagnostics(
  input: CalibrationEvidenceEvaluationInput,
  policyReason: string,
): CalibrationEvidenceDiagnostics {
  return calibrationEvidenceDiagnosticsSchema.parse({
    version: 1,
    streamCoverage: input.streamCoverage,
    supportingOutputCoverage: input.supportingOutputCoverage,
    maximumGapSeconds: input.maximumGapSeconds,
    selectedWindowSeconds: input.selectedWindowSeconds,
    outputCoefficientOfVariation: input.outputCoefficientOfVariation,
    supportingThresholdIdentity: input.supportingThresholdIdentity,
    supportingThresholdValue: input.supportingThresholdValue,
    model: input.modelDiagnostics,
    policyReason,
  });
}

function reject(
  input: CalibrationEvidenceEvaluationInput,
  reason: CalibrationEvidenceRejectionReason,
) {
  return { state: "rejected" as const, reason, diagnostics: diagnostics(input, reason) };
}

function valueIsValid(input: CalibrationEvidenceEvaluationInput): boolean {
  const value = input.candidateValue;
  if (value === null || !Number.isFinite(value)) return false;
  if (input.identity.metricKey === "threshold_power") return value >= 50 && value <= 2_000;
  if (input.identity.metricKey === "threshold_heart_rate") return value >= 80 && value <= 220;
  return input.identity.activityCategory === "swim"
    ? value >= 0.1 && value <= 3
    : value >= 0.3 && value <= 13;
}

/** Metric-specific qualification. Callers supply measured diagnostics; labels and summaries are absent. */
export function evaluateCalibrationEvidence(
  raw: CalibrationEvidenceEvaluationInput,
): CalibrationEvidenceEvaluation {
  const input = { ...raw, identity: calibrationIdentitySchema.parse(raw.identity) };
  if (!getCalibrationRegistryEntry(input.identity)) return reject(input, "metric_not_enabled");
  if (!input.sourceAccepted) return reject(input, "source_not_accepted");
  if (input.identity.metricKey === "threshold_power") {
    if (!input.modelQualitySufficient) {
      return reject(input, input.modelFailureReason ?? "model_quality_insufficient");
    }
    if (!valueIsValid(input)) return reject(input, "value_out_of_range");
  } else if (
    input.identity.metricKey === "threshold_speed" &&
    input.identity.activityCategory === "swim"
  ) {
    if (!valueIsValid(input)) return reject(input, "value_out_of_range");
    if (!input.completeCssProtocol) return reject(input, "protocol_incomplete");
  } else {
    if (!valueIsValid(input)) return reject(input, "value_out_of_range");
    if ((input.selectedWindowSeconds ?? 0) < 1_800) return reject(input, "duration_insufficient");
    if ((input.streamCoverage ?? 0) < 0.95) {
      return reject(input, "stream_coverage_insufficient");
    }
    if ((input.maximumGapSeconds ?? Number.POSITIVE_INFINITY) > 5) {
      return reject(input, "stream_gap_exceeded");
    }
    if ((input.outputCoefficientOfVariation ?? Number.POSITIVE_INFINITY) > 0.1) {
      return reject(input, "output_variability_exceeded");
    }
    if (input.identity.metricKey === "threshold_speed") {
      if ((input.gradeCoverage ?? 0) < 0.95) return reject(input, "grade_coverage_insufficient");
    } else {
      if ((input.supportingOutputCoverage ?? 0) < 0.95) {
        return reject(input, "stream_coverage_insufficient");
      }
      if (input.supportingThresholdIdentity === null || input.supportingThresholdValue === null) {
        return reject(input, "supporting_threshold_unavailable");
      }
      const expectedSupportingMetric =
        input.identity.activityCategory === "bike" ? "threshold_power" : "threshold_speed";
      if (
        input.supportingThresholdIdentity.metricKey !== expectedSupportingMetric ||
        input.supportingThresholdIdentity.activityCategory !== input.identity.activityCategory
      ) {
        return reject(input, "supporting_threshold_unavailable");
      }
    }
    if (!input.thresholdLike) return reject(input, "supporting_output_not_threshold_like");
  }
  return {
    state: "candidate",
    value: input.candidateValue as number,
    diagnostics: diagnostics(input, "qualified"),
  };
}

/** Registry-bound evaluator dispatcher; callers cannot substitute another identity. */
export function evaluateRegisteredCalibrationEvidence(
  entry: CalibrationRegistryEntry,
  input: Omit<CalibrationEvidenceEvaluationInput, "identity">,
): CalibrationEvidenceEvaluation {
  return evaluateCalibrationEvidence({ ...input, identity: entry.identity });
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0);
}

function dayNumber(value: string): number {
  const date = new Date(value);
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS,
  );
}

function qualifyingGroups(
  candidates: readonly CalibrationCandidate[],
  size: number,
  minimumDaySpan: number,
  maximumDaySpan: number,
  tolerance: (values: readonly number[]) => boolean,
): CalibrationCandidate[][] {
  const groups: CalibrationCandidate[][] = [];
  const visit = (start: number, selected: CalibrationCandidate[]) => {
    if (selected.length === size) {
      const days = selected.map((candidate) => dayNumber(candidate.observedAt));
      const span = Math.max(...days) - Math.min(...days);
      if (
        new Set(days).size === size &&
        span >= minimumDaySpan &&
        span <= maximumDaySpan &&
        tolerance(selected.map(({ value }) => value))
      ) {
        groups.push(selected);
      }
      return;
    }
    for (let index = start; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (candidate) visit(index + 1, [...selected, candidate]);
    }
  };
  visit(0, []);
  return groups;
}

function mutuallyClose(
  values: readonly number[],
  absolute: number | null,
  relative: number | null,
) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return absolute !== null ? high - low <= absolute : high / low - 1 <= (relative ?? 0);
}

function expiry(effectiveAt: string) {
  return new Date(
    Date.parse(effectiveAt) + PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.expiryDays * DAY_MS,
  ).toISOString();
}

export type CalibrationSelectionResult =
  | { state: "unavailable"; reason: "no_qualifying_evidence" }
  | { state: "provisional" | "confirmed" | "stale"; calibration: CalibrationRecord };

/** Bounded deterministic selector. It never reads a clock or selects maximum HR. */
export function selectCalibration(input: {
  identity: CalibrationIdentity;
  asOf: string;
  candidates: readonly CalibrationCandidate[];
  current: CalibrationRecord | null;
  nextId: string;
}): CalibrationSelectionResult {
  const identity = calibrationIdentitySchema.parse(input.identity);
  const registry = getCalibrationRegistryEntry(identity);
  if (!registry) return { state: "unavailable", reason: "no_qualifying_evidence" };
  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs)) throw new Error("Calibration asOf is invalid");
  const candidates = input.candidates
    .map((candidate) => calibrationCandidateSchema.parse(candidate))
    .filter((candidate) => Date.parse(candidate.observedAt) <= asOfMs)
    .sort(
      (left, right) =>
        Date.parse(left.observedAt) - Date.parse(right.observedAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(-PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.maximumSelectionCandidates);
  const current = input.current === null ? null : calibrationRecordSchema.parse(input.current);
  const tolerance =
    identity.metricKey === "threshold_heart_rate"
      ? PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.heartRateToleranceBpm
      : PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.relativeTolerance;
  const close = (values: readonly number[]) =>
    mutuallyClose(
      values,
      identity.metricKey === "threshold_heart_rate"
        ? PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.heartRateToleranceBpm
        : null,
      identity.metricKey === "threshold_heart_rate"
        ? null
        : PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.relativeTolerance,
    );
  const build = (
    value: number,
    _state: "provisional" | "confirmed",
    effectiveAt: string,
    selected: readonly CalibrationCandidate[],
    reason: CalibrationRecord["selectionDiagnostics"]["selectionReason"],
    trend: CalibrationRecord["selectionDiagnostics"]["trend"],
    retainedEvidenceIds: readonly string[] = selected.map(({ id }) => id),
    retainedActivityIds: readonly string[] = selected.map(({ activityId }) => activityId),
  ) =>
    calibrationRecordSchema.parse({
      id: input.nextId,
      identity,
      value,
      unit: registry.canonicalUnit,
      effectiveAt,
      expiresAt: expiry(effectiveAt),
      policyVersion: PERFORMANCE_CALIBRATION_POLICY_VERSION,
      selectionDiagnostics: {
        selectedEvidenceIds: retainedEvidenceIds,
        selectedActivityIds: retainedActivityIds,
        evidenceCount: retainedEvidenceIds.length,
        selectionReason: reason,
        trend,
        tolerance,
        policyVersion: PERFORMANCE_CALIBRATION_POLICY_VERSION,
      },
    });

  if (current === null) {
    const first = candidates.at(-1);
    if (!first) return { state: "unavailable", reason: "no_qualifying_evidence" };
    const completeProtocol = registry.initialSelectionPolicy === "confirmed_complete_protocol";
    const initialConfirmation = completeProtocol
      ? undefined
      : qualifyingGroups(
          candidates,
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.confirmation.evidenceCount,
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.confirmation.minimumDaySpan,
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.confirmation.maximumDaySpan,
          close,
        ).at(-1);
    const state = initialConfirmation || completeProtocol ? "confirmed" : "provisional";
    const selected = initialConfirmation ?? [first];
    const calibration = build(
      median(selected.map(({ value }) => value)),
      state,
      selected.at(-1)?.observedAt ?? first.observedAt,
      selected,
      initialConfirmation
        ? "independent_confirmation"
        : completeProtocol
          ? "complete_protocol"
          : "first_qualifying_evidence",
      "initial",
    );
    return { state, calibration };
  }

  const currentState = calibrationStateForSelection(current, input.asOf);
  const lifecycleStart =
    currentState === "stale" ? Date.parse(current.expiresAt) : Date.parse(current.effectiveAt);
  const lifecycleCandidates = candidates.filter(
    (candidate) => Date.parse(candidate.observedAt) >= lifecycleStart,
  );
  const confirmationCandidates =
    currentState === "provisional"
      ? candidates.filter(
          (candidate) =>
            Date.parse(candidate.observedAt) >=
            lifecycleStart -
              PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.confirmation.maximumDaySpan * DAY_MS,
        )
      : lifecycleCandidates;
  const confirmations = qualifyingGroups(
    confirmationCandidates,
    PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.confirmation.evidenceCount,
    PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.confirmation.minimumDaySpan,
    PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.confirmation.maximumDaySpan,
    close,
  ).filter(
    (group) =>
      currentState !== "provisional" ||
      Date.parse(group.at(-1)?.observedAt ?? "") >= lifecycleStart,
  );
  if (currentState === "provisional" && confirmations.length > 0) {
    const selected = confirmations.at(-1) as CalibrationCandidate[];
    const value = median(selected.map((candidate) => candidate.value));
    return {
      state: "confirmed",
      calibration: build(
        value,
        "confirmed",
        selected.at(-1)?.observedAt ?? input.asOf,
        selected,
        "independent_confirmation",
        "stable",
      ),
    };
  }

  if (currentState === "stale") {
    const confirmation = confirmations.at(-1);
    if (confirmation) {
      return {
        state: "confirmed",
        calibration: build(
          median(confirmation.map((candidate) => candidate.value)),
          "confirmed",
          confirmation.at(-1)?.observedAt ?? input.asOf,
          confirmation,
          "independent_confirmation",
          "stable",
        ),
      };
    }
    const latest = lifecycleCandidates.at(-1);
    if (latest && Date.parse(latest.observedAt) > Date.parse(current.effectiveAt)) {
      return {
        state: "provisional",
        calibration: build(
          latest.value,
          "provisional",
          latest.observedAt,
          [latest],
          "first_qualifying_evidence",
          "initial",
        ),
      };
    }
    return { state: "stale", calibration: current };
  }

  const changeGroups =
    identity.metricKey === "threshold_heart_rate"
      ? qualifyingGroups(
          lifecycleCandidates,
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.heartRateChange.evidenceCount,
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.heartRateChange.minimumDaySpan,
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.heartRateChange.maximumDaySpan,
          close,
        )
      : confirmations;
  const increases = changeGroups.filter((group) => {
    const value = median(group.map((candidate) => candidate.value));
    return identity.metricKey === "threshold_heart_rate"
      ? value - current.value >= PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.materialHeartRateChangeBpm
      : value / current.value - 1 >=
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.materialRelativeChange;
  });
  const currentBandSupport = confirmations.filter((group) =>
    group.every((candidate) =>
      identity.metricKey === "threshold_heart_rate"
        ? Math.abs(candidate.value - current.value) <=
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.heartRateToleranceBpm
        : Math.abs(candidate.value / current.value - 1) <=
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.relativeTolerance,
    ),
  );
  const decreases = qualifyingGroups(
    lifecycleCandidates,
    PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.decrease.evidenceCount,
    PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.decrease.minimumDaySpan,
    PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.decrease.maximumDaySpan,
    close,
  ).filter((group) => {
    const value = median(group.map((candidate) => candidate.value));
    return (
      currentBandSupport.length === 0 &&
      (identity.metricKey === "threshold_heart_rate"
        ? current.value - value >=
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.materialHeartRateChangeBpm
        : current.value / value - 1 >=
          PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.materialRelativeChange)
    );
  });
  const selected = increases.at(-1) ?? decreases.at(-1);
  if (selected) {
    const increasing = increases.includes(selected);
    const value = median(selected.map((candidate) => candidate.value));
    return {
      state: "confirmed",
      calibration: build(
        value,
        "confirmed",
        selected.at(-1)?.observedAt ?? input.asOf,
        selected,
        increasing ? "supported_increase" : "supported_decrease",
        increasing ? "increasing" : "decreasing",
      ),
    };
  }
  const retained = currentBandSupport.at(-1);
  if (
    retained &&
    Date.parse(retained.at(-1)?.observedAt ?? current.effectiveAt) > Date.parse(current.effectiveAt)
  ) {
    return {
      state: "confirmed",
      calibration: build(
        current.value,
        "confirmed",
        retained.at(-1)?.observedAt ?? input.asOf,
        retained,
        "unchanged",
        "stable",
      ),
    };
  }
  if (asOfMs >= Date.parse(current.expiresAt)) return { state: "stale", calibration: current };
  return { state: currentState, calibration: current };
}
