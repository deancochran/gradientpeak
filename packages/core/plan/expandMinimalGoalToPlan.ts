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
import { canonicalizeMinimalTrainingPlanCreate } from "./canonicalization";
import { derivePlanTimeline } from "./derivePlanTimeline";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";
import { normalizeGoalPriority } from "./goalPriorityWeighting";

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

type SegmentSpec = {
  phase: TrainingBlock["phase"];
  days: number;
  priority: number;
};

export function expandMinimalGoalToPlan(
  input: MinimalTrainingPlanCreate,
  options: ExpandMinimalGoalToPlanOptions = {},
): Extract<TrainingPlanCreate, { plan_type: "periodized" }> {
  const parsed = minimalTrainingPlanCreateSchema.parse(input);
  const canonicalMinimalPlan = canonicalizeMinimalTrainingPlanCreate(parsed);
  const normalizedGoals = canonicalMinimalPlan.goals.map((goal, index) =>
    normalizeGoalInput(goal, {
      idSeed: `minimal-goal:${goal.target_date}:${goal.priority ?? 1}:${index}`,
    }),
  );
  const normalizedGoal = getPrimaryGoal(normalizedGoals);
  const goalIds = normalizedGoals.map((goal) => goal.id);

  const timeline = derivePlanTimeline({
    goals: normalizedGoals,
    plan_start_date: canonicalMinimalPlan.plan_start_date ?? options.startDate,
    today_date: options.todayDate,
  });
  const startDate = timeline.start_date;
  const endDate = timeline.end_date;
  const orderedGoals = [...normalizedGoals].sort((a, b) => {
    const byDate = a.target_date.localeCompare(b.target_date);
    if (byDate !== 0) return byDate;
    return a.priority - b.priority;
  });
  const baseWeeklyTss = Math.max(
    50,
    Math.round((options.startingCtl ?? 40) * 7),
  );
  const segments = mergeAdjacentSegments(
    buildGoalAwareSegments(startDate, orderedGoals),
  );

  let cursor = startDate;
  let progression = 1;
  const blocks: TrainingBlock[] = segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const blockEndDate = isLast
      ? endDate
      : addDaysDateOnlyUtc(cursor, segment.days - 1);
    const phaseMultiplier = getPhaseTssMultiplier(segment.phase);
    const priorityMultiplier = getPriorityTssMultiplier(segment.priority);
    const targetTss = Math.round(
      clamp(
        baseWeeklyTss * phaseMultiplier * priorityMultiplier * progression,
        baseWeeklyTss * 0.45,
        baseWeeklyTss * 1.85,
      ),
    );
    progression = clamp(
      progression + getProgressionDelta(segment.phase),
      0.62,
      1.5,
    );
    const targetRangeSpread = getTargetRangeSpread(segment.phase);

    const block: TrainingBlock = {
      id: deterministicUuidFromSeed(
        `${normalizedGoal.id}|${segment.phase}|${index}|${cursor}|${blockEndDate}`,
      ),
      name: phaseName(segment.phase),
      start_date: cursor,
      end_date: blockEndDate,
      goal_ids: goalIds,
      phase: segment.phase,
      target_weekly_tss_range: {
        min: Math.max(0, Math.round(targetTss * (1 - targetRangeSpread))),
        max: Math.max(0, Math.round(targetTss * (1 + targetRangeSpread))),
      },
      target_sessions_per_week_range: getPhaseSessionRange(segment.phase),
    };

    cursor = addDaysDateOnlyUtc(blockEndDate, 1);
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

function buildGoalAwareSegments(
  startDate: string,
  goals: TrainingGoal[],
): SegmentSpec[] {
  const segments: SegmentSpec[] = [];
  let cursor = startDate;

  for (let index = 0; index < goals.length; index++) {
    const goal = goals[index];
    if (!goal) continue;

    let daysToGoal = diffDaysInclusive(cursor, goal.target_date);
    if (daysToGoal <= 0) {
      continue;
    }

    if (index > 0) {
      const previousGoal = goals[index - 1];
      const gapBetweenGoalDates = previousGoal
        ? diffDateOnlyUtcDays(previousGoal.target_date, goal.target_date)
        : 0;
      const recoveryDays = determineRecoveryDays(
        daysToGoal,
        gapBetweenGoalDates,
      );

      if (recoveryDays > 0) {
        segments.push({
          phase: "recovery",
          days: recoveryDays,
          priority: goal.priority,
        });
        cursor = addDaysDateOnlyUtc(cursor, recoveryDays);
        daysToGoal -= recoveryDays;
      }
    }

    if (daysToGoal > 0) {
      segments.push(...buildPrepSegments(daysToGoal, goal.priority));
      cursor = addDaysDateOnlyUtc(cursor, daysToGoal);
    }
  }

  return segments;
}

function buildPrepSegments(days: number, priority: number): SegmentSpec[] {
  const normalizedPriority = normalizeGoalPriority(priority);
  const isHighPriority = normalizedPriority >= 7;
  const isLowPriority = normalizedPriority <= 3;

  if (days <= 4) {
    return [{ phase: "build", days, priority: normalizedPriority }];
  }

  let taperDays =
    days >= 56 ? 10 : days >= 35 ? 7 : days >= 18 ? 5 : days >= 10 ? 3 : 2;
  if (isHighPriority) taperDays += 2;
  if (isLowPriority) taperDays -= 1;
  taperDays = clampInteger(taperDays, 1, Math.min(14, days - 1));

  let peakDays = days >= 49 ? 7 : days >= 35 ? 5 : days >= 24 ? 3 : 0;
  if (isHighPriority && peakDays > 0) peakDays += 1;
  if (isLowPriority && peakDays > 0) peakDays = Math.max(0, peakDays - 2);

  const maxPeakDays = Math.max(0, days - taperDays - 7);
  peakDays = clampInteger(peakDays, 0, Math.min(10, maxPeakDays));

  const remainingPrepDays = days - taperDays - peakDays;
  let baseDays = 0;
  if (remainingPrepDays >= 28) {
    baseDays = Math.max(
      7,
      Math.round(remainingPrepDays * (isHighPriority ? 0.45 : 0.4)),
    );
  } else if (remainingPrepDays >= 18) {
    baseDays = Math.max(5, Math.round(remainingPrepDays * 0.3));
  }

  baseDays = Math.min(baseDays, Math.max(0, remainingPrepDays - 7));
  let buildDays = remainingPrepDays - baseDays;
  if (buildDays < 4 && baseDays > 0) {
    const shift = Math.min(baseDays, 4 - buildDays);
    baseDays -= shift;
    buildDays += shift;
  }

  const segments: SegmentSpec[] = [];
  if (baseDays > 0) {
    segments.push({
      phase: "base",
      days: baseDays,
      priority: normalizedPriority,
    });
  }
  if (buildDays > 0) {
    segments.push({
      phase: "build",
      days: buildDays,
      priority: normalizedPriority,
    });
  }
  if (peakDays > 0) {
    segments.push({
      phase: "peak",
      days: peakDays,
      priority: normalizedPriority,
    });
  }
  if (taperDays > 0) {
    segments.push({
      phase: "taper",
      days: taperDays,
      priority: normalizedPriority,
    });
  }

  return segments;
}

function determineRecoveryDays(
  daysToGoal: number,
  gapBetweenGoalDates: number,
): number {
  if (daysToGoal <= 2 || gapBetweenGoalDates <= 0) {
    return 0;
  }

  if (gapBetweenGoalDates <= 10) {
    return Math.min(3, daysToGoal - 1);
  }

  if (gapBetweenGoalDates <= 21) {
    return Math.min(5, Math.max(2, Math.floor(daysToGoal * 0.2)));
  }

  if (gapBetweenGoalDates <= 28) {
    return Math.min(4, Math.max(1, Math.floor(daysToGoal * 0.12)));
  }

  return 0;
}

function mergeAdjacentSegments(segments: SegmentSpec[]): SegmentSpec[] {
  if (segments.length === 0) {
    return [];
  }

  const merged: SegmentSpec[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (!previous || previous.phase !== segment.phase) {
      merged.push({ ...segment });
      continue;
    }

    const totalDays = previous.days + segment.days;
    previous.priority =
      (previous.priority * previous.days + segment.priority * segment.days) /
      totalDays;
    previous.days = totalDays;
  }

  return merged;
}

function phaseName(phase: TrainingBlock["phase"]): string {
  return phase.slice(0, 1).toUpperCase() + phase.slice(1);
}

function getPhaseSessionRange(phase: TrainingBlock["phase"]): {
  min: number;
  max: number;
} {
  switch (phase) {
    case "base":
      return { min: 3, max: 5 };
    case "build":
      return { min: 4, max: 6 };
    case "peak":
      return { min: 4, max: 6 };
    case "taper":
      return { min: 2, max: 4 };
    case "recovery":
      return { min: 2, max: 4 };
    case "transition":
      return { min: 2, max: 4 };
    case "maintenance":
      return { min: 3, max: 5 };
  }
}

function getPhaseTssMultiplier(phase: TrainingBlock["phase"]): number {
  switch (phase) {
    case "base":
      return 1;
    case "build":
      return 1.12;
    case "peak":
      return 1.05;
    case "taper":
      return 0.82;
    case "recovery":
      return 0.66;
    case "transition":
      return 0.72;
    case "maintenance":
      return 0.92;
  }
}

function getPriorityTssMultiplier(priority: number): number {
  const normalized = normalizeGoalPriority(priority);
  const centered = (normalized - 4) / 40;
  return clamp(1 + centered, 0.88, 1.13);
}

function getProgressionDelta(phase: TrainingBlock["phase"]): number {
  switch (phase) {
    case "base":
      return 0.03;
    case "build":
      return 0.05;
    case "peak":
      return 0.01;
    case "taper":
      return -0.08;
    case "recovery":
      return -0.12;
    case "transition":
      return -0.06;
    case "maintenance":
      return 0;
  }
}

function getTargetRangeSpread(phase: TrainingBlock["phase"]): number {
  switch (phase) {
    case "base":
      return 0.12;
    case "build":
      return 0.1;
    case "peak":
      return 0.09;
    case "taper":
      return 0.14;
    case "recovery":
      return 0.18;
    case "transition":
      return 0.16;
    case "maintenance":
      return 0.12;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
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
  return diffDateOnlyUtcDays(startDate, endDate) + 1;
}

function getPrimaryGoal(goals: TrainingGoal[]): TrainingGoal {
  const [primaryGoal] = [...goals].sort((a, b) => a.priority - b.priority);
  if (!primaryGoal) {
    throw new Error("At least one goal is required");
  }

  return primaryGoal;
}
