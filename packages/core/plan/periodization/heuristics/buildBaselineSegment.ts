import type { CanonicalActivityCategory } from "../../../schemas/activity-category";
import { referenceTrajectoryPointSchema, type TrajectoryPhase } from "../../../schemas/planning";
import { getActivityCategoryModelConfig } from "../activity-categories";

export interface BuildBaselineSegmentInput {
  startDate: string;
  endDate: string;
  startLongTermLoad: number;
  endLongTermLoad: number;
  phase: TrajectoryPhase;
  activity_category: CanonicalActivityCategory;
  goalIdsInEffect?: string[];
  rationaleCodes?: string[];
  excludeStart?: boolean;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function diffDays(startDate: string, endDate: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86400000,
    ),
  );
}

function solveDailyLoad(
  currentLongTermLoad: number,
  nextLongTermLoad: number,
  longTermLoadTauDays: number,
): number {
  return Math.max(
    0,
    round(currentLongTermLoad + longTermLoadTauDays * (nextLongTermLoad - currentLongTermLoad)),
  );
}

export function buildBaselineSegment(input: BuildBaselineSegmentInput) {
  if (input.endDate < input.startDate) {
    return [];
  }

  const totalDays = diffDays(input.startDate, input.endDate);
  const config = getActivityCategoryModelConfig(input.activity_category);
  const points = [];

  for (let index = input.excludeStart ? 1 : 0; index <= totalDays; index += 1) {
    const progress = totalDays === 0 ? 1 : index / totalDays;
    const longTermLoad = Math.max(
      0,
      round(input.startLongTermLoad + (input.endLongTermLoad - input.startLongTermLoad) * progress),
    );
    const nextProgress = totalDays === 0 ? 1 : Math.min(1, (index + 1) / totalDays);
    const nextLongTermLoad = Math.max(
      0,
      round(
        input.startLongTermLoad + (input.endLongTermLoad - input.startLongTermLoad) * nextProgress,
      ),
    );

    points.push(
      referenceTrajectoryPointSchema.parse({
        date: addDays(input.startDate, index),
        target_longTermLoad: longTermLoad,
        target_load: solveDailyLoad(longTermLoad, nextLongTermLoad, config.longTermLoad_tau_days),
        target_recentLoad_ceiling: round(longTermLoad * config.acwr_ceiling),
        phase: input.phase,
        goal_ids_in_effect: input.goalIdsInEffect ?? [],
        rationale_codes: input.rationaleCodes ?? [],
      }),
    );
  }

  return points;
}
