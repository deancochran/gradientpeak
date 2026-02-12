import { calculateCTL } from "../calculations";

export type ProjectionWeekPattern = "ramp" | "deload" | "taper" | "event";
export type ProjectionMicrocyclePattern = ProjectionWeekPattern | "recovery";

export interface ProjectionGoalDateLike {
  target_date: string;
  priority?: number;
}

export interface ProjectionWeekPatternInput {
  blockPhase: string;
  weekIndexWithinBlock: number;
  weekStartDate: string;
  weekEndDate: string;
  goals: ProjectionGoalDateLike[];
}

export interface ProjectionWeekPatternResult {
  pattern: ProjectionWeekPattern;
  multiplier: number;
}

type GoalDrivenPattern = "event" | "taper";

interface GoalPatternInfluence {
  pattern: GoalDrivenPattern;
  multiplier: number;
  influenceScore: number;
  goalTargetDate: string;
}

const MIN_GOAL_PRIORITY = 1;
const MAX_GOAL_PRIORITY = 10;

export function weeklyLoadFromBlockAndBaseline(
  block:
    | {
        target_weekly_tss_range?: { min: number; max: number };
      }
    | undefined,
  baselineWeeklyTss: number,
): number {
  const targetRange = block?.target_weekly_tss_range;
  if (!targetRange) {
    return Math.round(baselineWeeklyTss * 10) / 10;
  }

  const midpoint = (targetRange.min + targetRange.max) / 2;
  const blendedWeeklyTss = baselineWeeklyTss * 0.35 + midpoint * 0.65;
  return Math.round(blendedWeeklyTss * 10) / 10;
}

function diffDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end - start) / dayMs);
}

export function getProjectionWeekPattern(
  input: ProjectionWeekPatternInput,
): ProjectionWeekPatternResult {
  const basePattern = getBaseProjectionWeekPattern(
    input.blockPhase,
    input.weekIndexWithinBlock,
  );
  const goalInfluences = input.goals
    .map((goal) =>
      buildGoalPatternInfluence(goal, input.weekStartDate, input.weekEndDate),
    )
    .filter(
      (influence): influence is GoalPatternInfluence => influence !== null,
    );

  if (goalInfluences.length === 0) {
    return basePattern;
  }

  const totalInfluenceScore = goalInfluences.reduce(
    (sum, influence) => sum + influence.influenceScore,
    0,
  );

  if (totalInfluenceScore <= 0) {
    return basePattern;
  }

  const weightedGoalMultiplier = goalInfluences.reduce(
    (sum, influence) =>
      sum +
      influence.multiplier * (influence.influenceScore / totalInfluenceScore),
    0,
  );

  const blendedMultiplier = round3(
    Math.min(basePattern.multiplier, weightedGoalMultiplier),
  );

  const dominantInfluence = [...goalInfluences].sort((a, b) => {
    if (b.influenceScore !== a.influenceScore) {
      return b.influenceScore - a.influenceScore;
    }

    if (a.pattern !== b.pattern) {
      return a.pattern === "event" ? -1 : 1;
    }

    return a.goalTargetDate.localeCompare(b.goalTargetDate);
  })[0];

  return {
    pattern: dominantInfluence?.pattern ?? basePattern.pattern,
    multiplier: blendedMultiplier,
  };
}

function getBaseProjectionWeekPattern(
  blockPhase: string,
  weekIndexWithinBlock: number,
): ProjectionWeekPatternResult {
  if (blockPhase === "taper") {
    return { pattern: "taper", multiplier: 0.88 };
  }

  if ((weekIndexWithinBlock + 1) % 4 === 0) {
    return { pattern: "deload", multiplier: 0.9 };
  }

  const rampStep = weekIndexWithinBlock % 3;
  const rampMultipliers = [0.92, 1.0, 1.08];
  return {
    pattern: "ramp",
    multiplier: rampMultipliers[rampStep] ?? 1,
  };
}

function buildGoalPatternInfluence(
  goal: ProjectionGoalDateLike,
  weekStartDate: string,
  weekEndDate: string,
): GoalPatternInfluence | null {
  const priorityWeight = getPriorityInfluenceWeight(goal.priority);

  if (goal.target_date >= weekStartDate && goal.target_date <= weekEndDate) {
    return {
      pattern: "event",
      multiplier: getGoalEventMultiplier(goal.priority),
      influenceScore: priorityWeight,
      goalTargetDate: goal.target_date,
    };
  }

  const daysUntilGoal = diffDays(weekEndDate, goal.target_date);
  if (daysUntilGoal < 0 || daysUntilGoal > 7) {
    return null;
  }

  const proximityFactor = (8 - daysUntilGoal) / 8;
  const influenceScore = priorityWeight * proximityFactor;

  return {
    pattern: "taper",
    multiplier: getGoalTaperMultiplier(goal.priority),
    influenceScore,
    goalTargetDate: goal.target_date,
  };
}

function normalizePriority(priority: number | undefined): number {
  if (priority === undefined || Number.isNaN(priority)) {
    return MIN_GOAL_PRIORITY;
  }

  return Math.max(
    MIN_GOAL_PRIORITY,
    Math.min(MAX_GOAL_PRIORITY, Math.round(priority)),
  );
}

function getPriorityProgress(priority: number | undefined): number {
  const normalizedPriority = normalizePriority(priority);
  return (
    (normalizedPriority - MIN_GOAL_PRIORITY) /
    (MAX_GOAL_PRIORITY - MIN_GOAL_PRIORITY)
  );
}

function getPriorityInfluenceWeight(priority: number | undefined): number {
  const normalizedPriority = normalizePriority(priority);
  return MAX_GOAL_PRIORITY - normalizedPriority + 1;
}

function getGoalEventMultiplier(priority: number | undefined): number {
  const priorityProgress = getPriorityProgress(priority);
  return round3(0.82 + 0.08 * priorityProgress);
}

function getGoalTaperMultiplier(priority: number | undefined): number {
  const priorityProgress = getPriorityProgress(priority);
  return round3(0.9 + 0.06 * priorityProgress);
}

type OptimizationProfile = "outcome_first" | "balanced" | "sustainable";

const PROJECTION_PROFILE_DEFAULTS: Record<
  OptimizationProfile,
  {
    post_goal_recovery_days: number;
    max_weekly_tss_ramp_pct: number;
    max_ctl_ramp_per_week: number;
  }
> = {
  outcome_first: {
    post_goal_recovery_days: 3,
    max_weekly_tss_ramp_pct: 10,
    max_ctl_ramp_per_week: 5,
  },
  balanced: {
    post_goal_recovery_days: 5,
    max_weekly_tss_ramp_pct: 7,
    max_ctl_ramp_per_week: 3,
  },
  sustainable: {
    post_goal_recovery_days: 7,
    max_weekly_tss_ramp_pct: 5,
    max_ctl_ramp_per_week: 2,
  },
};

export interface ProjectionSafetyConfigInput {
  optimization_profile?: OptimizationProfile;
  post_goal_recovery_days?: number;
  max_weekly_tss_ramp_pct?: number;
  max_ctl_ramp_per_week?: number;
}

export interface ProjectionSafetyConfig {
  optimization_profile: OptimizationProfile;
  post_goal_recovery_days: number;
  max_weekly_tss_ramp_pct: number;
  max_ctl_ramp_per_week: number;
}

export interface DeterministicProjectionGoalMarker extends ProjectionGoalDateLike {
  id: string;
  name: string;
  priority: number;
}

export interface DeterministicProjectionPoint {
  date: string;
  predicted_load_tss: number;
  predicted_fitness_ctl: number;
}

export interface ProjectionWeekMetadata {
  recovery: {
    active: boolean;
    goal_ids: string[];
    reduction_factor: number;
  };
  tss_ramp: {
    previous_week_tss: number;
    requested_weekly_tss: number;
    applied_weekly_tss: number;
    max_weekly_tss_ramp_pct: number;
    clamped: boolean;
  };
  ctl_ramp: {
    requested_ctl_ramp: number;
    applied_ctl_ramp: number;
    max_ctl_ramp_per_week: number;
    clamped: boolean;
  };
}

export interface DeterministicProjectionMicrocycle {
  week_start_date: string;
  week_end_date: string;
  phase: string;
  pattern: ProjectionMicrocyclePattern;
  planned_weekly_tss: number;
  projected_ctl: number;
  metadata: ProjectionWeekMetadata;
}

export interface ProjectionRecoverySegment {
  goal_id: string;
  goal_name: string;
  start_date: string;
  end_date: string;
}

export interface DeterministicProjectionPayload {
  start_date: string;
  end_date: string;
  points: DeterministicProjectionPoint[];
  goal_markers: DeterministicProjectionGoalMarker[];
  microcycles: DeterministicProjectionMicrocycle[];
  recovery_segments: ProjectionRecoverySegment[];
  constraint_summary: {
    normalized_creation_config: ProjectionSafetyConfig;
    tss_ramp_clamp_weeks: number;
    ctl_ramp_clamp_weeks: number;
    recovery_weeks: number;
  };
}

export interface BuildDeterministicProjectionInput {
  timeline: {
    start_date: string;
    end_date: string;
  };
  blocks: Array<{
    name: string;
    phase: string;
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>;
  goals: Array<{
    id?: string;
    name: string;
    target_date: string;
    priority?: number;
  }>;
  baseline_weekly_tss: number;
  starting_ctl?: number;
  creation_config?: ProjectionSafetyConfigInput;
}

/**
 * Normalizes safety controls for deterministic projection behavior.
 */
export function normalizeProjectionSafetyConfig(
  input: ProjectionSafetyConfigInput | undefined,
): ProjectionSafetyConfig {
  const profile = input?.optimization_profile ?? "balanced";
  const defaults = PROJECTION_PROFILE_DEFAULTS[profile];

  return {
    optimization_profile: profile,
    post_goal_recovery_days: Math.max(
      0,
      Math.min(
        28,
        Math.round(
          input?.post_goal_recovery_days ?? defaults.post_goal_recovery_days,
        ),
      ),
    ),
    max_weekly_tss_ramp_pct: Math.max(
      0,
      Math.min(
        20,
        input?.max_weekly_tss_ramp_pct ?? defaults.max_weekly_tss_ramp_pct,
      ),
    ),
    max_ctl_ramp_per_week: Math.max(
      0,
      Math.min(
        8,
        input?.max_ctl_ramp_per_week ?? defaults.max_ctl_ramp_per_week,
      ),
    ),
  };
}

/**
 * Builds a deterministic weekly projection with explicit ramp caps and post-goal recovery windows.
 */
export function buildDeterministicProjectionPayload(
  input: BuildDeterministicProjectionInput,
): DeterministicProjectionPayload {
  const normalizedConfig = normalizeProjectionSafetyConfig(
    input.creation_config,
  );
  const baselineWeeklyTss = Math.max(0, round1(input.baseline_weekly_tss));
  const goalMarkers = input.goals
    .map((goal, index) => ({
      id: goal.id ?? `goal-${index + 1}`,
      name: goal.name,
      target_date: goal.target_date,
      priority: goal.priority ?? 1,
    }))
    .sort((a, b) => a.target_date.localeCompare(b.target_date));

  const recoverySegments = deriveRecoverySegments(
    goalMarkers,
    normalizedConfig.post_goal_recovery_days,
    input.timeline.end_date,
  );

  const startDate = input.timeline.start_date;
  const endDate = input.timeline.end_date;
  const startingCtl = Math.max(
    0,
    round1(
      input.starting_ctl === undefined
        ? baselineWeeklyTss / 7
        : input.starting_ctl,
    ),
  );

  const microcycles: DeterministicProjectionMicrocycle[] = [];
  const points: DeterministicProjectionPoint[] = [];
  const dailySnapshotByDate = new Map<string, DeterministicProjectionPoint>();

  let currentCtl = startingCtl;
  let previousWeekTss = baselineWeeklyTss;
  let tssRampClampWeeks = 0;
  let ctlRampClampWeeks = 0;
  let recoveryWeeks = 0;

  for (
    let weekStartDate = startDate;
    weekStartDate <= endDate;
    weekStartDate = addDaysUtc(weekStartDate, 7)
  ) {
    const weekEndDate =
      addDaysUtc(weekStartDate, 6) <= endDate
        ? addDaysUtc(weekStartDate, 6)
        : endDate;
    const daysInWeek = diffDays(weekStartDate, weekEndDate) + 1;

    const block = findBlockForDate(input.blocks, weekStartDate);
    const weekIndexWithinBlock = block
      ? Math.max(0, Math.floor(diffDays(block.start_date, weekStartDate) / 7))
      : 0;
    const weekPattern = getProjectionWeekPattern({
      blockPhase: block?.phase ?? "build",
      weekIndexWithinBlock,
      weekStartDate,
      weekEndDate,
      goals: goalMarkers,
    });

    const baseWeeklyTss = weeklyLoadFromBlockAndBaseline(
      block,
      baselineWeeklyTss,
    );
    const requestedWeeklyTss = Math.max(
      0,
      round1(baseWeeklyTss * weekPattern.multiplier),
    );

    const recoveryOverlap = findRecoveryOverlap(
      recoverySegments,
      weekStartDate,
      weekEndDate,
    );
    const recoveryCoverage =
      recoveryOverlap.overlap_days / Math.max(1, daysInWeek);
    const recoveryReductionFactor = round3(1 - 0.35 * recoveryCoverage);
    const recoveryAdjustedWeeklyTss = Math.max(
      0,
      round1(requestedWeeklyTss * recoveryReductionFactor),
    );

    const maxAllowedByTssRamp = round1(
      previousWeekTss * (1 + normalizedConfig.max_weekly_tss_ramp_pct / 100),
    );
    const tssRampClamped = recoveryAdjustedWeeklyTss > maxAllowedByTssRamp;
    if (tssRampClamped) {
      tssRampClampWeeks += 1;
    }
    let appliedWeeklyTss = tssRampClamped
      ? maxAllowedByTssRamp
      : recoveryAdjustedWeeklyTss;

    const ctlBeforeWeek = currentCtl;
    const requestedCtlAfterWeek = simulateCtlOverWeek(
      currentCtl,
      appliedWeeklyTss,
      daysInWeek,
    );
    const requestedCtlRamp = requestedCtlAfterWeek - ctlBeforeWeek;

    let ctlRampClamped = false;
    if (requestedCtlRamp > normalizedConfig.max_ctl_ramp_per_week) {
      ctlRampClamped = true;
      ctlRampClampWeeks += 1;
      appliedWeeklyTss = findWeeklyTssForCtlRampLimit(
        currentCtl,
        appliedWeeklyTss,
        normalizedConfig.max_ctl_ramp_per_week,
        daysInWeek,
      );
    }

    const ctlAfterWeek = simulateCtlOverWeek(
      currentCtl,
      appliedWeeklyTss,
      daysInWeek,
    );
    const appliedCtlRamp = ctlAfterWeek - ctlBeforeWeek;
    currentCtl = ctlAfterWeek;

    if (recoveryOverlap.goal_ids.length > 0) {
      recoveryWeeks += 1;
    }

    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const dayDate = addDaysUtc(weekStartDate, dayOffset);
      const dayCtl = simulateCtlOverWeek(
        ctlBeforeWeek,
        appliedWeeklyTss,
        dayOffset + 1,
      );
      dailySnapshotByDate.set(dayDate, {
        date: dayDate,
        predicted_load_tss: appliedWeeklyTss,
        predicted_fitness_ctl: round1(dayCtl),
      });
    }

    microcycles.push({
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      phase: block?.name ?? "Build",
      pattern:
        recoveryOverlap.goal_ids.length > 0 ? "recovery" : weekPattern.pattern,
      planned_weekly_tss: appliedWeeklyTss,
      projected_ctl: round1(currentCtl),
      metadata: {
        recovery: {
          active: recoveryOverlap.goal_ids.length > 0,
          goal_ids: recoveryOverlap.goal_ids,
          reduction_factor: recoveryReductionFactor,
        },
        tss_ramp: {
          previous_week_tss: round1(previousWeekTss),
          requested_weekly_tss: recoveryAdjustedWeeklyTss,
          applied_weekly_tss: appliedWeeklyTss,
          max_weekly_tss_ramp_pct: normalizedConfig.max_weekly_tss_ramp_pct,
          clamped: tssRampClamped,
        },
        ctl_ramp: {
          requested_ctl_ramp: round3(requestedCtlRamp),
          applied_ctl_ramp: round3(appliedCtlRamp),
          max_ctl_ramp_per_week: normalizedConfig.max_ctl_ramp_per_week,
          clamped: ctlRampClamped,
        },
      },
    });

    points.push({
      date: weekEndDate,
      predicted_load_tss: appliedWeeklyTss,
      predicted_fitness_ctl: round1(currentCtl),
    });

    previousWeekTss = appliedWeeklyTss;
  }

  for (const goal of goalMarkers) {
    if (points.some((point) => point.date === goal.target_date)) {
      continue;
    }

    const goalDaySnapshot = dailySnapshotByDate.get(goal.target_date);
    if (!goalDaySnapshot) {
      continue;
    }

    points.push(goalDaySnapshot);
  }

  points.sort((a, b) => a.date.localeCompare(b.date));

  return {
    start_date: startDate,
    end_date: endDate,
    points,
    goal_markers: goalMarkers,
    microcycles,
    recovery_segments: recoverySegments,
    constraint_summary: {
      normalized_creation_config: normalizedConfig,
      tss_ramp_clamp_weeks: tssRampClampWeeks,
      ctl_ramp_clamp_weeks: ctlRampClampWeeks,
      recovery_weeks: recoveryWeeks,
    },
  };
}

function parseDateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDaysUtc(value: string, days: number): string {
  const date = parseDateOnlyUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function simulateCtlOverWeek(
  startingCtl: number,
  weeklyTss: number,
  days: number,
): number {
  let ctl = startingCtl;
  const dailyTss = weeklyTss / Math.max(1, days);
  for (let day = 0; day < days; day += 1) {
    ctl = calculateCTL(ctl, dailyTss);
  }

  return ctl;
}

function findWeeklyTssForCtlRampLimit(
  startingCtl: number,
  upperWeeklyTss: number,
  maxCtlRampPerWeek: number,
  days: number,
): number {
  let low = 0;
  let high = upperWeeklyTss;

  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    const ctlAfter = simulateCtlOverWeek(startingCtl, mid, days);
    const ctlRamp = ctlAfter - startingCtl;
    if (ctlRamp > maxCtlRampPerWeek) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return round1(low);
}

function findBlockForDate(
  blocks: BuildDeterministicProjectionInput["blocks"],
  date: string,
) {
  return blocks.find(
    (block) => block.start_date <= date && block.end_date >= date,
  );
}

function deriveRecoverySegments(
  goals: DeterministicProjectionGoalMarker[],
  recoveryDays: number,
  timelineEndDate: string,
): ProjectionRecoverySegment[] {
  if (recoveryDays <= 0) {
    return [];
  }

  return goals
    .map((goal) => {
      const recoveryStartDate = addDaysUtc(goal.target_date, 1);
      const rawRecoveryEndDate = addDaysUtc(
        recoveryStartDate,
        recoveryDays - 1,
      );
      const recoveryEndDate =
        rawRecoveryEndDate <= timelineEndDate
          ? rawRecoveryEndDate
          : timelineEndDate;

      if (
        recoveryStartDate > timelineEndDate ||
        recoveryStartDate > recoveryEndDate
      ) {
        return null;
      }

      return {
        goal_id: goal.id,
        goal_name: goal.name,
        start_date: recoveryStartDate,
        end_date: recoveryEndDate,
      };
    })
    .filter(
      (segment): segment is ProjectionRecoverySegment => segment !== null,
    );
}

function findRecoveryOverlap(
  segments: ProjectionRecoverySegment[],
  weekStartDate: string,
  weekEndDate: string,
): { overlap_days: number; goal_ids: string[] } {
  let overlapDays = 0;
  const goalIds: string[] = [];
  const maxWeekDays = diffDays(weekStartDate, weekEndDate) + 1;

  for (const segment of segments) {
    const overlapStart =
      segment.start_date > weekStartDate ? segment.start_date : weekStartDate;
    const overlapEnd =
      segment.end_date < weekEndDate ? segment.end_date : weekEndDate;
    if (overlapStart > overlapEnd) {
      continue;
    }

    overlapDays += diffDays(overlapStart, overlapEnd) + 1;
    goalIds.push(segment.goal_id);
  }

  return {
    overlap_days: Math.min(overlapDays, maxWeekDays),
    goal_ids: [...new Set(goalIds)],
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
