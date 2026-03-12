import {
  referenceTrajectoryPointSchema,
  type TrajectoryPhase,
} from "../../../schemas/planning";
import type { CanonicalSport } from "../../../schemas/sport";
import { getSportModelConfig } from "../sports";

export interface BuildBaselineSegmentInput {
  startDate: string;
  endDate: string;
  startCtl: number;
  endCtl: number;
  phase: TrajectoryPhase;
  sport: CanonicalSport;
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
      (Date.parse(`${endDate}T00:00:00.000Z`) -
        Date.parse(`${startDate}T00:00:00.000Z`)) /
        86400000,
    ),
  );
}

function solveDailyTss(
  currentCtl: number,
  nextCtl: number,
  ctlTauDays: number,
): number {
  return Math.max(0, round(currentCtl + ctlTauDays * (nextCtl - currentCtl)));
}

export function buildBaselineSegment(input: BuildBaselineSegmentInput) {
  if (input.endDate < input.startDate) {
    return [];
  }

  const totalDays = diffDays(input.startDate, input.endDate);
  const config = getSportModelConfig(input.sport);
  const points = [];

  for (let index = input.excludeStart ? 1 : 0; index <= totalDays; index += 1) {
    const progress = totalDays === 0 ? 1 : index / totalDays;
    const ctl = Math.max(
      0,
      round(input.startCtl + (input.endCtl - input.startCtl) * progress),
    );
    const nextProgress =
      totalDays === 0 ? 1 : Math.min(1, (index + 1) / totalDays);
    const nextCtl = Math.max(
      0,
      round(input.startCtl + (input.endCtl - input.startCtl) * nextProgress),
    );

    points.push(
      referenceTrajectoryPointSchema.parse({
        date: addDays(input.startDate, index),
        target_ctl: ctl,
        target_tss: solveDailyTss(ctl, nextCtl, config.ctl_tau_days),
        target_atl_ceiling: round(ctl * config.acwr_ceiling),
        phase: input.phase,
        goal_ids_in_effect: input.goalIdsInEffect ?? [],
        rationale_codes: input.rationaleCodes ?? [],
      }),
    );
  }

  return points;
}
