import {
  minimalTrainingPlanCreateSchema,
  periodizedPlanCreateSchema,
  type MinimalTrainingPlanCreate,
  type TrainingBlock,
  type TrainingGoal,
  type TrainingPlanCreate,
} from "../schemas/training_plan_structure";
import {
  deriveActivityCategoriesFromGoalTargets,
  deterministicUuidFromSeed,
  normalizeGoalInput,
} from "./normalizeGoalInput";
import { derivePlanTimeline } from "./derivePlanTimeline";

type ActivityDistributionInput = Partial<Record<string, number>>;

export interface ExpandMinimalGoalToPlanOptions {
  planName?: string;
  description?: string;
  startDate?: string;
  todayDate?: string;
  startingCtl?: number;
  activityDistribution?: ActivityDistributionInput;
  metadata?: Record<string, unknown>;
}

type PhaseSpec = {
  name: string;
  phase: TrainingBlock["phase"];
  days: number;
  tssMultiplier: number;
  sessionsRange: { min: number; max: number };
};

export function expandMinimalGoalToPlan(
  input: MinimalTrainingPlanCreate,
  options: ExpandMinimalGoalToPlanOptions = {},
): Extract<TrainingPlanCreate, { plan_type: "periodized" }> {
  const parsed = minimalTrainingPlanCreateSchema.parse(input);
  const normalizedGoals = parsed.goals.map((goal, index) =>
    normalizeGoalInput(goal, {
      idSeed: `minimal-goal:${index}`,
    }),
  );
  const normalizedGoal = getPrimaryGoal(normalizedGoals);
  const goalIds = normalizedGoals.map((goal) => goal.id);

  const timeline = derivePlanTimeline({
    goals: normalizedGoals,
    plan_start_date: parsed.plan_start_date ?? options.startDate,
    today_date: options.todayDate,
  });
  const startDate = timeline.start_date;
  const endDate = timeline.end_date;
  const totalDays = Math.max(1, diffDaysInclusive(startDate, endDate));
  const phases = buildPhaseSpecs(totalDays);

  let cursor = startDate;
  const blocks: TrainingBlock[] = phases.map((phase, index) => {
    const isLast = index === phases.length - 1;
    const blockEndDate = isLast ? endDate : addDaysUtc(cursor, phase.days - 1);
    const baseWeeklyTss = Math.max(
      50,
      Math.round((options.startingCtl ?? 40) * 7),
    );
    const targetTss = Math.round(baseWeeklyTss * phase.tssMultiplier);

    const block: TrainingBlock = {
      id: deterministicUuidFromSeed(
        `${normalizedGoal.id}|${phase.phase}|${index}|${cursor}|${blockEndDate}`,
      ),
      name: phase.name,
      start_date: cursor,
      end_date: blockEndDate,
      goal_ids: goalIds,
      phase: phase.phase,
      target_weekly_tss_range: {
        min: Math.max(0, Math.round(targetTss * 0.85)),
        max: Math.max(0, Math.round(targetTss * 1.15)),
      },
      target_sessions_per_week_range: phase.sessionsRange,
    };

    cursor = addDaysUtc(blockEndDate, 1);
    return block;
  });

  const [primaryCategory] =
    deriveActivityCategoriesFromGoalTargets(normalizedGoals);
  const activityDistribution = normalizeActivityDistribution(
    options.activityDistribution,
    primaryCategory ?? "run",
  );

  const plan = {
    plan_type: "periodized" as const,
    name: options.planName ?? `${normalizedGoal.name} Training Plan`,
    description: options.description,
    start_date: startDate,
    end_date: endDate,
    goals: normalizedGoals,
    fitness_progression: {
      starting_ctl: Math.max(0, options.startingCtl ?? 40),
    },
    activity_distribution: activityDistribution,
    constraints: {
      min_rest_days_per_week: 1,
    },
    blocks,
    is_active: true,
    metadata: options.metadata,
  };

  return periodizedPlanCreateSchema.parse(plan);
}

function buildPhaseSpecs(totalDays: number): PhaseSpec[] {
  if (totalDays < 14) {
    return [
      {
        name: "Build",
        phase: "build",
        days: totalDays,
        tssMultiplier: 1.0,
        sessionsRange: { min: 3, max: 5 },
      },
    ];
  }

  if (totalDays < 42) {
    return [
      {
        name: "Build",
        phase: "build",
        days: totalDays - 7,
        tssMultiplier: 1.1,
        sessionsRange: { min: 4, max: 6 },
      },
      {
        name: "Taper",
        phase: "taper",
        days: 7,
        tssMultiplier: 0.82,
        sessionsRange: { min: 2, max: 4 },
      },
    ];
  }

  const baseDays = Math.max(7, Math.round(totalDays * 0.45));
  const rawTaperDays = Math.max(7, Math.round(totalDays * 0.12));
  const taperDays = Math.min(14, rawTaperDays);
  const adjustedBuildDays = Math.max(7, totalDays - baseDays - taperDays);

  return [
    {
      name: "Base",
      phase: "base",
      days: baseDays,
      tssMultiplier: 1.0,
      sessionsRange: { min: 3, max: 5 },
    },
    {
      name: "Build",
      phase: "build",
      days: adjustedBuildDays,
      tssMultiplier: 1.15,
      sessionsRange: { min: 4, max: 6 },
    },
    {
      name: "Taper",
      phase: "taper",
      days: taperDays,
      tssMultiplier: 0.82,
      sessionsRange: { min: 2, max: 4 },
    },
  ];
}

function normalizeActivityDistribution(
  distribution: ActivityDistributionInput | undefined,
  fallbackCategory: string,
): Record<string, { target_percentage: number }> {
  const entries = Object.entries(distribution ?? {}).filter(
    ([, value]) => Number.isFinite(value ?? NaN) && (value ?? 0) > 0,
  );

  if (entries.length === 0) {
    return {
      [fallbackCategory]: { target_percentage: 1 },
    };
  }

  const total = entries.reduce((sum, [, value]) => sum + (value ?? 0), 0);
  if (total <= 0) {
    return {
      [fallbackCategory]: { target_percentage: 1 },
    };
  }

  return Object.fromEntries(
    entries.map(([category, value]) => [
      category,
      { target_percentage: (value ?? 0) / total },
    ]),
  );
}

function diffDaysInclusive(startDate: string, endDate: string): number {
  const start = parseDateOnlyUtc(startDate).getTime();
  const end = parseDateOnlyUtc(endDate).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end - start) / dayMs) + 1;
}

function addDaysUtc(dateString: string, days: number): string {
  const date = parseDateOnlyUtc(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyUtc(date);
}

function parseDateOnlyUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPrimaryGoal(goals: TrainingGoal[]): TrainingGoal {
  const [primaryGoal] = [...goals].sort((a, b) => a.priority - b.priority);
  if (!primaryGoal) {
    throw new Error("At least one goal is required");
  }

  return primaryGoal;
}
