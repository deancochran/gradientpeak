export type MpcTieBreakField =
  | "objective"
  | "delta_from_prev"
  | "goal_date"
  | "goal_id"
  | "candidate_value";

export const MPC_TIE_BREAK_ORDER: readonly MpcTieBreakField[] = [
  "objective",
  "delta_from_prev",
  "goal_date",
  "goal_id",
  "candidate_value",
] as const;

export interface MpcTieBreakCandidate {
  candidate_value: number;
  objective_score: number;
  delta_from_prev: number;
  primary_goal_date?: string | null;
  primary_goal_id?: string | null;
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
export function rankMpcCandidatesDeterministically<
  T extends MpcTieBreakCandidate,
>(candidates: readonly T[]): T[] {
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
