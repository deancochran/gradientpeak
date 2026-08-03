export const EXACT_LANE_MISS_BUDGETS: Record<string, number> = {
  exact_5k_speed_block: 2,
  intermediate_rich_half: 6,
  advanced_marathon_build: 6,
  boundary_feasible_bike: 4,
};

export const EXACT_LANE_CONSECUTIVE_MISS_PAIR_BUDGETS: Record<string, number> = {
  exact_5k_speed_block: 0,
  intermediate_rich_half: 4,
  advanced_marathon_build: 3,
  boundary_feasible_bike: 0,
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
  exact_5k_speed_block: {
    weeklyLoad: [110.2, 140.9, 114.2, 122.9, 140.9, 140.9, 114.2, 122.9],
    weeklyStatus: [
      "partial",
      "complete",
      "partial",
      "complete",
      "complete",
      "complete",
      "partial",
      "complete",
    ],
    summary: {
      weeks: 8,
      sessionCount: 30,
      totalLoad: 1007.1,
      meanLoad: 125.9,
      minLoad: 110.2,
      maxLoad: 140.9,
      feasibilityMode: "target_seeking",
      blockStatus: "partial",
      blockGatePass: null,
      meanGatePass: null,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
  intermediate_rich_half: {
    weeklyLoad: [86.3, 54.9, 86.3, 54.9, 72.9, 153.7, 72.9, 153.7, 54.9, 68.3],
    weeklyStatus: Array.from({ length: 10 }, () => "partial"),
    summary: {
      weeks: 10,
      sessionCount: 36,
      totalLoad: 858.8,
      meanLoad: 85.9,
      minLoad: 54.9,
      maxLoad: 153.7,
      feasibilityMode: "capacity_bounded",
      blockStatus: "partial",
      blockGatePass: null,
      meanGatePass: null,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
  advanced_marathon_build: {
    weeklyLoad: [86.3, 86.3, 104.3, 65.2, 86.3, 104.3, 86.3, 65.2, 86.3, 104.3, 86.3, 65.2],
    weeklyStatus: Array.from({ length: 12 }, () => "partial"),
    summary: {
      weeks: 12,
      sessionCount: 48,
      totalLoad: 1026.1,
      meanLoad: 85.5,
      minLoad: 65.2,
      maxLoad: 104.3,
      feasibilityMode: "capacity_bounded",
      blockStatus: "partial",
      blockGatePass: null,
      meanGatePass: null,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
  boundary_feasible_bike: {
    weeklyLoad: [
      219.5, 210.6, 219.5, 151.4, 227.5, 218.5, 227.5, 151.4, 227.5, 218.5, 227.5, 151.4,
    ],
    weeklyStatus: Array.from({ length: 12 }, () => "partial"),
    summary: {
      weeks: 12,
      sessionCount: 45,
      totalLoad: 2450.9,
      meanLoad: 204.2,
      minLoad: 151.4,
      maxLoad: 227.5,
      feasibilityMode: "target_seeking",
      blockStatus: "partial",
      blockGatePass: null,
      meanGatePass: null,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
};
