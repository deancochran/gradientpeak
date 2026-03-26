import { z } from "zod";
import type {
  ActivityDistribution,
  IntensityDistribution,
  PeriodizedPlan,
  TrainingBlock,
  WizardActivityInput,
  WizardFitnessInput,
} from "./domain-schemas";
import { intensityDistributionSchema, trainingPhaseEnum } from "./domain-schemas";

export const INTENSITY_PRESETS: Record<
  "polarized" | "pyramidal" | "threshold",
  IntensityDistribution
> = {
  polarized: { easy: 0.8, moderate: 0.1, hard: 0.1 },
  pyramidal: { easy: 0.7, moderate: 0.2, hard: 0.1 },
  threshold: { easy: 0.6, moderate: 0.3, hard: 0.1 },
};

export const PHASE_CHARACTERISTICS = {
  base: {
    intensity: INTENSITY_PRESETS.polarized,
    sessionsPerWeek: { min: 4, max: 6 },
    durationWeeks: { min: 4, max: 12 },
    tssMultiplier: 1.0,
  },
  build: {
    intensity: INTENSITY_PRESETS.pyramidal,
    sessionsPerWeek: { min: 5, max: 7 },
    durationWeeks: { min: 4, max: 12 },
    tssMultiplier: 1.2,
  },
  peak: {
    intensity: INTENSITY_PRESETS.threshold,
    sessionsPerWeek: { min: 5, max: 7 },
    durationWeeks: { min: 2, max: 4 },
    tssMultiplier: 1.0,
  },
  taper: {
    intensity: INTENSITY_PRESETS.polarized,
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 1, max: 3 },
    tssMultiplier: 0.6,
  },
  recovery: {
    intensity: { easy: 0.95, moderate: 0.05, hard: 0.0 },
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 1, max: 2 },
    tssMultiplier: 0.5,
  },
  transition: {
    intensity: { easy: 0.9, moderate: 0.1, hard: 0.0 },
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 2, max: 4 },
    tssMultiplier: 0.7,
  },
  maintenance: {
    intensity: INTENSITY_PRESETS.polarized,
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 1, max: 52 },
    tssMultiplier: 0.8,
  },
} as const;

export const EXPERIENCE_LEVELS = {
  beginner: {
    weeklyTSSIncreaseRate: 0.05,
    maxWeeklyCTLIncrease: 5,
    recoveryWeekFrequency: 3,
    baselineSessionsPerWeek: 4,
  },
  intermediate: {
    weeklyTSSIncreaseRate: 0.07,
    maxWeeklyCTLIncrease: 7,
    recoveryWeekFrequency: 3,
    baselineSessionsPerWeek: 5,
  },
  advanced: {
    weeklyTSSIncreaseRate: 0.1,
    maxWeeklyCTLIncrease: 10,
    recoveryWeekFrequency: 4,
    baselineSessionsPerWeek: 6,
  },
} as const;

export function calculateWeeks(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil(days / 7);
}

export function addWeeks(dateString: string, weeks: number): string {
  const date = new Date(dateString);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().split("T")[0] || "";
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0] || "";
}

export function calculateWeeksUntil(dateString: string, fromDate?: string): number {
  const target = new Date(dateString);
  const from = fromDate ? new Date(fromDate) : new Date();
  from.setHours(0, 0, 0, 0);
  const days = Math.ceil((target.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil(days / 7);
}

export function estimateCTLFromWeeklyTSS(weeklyTSS: number): number {
  return Math.round(weeklyTSS / 7);
}

export function estimateCTLFromWeeklyHours(weeklyHours: number, avgIntensity: number = 60): number {
  const weeklyTSS = weeklyHours * avgIntensity;
  return estimateCTLFromWeeklyTSS(weeklyTSS);
}

export function estimateWeeklyTSSFromCTL(ctl: number): number {
  return Math.round(ctl * 7);
}

export function resolveFitnessInput(fitness: WizardFitnessInput): number {
  if (fitness.starting_ctl !== undefined) {
    return fitness.starting_ctl;
  }
  if (fitness.estimated_from_weekly_tss !== undefined) {
    return estimateCTLFromWeeklyTSS(fitness.estimated_from_weekly_tss);
  }
  if (fitness.estimated_from_weekly_hours !== undefined) {
    return estimateCTLFromWeeklyHours(fitness.estimated_from_weekly_hours);
  }
  return 40;
}

export function getBlocksInRange(
  blocks: TrainingBlock[],
  startDate: string,
  endDate: string,
): TrainingBlock[] {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return blocks.filter((block) => {
    const blockStart = new Date(block.start_date);
    const blockEnd = new Date(block.end_date);
    return blockStart <= end && blockEnd >= start;
  });
}

export function getBlockDurationWeeks(block: TrainingBlock): number {
  return calculateWeeks(block.start_date, block.end_date);
}

export function normalizeActivityDistribution(
  activities: WizardActivityInput,
): ActivityDistribution {
  return Object.fromEntries(
    Object.entries(activities).map(([type, percentage]) => [
      type,
      { target_percentage: percentage },
    ]),
  );
}

export const mesocycleSchema = z.object({
  name: z.string().min(1).max(100),
  phase: trainingPhaseEnum,
  duration_weeks: z.number().int().min(1).max(52),
  intensity_distribution: intensityDistributionSchema,
  tss_multiplier: z.number().min(0.1).max(3.0),
});

export type Mesocycle = z.infer<typeof mesocycleSchema>;

export type MesocyclePresetKey =
  | "marathon_18wk"
  | "marathon_12wk"
  | "half_marathon_12wk"
  | "10k_8wk"
  | "base_building_8wk"
  | "custom";

export function validatePlanFeasibility(plan: PeriodizedPlan): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  const sortedBlocks = [...plan.blocks].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );

  for (let i = 0; i < sortedBlocks.length - 1; i++) {
    const currentBlock = sortedBlocks[i];
    const nextBlock = sortedBlocks[i + 1];
    if (!currentBlock || !nextBlock) continue;

    const currentEnd = new Date(currentBlock.end_date);
    const nextStart = new Date(nextBlock.start_date);
    const daysBetween = Math.floor(
      (nextStart.getTime() - currentEnd.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysBetween > 1) {
      warnings.push(`Gap of ${daysBetween} days between blocks`);
    }
  }

  if (plan.fitness_progression.target_ctl_at_peak) {
    const totalWeeks = calculateWeeks(plan.start_date, plan.end_date);
    const ctlIncrease =
      plan.fitness_progression.target_ctl_at_peak - plan.fitness_progression.starting_ctl;
    const weeklyIncrease = ctlIncrease / totalWeeks;

    if (weeklyIncrease > 8) {
      warnings.push(`CTL increase of ${weeklyIncrease.toFixed(1)} per week may be too aggressive`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
