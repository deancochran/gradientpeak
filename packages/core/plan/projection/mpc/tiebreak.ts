export type MpcTieBreakField =
  | "objective"
  | "safety_penalty"
  | "tracking_error"
  | "volatility_penalty"
  | "churn_penalty"
  | "delta_from_prev"
  | "goal_date"
  | "goal_id"
  | "candidate_value";

export const MPC_TIE_BREAK_ORDER: readonly MpcTieBreakField[] = [
  "objective",
  "safety_penalty",
  "tracking_error",
  "volatility_penalty",
  "churn_penalty",
  "delta_from_prev",
  "goal_date",
  "goal_id",
  "candidate_value",
] as const;

export interface MpcTieBreakCandidate {
  candidate_value: number;
  objective_score: number;
  safety_penalty?: number;
  tracking_error?: number;
  volatility_penalty?: number;
  churn_penalty?: number;
  delta_from_prev: number;
  primary_goal_date?: string | null;
  primary_goal_id?: string | null;
}

function compareOptionalPenalty(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) {
    return 0;
  }

  return (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY);
}

/**
 * Compares two candidates using deterministic tie-break ordering.
 */
export function compareMpcTieBreakCandidates(
  left: MpcTieBreakCandidate,
  right: MpcTieBreakCandidate,
): number {
  if (left.objective_score !== right.objective_score) {
    return right.objective_score - left.objective_score;
  }

  const safetyPenaltyOrder = compareOptionalPenalty(left.safety_penalty, right.safety_penalty);
  if (safetyPenaltyOrder !== 0) {
    return safetyPenaltyOrder;
  }

  const trackingErrorOrder = compareOptionalPenalty(left.tracking_error, right.tracking_error);
  if (trackingErrorOrder !== 0) {
    return trackingErrorOrder;
  }

  const volatilityPenaltyOrder = compareOptionalPenalty(
    left.volatility_penalty,
    right.volatility_penalty,
  );
  if (volatilityPenaltyOrder !== 0) {
    return volatilityPenaltyOrder;
  }

  const churnPenaltyOrder = compareOptionalPenalty(left.churn_penalty, right.churn_penalty);
  if (churnPenaltyOrder !== 0) {
    return churnPenaltyOrder;
  }

  if (left.delta_from_prev !== right.delta_from_prev) {
    return left.delta_from_prev - right.delta_from_prev;
  }

  const leftDate = left.primary_goal_date ?? "9999-12-31";
  const rightDate = right.primary_goal_date ?? "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  const leftGoalId = left.primary_goal_id ?? "~";
  const rightGoalId = right.primary_goal_id ?? "~";
  if (leftGoalId !== rightGoalId) {
    return leftGoalId.localeCompare(rightGoalId);
  }

  return left.candidate_value - right.candidate_value;
}

/**
 * Returns candidates ranked with deterministic ordering.
 */
export function rankMpcCandidatesDeterministically<T extends MpcTieBreakCandidate>(
  candidates: readonly T[],
): T[] {
  return [...candidates].sort(compareMpcTieBreakCandidates);
}

/**
 * Picks the best deterministic candidate and returns tie-break diagnostics.
 */
export function pickBestMpcCandidate<T extends MpcTieBreakCandidate>(
  candidates: readonly T[],
): {
  selected: T;
  tie_break_order: readonly MpcTieBreakField[];
} {
  if (candidates.length === 0) {
    throw new Error("Cannot pick MPC candidate from empty collection");
  }

  const ranked = rankMpcCandidatesDeterministically(candidates);
  const selected = ranked[0];

  if (!selected) {
    throw new Error("MPC candidate ranking produced no winner");
  }

  return {
    selected,
    tie_break_order: MPC_TIE_BREAK_ORDER,
  };
}
