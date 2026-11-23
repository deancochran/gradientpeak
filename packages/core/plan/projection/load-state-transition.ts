import { calculateLongTermLoad, calculateRecentLoad } from "../../load/progression";

export interface ProjectionLoadState {
  longTermLoad: number;
  recentLoad: number;
}

export interface ProjectionLoadStatePoint extends ProjectionLoadState {
  dayOffset: number;
}

/**
 * Canonical load-state transition used by projection execution and optimizer lookahead.
 * The divisor and rounding options preserve each caller's explicit load-distribution policy.
 */
export function simulateProjectionLoadState(input: {
  startingState: ProjectionLoadState;
  weeklyLoad: number;
  days: number;
  distributionDays?: number;
  roundDailyLoad?: boolean;
}): { finalState: ProjectionLoadState; points: ProjectionLoadStatePoint[]; dailyLoad: number } {
  const distributionDays = Math.max(1, input.distributionDays ?? 7);
  const unroundedDailyLoad = input.weeklyLoad / distributionDays;
  const dailyLoad = input.roundDailyLoad
    ? Math.round(unroundedDailyLoad * 10) / 10
    : unroundedDailyLoad;
  let longTermLoad = input.startingState.longTermLoad;
  let recentLoad = input.startingState.recentLoad;
  const points: ProjectionLoadStatePoint[] = [];

  for (let dayOffset = 0; dayOffset < input.days; dayOffset += 1) {
    longTermLoad = calculateLongTermLoad(longTermLoad, dailyLoad);
    recentLoad = calculateRecentLoad(recentLoad, dailyLoad);
    if (!Number.isFinite(longTermLoad)) {
      throw new Error("projection_numerical_instability_longTermLoad");
    }
    if (!Number.isFinite(recentLoad)) {
      throw new Error("projection_numerical_instability_recentLoad");
    }
    points.push({ dayOffset, longTermLoad, recentLoad });
  }

  return { finalState: { longTermLoad, recentLoad }, points, dailyLoad };
}
