import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import { defaultAthletePreferenceProfile } from "../schemas/settings/profile_settings";
import type { GoalTargetV2, MinimalTrainingPlanCreate } from "../schemas/training_plan_structure";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays, formatDateOnlyUtc } from "./dateOnlyUtc";
import { derivePlanTimeline } from "./derivePlanTimeline";
import { deterministicUuidFromSeed } from "./normalizeGoalInput";
import { computeTaperWindow } from "./periodization";
import { fromProfileGoals } from "./periodization/adapters/fromProfileGoals";
import { resolveEventDemand } from "./periodization/heuristics/resolveEventDemand";

type ProjectionBlockPhase = "base" | "build" | "peak" | "taper" | "recovery" | "maintenance";

export type GoalAnchoredProjectionGoal = MinimalTrainingPlanCreate["goals"][number] & {
  id: string;
};

export type GoalAnchoredProjectionPlan = {
  plan_type: "periodized";
  name: string;
  start_date: string;
  end_date: string;
  fitness_progression: {
    starting_ctl: number;
    target_ctl_at_peak?: number;
  };
  activity_distribution: Record<string, { target_percentage: number }>;
  blocks: Array<{
    id: string;
    name: string;
    phase: ProjectionBlockPhase;
    start_date: string;
    end_date: string;
    goal_ids: string[];
    target_weekly_tss_range: { min: number; max: number };
    target_sessions_per_week_range: { min: number; max: number };
  }>;
  goals: GoalAnchoredProjectionGoal[];
};

export interface BuildGoalAnchoredProjectionPlanInput {
  minimalPlan: MinimalTrainingPlanCreate;
  startingCtl?: number;
  preferenceProfile?: AthletePreferenceProfile;
}

type GoalWindow = {
  date: string;
  goals: GoalAnchoredProjectionGoal[];
  priority: number;
  priorityClass: "A" | "B" | "C";
  peakWeeklyTss: number;
  taperDays: number;
  recoveryDays: number;
  tuning: PlannerPreferenceTuning;
};

type PlannerPreferenceTuning = {
  progressionPace: number;
  weekPatternPreference: number;
  recoveryPriority: number;
  targetSurplusPreference: number;
  phaseMultipliers: Record<ProjectionBlockPhase, number>;
  weeklyLoadCap: number | null;
};

type PendingBlock = Omit<GoalAnchoredProjectionPlan["blocks"][number], "id">;

const fallbackPhaseLoadMultiplier: Record<ProjectionBlockPhase, number> = {
  base: 0.72,
  build: 0.88,
  peak: 1,
  taper: 0.62,
  recovery: 0.5,
  maintenance: 0.68,
};

function clampPriority(priority: number | undefined): number {
  if (priority === undefined || Number.isNaN(priority)) {
    return 5;
  }

  return Math.max(0, Math.min(10, Math.round(priority)));
}

function resolvePriorityClass(priority: number): "A" | "B" | "C" {
  if (priority >= 8) return "A";
  if (priority >= 4) return "B";
  return "C";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number | undefined): number {
  return Math.max(0, Math.min(1, value ?? 0.5));
}

function lerp(min: number, max: number, ratio: number): number {
  return min + (max - min) * clamp01(ratio);
}

function resolvePlannerPreferenceTuning(
  preferenceProfile: AthletePreferenceProfile,
  applyDoseLimitCaps: boolean,
): PlannerPreferenceTuning {
  const progressionPace = clamp01(preferenceProfile.training_style.progression_pace);
  const weekPatternPreference = clamp01(preferenceProfile.training_style.week_pattern_preference);
  const recoveryPriority = clamp01(preferenceProfile.recovery_preferences.recovery_priority);
  const targetSurplusPreference = clamp01(
    preferenceProfile.goal_strategy_preferences.target_surplus_preference,
  );
  const weeklyDurationCap = preferenceProfile.dose_limits.max_weekly_duration_minutes;
  const maxSessionDuration = preferenceProfile.dose_limits.max_single_session_duration_minutes;
  const maxSessions = preferenceProfile.dose_limits.max_sessions_per_week;
  const weeklyDurationFromSessions =
    typeof maxSessionDuration === "number" && typeof maxSessions === "number"
      ? maxSessionDuration * maxSessions
      : null;
  const weeklyDurationCandidates = [
    ...(typeof weeklyDurationCap === "number" ? [weeklyDurationCap] : []),
    ...(weeklyDurationFromSessions !== null ? [weeklyDurationFromSessions] : []),
  ];
  const effectiveWeeklyDurationCap =
    weeklyDurationCandidates.length > 0 ? Math.min(...weeklyDurationCandidates) : null;
  const weeklyLoadCap =
    applyDoseLimitCaps &&
    effectiveWeeklyDurationCap !== null &&
    Number.isFinite(effectiveWeeklyDurationCap)
      ? Math.max(90, Math.round(effectiveWeeklyDurationCap * lerp(0.72, 0.98, progressionPace)))
      : null;

  return {
    progressionPace,
    weekPatternPreference,
    recoveryPriority,
    targetSurplusPreference,
    weeklyLoadCap,
    phaseMultipliers: {
      base: round(lerp(0.84, 0.6, progressionPace) * lerp(1.04, 0.96, weekPatternPreference)),
      build: round(lerp(0.93, 0.84, progressionPace) * lerp(0.98, 1.03, weekPatternPreference)),
      peak: round(lerp(0.95, 1.08, progressionPace) * lerp(0.96, 1.06, targetSurplusPreference)),
      taper: round(lerp(0.72, 0.52, recoveryPriority)),
      recovery: round(lerp(0.6, 0.42, recoveryPriority)),
      maintenance: round(lerp(0.76, 0.62, progressionPace)),
    },
  };
}

function buildActivityDistribution(
  goals: MinimalTrainingPlanCreate["goals"],
): GoalAnchoredProjectionPlan["activity_distribution"] {
  const categoryCounts = new Map<string, number>();

  for (const goal of goals) {
    for (const target of goal.targets) {
      const category =
        "activity_category" in target && target.activity_category
          ? target.activity_category
          : "other";
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  if (categoryCounts.size === 0) {
    return { other: { target_percentage: 1 } };
  }

  const total = [...categoryCounts.values()].reduce((sum, count) => sum + count, 0);
  const entries = [...categoryCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let runningTotal = 0;
  const distribution: GoalAnchoredProjectionPlan["activity_distribution"] = {};

  for (let index = 0; index < entries.length; index += 1) {
    const [category, count] = entries[index]!;
    const value =
      index === entries.length - 1
        ? Math.max(0, Math.round((1 - runningTotal) * 1000) / 1000)
        : Math.round((count / total) * 1000) / 1000;
    distribution[category] = { target_percentage: value };
    runningTotal += value;
  }

  return distribution;
}

function resolveGoalWindows(input: {
  goals: GoalAnchoredProjectionGoal[];
  startingCtl: number;
  preferenceProfile: AthletePreferenceProfile;
  applyDoseLimitCaps: boolean;
}): GoalWindow[] {
  const goalsByDate = new Map<string, GoalAnchoredProjectionGoal[]>();

  for (const goal of input.goals) {
    const group = goalsByDate.get(goal.target_date) ?? [];
    group.push(goal);
    goalsByDate.set(goal.target_date, group);
  }

  return [...goalsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, goals]) => {
      const priority = Math.max(...goals.map((goal) => clampPriority(goal.priority)));
      const normalizedGoals = fromProfileGoals(
        goals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          target_date: goal.target_date,
          priority: goal.priority,
          targets: goal.targets as GoalTargetV2[],
        })),
      );
      const demands = normalizedGoals.flatMap((goal) => {
        const result = resolveEventDemand(goal);
        return result.status === "supported" ? [result.demand] : [];
      });
      const priorityProgress = priority / 10;
      const tuning = resolvePlannerPreferenceTuning(
        input.preferenceProfile,
        input.applyDoseLimitCaps,
      );
      const baselineWeeklyTss = Math.max(140, input.startingCtl * 7);
      const demandPeakWeeklyTss = demands.reduce((max, demand) => {
        const priorityScale =
          0.5 +
          priorityProgress * 0.15 +
          tuning.targetSurplusPreference * 0.1 +
          (tuning.progressionPace - 0.5) * 0.12;
        return Math.max(max, demand.required_weekly_load_floor * priorityScale);
      }, 0);
      const uncappedPeakWeeklyTss = round(Math.max(baselineWeeklyTss, demandPeakWeeklyTss));
      const peakWeeklyTss =
        tuning.weeklyLoadCap === null
          ? uncappedPeakWeeklyTss
          : round(Math.min(uncappedPeakWeeklyTss, tuning.weeklyLoadCap));
      const primaryDemand = demands.sort(
        (left, right) => right.required_weekly_load_floor - left.required_weekly_load_floor,
      )[0];
      const maxDemandDurationMinutes = demands.reduce(
        (max, demand) => Math.max(max, demand.demand_duration_minutes),
        0,
      );
      const maxDemandWeeklyLoad = demands.reduce(
        (max, demand) => Math.max(max, demand.required_weekly_load_floor),
        0,
      );
      const taperDays = primaryDemand
        ? computeTaperWindow(primaryDemand, input.preferenceProfile).days
        : priority >= 8
          ? 14
          : 7;
      const configuredRecoveryDays =
        input.preferenceProfile.recovery_preferences.post_goal_recovery_days;
      const durationPressure = Math.min(1, maxDemandDurationMinutes / 240);
      const loadPressure = Math.min(1, maxDemandWeeklyLoad / 650);
      const priorityPressure = priority / 10;
      const recoveryScale =
        0.55 +
        tuning.recoveryPriority * 0.65 +
        durationPressure * 0.45 +
        loadPressure * 0.25 +
        priorityPressure * 0.18;
      const recoveryDays = Math.max(
        0,
        Math.min(28, Math.round(configuredRecoveryDays * recoveryScale)),
      );

      return {
        date,
        goals: [...goals].sort((left, right) => {
          const priorityDelta = clampPriority(right.priority) - clampPriority(left.priority);
          return priorityDelta !== 0 ? priorityDelta : left.name.localeCompare(right.name);
        }),
        priority,
        priorityClass: resolvePriorityClass(priority),
        peakWeeklyTss,
        taperDays,
        recoveryDays,
        tuning,
      };
    });
}

function pushBlock(input: {
  blocks: PendingBlock[];
  name: string;
  phase: ProjectionBlockPhase;
  startDate: string;
  endDate: string;
  peakWeeklyTss: number;
  tuning?: PlannerPreferenceTuning;
  goalIds?: string[];
}) {
  if (input.endDate < input.startDate) {
    return;
  }

  const phaseLoadMultiplier = input.tuning?.phaseMultipliers ?? fallbackPhaseLoadMultiplier;
  const targetWeeklyTss = Math.max(
    60,
    Math.round(input.peakWeeklyTss * phaseLoadMultiplier[input.phase]),
  );
  input.blocks.push({
    name: input.name,
    phase: input.phase,
    start_date: input.startDate,
    end_date: input.endDate,
    goal_ids: input.goalIds ?? [],
    target_weekly_tss_range: {
      min: Math.max(60, Math.round(targetWeeklyTss * 0.88)),
      max: Math.max(90, Math.round(targetWeeklyTss * 1.12)),
    },
    target_sessions_per_week_range:
      input.phase === "taper" || input.phase === "recovery"
        ? { min: 2, max: 4 }
        : { min: 3, max: 6 },
  });
}

function pushPreparationBlocks(input: {
  blocks: PendingBlock[];
  startDate: string;
  endDate: string;
  window: GoalWindow;
}) {
  const prepDays = diffDateOnlyUtcDays(input.startDate, input.endDate) + 1;
  if (prepDays <= 0) return;

  const progressionPace = input.window.tuning.progressionPace;
  const weekPatternPreference = input.window.tuning.weekPatternPreference;
  const longBaseRatio = lerp(0.45, 0.25, progressionPace);
  const longPeakRatio = lerp(0.12, 0.24, weekPatternPreference);
  const mediumBaseRatio = lerp(0.34, 0.16, progressionPace);
  const mediumPeakRatio = lerp(0.14, 0.26, weekPatternPreference);
  const shortPeakRatio = lerp(0.18, 0.34, weekPatternPreference);
  const phases: Array<{ phase: ProjectionBlockPhase; ratio: number }> =
    prepDays >= 84
      ? [
          { phase: "base", ratio: longBaseRatio },
          { phase: "build", ratio: Math.max(0.25, 1 - longBaseRatio - longPeakRatio) },
          { phase: "peak", ratio: longPeakRatio },
        ]
      : prepDays >= 42
        ? [
            { phase: "base", ratio: mediumBaseRatio },
            { phase: "build", ratio: Math.max(0.3, 1 - mediumBaseRatio - mediumPeakRatio) },
            { phase: "peak", ratio: mediumPeakRatio },
          ]
        : prepDays >= 14
          ? [
              { phase: "build", ratio: Math.max(0.55, 1 - shortPeakRatio) },
              { phase: "peak", ratio: shortPeakRatio },
            ]
          : [{ phase: "peak", ratio: 1 }];

  let phaseStart = input.startDate;
  let consumedDays = 0;

  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index]!;
    const isLast = index === phases.length - 1;
    const phaseDays = isLast
      ? prepDays - consumedDays
      : Math.max(1, Math.round(prepDays * phase.ratio));
    const phaseEnd = isLast
      ? input.endDate
      : addDaysDateOnlyUtc(phaseStart, Math.max(0, phaseDays - 1));
    pushBlock({
      blocks: input.blocks,
      name: `${input.window.goals[0]?.name ?? "Goal"} ${phase.phase}`,
      phase: phase.phase,
      startDate: phaseStart,
      endDate: phaseEnd <= input.endDate ? phaseEnd : input.endDate,
      peakWeeklyTss: input.window.peakWeeklyTss,
      tuning: input.window.tuning,
      goalIds: phase.phase === "peak" ? input.window.goals.map((goal) => goal.id) : [],
    });
    consumedDays += phaseDays;
    phaseStart = addDaysDateOnlyUtc(phaseEnd, 1);
    if (phaseStart > input.endDate) break;
  }
}

function withDeterministicBlockIds(
  blocks: PendingBlock[],
  timelineStart: string,
  timelineEnd: string,
): GoalAnchoredProjectionPlan["blocks"] {
  return blocks.map((block, index) => ({
    id: deterministicUuidFromSeed(
      `goal-anchored-block|${timelineStart}|${timelineEnd}|${index}|${block.name}|${block.start_date}|${block.end_date}`,
    ),
    ...block,
  }));
}

export function buildGoalAnchoredProjectionPlan(
  input: BuildGoalAnchoredProjectionPlanInput,
): GoalAnchoredProjectionPlan {
  const timeline = derivePlanTimeline({
    goals: input.minimalPlan.goals,
    plan_start_date: input.minimalPlan.plan_start_date ?? formatDateOnlyUtc(new Date()),
  });
  const startingCtl = input.startingCtl ?? 45;
  const preferenceProfile = input.preferenceProfile ?? defaultAthletePreferenceProfile;
  const goals = input.minimalPlan.goals
    .map((goal, index) => ({
      ...goal,
      id: deterministicUuidFromSeed(
        `goal-anchored-goal|${timeline.start_date}|${goal.target_date}|${goal.name}|${index}`,
      ),
    }))
    .sort((left, right) => left.target_date.localeCompare(right.target_date));
  const windows = resolveGoalWindows({
    goals,
    startingCtl,
    preferenceProfile,
    applyDoseLimitCaps: input.preferenceProfile !== undefined,
  });
  const timelineEndDate = windows.reduce((endDate, window) => {
    const recoveryEndDate =
      window.recoveryDays > 0 ? addDaysDateOnlyUtc(window.date, window.recoveryDays) : window.date;
    return recoveryEndDate > endDate ? recoveryEndDate : endDate;
  }, timeline.end_date);
  const pendingBlocks: PendingBlock[] = [];
  let cursorDate = timeline.start_date;

  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index]!;
    if (window.date < cursorDate) {
      continue;
    }

    const nextWindow = windows[index + 1];
    const daysToGoal = diffDateOnlyUtcDays(cursorDate, window.date) + 1;
    const closeLowerPriorityBeforeAGoal =
      nextWindow?.priorityClass === "A" &&
      window.priorityClass !== "A" &&
      diffDateOnlyUtcDays(window.date, nextWindow.date) <= 35;
    const taperDays = closeLowerPriorityBeforeAGoal
      ? Math.min(4, window.taperDays)
      : Math.min(window.taperDays, Math.max(3, Math.floor(daysToGoal * 0.3)));
    const taperStart = addDaysDateOnlyUtc(window.date, -(taperDays - 1));
    const prepEnd = addDaysDateOnlyUtc(taperStart, -1);

    pushPreparationBlocks({
      blocks: pendingBlocks,
      startDate: cursorDate,
      endDate: prepEnd,
      window,
    });
    pushBlock({
      blocks: pendingBlocks,
      name: `${window.goals[0]?.name ?? "Goal"} taper`,
      phase: "taper",
      startDate: taperStart > cursorDate ? taperStart : cursorDate,
      endDate: window.date,
      peakWeeklyTss: window.peakWeeklyTss,
      tuning: window.tuning,
      goalIds: window.goals.map((goal) => goal.id),
    });

    const recoveryDays = window.recoveryDays;
    const recoveryStart = addDaysDateOnlyUtc(window.date, 1);
    const recoveryEnd = addDaysDateOnlyUtc(recoveryStart, recoveryDays - 1);
    if (recoveryDays > 0 && recoveryStart <= timelineEndDate) {
      pushBlock({
        blocks: pendingBlocks,
        name: `${window.goals[0]?.name ?? "Goal"} recovery`,
        phase: "recovery",
        startDate: recoveryStart,
        endDate: recoveryEnd <= timelineEndDate ? recoveryEnd : timelineEndDate,
        peakWeeklyTss: window.peakWeeklyTss,
        tuning: window.tuning,
        goalIds: window.goals.map((goal) => goal.id),
      });
    }
    cursorDate = recoveryDays > 0 ? addDaysDateOnlyUtc(recoveryEnd, 1) : recoveryStart;
  }

  const blocks = withDeterministicBlockIds(pendingBlocks, timeline.start_date, timelineEndDate);
  const peakTargetCtl =
    blocks.length > 0
      ? Math.round(
          Math.max(
            ...blocks.map(
              (block) =>
                (block.target_weekly_tss_range.min + block.target_weekly_tss_range.max) / 14,
            ),
          ),
        )
      : undefined;

  return {
    plan_type: "periodized",
    name: goals.length === 1 ? `${goals[0]?.name} Plan` : "Multi-goal Training Plan",
    start_date: timeline.start_date,
    end_date: timelineEndDate,
    fitness_progression: {
      starting_ctl: startingCtl,
      ...(typeof peakTargetCtl === "number" ? { target_ctl_at_peak: peakTargetCtl } : {}),
    },
    activity_distribution: buildActivityDistribution(goals),
    blocks,
    goals,
  };
}
