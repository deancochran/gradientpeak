import {
  getThresholdActivityCategoryPolicy,
  type ThresholdActivityCategoryPolicy,
} from "./registry";
import {
  THRESHOLD_LIFECYCLE_STATE_VERSION,
  type ThresholdEvaluation,
  type ThresholdEvidence,
  type ThresholdExactWindowObservation,
  type ThresholdFreshness,
  type ThresholdLifecycleEvidencePoint,
  type ThresholdLifecycleInput,
  type ThresholdLifecycleResult,
  type ThresholdLifecycleState,
  type ThresholdLifecycleStepInput,
  type ThresholdLifecycleStepResult,
  type ThresholdSelectionDecision,
  type ThresholdSelectionInput,
  type ThresholdSelectionResult,
  thresholdCandidateSchema,
  thresholdEvaluationDiagnosticsSchema,
  thresholdEvaluationSchema,
  thresholdFreshnessSchema,
  thresholdLifecycleInputSchema,
  thresholdLifecycleResultSchema,
  thresholdLifecycleStateSchema,
  thresholdLifecycleStepInputSchema,
  thresholdLifecycleStepResultSchema,
  thresholdObservationMetricSchema,
  thresholdSelectionDecisionSchema,
  thresholdSelectionInputSchema,
  thresholdSelectionResultSchema,
} from "./threshold-contracts";

const DAY_SECONDS = 86_400;
const SCALED_COMPARISON_EPSILON_ULPS = 16;

type MeasurementAttempt = {
  role: "preferred" | "fallback";
  metric: ThresholdExactWindowObservation["metric"];
  evidenceIds: string[];
  evaluation: ThresholdEvaluation;
  selectedObservation: ThresholdExactWindowObservation | null;
};

function exactObservationDiagnostics(
  policy: ThresholdActivityCategoryPolicy,
  role: MeasurementAttempt["role"],
  metric: MeasurementAttempt["metric"],
  observation: ThresholdExactWindowObservation | null,
  thresholdValue: number | null,
) {
  return thresholdEvaluationDiagnosticsSchema.parse({
    policyVersion: policy.policyVersion,
    plausibilityVersion: policy.plausibilityVersion,
    selectedSeriesId: observation?.seriesId ?? null,
    selectedSeriesRole: role,
    selectedSeriesMetric: metric,
    exactWindowSeconds: policy.exactWindowSeconds,
    conversionFactor: policy.conversionFactor,
    requiredWindowCoverage: policy.requiredWindowCoverage,
    maximumGapSeconds: policy.maximumGapSeconds,
    extractedValue: observation?.value ?? null,
    thresholdValue,
  });
}

function evaluateExactWindowMeasurement(input: {
  policy: ThresholdActivityCategoryPolicy;
  role: MeasurementAttempt["role"];
  metric: MeasurementAttempt["metric"];
  observations: readonly ThresholdExactWindowObservation[];
}): MeasurementAttempt {
  const evidenceIds = input.observations
    .map(({ evidenceId }) => evidenceId)
    .sort((left, right) => compareText(left, right));
  const rejected = (
    reason: Extract<ThresholdEvaluation, { status: "rejected" }>["reason"],
    observation: ThresholdExactWindowObservation | null = null,
    thresholdValue: number | null = null,
  ): MeasurementAttempt => ({
    role: input.role,
    metric: input.metric,
    evidenceIds,
    evaluation: thresholdEvaluationSchema.parse({
      status: "rejected",
      reason,
      diagnostics: exactObservationDiagnostics(
        input.policy,
        input.role,
        input.metric,
        observation,
        thresholdValue,
      ),
    }),
    selectedObservation: null,
  });

  if (input.observations.length === 0) return rejected("series_missing");
  if (input.observations.length > 1) return rejected("series_ambiguous");
  const observation = input.observations[0];
  if (observation === undefined) return rejected("series_missing");
  if (!observation.sourceAccepted) return rejected("source_not_accepted", observation);
  if (!observation.ownershipVerified) return rejected("ownership_unverified", observation);
  if (
    observation.durationSeconds !== input.policy.exactWindowSeconds ||
    observation.endTimestampSeconds !==
      observation.startTimestampSeconds + input.policy.exactWindowSeconds
  ) {
    return rejected("exact_window_missing", observation);
  }
  if (observation.availability === "incomplete") {
    return rejected("exact_window_incomplete", observation);
  }
  if (observation.windowCoverage < input.policy.requiredWindowCoverage) {
    return rejected("coverage_insufficient", observation);
  }
  if (observation.maximumGapSeconds > input.policy.maximumGapSeconds) {
    return rejected("gap_bound_exceeded", observation);
  }

  const thresholdValue = observation.value * input.policy.conversionFactor;
  if (
    !Number.isFinite(thresholdValue) ||
    thresholdValue < input.policy.plausibleThreshold.minimum ||
    thresholdValue > input.policy.plausibleThreshold.maximum
  ) {
    return rejected(
      "value_implausible",
      observation,
      Number.isFinite(thresholdValue) && thresholdValue > 0 ? thresholdValue : null,
    );
  }

  const candidate = thresholdCandidateSchema.parse({
    activityCategory: input.policy.activityCategory,
    metric: input.policy.metric,
    unit: input.policy.unit,
    method: input.policy.method,
    value: thresholdValue,
    sourceSeriesId: observation.seriesId,
    sourceSeriesMetric: observation.metric,
    startTimestampSeconds: observation.startTimestampSeconds,
    endTimestampSeconds: observation.endTimestampSeconds,
    exactWindowSeconds: input.policy.exactWindowSeconds,
    conversionFactor: input.policy.conversionFactor,
    policyVersion: input.policy.policyVersion,
    plausibilityVersion: input.policy.plausibilityVersion,
  });
  return {
    role: input.role,
    metric: input.metric,
    evidenceIds,
    evaluation: thresholdEvaluationSchema.parse({
      status: "qualified",
      candidate,
      diagnostics: exactObservationDiagnostics(
        input.policy,
        input.role,
        input.metric,
        observation,
        thresholdValue,
      ),
    }),
    selectedObservation: observation,
  };
}

/**
 * Evaluates every configured measurement independently, then selects the first
 * qualified measurement in policy order. Selection never branches on rejection
 * reasons, so raw run speed is eligible after any grade-adjusted rejection.
 */
export function selectThresholdCandidate(input: ThresholdSelectionInput): ThresholdSelectionResult {
  const parsed = thresholdSelectionInputSchema.parse(input);
  const policy = getThresholdActivityCategoryPolicy(parsed.activityCategory, parsed.metric);
  const configuredMeasurements = [
    { role: "preferred" as const, metric: policy.seriesSelection.preferred },
    ...(policy.seriesSelection.fallback === null
      ? []
      : [{ role: "fallback" as const, metric: policy.seriesSelection.fallback }]),
  ].map(({ role, metric }) => ({ role, metric: thresholdObservationMetricSchema.parse(metric) }));
  const attempts = configuredMeasurements.map(({ role, metric }) =>
    evaluateExactWindowMeasurement({
      policy,
      role,
      metric,
      observations: parsed.observations.filter((observation) => observation.metric === metric),
    }),
  );
  const selected = attempts.find(({ evaluation }) => evaluation.status === "qualified");
  const publicAttempts = attempts.map(({ selectedObservation: _selectedObservation, ...attempt }) =>
    Object.freeze(attempt),
  );
  if (
    selected === undefined ||
    selected.evaluation.status !== "qualified" ||
    selected.selectedObservation === null
  ) {
    return thresholdSelectionResultSchema.parse({
      status: "rejected",
      reason: "no_qualified_measurement",
      attempts: publicAttempts,
    });
  }
  return thresholdSelectionResultSchema.parse({
    status: "qualified",
    candidate: selected.evaluation.candidate,
    selectedRole: selected.role,
    selectedEvidenceId: selected.selectedObservation.evidenceId,
    selectedActivityId: selected.selectedObservation.activityId,
    attempts: publicAttempts,
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle] ?? 0;
  return ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

/** Compares same-unit finite values with a scale-aware floating-point boundary. */
function compareScaled(left: number, right: number): -1 | 0 | 1 {
  const epsilon =
    Number.EPSILON * SCALED_COMPARISON_EPSILON_ULPS * Math.max(Math.abs(left), Math.abs(right), 1);
  if (left < right - epsilon) return -1;
  if (left > right + epsilon) return 1;
  return 0;
}

function mutuallyConsistent(
  evidence: readonly { value: number }[],
  relativeTolerance: number,
): boolean {
  if (evidence.length < 2) return false;
  const values = evidence.map(({ value }) => value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return compareScaled(maximum - minimum, relativeTolerance * minimum) <= 0;
}

function buildThresholdSelectionDecision(
  policy: ThresholdActivityCategoryPolicy,
  evidence: readonly ThresholdLifecycleEvidencePoint[],
  reason: ThresholdSelectionDecision["publicationReason"],
): ThresholdSelectionDecision {
  const latest = evidence.at(-1);
  if (latest === undefined) throw new Error("Threshold selection decision requires evidence");
  return thresholdSelectionDecisionSchema.parse({
    activityCategory: policy.activityCategory,
    metric: policy.metric,
    unit: policy.unit,
    method: policy.method,
    value: median(evidence.map(({ value }) => value)),
    effectiveAt: latest.observedAt,
    policyVersion: policy.policyVersion,
    plausibilityVersion: policy.plausibilityVersion,
    selectedEvidenceIds: evidence.map(({ evidenceId }) => evidenceId),
    selectedActivityIds: evidence.map(({ activityId }) => activityId),
    publicationReason: reason,
  });
}

function evidenceMatchesPolicy(
  candidate: ThresholdEvidence,
  policy: ThresholdActivityCategoryPolicy,
): boolean {
  const sourceMetricAccepted =
    candidate.sourceSeriesMetric === policy.seriesSelection.preferred ||
    candidate.sourceSeriesMetric === policy.seriesSelection.fallback;
  return (
    candidate.activityCategory === policy.activityCategory &&
    candidate.metric === policy.metric &&
    candidate.unit === policy.unit &&
    candidate.method === policy.method &&
    candidate.exactWindowSeconds === policy.exactWindowSeconds &&
    candidate.conversionFactor === policy.conversionFactor &&
    sourceMetricAccepted &&
    candidate.value >= policy.plausibleThreshold.minimum &&
    candidate.value <= policy.plausibleThreshold.maximum
  );
}

function evidencePoint(evidence: ThresholdEvidence): ThresholdLifecycleEvidencePoint {
  return {
    evidenceId: evidence.evidenceId,
    activityId: evidence.activityId,
    observedAt: evidence.observedAt,
    value: evidence.value,
  };
}

function compareChronologicalKey(
  left: { observedAt: string; evidenceId: string },
  right: { observedAt: string; evidenceId: string },
): number {
  return (
    Date.parse(left.observedAt) - Date.parse(right.observedAt) ||
    compareText(left.evidenceId, right.evidenceId)
  );
}

function retainedIdentitySets(state: ThresholdLifecycleState): {
  evidenceIds: Set<string>;
  activityIds: Set<string>;
} {
  return {
    evidenceIds: new Set([
      ...state.current.selectedEvidenceIds,
      ...state.pendingDecrease.map(({ evidenceId }) => evidenceId),
      state.lastProcessed.evidenceId,
    ]),
    activityIds: new Set([
      ...state.current.selectedActivityIds,
      ...state.pendingDecrease.map(({ activityId }) => activityId),
      state.lastProcessed.activityId,
    ]),
  };
}

function lifecycleState(input: {
  policy: ThresholdActivityCategoryPolicy;
  confidence: ThresholdLifecycleState["confidence"];
  current: ThresholdSelectionDecision;
  pendingDecrease: readonly ThresholdLifecycleEvidencePoint[];
  candidate: ThresholdEvidence;
}): ThresholdLifecycleState {
  return thresholdLifecycleStateSchema.parse({
    stateVersion: THRESHOLD_LIFECYCLE_STATE_VERSION,
    activityCategory: input.policy.activityCategory,
    confidence: input.confidence,
    current: input.current,
    pendingDecrease: input.pendingDecrease,
    lastProcessed: {
      observedAt: input.candidate.observedAt,
      evidenceId: input.candidate.evidenceId,
      activityId: input.candidate.activityId,
    },
  });
}

function stepResult(input: {
  action: ThresholdLifecycleStepResult["action"];
  decision: ThresholdLifecycleStepResult["decision"];
  state: ThresholdLifecycleState;
}): ThresholdLifecycleStepResult {
  return thresholdLifecycleStepResultSchema.parse({
    ...input,
    selectedValue: input.state.current.value,
  });
}

/**
 * Advances one policy-qualified candidate through a bounded lifecycle state.
 * Callers supply candidates in `(observedAt, evidenceId)` keyset order.
 */
export function advanceThresholdLifecycle(
  input: ThresholdLifecycleStepInput,
): ThresholdLifecycleStepResult {
  const parsed = thresholdLifecycleStepInputSchema.parse(input);
  const candidate = parsed.candidate;
  const policy = getThresholdActivityCategoryPolicy(candidate.activityCategory, candidate.metric);
  if (!evidenceMatchesPolicy(candidate, policy)) {
    throw new Error("Threshold lifecycle candidate does not match its current policy");
  }
  const candidatePoint = evidencePoint(candidate);

  if (parsed.state === null) {
    const current = buildThresholdSelectionDecision(
      policy,
      [candidatePoint],
      "first_qualified_candidate",
    );
    return stepResult({
      action: "provisional",
      decision: "first_qualified_candidate",
      state: lifecycleState({
        policy,
        confidence: "provisional",
        current,
        pendingDecrease: [],
        candidate,
      }),
    });
  }

  const state = parsed.state;
  if (state.activityCategory !== candidate.activityCategory) {
    throw new Error("Threshold lifecycle candidate category does not match state");
  }
  if (
    state.current.metric !== policy.metric ||
    state.current.unit !== policy.unit ||
    state.current.method !== policy.method ||
    state.current.policyVersion !== policy.policyVersion ||
    state.current.plausibilityVersion !== policy.plausibilityVersion ||
    state.current.value < policy.plausibleThreshold.minimum ||
    state.current.value > policy.plausibleThreshold.maximum
  ) {
    throw new Error("Threshold lifecycle state does not match its current policy");
  }
  const identities = retainedIdentitySets(state);
  if (identities.evidenceIds.has(candidate.evidenceId)) {
    throw new Error("Threshold lifecycle evidence identity was already processed");
  }
  if (identities.activityIds.has(candidate.activityId)) {
    throw new Error("Threshold lifecycle activity identity was already processed");
  }
  if (compareChronologicalKey(candidate, state.lastProcessed) <= 0) {
    throw new Error("Threshold lifecycle candidate is out of chronological keyset order");
  }

  const candidateMs = Date.parse(candidate.observedAt);
  const decreaseCutoffMs = candidateMs - policy.decreaseWindowDays * DAY_SECONDS * 1_000;
  const activePendingDecrease = state.pendingDecrease
    .filter(({ observedAt }) => Date.parse(observedAt) >= decreaseCutoffMs)
    .slice(-(policy.decreaseEvidenceCount - 1));
  const confirmationWindowMs = policy.confirmationWindowDays * DAY_SECONDS * 1_000;
  if (
    state.confidence === "provisional" &&
    candidateMs - Date.parse(state.current.effectiveAt) > confirmationWindowMs
  ) {
    const current = buildThresholdSelectionDecision(
      policy,
      [candidatePoint],
      "confirmation_window_reset",
    );
    return stepResult({
      action: "provisional",
      decision: "confirmation_window_reset",
      state: lifecycleState({
        policy,
        confidence: "provisional",
        current,
        pendingDecrease: [],
        candidate,
      }),
    });
  }

  const materialChange = policy.materialChangeRelativeThreshold * state.current.value;
  const materiallyHigher =
    compareScaled(candidate.value - state.current.value, materialChange) >= 0;
  const materiallyLower = compareScaled(state.current.value - candidate.value, materialChange) >= 0;

  if (state.confidence === "provisional") {
    const currentEvidenceId = state.current.selectedEvidenceIds[0];
    const currentActivityId = state.current.selectedActivityIds[0];
    if (currentEvidenceId === undefined || currentActivityId === undefined) {
      throw new Error("Provisional threshold state is missing its selected evidence identity");
    }
    const currentPoint: ThresholdLifecycleEvidencePoint = {
      evidenceId: currentEvidenceId,
      activityId: currentActivityId,
      observedAt: state.current.effectiveAt,
      value: state.current.value,
    };
    if (mutuallyConsistent([currentPoint, candidatePoint], policy.consistencyRelativeTolerance)) {
      const current = buildThresholdSelectionDecision(
        policy,
        [currentPoint, candidatePoint],
        "independent_confirmation",
      );
      return stepResult({
        action: "confirm",
        decision: "independent_confirmation",
        state: lifecycleState({
          policy,
          confidence: "confirmed",
          current,
          pendingDecrease: [],
          candidate,
        }),
      });
    }
  }

  if (materiallyHigher) {
    const current = buildThresholdSelectionDecision(policy, [candidatePoint], "material_increase");
    return stepResult({
      action: "increase",
      decision: "material_increase",
      state: lifecycleState({
        policy,
        confidence: state.confidence,
        current,
        pendingDecrease: [],
        candidate,
      }),
    });
  }

  if (!materiallyLower) {
    return stepResult({
      action: "retain",
      decision: "retained_noise",
      state: lifecycleState({
        policy,
        confidence: state.confidence,
        current: state.current,
        pendingDecrease: activePendingDecrease,
        candidate,
      }),
    });
  }

  const pendingDecrease = activePendingDecrease
    .filter((pending) =>
      mutuallyConsistent([pending, candidatePoint], policy.consistencyRelativeTolerance),
    )
    .slice(-(policy.decreaseEvidenceCount - 1));
  const supportedDecrease = [...pendingDecrease, candidatePoint];
  if (
    supportedDecrease.length >= policy.decreaseEvidenceCount &&
    mutuallyConsistent(supportedDecrease, policy.consistencyRelativeTolerance)
  ) {
    const current = buildThresholdSelectionDecision(
      policy,
      supportedDecrease,
      "supported_decrease",
    );
    return stepResult({
      action: "decrease",
      decision: "supported_decrease",
      state: lifecycleState({
        policy,
        confidence: "confirmed",
        current,
        pendingDecrease: [],
        candidate,
      }),
    });
  }

  return stepResult({
    action: "retain",
    decision: "retained_single_decrease",
    state: lifecycleState({
      policy,
      confidence: state.confidence,
      current: state.current,
      pendingDecrease: [candidatePoint].slice(-(policy.decreaseEvidenceCount - 1)),
      candidate,
    }),
  });
}

/**
 * Convenience replay that sorts a finite in-memory input, then folds exclusively
 * through the production incremental state transition.
 */
export function resolveThresholdLifecycle(
  input: ThresholdLifecycleInput,
): ThresholdLifecycleResult {
  const parsed = thresholdLifecycleInputSchema.parse(input);
  const policy = getThresholdActivityCategoryPolicy(parsed.activityCategory, parsed.metric);
  const asOfMs = Date.parse(parsed.asOf);
  const evidence = parsed.evidence
    .filter(
      (candidate) =>
        evidenceMatchesPolicy(candidate, policy) && Date.parse(candidate.observedAt) <= asOfMs,
    )
    .sort(
      (left, right) =>
        Date.parse(left.observedAt) - Date.parse(right.observedAt) ||
        compareText(left.evidenceId, right.evidenceId),
    );

  if (evidence.length === 0) {
    return { status: "unavailable", reason: "no_qualified_evidence" };
  }
  let state: ThresholdLifecycleState | null = null;
  let latest: ThresholdLifecycleStepResult | null = null;
  for (const candidate of evidence) {
    latest = advanceThresholdLifecycle({ state, candidate });
    state = latest.state;
  }
  if (latest === null) throw new Error("Threshold lifecycle replay produced no state");
  return thresholdLifecycleResultSchema.parse({
    status: "available",
    state: latest.state.confidence,
    decision: latest.decision,
    threshold: latest.state.current,
  });
}

/** Freshness is derived only from explicit as-of time, effective time, and method policy. */
export function deriveThresholdFreshness(input: {
  threshold: ThresholdSelectionDecision;
  asOf: string;
}): ThresholdFreshness {
  const threshold = thresholdSelectionDecisionSchema.parse(input.threshold);
  const asOf = thresholdLifecycleInputSchema.shape.asOf.parse(input.asOf);
  const policy = getThresholdActivityCategoryPolicy(threshold.activityCategory, threshold.metric);
  if (policy.method !== threshold.method) {
    throw new Error("Threshold selection method does not match its activity-category policy");
  }
  const ageMilliseconds = Date.parse(asOf) - Date.parse(threshold.effectiveAt);
  if (ageMilliseconds < 0) {
    throw new Error("Threshold freshness asOf cannot precede effectiveAt");
  }
  const ageSeconds = Math.floor(ageMilliseconds / 1_000);
  const freshForSeconds = policy.freshnessDays * DAY_SECONDS;
  return thresholdFreshnessSchema.parse({
    status: ageSeconds < freshForSeconds ? "fresh" : "stale",
    ageSeconds,
    freshForSeconds,
  });
}
