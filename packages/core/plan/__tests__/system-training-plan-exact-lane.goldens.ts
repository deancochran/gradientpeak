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
  weeklyLoadTss: number[];
  summary: {
    weeks: number;
    sessionCount: number;
    totalTss: number;
    meanTss: number;
    minTss: number;
    maxTss: number;
    feasibilityMode: "target_seeking" | "capacity_bounded";
    blockGatePass: boolean;
    meanGatePass: boolean;
    weeklyMissesWithinBudget: boolean;
    consecutiveMissPairsWithinBudget: boolean;
  };
}

export const EXACT_LANE_GOLDENS: Record<string, ExactLaneGoldenArtifact> = {
  exact_5k_speed_block: {
    weeklyLoadTss: [153, 140, 157, 122, 140, 140, 157, 122],
    summary: {
      weeks: 8,
      sessionCount: 30,
      totalTss: 1131,
      meanTss: 141.4,
      minTss: 122,
      maxTss: 157,
      feasibilityMode: "target_seeking",
      blockGatePass: true,
      meanGatePass: true,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
  intermediate_rich_half: {
    weeklyLoadTss: [144, 156, 144, 156, 174, 197, 174, 197, 156, 126],
    summary: {
      weeks: 10,
      sessionCount: 36,
      totalTss: 1624,
      meanTss: 162.4,
      minTss: 126,
      maxTss: 197,
      feasibilityMode: "capacity_bounded",
      blockGatePass: true,
      meanGatePass: true,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
  advanced_marathon_build: {
    weeklyLoadTss: [144, 144, 162, 123, 144, 162, 144, 123, 144, 162, 144, 123],
    summary: {
      weeks: 12,
      sessionCount: 48,
      totalTss: 1719,
      meanTss: 143.3,
      minTss: 123,
      maxTss: 162,
      feasibilityMode: "capacity_bounded",
      blockGatePass: true,
      meanGatePass: true,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
  boundary_feasible_bike: {
    weeklyLoadTss: [230, 221, 230, 162, 238, 229, 238, 162, 238, 229, 238, 162],
    summary: {
      weeks: 12,
      sessionCount: 45,
      totalTss: 2577,
      meanTss: 214.8,
      minTss: 162,
      maxTss: 238,
      feasibilityMode: "target_seeking",
      blockGatePass: true,
      meanGatePass: true,
      weeklyMissesWithinBudget: true,
      consecutiveMissPairsWithinBudget: true,
    },
  },
};
