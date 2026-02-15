export type EnvelopeState = "inside" | "edge" | "outside";
export type EvidenceState = "none" | "sparse" | "stale" | "rich";

export interface CapacityEnvelopeWeekInput {
  projected_weekly_tss: number;
  projected_ramp_pct: number;
}

export interface CapacityEnvelopeInput {
  weeks: CapacityEnvelopeWeekInput[];
  starting_ctl: number;
  evidence_state?: EvidenceState;
}

export interface CapacityEnvelopeResult {
  envelope_score: number;
  envelope_state: EnvelopeState;
  limiting_factors: string[];
}

const WEIGHTS = {
  over_high: 0.55,
  under_low: 0.2,
  over_ramp: 0.25,
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getHistoryMultiplier(state: EvidenceState | undefined): number {
  if (state === "rich") return 1;
  if (state === "sparse") return 0.93;
  if (state === "stale") return 0.88;
  return 0.82;
}

function deriveEnvelopeBounds(input: {
  weekIndex: number;
  baselineWeeklyTss: number;
  historyMultiplier: number;
}): {
  safe_low: number;
  safe_high: number;
  ramp_limit: number;
} {
  const progressiveGrowth = 1 + Math.min(0.38, input.weekIndex * 0.035);
  const safeLow =
    input.baselineWeeklyTss * (0.76 + Math.min(0.08, input.weekIndex * 0.006));
  const safeHigh =
    input.baselineWeeklyTss *
    progressiveGrowth *
    (1.08 * input.historyMultiplier);
  const rampLimit = clamp(
    7 + input.baselineWeeklyTss / 160 + input.weekIndex * 0.2,
    4,
    14,
  );

  return {
    safe_low: Math.max(1, safeLow),
    safe_high: Math.max(1, Math.max(safeLow + 1, safeHigh)),
    ramp_limit: rampLimit,
  };
}

/**
 * Scores projected weekly load realism against a profile/history-aware capacity envelope.
 */
export function computeCapacityEnvelope(
  input: CapacityEnvelopeInput,
): CapacityEnvelopeResult {
  if (input.weeks.length === 0) {
    return {
      envelope_score: 100,
      envelope_state: "inside",
      limiting_factors: [],
    };
  }

  const baselineWeeklyTss = Math.max(35, input.starting_ctl * 7);
  const historyMultiplier = getHistoryMultiplier(input.evidence_state);

  let weightedPenalty = 0;
  let weightTotal = 0;
  let overHighTotal = 0;
  let underLowTotal = 0;
  let overRampTotal = 0;

  for (let index = 0; index < input.weeks.length; index += 1) {
    const week = input.weeks[index];
    if (!week) continue;

    const bounds = deriveEnvelopeBounds({
      weekIndex: index,
      baselineWeeklyTss,
      historyMultiplier,
    });
    const overHigh = Math.max(0, week.projected_weekly_tss - bounds.safe_high);
    const underLow = Math.max(0, bounds.safe_low - week.projected_weekly_tss);
    const overRamp = Math.max(0, week.projected_ramp_pct - bounds.ramp_limit);

    const normOverHigh = overHigh / bounds.safe_high;
    const normUnderLow = underLow / bounds.safe_low;
    const normOverRamp = overRamp / bounds.ramp_limit;

    const weekPenalty = clamp01(
      WEIGHTS.over_high * normOverHigh +
        WEIGHTS.under_low * normUnderLow +
        WEIGHTS.over_ramp * normOverRamp,
    );
    const weekWeight = 1 + index * 0.04;

    weightedPenalty += weekPenalty * weekWeight;
    weightTotal += weekWeight;
    overHighTotal += normOverHigh;
    underLowTotal += normUnderLow;
    overRampTotal += normOverRamp;
  }

  const meanPenalty = weightTotal <= 0 ? 0 : weightedPenalty / weightTotal;
  const envelopeScore = clamp100(100 - meanPenalty * 100);
  const envelopeState: EnvelopeState =
    envelopeScore >= 85 ? "inside" : envelopeScore >= 65 ? "edge" : "outside";

  const weekCount = Math.max(1, input.weeks.length);
  const limitingFactors: string[] = [];
  if (overHighTotal / weekCount > 0.04) {
    limitingFactors.push("over_high");
  }
  if (underLowTotal / weekCount > 0.08) {
    limitingFactors.push("under_low");
  }
  if (overRampTotal / weekCount > 0.05) {
    limitingFactors.push("over_ramp");
  }

  return {
    envelope_score: envelopeScore,
    envelope_state: envelopeState,
    limiting_factors: limitingFactors,
  };
}
