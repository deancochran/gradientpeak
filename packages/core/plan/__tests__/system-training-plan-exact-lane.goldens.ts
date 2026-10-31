export const EXACT_LANE_MISS_BUDGETS: Record<string, number> = {
  local_exact_run: 4,
};

export const EXACT_LANE_CONSECUTIVE_MISS_PAIR_BUDGETS: Record<string, number> = {
  local_exact_run: 3,
};

export interface ExactLaneGoldenArtifact {
  weeklyLoad: Array<number | null>;
  weeklyStatus: Array<"complete" | "partial" | "unavailable">;
  summary: {
    weeks: number;
    sessionCount: number;
    totalLoad: number;
    meanLoad: number;
    minLoad: number | null;
    maxLoad: number | null;
    feasibilityMode: "target_seeking" | "capacity_bounded";
    blockStatus: "complete" | "partial" | "unavailable";
    blockGatePass: boolean | null;
    meanGatePass: boolean | null;
    weeklyMissesWithinBudget: boolean;
    consecutiveMissPairsWithinBudget: boolean;
  };
}

export const EXACT_LANE_GOLDENS: Record<string, ExactLaneGoldenArtifact> = {
  local_exact_run: {
    weeklyLoad: [93, 93, 93, 55.5],
    weeklyStatus: ["complete", "complete", "complete", "complete"],
    summary: {
      weeks: 4,
      sessionCount: 11,
      totalLoad: 334.5,
      meanLoad: 83.6,
      minLoad: 55.5,
      maxLoad: 93,
      feasibilityMode: "capacity_bounded",
      blockStatus: "complete",
      blockGatePass: true,
      meanGatePass: true,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
};
