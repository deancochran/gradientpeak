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

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
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

export interface ProjectionPointReadinessInput {
  date: string;
  predicted_fitness_ctl: number;
  predicted_fatigue_atl: number;
  predicted_form_tsb: number;
}

export interface ProjectionPointReadinessGoalInput {
  target_date: string;
  priority?: number;
}

function normalizePriority(priority: number | undefined): number {
  if (typeof priority !== "number" || Number.isNaN(priority)) {
    return 5;
  }

  return Math.max(1, Math.min(10, Math.round(priority)));
}

function diffDateOnlyUtcDays(a: string, b: string): number {
  const aMs = Date.parse(`${a}T00:00:00.000Z`);
  const bMs = Date.parse(`${b}T00:00:00.000Z`);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
    return 0;
  }

  return Math.round((bMs - aMs) / 86400000);
}

export function computeProjectionPointReadinessScores(input: {
  points: ProjectionPointReadinessInput[];
  planReadinessScore?: number;
  goals?: ProjectionPointReadinessGoalInput[];
}): number[] {
  if (input.points.length === 0) {
    return [];
  }

  const peakProjectedCtl = Math.max(
    1,
    ...input.points.map((point) => Math.max(0, point.predicted_fitness_ctl)),
  );
  const feasibilitySignal = clamp01((input.planReadinessScore ?? 50) / 100);

  const goals = input.goals ?? [];

  const rawScores = input.points.map((point) => {
    const ctl = Math.max(0, point.predicted_fitness_ctl);
    const atl = Math.max(0, point.predicted_fatigue_atl);
    const tsb = point.predicted_form_tsb;

    const fitnessSignal = clamp01(ctl / peakProjectedCtl);
    const targetTsb = 8;
    const formTolerance = 20;
    const formSignal = clamp01(1 - Math.abs(tsb - targetTsb) / formTolerance);

    const fatigueOverflow = Math.max(0, atl - ctl);
    const fatigueSignal = clamp01(
      1 - fatigueOverflow / Math.max(1, peakProjectedCtl * 0.4),
    );

    const readinessSignal =
      formSignal * 0.5 + fitnessSignal * 0.3 + fatigueSignal * 0.2;
    const blendedSignal = readinessSignal * 0.85 + feasibilitySignal * 0.15;

    return clampScore(blendedSignal * 100);
  });

  if (goals.length === 0) {
    return rawScores;
  }

  const resolveGoalIndex = (targetDate: string): number => {
    const exactIndex = input.points.findIndex(
      (point) => point.date === targetDate,
    );
    if (exactIndex >= 0) {
      return exactIndex;
    }

    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestIndex = 0;
    for (let i = 0; i < input.points.length; i += 1) {
      const candidatePoint = input.points[i];
      if (!candidatePoint) {
        continue;
      }

      const distance = Math.abs(
        diffDateOnlyUtcDays(candidatePoint.date, targetDate),
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  };

  const goalAnchors = goals
    .map((goal) => {
      const goalIndex = resolveGoalIndex(goal.target_date);
      const priority = normalizePriority(goal.priority);
      const priorityWeight = priority / 10;
      const peakWindow = Math.round(8 + priorityWeight * 10);
      const basePeak = clampScore(
        78 + priorityWeight * 10 + feasibilitySignal * 6,
      );

      return {
        goalIndex,
        peakWindow,
        peakSlope: 1.1 + priorityWeight * 0.7,
        basePeak,
      };
    })
    .sort((a, b) => a.goalIndex - b.goalIndex);

  let optimized = [...rawScores];
  const iterations = 60;
  const smoothingLambda = 0.42;
  const maxStepDelta = 6;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const smoothed = [...optimized];
    for (let i = 1; i < optimized.length - 1; i += 1) {
      const left = optimized[i - 1] ?? optimized[i] ?? 0;
      const center = optimized[i] ?? 0;
      const right = optimized[i + 1] ?? optimized[i] ?? 0;
      const prior = rawScores[i] ?? center;
      const updated =
        (prior + smoothingLambda * left + smoothingLambda * right) /
        (1 + 2 * smoothingLambda);
      smoothed[i] = clampScore(updated);
    }
    optimized = smoothed;

    for (const anchor of goalAnchors) {
      const start = Math.max(0, anchor.goalIndex - anchor.peakWindow);
      const end = Math.min(
        optimized.length - 1,
        anchor.goalIndex + anchor.peakWindow,
      );

      let localMax = 0;
      for (let i = start; i <= end; i += 1) {
        localMax = Math.max(localMax, optimized[i] ?? 0);
      }

      const requiredPeak = Math.max(anchor.basePeak, localMax + 1);
      optimized[anchor.goalIndex] = clampScore(
        Math.max(optimized[anchor.goalIndex] ?? 0, requiredPeak),
      );

      const goalScore = optimized[anchor.goalIndex] ?? 0;
      for (let i = start; i <= end; i += 1) {
        if (i === anchor.goalIndex) {
          continue;
        }

        const dayDistance = Math.abs(
          diffDateOnlyUtcDays(
            input.points[i]?.date ?? "",
            input.points[anchor.goalIndex]?.date ?? "",
          ),
        );
        const cap = clampScore(
          goalScore -
            Math.max(0, anchor.peakWindow - dayDistance) * anchor.peakSlope,
        );
        optimized[i] = Math.min(optimized[i] ?? 0, cap);
      }
    }

    for (let i = 1; i < optimized.length; i += 1) {
      const prev = optimized[i - 1] ?? 0;
      optimized[i] = clampScore(
        Math.min(
          prev + maxStepDelta,
          Math.max(prev - maxStepDelta, optimized[i] ?? prev),
        ),
      );
    }
    for (let i = optimized.length - 2; i >= 0; i -= 1) {
      const next = optimized[i + 1] ?? 0;
      optimized[i] = clampScore(
        Math.min(
          next + maxStepDelta,
          Math.max(next - maxStepDelta, optimized[i] ?? next),
        ),
      );
    }

    optimized = optimized.map((value, i) =>
      clampScore((value ?? 0) * 0.9 + (rawScores[i] ?? 0) * 0.1),
    );
  }

  for (const anchor of goalAnchors) {
    const start = Math.max(0, anchor.goalIndex - anchor.peakWindow);
    const end = Math.min(
      optimized.length - 1,
      anchor.goalIndex + anchor.peakWindow,
    );
    let localMax = 0;
    for (let i = start; i <= end; i += 1) {
      localMax = Math.max(localMax, optimized[i] ?? 0);
    }

    optimized[anchor.goalIndex] = clampScore(
      Math.max(optimized[anchor.goalIndex] ?? 0, localMax),
    );
  }

  return optimized;
}
