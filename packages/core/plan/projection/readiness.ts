type ProjectionMicrocyclePattern =
  | "ramp"
  | "deload"
  | "taper"
  | "event"
  | "recovery";

export type ReadinessBand = "low" | "medium" | "high";

export interface ProjectionDemandGap {
  required_weekly_tss_target: number;
  feasible_weekly_tss_applied: number;
  unmet_weekly_tss: number;
  unmet_ratio: number;
}

export interface ProjectionFeasibilityMetadata {
  demand_gap: ProjectionDemandGap;
  readiness_band: ReadinessBand;
  dominant_limiters: string[];
  readiness_score?: number;
  readiness_components?: {
    load_state: number;
    intensity_balance: number;
    specificity: number;
    execution_confidence: number;
  };
  projection_uncertainty?: {
    tss_low: number;
    tss_likely: number;
    tss_high: number;
    confidence: number;
  };
  readiness_rationale_codes?: string[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function blendDemandWithConfidence(input: {
  demandFloorWeeklyTss: number | null;
  conservativeBaselineWeeklyTss: number;
  confidence: number;
}): number | null {
  if (input.demandFloorWeeklyTss === null) {
    return null;
  }

  const baseline = Math.max(0, input.conservativeBaselineWeeklyTss);
  const confidence = clamp01(input.confidence);
  return round1(
    baseline + (input.demandFloorWeeklyTss - baseline) * confidence,
  );
}

export function getDemandRhythmMultiplier(input: {
  weekPattern: ProjectionMicrocyclePattern;
  weekIndex: number;
  weeksToEvent: number;
}): number {
  if (input.weekPattern === "event") {
    return 0.62;
  }

  if (input.weekPattern === "recovery") {
    return 0.72;
  }

  const weeksRemaining = Math.max(0, input.weeksToEvent - input.weekIndex - 1);

  if (input.weekPattern === "taper") {
    if (weeksRemaining <= 1) return 0.7;
    if (weeksRemaining <= 2) return 0.8;
    return 0.88;
  }

  if (input.weekPattern === "deload") {
    return 0.82;
  }

  const wave = input.weekIndex % 3;
  if (wave === 0) return 0.9;
  if (wave === 1) return 1;
  return 1.08;
}

export function computeProjectionFeasibilityMetadata(input: {
  requiredPeakWeeklyTssTarget: number;
  feasiblePeakWeeklyTssApplied: number;
  tssRampClampWeeks: number;
  ctlRampClampWeeks: number;
  confidence: number;
  projectionWeeks: number;
}): ProjectionFeasibilityMetadata {
  const unmetWeeklyTss = Math.max(
    0,
    round1(
      input.requiredPeakWeeklyTssTarget - input.feasiblePeakWeeklyTssApplied,
    ),
  );
  const unmetRatio =
    input.requiredPeakWeeklyTssTarget <= 0
      ? 0
      : round3(unmetWeeklyTss / input.requiredPeakWeeklyTssTarget);
  const clampPressure = clamp01(
    (input.tssRampClampWeeks + input.ctlRampClampWeeks) /
      Math.max(1, input.projectionWeeks),
  );
  const demandFulfillment =
    input.requiredPeakWeeklyTssTarget <= 0
      ? 1
      : clamp01(
          input.feasiblePeakWeeklyTssApplied /
            input.requiredPeakWeeklyTssTarget,
        );
  const confidence = clamp01(input.confidence);

  const loadState = clamp01(
    demandFulfillment * 0.75 + (1 - unmetRatio) * 0.25 - clampPressure * 0.35,
  );
  const intensityBalance = clamp01(
    1 - clampPressure * 0.7 - Math.min(0.12, input.tssRampClampWeeks * 0.04),
  );
  const specificity = clamp01(
    demandFulfillment * 0.85 + (1 - clampPressure) * 0.15,
  );
  const executionConfidence = clamp01(
    confidence * 0.8 + (1 - clampPressure) * 0.2,
  );
  const readinessScore = Math.round(
    (loadState * 0.35 +
      intensityBalance * 0.25 +
      specificity * 0.25 +
      executionConfidence * 0.15) *
      100,
  );

  let readiness: ReadinessBand = "low";
  if (readinessScore >= 75) {
    readiness = "high";
  } else if (readinessScore >= 55) {
    readiness = "medium";
  }

  const dominantLimiters: string[] = [];
  if (unmetWeeklyTss > 0) dominantLimiters.push("required_growth_exceeds_caps");
  if (input.tssRampClampWeeks > 0)
    dominantLimiters.push("tss_ramp_cap_pressure");
  if (input.ctlRampClampWeeks > 0)
    dominantLimiters.push("ctl_ramp_cap_pressure");
  if (input.confidence < 0.5) dominantLimiters.push("low_evidence_confidence");

  const readinessRationaleCodes: string[] = [];
  if (demandFulfillment < 0.85) {
    readinessRationaleCodes.push("readiness_penalty_demand_gap");
  }
  if (clampPressure > 0.15) {
    readinessRationaleCodes.push("readiness_penalty_clamp_pressure");
  }
  if (confidence >= 0.75) {
    readinessRationaleCodes.push("readiness_credit_evidence_confidence_high");
  }

  const uncertaintyPct = Math.min(
    0.28,
    Math.max(0.08, 0.06 + (1 - confidence) * 0.18 + clampPressure * 0.05),
  );
  const likelyTss = round1(Math.max(0, input.feasiblePeakWeeklyTssApplied));
  const uncertaintyDelta = round1(likelyTss * uncertaintyPct);

  return {
    demand_gap: {
      required_weekly_tss_target: round1(input.requiredPeakWeeklyTssTarget),
      feasible_weekly_tss_applied: round1(input.feasiblePeakWeeklyTssApplied),
      unmet_weekly_tss: unmetWeeklyTss,
      unmet_ratio: unmetRatio,
    },
    readiness_band: readiness,
    dominant_limiters: dominantLimiters,
    readiness_score: readinessScore,
    readiness_components: {
      load_state: round3(loadState),
      intensity_balance: round3(intensityBalance),
      specificity: round3(specificity),
      execution_confidence: round3(executionConfidence),
    },
    projection_uncertainty: {
      tss_low: round1(Math.max(0, likelyTss - uncertaintyDelta)),
      tss_likely: likelyTss,
      tss_high: round1(likelyTss + uncertaintyDelta),
      confidence: round3(1 - uncertaintyPct),
    },
    readiness_rationale_codes: readinessRationaleCodes,
  };
}
