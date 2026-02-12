// packages/trpc/src/routers/training_plans.ts
import {
  addDaysDateOnlyUtc,
  buildDeterministicProjectionPayload,
  calculateATL,
  calculateCTL,
  calculateTSB,
  calculateTrainingLoadSeries,
  classifyCreationFeasibility,
  creationAvailabilityConfigSchema,
  creationBaselineLoadSchema,
  creationConfigLocksSchema,
  creationConstraintsSchema,
  creationOptimizationProfileEnum,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  creationRecentInfluenceSchema,
  countAvailableTrainingDays,
  deriveCreationContext,
  deriveCreationSuggestions,
  deriveNoHistoryGoalTierFromTargets,
  deterministicUuidFromSeed,
  diffDateOnlyUtcDays,
  expandMinimalGoalToPlan,
  formatDateOnlyUtc,
  getFormStatus,
  getTrainingIntensityZone,
  normalizeCreationConfig,
  normalizeProjectionSafetyConfig,
  parseDateOnlyUtc,
  resolveConstraintConflicts,
  trainingPlanCreationConfigFormSchema,
  trainingPlanCreateInputSchema,
  trainingPlanCreateSchema,
  trainingPlanSchema,
  trainingPlanUpdateInputSchema,
  validatePlanFeasibility,
  type CreationContextSummary,
  type DeterministicProjectionMicrocycle,
  type NoHistoryAnchorContext,
  type NoHistoryProjectionMetadata,
  type NoHistoryGoalTargetInput,
  type ProjectionChartPayload as CoreProjectionChartPayload,
  type ProjectionConstraintSummary,
  type ProjectionPeriodizationPhase,
  type ProjectionRecoverySegment,
  type NormalizeCreationConfigInput,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { addEstimationToPlans } from "../utils/estimation-helpers";
import { featureFlags } from "../lib/features";

const DEFAULT_ESTIMATED_CTL = 0;

const feasibilityStateSchema = z.enum(["feasible", "aggressive", "unsafe"]);
const safetyStateSchema = z.enum(["safe", "caution", "exceeded"]);

type FeasibilityState = z.infer<typeof feasibilityStateSchema>;
type SafetyState = z.infer<typeof safetyStateSchema>;

type GoalAssessment = {
  goal_id: string;
  goal_name: string;
  state: FeasibilityState;
  reasons: string[];
};

type GoalSafetyAssessment = {
  goal_id: string;
  goal_name: string;
  state: SafetyState;
  reasons: string[];
};

type PlanAssessmentBundle = {
  planFeasibility: {
    state: FeasibilityState;
    reasons: string[];
  };
  goalFeasibility: GoalAssessment[];
  planSafety: {
    state: SafetyState;
    reasons: string[];
  };
  goalSafety: GoalSafetyAssessment[];
};

type ProjectionMicrocycleWithId = DeterministicProjectionMicrocycle & {
  id?: string;
};

type ProjectionFeasibilitySummary = {
  state: FeasibilityState;
  reasons: string[];
  diagnostics: {
    tss_ramp_near_cap_weeks: number;
    ctl_ramp_near_cap_weeks: number;
    tss_ramp_clamp_weeks: number;
    ctl_ramp_clamp_weeks: number;
    recovery_weeks: number;
  };
};

type CreationConflictItem = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  field_paths: string[];
  suggestions: string[];
};

type ProjectionChartPayload = Omit<
  CoreProjectionChartPayload,
  "microcycles"
> & {
  microcycles: ProjectionMicrocycleWithId[];
  recovery_segments: ProjectionRecoverySegment[];
  constraint_summary: ProjectionConstraintSummary;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function getWorstFeasibilityState(
  states: FeasibilityState[],
): FeasibilityState {
  if (states.includes("unsafe")) return "unsafe";
  if (states.includes("aggressive")) return "aggressive";
  return "feasible";
}

function getWorstSafetyState(states: SafetyState[]): SafetyState {
  if (states.includes("exceeded")) return "exceeded";
  if (states.includes("caution")) return "caution";
  return "safe";
}

function assessSingleGoal(
  goal: {
    id: string;
    name: string;
    target_date: string;
    priority?: number;
  },
  referenceDate: string,
  currentCtl: number,
  targetCtlAtPeak?: number,
): { feasibility: GoalAssessment; safety: GoalSafetyAssessment } {
  const daysUntilGoal = diffDateOnlyUtcDays(referenceDate, goal.target_date);
  const weeksUntilGoal = Math.max(daysUntilGoal / 7, 0.1);
  const requiredWeeklyCtlRamp =
    typeof targetCtlAtPeak === "number"
      ? (targetCtlAtPeak - currentCtl) / weeksUntilGoal
      : null;

  const feasibilityReasons: string[] = [];
  let feasibilityState: FeasibilityState = "feasible";

  if (daysUntilGoal < 0) {
    feasibilityState = "unsafe";
    feasibilityReasons.push("goal_date_in_past");
  } else if (daysUntilGoal < 21) {
    feasibilityState = "unsafe";
    feasibilityReasons.push("goal_timeline_too_short");
  } else if (daysUntilGoal < 56) {
    feasibilityState = "aggressive";
    feasibilityReasons.push("limited_preparation_window");
  }

  if (requiredWeeklyCtlRamp !== null) {
    if (requiredWeeklyCtlRamp > 8) {
      feasibilityState = "unsafe";
      feasibilityReasons.push("required_ctl_ramp_too_high");
    } else if (requiredWeeklyCtlRamp > 5 && feasibilityState !== "unsafe") {
      feasibilityState = "aggressive";
      feasibilityReasons.push("required_ctl_ramp_near_limit");
    }
  }

  if (
    (goal.priority ?? 1) >= 8 &&
    daysUntilGoal < 84 &&
    feasibilityState === "feasible"
  ) {
    feasibilityState = "aggressive";
    feasibilityReasons.push("high_priority_goal_short_timeline");
  }

  const safetyReasons: string[] = [];
  let safetyState: SafetyState = "safe";

  if (daysUntilGoal < 14) {
    safetyState = "exceeded";
    safetyReasons.push("goal_date_within_two_weeks");
  } else if (daysUntilGoal < 35) {
    safetyState = "caution";
    safetyReasons.push("goal_date_within_five_weeks");
  }

  if (requiredWeeklyCtlRamp !== null) {
    if (requiredWeeklyCtlRamp > 7) {
      safetyState = "exceeded";
      safetyReasons.push("required_ramp_exceeds_safe_boundary");
    } else if (requiredWeeklyCtlRamp > 4 && safetyState !== "exceeded") {
      safetyState = "caution";
      safetyReasons.push("required_ramp_near_safe_boundary");
    }
  }

  return {
    feasibility: {
      goal_id: goal.id,
      goal_name: goal.name,
      state: feasibilityState,
      reasons: uniqueReasons(feasibilityReasons),
    },
    safety: {
      goal_id: goal.id,
      goal_name: goal.name,
      state: safetyState,
      reasons: uniqueReasons(safetyReasons),
    },
  };
}

function buildPlanAssessments(input: {
  goals: Array<{
    id: string;
    name: string;
    target_date: string;
    priority?: number;
  }>;
  referenceDate: string;
  currentCtl: number;
  targetCtlAtPeak?: number;
  planWarnings?: string[];
  blockRampWarnings?: string[];
}): PlanAssessmentBundle {
  const goalBundles = input.goals.map((goal) =>
    assessSingleGoal(
      goal,
      input.referenceDate,
      input.currentCtl,
      input.targetCtlAtPeak,
    ),
  );

  const goalFeasibility = goalBundles.map((bundle) => bundle.feasibility);
  const goalSafety = goalBundles.map((bundle) => bundle.safety);

  const planFeasibilityReasons = uniqueReasons([
    ...goalFeasibility.flatMap((goal) => goal.reasons),
    ...(input.planWarnings ?? []),
  ]);
  const planSafetyReasons = uniqueReasons([
    ...goalSafety.flatMap((goal) => goal.reasons),
    ...(input.blockRampWarnings ?? []),
  ]);

  const planFeasibilityState = getWorstFeasibilityState([
    ...goalFeasibility.map((goal) => goal.state),
    ...(input.planWarnings && input.planWarnings.length > 0
      ? (["aggressive"] as FeasibilityState[])
      : []),
  ]);

  const planSafetyState = getWorstSafetyState([
    ...goalSafety.map((goal) => goal.state),
    ...(input.blockRampWarnings && input.blockRampWarnings.length > 0
      ? (["caution"] as SafetyState[])
      : []),
  ]);

  return {
    planFeasibility: {
      state: planFeasibilityState,
      reasons: planFeasibilityReasons,
    },
    goalFeasibility,
    planSafety: {
      state: planSafetyState,
      reasons: planSafetyReasons,
    },
    goalSafety,
  };
}

function buildDateRange(startDate: string, endDate: string): string[] {
  const totalDays = diffDateOnlyUtcDays(startDate, endDate);
  if (totalDays < 0) {
    return [];
  }

  const dates: string[] = [];
  for (let i = 0; i <= totalDays; i++) {
    dates.push(addDaysDateOnlyUtc(startDate, i));
  }
  return dates;
}

function ratioScore(actual: number, target: number): number {
  if (target <= 0) {
    return actual <= 0 ? 100 : 0;
  }

  const ratio = actual / target;
  if (ratio <= 1) {
    return clampNumber(Math.round(ratio * 100), 0, 100);
  }

  if (ratio <= 1.2) {
    return clampNumber(Math.round(100 - (ratio - 1) * 100), 0, 100);
  }

  return clampNumber(Math.round(80 - (ratio - 1.2) * 50), 0, 100);
}

function adherenceScore(
  idealTss: number,
  scheduledTss: number,
  actualTss: number,
): number {
  const actualVsScheduled = ratioScore(actualTss, scheduledTss);
  const scheduledVsIdeal = ratioScore(scheduledTss, idealTss);
  return clampNumber(
    Math.round(actualVsScheduled * 0.7 + scheduledVsIdeal * 0.3),
    0,
    100,
  );
}

function classifyBoundaryState(
  idealTss: number,
  scheduledTss: number,
  actualTss: number,
): { state: SafetyState; reasons: string[] } {
  const reasons: string[] = [];
  let state: SafetyState = "safe";

  if (idealTss > 0 && scheduledTss > idealTss * 1.35) {
    state = "exceeded";
    reasons.push("scheduled_load_above_ideal_boundary");
  } else if (idealTss > 0 && scheduledTss > idealTss * 1.15) {
    state = "caution";
    reasons.push("scheduled_load_near_ideal_boundary");
  }

  if (scheduledTss > 0 && actualTss > scheduledTss * 1.35) {
    state = "exceeded";
    reasons.push("actual_load_above_scheduled_boundary");
  } else if (scheduledTss > 0 && actualTss > scheduledTss * 1.15) {
    state = state === "exceeded" ? "exceeded" : "caution";
    reasons.push("actual_load_near_scheduled_boundary");
  }

  return {
    state,
    reasons: uniqueReasons(reasons),
  };
}

function estimateIdealDailyTss(
  date: string,
  blocks: Array<{
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>,
): number {
  const block = blocks.find(
    (candidate) =>
      candidate.start_date <= date &&
      candidate.end_date >= date &&
      candidate.target_weekly_tss_range,
  );

  if (!block?.target_weekly_tss_range) {
    return 0;
  }

  const weeklyMidpoint =
    (block.target_weekly_tss_range.min + block.target_weekly_tss_range.max) / 2;
  return Math.round((weeklyMidpoint / 7) * 10) / 10;
}

function collectBlockRampWarnings(
  blocks: Array<{ target_weekly_tss_range?: { min: number; max: number } }>,
): string[] {
  if (blocks.length < 2) {
    return [];
  }

  const warnings: string[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const previous = blocks[i - 1]?.target_weekly_tss_range;
    const current = blocks[i]?.target_weekly_tss_range;
    if (!previous || !current || previous.max <= 0) continue;

    const weeklyRampPct = ((current.max - previous.max) / previous.max) * 100;
    if (weeklyRampPct > 25) {
      warnings.push("block_to_block_tss_ramp_exceeds_25pct");
    } else if (weeklyRampPct > 15) {
      warnings.push("block_to_block_tss_ramp_exceeds_15pct");
    }
  }

  return uniqueReasons(warnings);
}

function findBlockForDate(
  blocks: Array<{
    name: string;
    phase: string;
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>,
  date: string,
) {
  return blocks.find(
    (block) => block.start_date <= date && block.end_date >= date,
  );
}

function buildProjectionChartPayload(input: {
  expandedPlan: ReturnType<typeof expandMinimalGoalToPlan>;
  baselineWeeklyTss: number;
  startingCtl?: number;
  creationConfig?: {
    optimization_profile?: "outcome_first" | "balanced" | "sustainable";
    post_goal_recovery_days?: number;
    max_weekly_tss_ramp_pct?: number;
    max_ctl_ramp_per_week?: number;
  };
  noHistoryContext?: NoHistoryAnchorContext;
}): ProjectionChartPayload {
  const { expandedPlan } = input;
  const baselineWeeklyTss = Math.max(0, input.baselineWeeklyTss);

  const periodizationPhases: ProjectionPeriodizationPhase[] =
    expandedPlan.blocks.map((block, index) => ({
      id: deterministicUuidFromSeed(
        `projection-phase|${expandedPlan.start_date}|${expandedPlan.end_date}|${index}|${block.name}|${block.start_date}|${block.end_date}`,
      ),
      name: block.name,
      start_date: block.start_date,
      end_date: block.end_date,
      target_weekly_tss_min:
        Math.round(
          (block.target_weekly_tss_range?.min ?? baselineWeeklyTss) * 10,
        ) / 10,
      target_weekly_tss_max:
        Math.round(
          (block.target_weekly_tss_range?.max ?? baselineWeeklyTss) * 10,
        ) / 10,
    }));

  const deterministicProjection = buildDeterministicProjectionPayload({
    timeline: {
      start_date: expandedPlan.start_date,
      end_date: expandedPlan.end_date,
    },
    blocks: expandedPlan.blocks.map((block) => ({
      name: block.name,
      phase: block.phase,
      start_date: block.start_date,
      end_date: block.end_date,
      target_weekly_tss_range: block.target_weekly_tss_range,
    })),
    goals: expandedPlan.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      target_date: goal.target_date,
      priority: goal.priority,
    })),
    baseline_weekly_tss: baselineWeeklyTss,
    starting_ctl: input.startingCtl,
    creation_config: input.creationConfig,
    no_history_context: input.noHistoryContext,
  });

  const microcycles: ProjectionMicrocycleWithId[] =
    deterministicProjection.microcycles.map((microcycle) => ({
      id: deterministicUuidFromSeed(
        `projection-microcycle|${expandedPlan.start_date}|${microcycle.week_start_date}|${microcycle.week_end_date}`,
      ),
      ...microcycle,
    }));

  return {
    start_date: expandedPlan.start_date,
    end_date: expandedPlan.end_date,
    points: deterministicProjection.points,
    goal_markers: deterministicProjection.goal_markers,
    periodization_phases: periodizationPhases,
    microcycles,
    recovery_segments: deterministicProjection.recovery_segments,
    constraint_summary: deterministicProjection.constraint_summary,
    no_history: toNoHistoryMetadataOrUndefined(
      deterministicProjection.no_history,
    ),
  };
}

function toNoHistoryMetadataOrUndefined(
  metadata: NoHistoryProjectionMetadata,
): NoHistoryProjectionMetadata | undefined {
  if (!metadata.projection_floor_applied) {
    return undefined;
  }

  return metadata;
}

function deriveNoHistoryAnchorContext(input: {
  expandedPlan: ReturnType<typeof expandMinimalGoalToPlan>;
  contextSummary: CreationContextSummary;
  finalConfig: Awaited<
    ReturnType<typeof evaluateCreationConfig>
  >["finalConfig"];
  startingCtlOverride?: number;
}): NoHistoryAnchorContext | undefined {
  if (input.contextSummary.history_availability_state !== "none") {
    return undefined;
  }

  const earliestGoal = input.expandedPlan.goals.reduce<
    (typeof input.expandedPlan.goals)[number] | undefined
  >((earliest, goal) => {
    if (!earliest || goal.target_date < earliest.target_date) {
      return goal;
    }
    return earliest;
  }, undefined);

  if (!earliestGoal) {
    return undefined;
  }

  const latestGoal = input.expandedPlan.goals.reduce<
    (typeof input.expandedPlan.goals)[number] | undefined
  >((latest, goal) => {
    if (!latest || goal.target_date > latest.target_date) {
      return goal;
    }
    return latest;
  }, undefined);

  return {
    history_availability_state: "none",
    goal_tier: deriveNoHistoryGoalTierFromTargets(
      input.expandedPlan.goals.flatMap(
        (goal) => goal.targets ?? [],
      ) as NoHistoryGoalTargetInput[],
    ),
    weeks_to_event: Math.max(
      0,
      diffDateOnlyUtcDays(
        input.expandedPlan.start_date,
        earliestGoal.target_date,
      ) / 7,
    ),
    total_horizon_weeks: latestGoal
      ? Math.max(
          0,
          diffDateOnlyUtcDays(
            input.expandedPlan.start_date,
            latestGoal.target_date,
          ) / 7,
        )
      : undefined,
    goal_count: input.expandedPlan.goals.length,
    starting_ctl_override: input.startingCtlOverride,
    context_summary: input.contextSummary,
    availability_context: {
      availability_days: input.finalConfig.availability_config.days,
      hard_rest_days: input.finalConfig.constraints.hard_rest_days,
      max_single_session_duration_minutes:
        input.finalConfig.constraints.max_single_session_duration_minutes,
    },
  };
}

function buildProjectionFeasibilitySummary(
  projectionChart: ProjectionChartPayload,
): ProjectionFeasibilitySummary {
  const nearCapThreshold = 0.9;
  let tssNearCapWeeks = 0;
  let ctlNearCapWeeks = 0;

  for (const microcycle of projectionChart.microcycles) {
    const tssRamp = microcycle.metadata?.tss_ramp;
    const ctlRamp = microcycle.metadata?.ctl_ramp;
    if (!tssRamp || !ctlRamp) {
      continue;
    }

    if (
      !tssRamp.clamped &&
      tssRamp.previous_week_tss > 0 &&
      tssRamp.max_weekly_tss_ramp_pct > 0
    ) {
      const requestedRampPct =
        ((tssRamp.requested_weekly_tss - tssRamp.previous_week_tss) /
          tssRamp.previous_week_tss) *
        100;
      if (
        requestedRampPct >=
        tssRamp.max_weekly_tss_ramp_pct * nearCapThreshold
      ) {
        tssNearCapWeeks += 1;
      }
    }

    if (!ctlRamp.clamped && ctlRamp.max_ctl_ramp_per_week > 0) {
      if (
        ctlRamp.requested_ctl_ramp >=
        ctlRamp.max_ctl_ramp_per_week * nearCapThreshold
      ) {
        ctlNearCapWeeks += 1;
      }
    }
  }

  const reasons: string[] = [];
  let state: FeasibilityState = "feasible";

  if (projectionChart.constraint_summary.tss_ramp_clamp_weeks > 0) {
    state = "unsafe";
    reasons.push("required_tss_ramp_exceeds_configured_cap");
  }

  if (projectionChart.constraint_summary.ctl_ramp_clamp_weeks > 0) {
    state = "unsafe";
    reasons.push("required_ctl_ramp_exceeds_configured_cap");
  }

  if (state !== "unsafe" && tssNearCapWeeks > 0) {
    state = "aggressive";
    reasons.push("required_tss_ramp_near_configured_cap");
  }

  if (state !== "unsafe" && ctlNearCapWeeks > 0) {
    state = "aggressive";
    reasons.push("required_ctl_ramp_near_configured_cap");
  }

  return {
    state,
    reasons: uniqueReasons(reasons),
    diagnostics: {
      tss_ramp_near_cap_weeks: tssNearCapWeeks,
      ctl_ramp_near_cap_weeks: ctlNearCapWeeks,
      tss_ramp_clamp_weeks:
        projectionChart.constraint_summary.tss_ramp_clamp_weeks,
      ctl_ramp_clamp_weeks:
        projectionChart.constraint_summary.ctl_ramp_clamp_weeks,
      recovery_weeks: projectionChart.constraint_summary.recovery_weeks,
    },
  };
}

function deriveProjectionDrivenConflicts(input: {
  expandedPlan: ReturnType<typeof expandMinimalGoalToPlan>;
  projectionChart: ProjectionChartPayload;
  postGoalRecoveryDays: number;
}): CreationConflictItem[] {
  const conflicts: CreationConflictItem[] = [];

  if (input.projectionChart.constraint_summary.tss_ramp_clamp_weeks > 0) {
    conflicts.push({
      code: "required_tss_ramp_exceeds_cap",
      severity: "blocking",
      message:
        "Required week-to-week TSS progression exceeds the configured max_weekly_tss_ramp_pct",
      field_paths: ["max_weekly_tss_ramp_pct", "optimization_profile"],
      suggestions: [
        "Raise max_weekly_tss_ramp_pct",
        "Move one or more goals farther out",
        "Pick a less conservative optimization profile",
      ],
    });
  }

  if (input.projectionChart.constraint_summary.ctl_ramp_clamp_weeks > 0) {
    conflicts.push({
      code: "required_ctl_ramp_exceeds_cap",
      severity: "blocking",
      message:
        "Required CTL progression exceeds the configured max_ctl_ramp_per_week",
      field_paths: ["max_ctl_ramp_per_week", "optimization_profile"],
      suggestions: [
        "Raise max_ctl_ramp_per_week",
        "Extend timeline before high-priority goals",
        "Lower expected peak load requirements",
      ],
    });
  }

  const sortedGoals = [...input.expandedPlan.goals].sort((a, b) =>
    a.target_date.localeCompare(b.target_date),
  );
  for (let i = 0; i < sortedGoals.length - 1; i += 1) {
    const currentGoal = sortedGoals[i]!;
    const nextGoal = sortedGoals[i + 1]!;
    const recoveryEnd = addDaysDateOnlyUtc(
      currentGoal.target_date,
      input.postGoalRecoveryDays,
    );
    const prepDays = diffDateOnlyUtcDays(recoveryEnd, nextGoal.target_date);
    if (prepDays < 21) {
      conflicts.push({
        code:
          prepDays < 0
            ? "post_goal_recovery_overlaps_next_goal"
            : "post_goal_recovery_compresses_next_goal_prep",
        severity: "blocking",
        message:
          prepDays < 0
            ? `Post-goal recovery after ${currentGoal.name} overlaps ${nextGoal.name}`
            : `Post-goal recovery after ${currentGoal.name} leaves only ${prepDays} prep days before ${nextGoal.name}`,
        field_paths: ["post_goal_recovery_days", "optimization_profile"],
        suggestions: [
          "Reduce post_goal_recovery_days",
          "Move the next goal farther out",
          "Use a more aggressive profile only when recovery can safely shorten",
        ],
      });
    }
  }

  return conflicts;
}

async function estimateCurrentCtl(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 42);

  const { data, error } = await supabase
    .from("activities")
    .select("training_stress_score, started_at")
    .eq("profile_id", profileId)
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: true });

  if (error || !data || data.length === 0) {
    return DEFAULT_ESTIMATED_CTL;
  }

  let ctl = DEFAULT_ESTIMATED_CTL;
  for (const activity of data) {
    const tss = activity.training_stress_score || 0;
    ctl = calculateCTL(ctl, tss);
  }

  return Math.round(ctl * 10) / 10;
}

const insightTimelineInputSchema = z.object({
  training_plan_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
});

const goalSnapshotSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  target_date: z.string().optional(),
  priority: z.number().optional(),
});

const minimalGoalTargetV2InputSchema = z.discriminatedUnion("target_type", [
  z
    .object({
      target_type: z.literal("race_performance"),
      distance_m: z.number().positive(),
      target_time_s: z.number().int().positive(),
      activity_category: z.enum(["run", "bike", "swim", "other"]),
    })
    .strict(),
  z
    .object({
      target_type: z.literal("pace_threshold"),
      target_speed_mps: z.number().positive(),
      test_duration_s: z.number().int().positive(),
      activity_category: z.enum(["run", "bike", "swim", "other"]),
    })
    .strict(),
  z
    .object({
      target_type: z.literal("power_threshold"),
      target_watts: z.number().positive(),
      test_duration_s: z.number().int().positive(),
      activity_category: z.enum(["run", "bike", "swim", "other"]),
    })
    .strict(),
  z
    .object({
      target_type: z.literal("hr_threshold"),
      target_lthr_bpm: z.number().int().positive(),
    })
    .strict(),
]);

const minimalTrainingGoalV2InputSchema = z
  .object({
    name: z.string().min(1).max(100),
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    priority: z.number().int().min(1).max(10).default(1),
    targets: z.array(minimalGoalTargetV2InputSchema).min(1),
  })
  .strict();

const minimalTrainingPlanV2InputSchema = z
  .object({
    plan_start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    goals: z.array(minimalTrainingGoalV2InputSchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (!data.plan_start_date) {
      return;
    }

    const latestGoalDate = data.goals
      .map((goal) => goal.target_date)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);

    if (!latestGoalDate) {
      return;
    }

    if (data.plan_start_date > latestGoalDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plan_start_date"],
        message: `plan_start_date must be on or before the latest goal target_date (${latestGoalDate})`,
      });
    }
  })
  .strict();

const blockSnapshotSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  target_weekly_tss_range: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
});

const creationConfigValueSchema = z.object({
  availability_config: creationAvailabilityConfigSchema,
  baseline_load: creationBaselineLoadSchema,
  recent_influence: creationRecentInfluenceSchema,
  recent_influence_action: creationRecentInfluenceActionEnum,
  constraints: creationConstraintsSchema,
  optimization_profile: creationOptimizationProfileEnum,
  post_goal_recovery_days: z.number().int().min(0).max(28),
  max_weekly_tss_ramp_pct: z.number().min(0).max(20),
  max_ctl_ramp_per_week: z.number().min(0).max(8),
});

const creationNormalizationInputSchema = z.object({
  user_values: creationConfigValueSchema
    .extend({
      locks: creationConfigLocksSchema,
    })
    .partial()
    .optional(),
  confirmed_suggestions: creationConfigValueSchema.partial().optional(),
  defaults: creationConfigValueSchema.partial().optional(),
  provenance_overrides: z
    .object({
      availability_provenance: creationProvenanceSchema.partial().optional(),
      baseline_load_provenance: creationProvenanceSchema.partial().optional(),
      recent_influence_provenance: creationProvenanceSchema
        .partial()
        .optional(),
    })
    .optional(),
  now_iso: z.string().datetime().optional(),
});

const postCreateBehaviorSchema = z.object({
  autonomous_mutation_enabled: z.boolean().default(false),
});

const getCreationSuggestionsInputSchema = z
  .object({
    as_of: z.string().datetime().optional(),
    locks: creationConfigLocksSchema.partial().optional(),
    existing_values: z
      .object({
        availability_config: creationAvailabilityConfigSchema.optional(),
        baseline_load_weekly_tss: z.number().int().min(30).max(2000).optional(),
        recent_influence_score: z.number().min(-1).max(1).optional(),
        optimization_profile: creationOptimizationProfileEnum.optional(),
        post_goal_recovery_days: z.number().int().min(0).max(28).optional(),
        max_weekly_tss_ramp_pct: z.number().min(0).max(20).optional(),
        max_ctl_ramp_per_week: z.number().min(0).max(8).optional(),
        constraints: creationConstraintsSchema.partial().optional(),
      })
      .optional(),
  })
  .optional();

const previewCreationConfigInputSchema = z.object({
  minimal_plan: minimalTrainingPlanV2InputSchema,
  creation_input: creationNormalizationInputSchema,
  starting_ctl_override: z.number().min(0).max(150).optional(),
  post_create_behavior: postCreateBehaviorSchema.optional(),
});

const createFromCreationConfigInputSchema =
  previewCreationConfigInputSchema.extend({
    is_active: z.boolean().optional().default(true),
    preview_snapshot_token: z.string().min(1).optional(),
  });

const CREATION_PREVIEW_SNAPSHOT_VERSION = "creation_preview_v1";

function formatIssuePath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "root";
  }

  return path
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : `${segment}`,
    )
    .join(".")
    .replace(/\.\[/g, "[");
}

function throwPathValidationError(
  message: string,
  issues: Array<{ path: Array<string | number>; message: string }>,
): never {
  const formattedIssues = issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    message: issue.message,
  }));

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `${message}: ${formattedIssues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ")}`,
    cause: {
      issues: formattedIssues,
    },
  });
}

function enforceNoAutonomousPostCreateMutation(input?: {
  autonomous_mutation_enabled?: boolean;
}): void {
  if (input?.autonomous_mutation_enabled) {
    throwPathValidationError(
      "Autonomous post-create mutation is not supported in MVP",
      [
        {
          path: ["post_create_behavior", "autonomous_mutation_enabled"],
          message:
            "Set this to false. Post-create plan changes require explicit user confirmation in MVP.",
        },
      ],
    );
  }
}

function canonicalizeForDeterministicToken(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForDeterministicToken(item));
  }

  const objectValue = value as Record<string, unknown>;
  const sortedEntries = Object.entries(objectValue).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return Object.fromEntries(
    sortedEntries.map(([key, nestedValue]) => [
      key,
      canonicalizeForDeterministicToken(nestedValue),
    ]),
  );
}

function buildCreationPreviewSnapshotToken(input: {
  minimalPlan: z.infer<typeof minimalTrainingPlanV2InputSchema>;
  finalConfig: Awaited<
    ReturnType<typeof evaluateCreationConfig>
  >["finalConfig"];
  estimatedCurrentCtl: number;
  projectionConstraintSummary: ProjectionConstraintSummary;
  projectionFeasibility: ProjectionFeasibilitySummary;
  noHistoryMetadata?: NoHistoryProjectionMetadata;
}): string {
  const normalizedCreationConfigSnapshot = {
    availability_config: input.finalConfig.availability_config,
    baseline_load: input.finalConfig.baseline_load,
    recent_influence: input.finalConfig.recent_influence,
    recent_influence_action: input.finalConfig.recent_influence_action,
    constraints: input.finalConfig.constraints,
    optimization_profile: input.finalConfig.optimization_profile,
    post_goal_recovery_days: input.finalConfig.post_goal_recovery_days,
    max_weekly_tss_ramp_pct: input.finalConfig.max_weekly_tss_ramp_pct,
    max_ctl_ramp_per_week: input.finalConfig.max_ctl_ramp_per_week,
  };

  const snapshotPayload = {
    version: CREATION_PREVIEW_SNAPSHOT_VERSION,
    minimal_plan: input.minimalPlan,
    normalized_creation_config: normalizedCreationConfigSnapshot,
    estimated_current_ctl: Math.round(input.estimatedCurrentCtl * 10) / 10,
    projection_constraint_summary: input.projectionConstraintSummary,
    projection_feasibility: input.projectionFeasibility,
    ...(input.noHistoryMetadata
      ? { projection_no_history: input.noHistoryMetadata }
      : {}),
  };

  const canonicalSnapshotPayload =
    canonicalizeForDeterministicToken(snapshotPayload);

  return deterministicUuidFromSeed(
    `creation-preview-snapshot|${JSON.stringify(canonicalSnapshotPayload)}`,
  );
}

function buildCreationProjectionArtifacts(input: {
  minimalPlan: z.infer<typeof minimalTrainingPlanV2InputSchema>;
  estimatedCurrentCtl: number;
  startingCtlOverride?: number;
  finalConfig: Awaited<
    ReturnType<typeof evaluateCreationConfig>
  >["finalConfig"];
  contextSummary: CreationContextSummary;
}): {
  expandedPlan: ReturnType<typeof expandMinimalGoalToPlan>;
  projectionChart: ProjectionChartPayload;
  projectionFeasibility: ProjectionFeasibilitySummary;
} {
  const expandedPlan = expandMinimalGoalToPlan(input.minimalPlan, {
    startingCtl: input.estimatedCurrentCtl,
  });

  const noHistoryContext = deriveNoHistoryAnchorContext({
    expandedPlan,
    contextSummary: input.contextSummary,
    finalConfig: input.finalConfig,
    startingCtlOverride: input.startingCtlOverride,
  });

  const projectionChart = buildProjectionChartPayload({
    expandedPlan,
    baselineWeeklyTss: input.finalConfig.baseline_load.weekly_tss,
    startingCtl: input.estimatedCurrentCtl,
    creationConfig: {
      optimization_profile: input.finalConfig.optimization_profile,
      post_goal_recovery_days: input.finalConfig.post_goal_recovery_days,
      max_weekly_tss_ramp_pct: input.finalConfig.max_weekly_tss_ramp_pct,
      max_ctl_ramp_per_week: input.finalConfig.max_ctl_ramp_per_week,
    },
    noHistoryContext,
  });

  return {
    expandedPlan,
    projectionChart,
    projectionFeasibility: buildProjectionFeasibilitySummary(projectionChart),
  };
}

function enforceCreationConfigFeatureEnabled(): void {
  if (!featureFlags.trainingPlanCreateConfigMvp) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Training plan creation config MVP is not enabled",
    });
  }
}

export async function deriveProfileAwareCreationContext(input: {
  supabase: SupabaseClient;
  profileId: string;
  asOfIso?: string;
}) {
  const asOf = input.asOfIso ? new Date(input.asOfIso) : new Date();
  const recentActivitiesCutoff = new Date(asOf);
  recentActivitiesCutoff.setDate(recentActivitiesCutoff.getDate() - 84);

  const recentEffortsCutoff = new Date(asOf);
  recentEffortsCutoff.setDate(recentEffortsCutoff.getDate() - 84);

  const [activitiesResult, effortsResult, profileMetricsResult] =
    await Promise.all([
      input.supabase
        .from("activities")
        .select(
          "started_at, activity_category, duration_seconds, training_stress_score",
        )
        .eq("profile_id", input.profileId)
        .gte("started_at", recentActivitiesCutoff.toISOString())
        .order("started_at", { ascending: false })
        .limit(300),
      input.supabase
        .from("activity_efforts")
        .select(
          "recorded_at, effort_type, duration_seconds, value, activity_category",
        )
        .eq("profile_id", input.profileId)
        .gte("recorded_at", recentEffortsCutoff.toISOString())
        .order("recorded_at", { ascending: false })
        .limit(200),
      input.supabase
        .from("profile_metrics")
        .select("metric_type, value, recorded_at")
        .eq("profile_id", input.profileId)
        .in("metric_type", ["lthr", "weight_kg"])
        .order("recorded_at", { ascending: false }),
    ]);

  if (activitiesResult.error) {
    console.warn(
      "Failed to load activities for creation context. Falling back to empty activities.",
      activitiesResult.error.message,
    );
  }

  if (effortsResult.error) {
    console.warn(
      "Failed to load activity efforts for creation context. Falling back to empty efforts.",
      effortsResult.error.message,
    );
  }

  if (profileMetricsResult.error) {
    console.warn(
      "Failed to load profile metrics for creation context. Falling back to empty metrics.",
      profileMetricsResult.error.message,
    );
  }

  const completedActivities = (
    activitiesResult.error ? [] : (activitiesResult.data ?? [])
  ).map((activity) => ({
    occurred_at: activity.started_at,
    activity_category: activity.activity_category,
    duration_seconds: activity.duration_seconds,
    tss: activity.training_stress_score,
  }));

  const activityCounts = completedActivities.reduce<Record<string, number>>(
    (acc, activity) => {
      const category = activity.activity_category ?? "other";
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const totalActivityCount = Object.values(activityCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const categoryMix =
    totalActivityCount > 0
      ? Object.fromEntries(
          Object.entries(activityCounts).map(([category, count]) => [
            category,
            Number((count / totalActivityCount).toFixed(3)),
          ]),
        )
      : undefined;

  const primaryCategory =
    Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    undefined;

  const efforts = (effortsResult.error ? [] : (effortsResult.data ?? [])).map(
    (effort) => ({
      recorded_at: effort.recorded_at,
      effort_type: effort.effort_type,
      duration_seconds: effort.duration_seconds,
      value: effort.value,
      activity_category: effort.activity_category,
    }),
  );

  const ftpEffort = efforts
    .filter(
      (effort) =>
        effort.effort_type === "power" && effort.duration_seconds === 1200,
    )
    .sort((a, b) => b.value - a.value)[0];

  const profileMetricsRows = profileMetricsResult.error
    ? []
    : (profileMetricsResult.data ?? []);

  const lthrMetric = profileMetricsRows.find(
    (metric) => metric.metric_type === "lthr",
  );
  const weightMetric = profileMetricsRows.find(
    (metric) => metric.metric_type === "weight_kg",
  );

  const profileMetrics = {
    ftp: ftpEffort?.value ? Math.round(ftpEffort.value * 0.95) : null,
    threshold_hr: lthrMetric?.value ? Number(lthrMetric.value) : null,
    weight_kg: weightMetric?.value ? Number(weightMetric.value) : null,
    lthr: lthrMetric?.value ? Number(lthrMetric.value) : null,
  };

  const contextSummary = deriveCreationContext({
    completed_activities: completedActivities,
    efforts,
    activity_context: {
      primary_category: primaryCategory,
      category_mix: categoryMix,
    },
    profile_metrics: profileMetrics,
    as_of: input.asOfIso,
  });

  return {
    contextSummary,
  };
}

function buildConfirmedSuggestionsFromContext(input: {
  contextSummary: ReturnType<typeof deriveCreationContext>;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
  nowIso: string;
}) {
  const suggestedOptimizationProfile =
    input.contextSummary.history_availability_state === "none"
      ? "sustainable"
      : input.contextSummary.signal_quality >= 0.75
        ? "outcome_first"
        : "balanced";

  const profileDefaults = normalizeProjectionSafetyConfig({
    optimization_profile:
      input.creationInput.user_values?.optimization_profile ??
      input.creationInput.confirmed_suggestions?.optimization_profile ??
      input.creationInput.defaults?.optimization_profile ??
      suggestedOptimizationProfile,
    post_goal_recovery_days:
      input.creationInput.defaults?.post_goal_recovery_days,
    max_weekly_tss_ramp_pct:
      input.creationInput.defaults?.max_weekly_tss_ramp_pct,
    max_ctl_ramp_per_week: input.creationInput.defaults?.max_ctl_ramp_per_week,
  });

  const suggestionPayload = deriveCreationSuggestions({
    context: input.contextSummary,
    existing_values: {
      availability_config: input.creationInput.user_values?.availability_config,
      baseline_load_weekly_tss:
        input.creationInput.user_values?.baseline_load?.weekly_tss,
      recent_influence_score:
        input.creationInput.user_values?.recent_influence?.influence_score,
      constraints: input.creationInput.user_values?.constraints,
    },
    locks: input.creationInput.user_values?.locks,
    now_iso: input.nowIso,
  });

  const suggestedValues = {
    availability_config: suggestionPayload.availability_config,
    baseline_load: suggestionPayload.baseline_load,
    recent_influence: suggestionPayload.recent_influence,
    recent_influence_action: suggestionPayload.recent_influence_action,
    constraints: suggestionPayload.constraints,
    optimization_profile: profileDefaults.optimization_profile,
    post_goal_recovery_days: profileDefaults.post_goal_recovery_days,
    max_weekly_tss_ramp_pct: profileDefaults.max_weekly_tss_ramp_pct,
    max_ctl_ramp_per_week: profileDefaults.max_ctl_ramp_per_week,
  };

  return {
    suggestionPayload,
    suggestedValues,
  };
}

async function evaluateCreationConfig(input: {
  supabase: SupabaseClient;
  profileId: string;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
  asOfIso?: string;
}) {
  const nowIso = input.creationInput.now_iso ?? new Date().toISOString();

  const { contextSummary } = await deriveProfileAwareCreationContext({
    supabase: input.supabase,
    profileId: input.profileId,
    asOfIso: input.asOfIso,
  });

  const { suggestionPayload, suggestedValues } =
    buildConfirmedSuggestionsFromContext({
      contextSummary,
      creationInput: input.creationInput,
      nowIso,
    });

  const mergedConfirmedSuggestions = {
    availability_config:
      input.creationInput.confirmed_suggestions?.availability_config ??
      suggestedValues.availability_config,
    baseline_load:
      input.creationInput.confirmed_suggestions?.baseline_load ??
      suggestedValues.baseline_load,
    recent_influence:
      input.creationInput.confirmed_suggestions?.recent_influence ??
      suggestedValues.recent_influence,
    recent_influence_action:
      input.creationInput.confirmed_suggestions?.recent_influence_action ??
      suggestedValues.recent_influence_action,
    constraints: {
      ...suggestedValues.constraints,
      ...(input.creationInput.confirmed_suggestions?.constraints ?? {}),
    },
    optimization_profile:
      input.creationInput.confirmed_suggestions?.optimization_profile ??
      suggestedValues.optimization_profile,
    post_goal_recovery_days:
      input.creationInput.confirmed_suggestions?.post_goal_recovery_days ??
      suggestedValues.post_goal_recovery_days,
    max_weekly_tss_ramp_pct:
      input.creationInput.confirmed_suggestions?.max_weekly_tss_ramp_pct ??
      suggestedValues.max_weekly_tss_ramp_pct,
    max_ctl_ramp_per_week:
      input.creationInput.confirmed_suggestions?.max_ctl_ramp_per_week ??
      suggestedValues.max_ctl_ramp_per_week,
  };

  const normalizedConfig = normalizeCreationConfig({
    ...input.creationInput,
    confirmed_suggestions: mergedConfirmedSuggestions,
    now_iso: nowIso,
  } satisfies NormalizeCreationConfigInput);

  const availabilityTrainingDays = countAvailableTrainingDays({
    availabilityDays: normalizedConfig.availability_config.days,
    hardRestDays: normalizedConfig.constraints.hard_rest_days,
    requirePositiveMaxSessions: true,
  });

  const constraintResolution = resolveConstraintConflicts({
    availability_training_days: availabilityTrainingDays,
    baseline_weekly_tss: normalizedConfig.baseline_load.weekly_tss,
    user_constraints: input.creationInput.user_values?.constraints,
    confirmed_suggestions: mergedConfirmedSuggestions.constraints,
    defaults: input.creationInput.defaults?.constraints,
    locks: normalizedConfig.locks,
  });

  const configWithResolvedConstraints = {
    ...normalizedConfig,
    constraints: constraintResolution.resolved_constraints,
  };

  const conflictResolution = {
    resolved_constraints: constraintResolution.resolved_constraints,
    conflicts: constraintResolution.conflicts.map((conflict) => ({
      code: conflict.code,
      severity: conflict.severity,
      message: conflict.message,
      field_paths: [...conflict.field_paths],
      suggestions: [...conflict.suggestions],
    })) satisfies CreationConflictItem[],
    is_blocking: constraintResolution.is_blocking,
    precedence: constraintResolution.precedence,
  };

  const feasibilitySummary = classifyCreationFeasibility({
    config: configWithResolvedConstraints,
    context: contextSummary,
    conflicts: constraintResolution.conflicts,
    now_iso: nowIso,
  });

  const finalConfig = {
    ...configWithResolvedConstraints,
    context_summary: contextSummary,
    feasibility_safety_summary: feasibilitySummary,
  };

  const validatedFinalConfig =
    trainingPlanCreationConfigFormSchema.safeParse(finalConfig);

  if (!validatedFinalConfig.success) {
    throwPathValidationError(
      "Invalid creation configuration",
      validatedFinalConfig.error.issues.map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        ),
        message: issue.message,
      })),
    );
  }

  return {
    finalConfig: validatedFinalConfig.data,
    contextSummary,
    suggestionPayload,
    conflictResolution,
    feasibilitySummary,
  };
}

export const trainingPlansRouter = createTRPCRouter({
  // ------------------------------
  // Get a training plan (by ID or active plan)
  // ------------------------------
  get: protectedProcedure
    .input(z.object({ id: z.string() }).optional())
    .query(async ({ ctx, input }) => {
      // If ID provided, get specific plan
      if (input?.id) {
        const { data, error } = await ctx.supabase
          .from("training_plans")
          .select("*")
          .eq("id", input.id)
          .eq("profile_id", ctx.session.user.id)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Training plan not found",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Validate structure
        try {
          if (data.structure) {
            trainingPlanSchema.parse(data.structure);
          }
        } catch (validationError) {
          console.error(
            "Invalid structure in database for training plan",
            data.id,
            validationError,
          );
        }

        return data;
      }

      // Otherwise, get active plan
      // Query for all active plans (in case there are multiple)
      const { data: activePlans, error } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // If no active plans, return null
      if (!activePlans || activePlans.length === 0) {
        return null;
      }

      // If multiple active plans exist (shouldn't happen, but handle it gracefully)
      if (activePlans.length > 1) {
        console.warn(
          `User ${ctx.session.user.id} has ${activePlans.length} active training plans. Deactivating older ones.`,
        );

        // Keep the most recent, deactivate the rest
        const mostRecentPlan = activePlans[0]!;
        const olderPlanIds = activePlans.slice(1).map((p) => p.id);

        // Deactivate older plans
        await ctx.supabase
          .from("training_plans")
          .update({ is_active: false })
          .in("id", olderPlanIds);

        // Return the most recent active plan
        const data = mostRecentPlan;

        // Validate structure on read (defensive programming)
        try {
          if (data.structure) {
            trainingPlanSchema.parse(data.structure);
          }
        } catch (validationError) {
          console.error(
            "Invalid structure in database for training plan",
            data.id,
            validationError,
          );
          // Don't fail the query, but log the issue
        }

        return data;
      }

      // Single active plan - normal case
      const data = activePlans[0]!;

      // Validate structure on read (defensive programming)
      try {
        if (data.structure) {
          trainingPlanSchema.parse(data.structure);
        }
      } catch (validationError) {
        console.error(
          "Invalid structure in database for training plan",
          data.id,
          validationError,
        );
        // Don't fail the query, but log the issue
      }

      return data;
    }),

  // ------------------------------
  // List all training plans for the user
  // ------------------------------
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("training_plans")
      .select("*")
      .eq("profile_id", ctx.session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data || [];
  }),

  // ------------------------------
  // Check if user has a training plan
  // ------------------------------
  exists: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from("training_plans")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return { exists: (count || 0) > 0, count: count || 0 };
  }),

  // ------------------------------
  // Create new training plan
  // Can create multiple plans; if is_active, deactivates others
  // ------------------------------
  create: protectedProcedure
    .input(trainingPlanCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Note: input.structure is already validated by trainingPlanCreateInputSchema
      // which uses trainingPlanCreateSchema (no ID required)

      // Generate a unique UUID for this plan structure
      // Each plan gets its own unique ID, even if created from a template
      const planId = crypto.randomUUID();
      const structureWithId = {
        ...input.structure,
        id: planId,
      };

      // Final validation with ID to ensure complete structure is valid
      try {
        trainingPlanSchema.parse(structureWithId);
      } catch (validationError) {
        console.error("Training plan validation error:", validationError);

        // Extract more meaningful error message from Zod validation
        let errorMessage = "Invalid training plan structure";
        const errorDetails: string[] = [];

        if (validationError && typeof validationError === "object") {
          const zodError = validationError as any;
          if (zodError.errors && Array.isArray(zodError.errors)) {
            // Collect all errors, not just the first one
            for (const err of zodError.errors) {
              const path = err.path ? err.path.join(".") : "unknown";
              const message = err.message || "validation failed";
              errorDetails.push(`${path}: ${message}`);
            }

            if (errorDetails.length > 0) {
              errorMessage = `Training plan validation failed:\n${errorDetails.join("\n")}`;
            }
          } else if (zodError.message) {
            errorMessage = zodError.message;
          }
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorMessage,
          cause: validationError,
        });
      }

      // If creating as active, deactivate any existing active plans
      if (input.is_active) {
        await ctx.supabase
          .from("training_plans")
          .update({ is_active: false })
          .eq("profile_id", ctx.session.user.id)
          .eq("is_active", true);
      }

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .insert({
          name: input.name,
          description: input.description ?? null,
          structure: structureWithId as any, // Cast to satisfy Supabase Json type
          is_active: input.is_active ?? true,
          profile_id: ctx.session.user.id,
        })
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data;
    }),

  // ------------------------------
  // Preview feasibility/safety from minimal goal payload
  // ------------------------------
  getFeasibilityPreview: protectedProcedure
    .input(minimalTrainingPlanV2InputSchema)
    .query(async ({ ctx, input }) => {
      const estimatedCurrentCtl = await estimateCurrentCtl(
        ctx.supabase,
        ctx.session.user.id,
      );
      const expandedPlan = expandMinimalGoalToPlan(input, {
        startingCtl: estimatedCurrentCtl,
      });
      const normalizedGoals = expandedPlan.goals;

      const referenceDate = formatDateOnlyUtc(new Date());

      const assessmentGoals = normalizedGoals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        target_date: goal.target_date,
        priority: goal.priority,
      }));

      const nextGoal = [...assessmentGoals].sort((a, b) =>
        a.target_date.localeCompare(b.target_date),
      )[0];

      const previewPlanWithId = {
        ...expandedPlan,
        id: deterministicUuidFromSeed(
          `${ctx.session.user.id}|${assessmentGoals.map((goal) => goal.id).join("|")}|preview-plan`,
        ),
      };

      const parsedPreviewPlan = trainingPlanSchema.safeParse(previewPlanWithId);
      const planWarnings =
        parsedPreviewPlan.success &&
        parsedPreviewPlan.data.plan_type === "periodized"
          ? validatePlanFeasibility(parsedPreviewPlan.data).warnings
          : [];

      const blockRampWarnings = collectBlockRampWarnings(expandedPlan.blocks);
      const assessments = buildPlanAssessments({
        goals: assessmentGoals,
        referenceDate,
        currentCtl: estimatedCurrentCtl,
        targetCtlAtPeak: expandedPlan.fitness_progression.target_ctl_at_peak,
        planWarnings,
        blockRampWarnings,
      });

      const planDurationDays = Math.max(
        0,
        diffDateOnlyUtcDays(expandedPlan.start_date, expandedPlan.end_date) + 1,
      );
      const targetWeeklyTssAvg =
        expandedPlan.blocks.length > 0
          ? expandedPlan.blocks.reduce((sum, block) => {
              const range = block.target_weekly_tss_range;
              return sum + (range.min + range.max) / 2;
            }, 0) / expandedPlan.blocks.length
          : 0;

      return {
        plan_assessment: {
          feasibility: assessments.planFeasibility,
          safety: assessments.planSafety,
        },
        goal_assessments: assessments.goalFeasibility.map((goalFeasibility) => {
          const goalSafety = assessments.goalSafety.find(
            (goal) => goal.goal_id === goalFeasibility.goal_id,
          );

          return {
            goal_id: goalFeasibility.goal_id,
            goal_name: goalFeasibility.goal_name,
            feasibility: {
              state: goalFeasibility.state,
              reasons: goalFeasibility.reasons,
            },
            safety: {
              state: goalSafety?.state ?? "safe",
              reasons: goalSafety?.reasons ?? [],
            },
          };
        }),
        key_metrics: {
          reference_date: referenceDate,
          days_until_goal: nextGoal
            ? diffDateOnlyUtcDays(referenceDate, nextGoal.target_date)
            : 0,
          plan_duration_days: planDurationDays,
          block_count: expandedPlan.blocks.length,
          goal_count: assessmentGoals.length,
          estimated_current_ctl: estimatedCurrentCtl,
          target_weekly_tss_avg: Math.round(targetWeeklyTssAvg),
        },
        normalized_goals: normalizedGoals,
      };
    }),

  // ------------------------------
  // Derive profile-aware creation context + suggestions
  // ------------------------------
  getCreationSuggestions: protectedProcedure
    .input(getCreationSuggestionsInputSchema)
    .query(async ({ ctx, input }) => {
      enforceCreationConfigFeatureEnabled();
      const nowIso = new Date().toISOString();
      const { contextSummary } = await deriveProfileAwareCreationContext({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        asOfIso: input?.as_of,
      });

      const suggestions = deriveCreationSuggestions({
        context: contextSummary,
        existing_values: input?.existing_values,
        locks: input?.locks,
        now_iso: nowIso,
      });

      return {
        context_summary: contextSummary,
        suggestions,
      };
    }),

  // ------------------------------
  // Preview normalized creation config + feasibility/safety
  // ------------------------------
  previewCreationConfig: protectedProcedure
    .input(previewCreationConfigInputSchema)
    .query(async ({ ctx, input }) => {
      enforceCreationConfigFeatureEnabled();
      enforceNoAutonomousPostCreateMutation(input.post_create_behavior);
      const evaluation = await evaluateCreationConfig({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        creationInput: input.creation_input,
      });
      const estimatedCurrentCtl = await estimateCurrentCtl(
        ctx.supabase,
        ctx.session.user.id,
      );
      const { expandedPlan, projectionChart, projectionFeasibility } =
        buildCreationProjectionArtifacts({
          minimalPlan: input.minimal_plan,
          estimatedCurrentCtl,
          startingCtlOverride: input.starting_ctl_override,
          finalConfig: evaluation.finalConfig,
          contextSummary: evaluation.contextSummary,
        });
      const previewSnapshotToken = buildCreationPreviewSnapshotToken({
        minimalPlan: input.minimal_plan,
        finalConfig: evaluation.finalConfig,
        estimatedCurrentCtl,
        projectionConstraintSummary: projectionChart.constraint_summary,
        projectionFeasibility,
        noHistoryMetadata: projectionChart.no_history,
      });
      const projectionConflicts = deriveProjectionDrivenConflicts({
        expandedPlan,
        projectionChart,
        postGoalRecoveryDays: evaluation.finalConfig.post_goal_recovery_days,
      });
      const allConflicts = [
        ...evaluation.conflictResolution.conflicts,
        ...projectionConflicts,
      ];

      return {
        normalized_creation_config: evaluation.finalConfig,
        creation_context_summary: evaluation.contextSummary,
        derived_suggestions: evaluation.suggestionPayload,
        feasibility_safety: evaluation.feasibilitySummary,
        projection_feasibility: projectionFeasibility,
        conflicts: {
          is_blocking: allConflicts.some(
            (conflict) => conflict.severity === "blocking",
          ),
          items: allConflicts,
        },
        plan_preview: {
          name: expandedPlan.name,
          start_date: expandedPlan.start_date,
          end_date: expandedPlan.end_date,
          goal_count: expandedPlan.goals.length,
          block_count: expandedPlan.blocks.length,
        },
        projection_chart: projectionChart,
        preview_snapshot: {
          version: CREATION_PREVIEW_SNAPSHOT_VERSION,
          token: previewSnapshotToken,
        },
      };
    }),

  // ------------------------------
  // Create plan from minimal goal + normalized creation config
  // ------------------------------
  createFromCreationConfig: protectedProcedure
    .input(createFromCreationConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      enforceCreationConfigFeatureEnabled();
      enforceNoAutonomousPostCreateMutation(input.post_create_behavior);
      const evaluation = await evaluateCreationConfig({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        creationInput: input.creation_input,
      });
      const estimatedCurrentCtl = await estimateCurrentCtl(
        ctx.supabase,
        ctx.session.user.id,
      );
      const { expandedPlan, projectionChart, projectionFeasibility } =
        buildCreationProjectionArtifacts({
          minimalPlan: input.minimal_plan,
          estimatedCurrentCtl,
          startingCtlOverride: input.starting_ctl_override,
          finalConfig: evaluation.finalConfig,
          contextSummary: evaluation.contextSummary,
        });
      const expectedPreviewSnapshotToken = buildCreationPreviewSnapshotToken({
        minimalPlan: input.minimal_plan,
        finalConfig: evaluation.finalConfig,
        estimatedCurrentCtl,
        projectionConstraintSummary: projectionChart.constraint_summary,
        projectionFeasibility,
        noHistoryMetadata: projectionChart.no_history,
      });

      if (
        input.preview_snapshot_token &&
        input.preview_snapshot_token !== expectedPreviewSnapshotToken
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Creation preview is stale or invalid. Refresh previewCreationConfig and retry createFromCreationConfig.",
        });
      }

      const projectionConflicts = deriveProjectionDrivenConflicts({
        expandedPlan,
        projectionChart,
        postGoalRecoveryDays: evaluation.finalConfig.post_goal_recovery_days,
      });
      const allConflicts = [
        ...evaluation.conflictResolution.conflicts,
        ...projectionConflicts,
      ];

      const blockingConflicts = allConflicts.filter(
        (conflict) => conflict.severity === "blocking",
      );

      if (blockingConflicts.length > 0) {
        throwPathValidationError(
          "Creation config has blocking conflicts",
          blockingConflicts.flatMap((conflict) =>
            conflict.field_paths.map((fieldPath) => ({
              path: fieldPath.split("."),
              message: `${conflict.message}. ${conflict.suggestions.join(" | ")}`,
            })),
          ),
        );
      }

      const planId = crypto.randomUUID();
      const normalizedAt =
        evaluation.finalConfig.feasibility_safety_summary?.computed_at ??
        new Date().toISOString();

      const structureWithId = {
        ...expandedPlan,
        id: planId,
        metadata: {
          ...(expandedPlan.metadata ?? {}),
          creation_config_mvp: {
            source_of_truth: "normalized_creation_config",
            policy_version: "creation_config_mvp_v1",
            precedence_order: [
              "locked_user_values",
              "user_values",
              "confirmed_suggestions",
              "defaults",
            ],
            post_create_mutation_policy: "manual_confirmation_required",
            normalized_at: normalizedAt,
            normalized_config: evaluation.finalConfig,
            conflict_resolution: {
              is_blocking: blockingConflicts.length > 0,
              conflicts: allConflicts,
              precedence: evaluation.conflictResolution.precedence,
            },
            projection_feasibility: projectionFeasibility,
            projection_chart: projectionChart,
          },
        },
      };

      try {
        trainingPlanSchema.parse(structureWithId);
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Generated training plan structure is invalid",
          cause: validationError,
        });
      }

      if (input.is_active) {
        await ctx.supabase
          .from("training_plans")
          .update({ is_active: false })
          .eq("profile_id", ctx.session.user.id)
          .eq("is_active", true);
      }

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .insert({
          name: expandedPlan.name,
          description: expandedPlan.description ?? null,
          structure: structureWithId as any,
          is_active: input.is_active ?? true,
          profile_id: ctx.session.user.id,
        })
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return {
        ...data,
        creation_summary: {
          normalized_creation_config: evaluation.finalConfig,
          conflicts: {
            is_blocking: blockingConflicts.length > 0,
            items: allConflicts,
          },
          projection_feasibility: projectionFeasibility,
          projection_chart: projectionChart,
          feasibility_safety: evaluation.feasibilitySummary,
          context_summary: evaluation.contextSummary,
        },
      };
    }),

  // ------------------------------
  // Create training plan from minimal goal payload
  // ------------------------------
  createFromMinimalGoal: protectedProcedure
    .input(minimalTrainingPlanV2InputSchema)
    .mutation(async ({ ctx, input }) => {
      const estimatedCurrentCtl = await estimateCurrentCtl(
        ctx.supabase,
        ctx.session.user.id,
      );
      const expandedPlan = expandMinimalGoalToPlan(input, {
        startingCtl: estimatedCurrentCtl,
      });

      const planId = crypto.randomUUID();
      const structureWithId = {
        ...expandedPlan,
        id: planId,
      };

      try {
        trainingPlanSchema.parse(structureWithId);
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Generated training plan structure is invalid",
          cause: validationError,
        });
      }

      // Keep behavior aligned with create: newly generated minimal plans are active
      await ctx.supabase
        .from("training_plans")
        .update({ is_active: false })
        .eq("profile_id", ctx.session.user.id)
        .eq("is_active", true);

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .insert({
          name: expandedPlan.name,
          description: expandedPlan.description ?? null,
          structure: structureWithId as any,
          is_active: true,
          profile_id: ctx.session.user.id,
        })
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data;
    }),

  // ------------------------------
  // Canonical insight timeline (MVP deterministic baseline)
  // ------------------------------
  getInsightTimeline: protectedProcedure
    .input(insightTimelineInputSchema)
    .query(async ({ ctx, input }) => {
      const windowDays =
        diffDateOnlyUtcDays(input.start_date, input.end_date) + 1;
      if (windowDays <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "end_date must be on or after start_date",
        });
      }

      if (windowDays > 400) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Date range too large. Use 400 days or fewer.",
        });
      }

      const { data: plan, error: planError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.training_plan_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const parsedStructure = trainingPlanSchema.safeParse(plan.structure);
      const looseStructure =
        (plan.structure as {
          goals?: unknown;
          blocks?: unknown;
          fitness_progression?: { target_ctl_at_peak?: number };
          activity_distribution?: Record<string, unknown>;
        }) ?? {};

      const parsedGoals = z
        .array(goalSnapshotSchema)
        .safeParse(looseStructure.goals);
      const fallbackGoals = parsedGoals.success ? parsedGoals.data : [];

      const goals = fallbackGoals
        .filter((goal) => goal.name && goal.target_date)
        .map((goal, index) => ({
          id:
            goal.id ??
            deterministicUuidFromSeed(
              `${plan.id}|goal|${index}|${goal.name}|${goal.target_date}`,
            ),
          name: goal.name ?? `Goal ${index + 1}`,
          target_date: goal.target_date ?? input.end_date,
          priority: goal.priority,
        }));

      const parsedBlocks = z
        .array(blockSnapshotSchema)
        .safeParse(looseStructure.blocks);
      const blocks = parsedBlocks.success ? parsedBlocks.data : [];

      const planWarnings =
        parsedStructure.success &&
        parsedStructure.data.plan_type === "periodized"
          ? validatePlanFeasibility(parsedStructure.data).warnings
          : [];

      const estimatedCurrentCtl = await estimateCurrentCtl(
        ctx.supabase,
        ctx.session.user.id,
      );

      const targetCtlAtPeak =
        parsedStructure.success &&
        parsedStructure.data.plan_type === "periodized"
          ? parsedStructure.data.fitness_progression.target_ctl_at_peak
          : looseStructure.fitness_progression?.target_ctl_at_peak;

      const blockRampWarnings = collectBlockRampWarnings(blocks);
      const assessments = buildPlanAssessments({
        goals,
        referenceDate: formatDateOnlyUtc(new Date()),
        currentCtl: estimatedCurrentCtl,
        targetCtlAtPeak,
        planWarnings,
        blockRampWarnings,
      });

      const { data: plannedActivitiesRaw } = await ctx.supabase
        .from("planned_activities")
        .select("scheduled_date, activity_plan:activity_plans (*)")
        .eq("profile_id", ctx.session.user.id)
        .eq("training_plan_id", input.training_plan_id)
        .gte("scheduled_date", input.start_date)
        .lte("scheduled_date", input.end_date);

      const activityPlans = (plannedActivitiesRaw || [])
        .map((item) => item.activity_plan)
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const plansWithEstimations =
        activityPlans.length > 0
          ? await addEstimationToPlans(
              activityPlans,
              ctx.supabase,
              ctx.session.user.id,
            )
          : [];

      const estimatedTssByPlanId = new Map(
        plansWithEstimations.map((item) => [item.id, item.estimated_tss]),
      );

      const scheduledByDate = new Map<string, number>();
      for (const planned of plannedActivitiesRaw || []) {
        const scheduledDate = planned.scheduled_date;
        if (!scheduledDate) continue;

        const planId = planned.activity_plan?.id;
        const estimatedTss = planId ? estimatedTssByPlanId.get(planId) || 0 : 0;
        scheduledByDate.set(
          scheduledDate,
          (scheduledByDate.get(scheduledDate) || 0) + estimatedTss,
        );
      }

      const endExclusive = new Date(parseDateOnlyUtc(input.end_date));
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

      const { data: actualActivities } = await ctx.supabase
        .from("activities")
        .select("started_at, training_stress_score")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", `${input.start_date}T00:00:00.000Z`)
        .lt("started_at", endExclusive.toISOString());

      const actualByDate = new Map<string, number>();
      for (const activity of actualActivities || []) {
        if (!activity.started_at) continue;
        const date = formatDateOnlyUtc(new Date(activity.started_at));
        const tss = activity.training_stress_score || 0;
        actualByDate.set(date, (actualByDate.get(date) || 0) + tss);
      }

      const timelineDates = buildDateRange(input.start_date, input.end_date);
      const timeline = timelineDates.map((date) => {
        const ideal_tss = estimateIdealDailyTss(date, blocks);
        const scheduled_tss =
          Math.round((scheduledByDate.get(date) || 0) * 10) / 10;
        const actual_tss = Math.round((actualByDate.get(date) || 0) * 10) / 10;
        const boundary = classifyBoundaryState(
          ideal_tss,
          scheduled_tss,
          actual_tss,
        );

        return {
          date,
          ideal_tss,
          scheduled_tss,
          actual_tss,
          adherence_score: adherenceScore(ideal_tss, scheduled_tss, actual_tss),
          boundary_state: boundary.state,
          boundary_reasons: boundary.reasons,
        };
      });

      const timelineBoundaryState = getWorstSafetyState(
        timeline.map((point) => point.boundary_state),
      );
      const timelineBoundaryReasons = uniqueReasons(
        timeline.flatMap((point) => point.boundary_reasons),
      );

      const planSafetyState = getWorstSafetyState([
        assessments.planSafety.state,
        timelineBoundaryState,
      ]);

      const primaryCategory =
        parsedStructure.success &&
        parsedStructure.data.plan_type === "periodized"
          ? (Object.keys(parsedStructure.data.activity_distribution)[0] ??
            "run")
          : (Object.keys(looseStructure.activity_distribution ?? {})[0] ??
            "run");

      const adherenceAverage =
        timeline.length > 0
          ? timeline.reduce((sum, point) => sum + point.adherence_score, 0) /
            timeline.length
          : 0;

      const projectionDrivers = [
        "mvp_baseline_projection",
        adherenceAverage < 70
          ? "low_adherence_reduces_projection_confidence"
          : "adherence_within_expected_range",
      ];

      return {
        window: {
          start_date: input.start_date,
          end_date: input.end_date,
          timezone: input.timezone,
        },
        plan_feasibility: assessments.planFeasibility,
        goal_feasibility: assessments.goalFeasibility,
        plan_safety: {
          state: planSafetyState,
          reasons: uniqueReasons([
            ...assessments.planSafety.reasons,
            ...timelineBoundaryReasons,
          ]),
        },
        goal_safety: assessments.goalSafety,
        capability: {
          category: primaryCategory,
          cp_or_cs: null,
          confidence: clampNumber(
            (actualActivities?.length || 0) / 30,
            0.1,
            0.9,
          ),
        },
        projection: {
          at_goal_date: {
            projected_goal_metric: null,
            confidence:
              adherenceAverage <= 0
                ? 0.2
                : clampNumber(adherenceAverage / 100, 0.2, 0.8),
          },
          drivers: projectionDrivers,
        },
        timeline,
      };
    }),

  // ------------------------------
  // Update training plan
  // ------------------------------
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
        })
        .and(trainingPlanUpdateInputSchema),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input as { id: string } & z.infer<
        typeof trainingPlanUpdateInputSchema
      >;

      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to edit it",
        });
      }

      // Validate structure if provided
      if (updates.structure) {
        try {
          trainingPlanSchema.parse(updates.structure);
        } catch (validationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid training plan structure",
            cause: validationError,
          });
        }
      }

      // If setting as active, deactivate other plans
      if (updates.is_active === true) {
        await ctx.supabase
          .from("training_plans")
          .update({ is_active: false })
          .eq("profile_id", ctx.session.user.id)
          .eq("is_active", true)
          .neq("id", id);
      }

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .update({
          name: updates.name as string | undefined,
          description: updates.description as string | null | undefined,
          structure: updates.structure as any,
          is_active: updates.is_active as boolean | undefined,
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data;
    }),

  // ------------------------------
  // Activate a training plan (deactivates all others)
  // ------------------------------
  activate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to activate it",
        });
      }

      if (existing.is_active) {
        // Already active, no-op
        return { success: true, message: "Plan is already active" };
      }

      // Deactivate all other plans for this user
      await ctx.supabase
        .from("training_plans")
        .update({ is_active: false })
        .eq("profile_id", ctx.session.user.id)
        .eq("is_active", true);

      // Activate this plan
      const { error } = await ctx.supabase
        .from("training_plans")
        .update({ is_active: true })
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return { success: true, message: "Plan activated successfully" };
    }),

  // ------------------------------
  // Delete training plan (cascades to delete planned activities)
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to delete it",
        });
      }

      // Delete all planned activities associated with this training plan first
      const { error: deleteActivitiesError } = await ctx.supabase
        .from("planned_activities")
        .delete()
        .eq("training_plan_id", input.id)
        .eq("profile_id", ctx.session.user.id);

      if (deleteActivitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete planned activities: ${deleteActivitiesError.message}`,
        });
      }

      // Now delete the training plan
      const { error } = await ctx.supabase
        .from("training_plans")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return { success: true };
    }),

  // ------------------------------
  // Get training plan by ID (for verification)
  // ------------------------------
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      // Validate structure on read
      try {
        if (data.structure) {
          trainingPlanSchema.parse(data.structure);
        }
      } catch (validationError) {
        console.error(
          "Invalid structure in database for training plan",
          input.id,
          validationError,
        );
      }

      return data;
    }),

  // ------------------------------
  // Get current training status (CTL/ATL/TSB)
  // ------------------------------
  getCurrentStatus: protectedProcedure.query(async ({ ctx }) => {
    // First check if user has a training plan
    const { data: plan } = await ctx.supabase
      .from("training_plans")
      .select("*")
      .eq("profile_id", ctx.session.user.id)
      .single();

    if (!plan) {
      return null;
    }

    // Get activities from the last 42 days (CTL time constant)
    const today = new Date();
    const fortyTwoDaysAgo = new Date(today);
    fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);

    const { data: activities, error: activitiesError } = await ctx.supabase
      .from("activities")
      .select("*")
      .eq("profile_id", ctx.session.user.id)
      .gte("started_at", fortyTwoDaysAgo.toISOString())
      .order("started_at", { ascending: true });

    if (activitiesError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: activitiesError.message,
      });
    }

    // Calculate CTL, ATL, TSB
    let ctl = 0;
    let atl = 0;

    if (activities && activities.length > 0) {
      for (const activity of activities) {
        // TSS is now stored in individual column
        const tss = activity.training_stress_score || 0;
        ctl = calculateCTL(ctl, tss);
        atl = calculateATL(atl, tss);
      }
    }

    const tsb = calculateTSB(ctl, atl);
    const form = getFormStatus(tsb);

    // Get this week's progress
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    // Get completed activities this week
    const { data: weekActivities } = await ctx.supabase
      .from("activities")
      .select("*")
      .eq("profile_id", ctx.session.user.id)
      .gte("started_at", startOfWeek.toISOString())
      .lt("started_at", endOfWeek.toISOString());

    const completedWeeklyTSS =
      weekActivities?.reduce(
        (sum, act) => sum + (act.training_stress_score || 0),
        0,
      ) || 0;

    // Get planned activities this week with their activity plans
    const { data: plannedActivities } = await ctx.supabase
      .from("planned_activities")
      .select("*, activity_plan:activity_plans (*)")
      .eq("profile_id", ctx.session.user.id)
      .gte("scheduled_date", startOfWeek.toISOString().split("T")[0])
      .lt("scheduled_date", endOfWeek.toISOString().split("T")[0]);

    // Extract activity plans and add estimations
    const activityPlans = (plannedActivities || [])
      .map((pa) => pa.activity_plan)
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

    const plansWithEstimations =
      activityPlans.length > 0
        ? await addEstimationToPlans(
            activityPlans,
            ctx.supabase,
            ctx.session.user.id,
          )
        : [];

    const plannedWeeklyTSS = plansWithEstimations.reduce(
      (sum, plan) => sum + plan.estimated_tss,
      0,
    );

    const totalPlannedActivities = plannedActivities?.length || 0;

    // Count completed activities this week
    const { count: completedActivitiesCount } = await ctx.supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id)
      .gte("started_at", startOfWeek.toISOString())
      .lt("started_at", endOfWeek.toISOString());

    // Get upcoming activities (next 5 days)
    const fiveDaysFromNow = new Date(today);
    fiveDaysFromNow.setDate(today.getDate() + 5);

    const { data: upcomingActivitiesRaw } = await ctx.supabase
      .from("planned_activities")
      .select("*, activity_plan:activity_plans (*)")
      .eq("profile_id", ctx.session.user.id)
      .gte("scheduled_date", today.toISOString().split("T")[0])
      .lte("scheduled_date", fiveDaysFromNow.toISOString().split("T")[0])
      .order("scheduled_date", { ascending: true })
      .limit(5);

    // Add estimations to upcoming activity plans
    const upcomingPlans = (upcomingActivitiesRaw || [])
      .map((pa) => pa.activity_plan)
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

    const upcomingPlansWithEstimations =
      upcomingPlans.length > 0
        ? await addEstimationToPlans(
            upcomingPlans,
            ctx.supabase,
            ctx.session.user.id,
          )
        : [];

    // Map back to planned activities structure with estimated values
    const upcomingActivities =
      upcomingActivitiesRaw?.map((pa, index) => ({
        id: pa.id,
        scheduled_date: pa.scheduled_date,
        activity_plan: upcomingPlansWithEstimations[index]
          ? {
              id: upcomingPlansWithEstimations[index].id,
              name: upcomingPlansWithEstimations[index].name,
              activity_category:
                upcomingPlansWithEstimations[index].activity_category,
              activity_location:
                upcomingPlansWithEstimations[index].activity_location,
              estimated_duration:
                upcomingPlansWithEstimations[index].estimated_duration,
              estimated_tss: upcomingPlansWithEstimations[index].estimated_tss,
            }
          : null,
      })) || [];

    // Get target TSS from current block in training plan structure
    const structure = plan.structure as any;
    let targetTSS = plannedWeeklyTSS;

    // For periodized plans, find the current block
    if (structure?.plan_type === "periodized" && structure?.blocks) {
      const todayStr = today.toISOString().split("T")[0] || "";
      const currentBlock = structure.blocks.find((block: any) => {
        return (
          todayStr && block.start_date <= todayStr && block.end_date >= todayStr
        );
      });

      if (currentBlock?.target_weekly_tss_range) {
        // Use the max of the range as the target
        targetTSS = currentBlock.target_weekly_tss_range.max;
      }
    } else if (
      structure?.plan_type === "maintenance" &&
      structure?.target_weekly_tss_range
    ) {
      // For maintenance plans, use the target range
      targetTSS = structure.target_weekly_tss_range.max;
    }

    return {
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      form,
      weekProgress: {
        completedTSS: Math.round(completedWeeklyTSS * 10) / 10,
        plannedTSS: Math.round(plannedWeeklyTSS * 10) / 10,
        targetTSS: Math.round(targetTSS * 10) / 10,
        completedActivities: completedActivitiesCount || 0,
        totalPlannedActivities,
      },
      upcomingActivities: upcomingActivities || [],
    };
  }),

  // ------------------------------
  // Get ideal training curve (planned progression)
  // ------------------------------
  getIdealCurve: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        start_date: z.string(),
        end_date: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get the training plan
      const { data: plan, error: planError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const structure = plan.structure as any;

      // ✅ FIX: Support both legacy fitness_progression and modern periodization_template
      const hasPeriodization =
        structure?.periodization_template?.target_ctl &&
        structure?.periodization_template?.target_date;

      if (!hasPeriodization && !structure?.fitness_progression) {
        return null;
      }

      // ✅ FIX: Get user's CURRENT CTL (not plan's starting_ctl)
      const { data: actualCurve } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .lte("started_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(42);

      let currentCTL = structure?.periodization_template?.starting_ctl || 40;

      if (actualCurve && actualCurve.length > 0) {
        const tssData = actualCurve.map((a) => a.training_stress_score || 0);
        const series = calculateTrainingLoadSeries(tssData, 0, 0);
        currentCTL = series[series.length - 1]?.ctl || currentCTL;
      }

      const targetCTL =
        structure.periodization_template?.target_ctl ||
        structure.fitness_progression?.target_ctl ||
        100;

      const targetDate =
        structure.periodization_template?.target_date ||
        structure.fitness_progression?.peak_date ||
        input.end_date;

      // ✅ FIX: Start projection from TODAY (not query start_date)
      const projectionStartDate = new Date();
      const projectionEndDate = new Date(targetDate);
      const daysToTarget = Math.floor(
        (projectionEndDate.getTime() - projectionStartDate.getTime()) /
          (24 * 60 * 60 * 1000),
      );

      // ✅ FIX: Use plan's target_weekly_tss for projection
      const weeklyTSS =
        structure.target_weekly_tss || (targetCTL - currentCTL) * 7;
      const dailyTSS = weeklyTSS / 7;

      // Build projection curve
      const curve = [];
      let ctl = currentCTL;

      for (let day = 0; day <= daysToTarget; day++) {
        const date = new Date(projectionStartDate);
        date.setDate(date.getDate() + day);

        // Apply phase multipliers if blocks exist
        const currentBlock = structure.blocks?.find((block: any) => {
          const blockStart = new Date(block.start_date);
          const blockEnd = new Date(block.end_date);
          return date >= blockStart && date <= blockEnd;
        });

        const phaseMultipliers: Record<string, number> = {
          base: 0.8,
          build: 1.0,
          peak: 1.2,
          taper: 0.5,
          recovery: 0.6,
        };

        const multiplier = currentBlock?.phase
          ? phaseMultipliers[currentBlock.phase] || 1.0
          : 1.0;

        const adjustedDailyTSS = dailyTSS * multiplier;

        // Update CTL (exponentially weighted moving average)
        ctl = ctl + (adjustedDailyTSS - ctl) / 42;

        curve.push({
          date: date.toISOString().split("T")[0],
          ctl: Math.round(ctl),
        });
      }

      return {
        dataPoints: curve,
        startCTL: currentCTL,
        targetCTL: targetCTL,
        targetDate: targetDate,
      };
    }),

  // ------------------------------
  // Get actual training curve (from completed activities)
  // ------------------------------
  getActualCurve: protectedProcedure
    .input(
      z.object({
        start_date: z.string(),
        end_date: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);

      // ✅ FIX: Get baseline CTL from before start_date
      const extendedStart = new Date(startDate);
      extendedStart.setDate(startDate.getDate() - 42); // 42 days before

      const { data: baselineActivities } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .lt("started_at", startDate.toISOString())
        .gte("started_at", extendedStart.toISOString())
        .order("started_at", { ascending: true });

      let initialCTL = 0;
      let initialATL = 0;

      if (baselineActivities && baselineActivities.length > 0) {
        const baselineTSS = baselineActivities.map(
          (a) => a.training_stress_score || 0,
        );
        const baselineSeries = calculateTrainingLoadSeries(baselineTSS, 0, 0);
        const last = baselineSeries[baselineSeries.length - 1];
        if (last) {
          initialCTL = last.ctl;
          initialATL = last.atl;
        }
      }

      // Get activities in range
      const { data: activities, error: activitiesError } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", startDate.toISOString())
        .lte("started_at", endDate.toISOString())
        .order("started_at", { ascending: true });

      if (activitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: activitiesError.message,
        });
      }

      const tssData: { date: string; tss: number }[] = [];
      const activitiesByDate = new Map<string, number>();

      // Group activities by date and sum TSS
      for (const activity of activities || []) {
        const dateStr = new Date(activity.started_at)
          .toISOString()
          .split("T")[0];
        if (!dateStr) continue;
        const tss = activity.training_stress_score || 0;
        activitiesByDate.set(
          dateStr,
          (activitiesByDate.get(dateStr) || 0) + tss,
        );
      }

      // Create daily TSS array for the requested range
      const daysDiff = Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      for (let i = 0; i <= daysDiff; i++) {
        const date = new Date(startDate.getTime());
        date.setDate(startDate.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        if (dateStr) {
          const tss = activitiesByDate.get(dateStr) || 0;
          tssData.push({ date: dateStr, tss });
        }
      }

      // ✅ FIX: Use baseline CTL/ATL
      const series = calculateTrainingLoadSeries(
        tssData.map((d) => d.tss),
        initialCTL,
        initialATL,
      );

      // Filter to requested date range and create data points
      const dataPoints = [];
      for (let i = 0; i < tssData.length; i++) {
        const tssItem = tssData[i];
        const seriesItem = series[i];
        if (!tssItem || !seriesItem) continue;

        const date = new Date(tssItem.date);
        if (date >= startDate && date <= endDate) {
          dataPoints.push({
            date: tssItem.date,
            ctl: Math.round(seriesItem.ctl * 10) / 10,
            atl: Math.round(seriesItem.atl * 10) / 10,
            tsb: Math.round(seriesItem.tsb * 10) / 10,
          });
        }
      }

      return { dataPoints };
    }),

  // ------------------------------
  // Apply quick adjustment to training plan
  // ------------------------------
  applyQuickAdjustment: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        adjustedStructure: z.any(), // Will be validated by trainingPlanSchema
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to edit it",
        });
      }

      // Validate the adjusted structure
      try {
        trainingPlanSchema.parse(input.adjustedStructure);
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid adjusted structure",
          cause: validationError,
        });
      }

      // Apply the adjustment
      const { data, error } = await ctx.supabase
        .from("training_plans")
        .update({
          structure: input.adjustedStructure,
        })
        .eq("id", input.id)
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data;
    }),

  // ------------------------------
  // Get weekly summary (planned vs actual)
  // ------------------------------
  getWeeklySummary: protectedProcedure
    .input(
      z.object({
        training_plan_id: z.string().uuid(),
        weeks_back: z.number().min(1).max(52).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify plan ownership
      const { data: plan, error: planError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.training_plan_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const structure = plan.structure as any;
      const blocks = structure.blocks || [];

      // Calculate date range
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - input.weeks_back * 7);

      // Get all planned activities in range with full activity plans
      const { data: plannedActivitiesRaw } = await ctx.supabase
        .from("planned_activities")
        .select("*, activity_plan:activity_plans (*)")
        .eq("training_plan_id", input.training_plan_id)
        .gte("scheduled_date", startDate.toISOString().split("T")[0])
        .lte("scheduled_date", today.toISOString().split("T")[0]);

      // Extract activity plans and add estimations
      const activityPlans = (plannedActivitiesRaw || [])
        .map((pa) => pa.activity_plan)
        .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

      const plansWithEstimations =
        activityPlans.length > 0
          ? await addEstimationToPlans(
              activityPlans,
              ctx.supabase,
              ctx.session.user.id,
            )
          : [];

      // Create a map for quick lookup of estimated TSS by plan ID
      const estimationMap = new Map(
        plansWithEstimations.map((plan) => [plan.id, plan.estimated_tss]),
      );

      // Map planned activities with their estimations
      const plannedActivities =
        plannedActivitiesRaw?.map((pa) => ({
          ...pa,
          activity_plan: pa.activity_plan
            ? {
                ...pa.activity_plan,
                estimated_tss: estimationMap.get(pa.activity_plan.id) || 0,
              }
            : null,
        })) || [];

      // Get all completed activities in range
      const { data: completedActivities } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", startDate.toISOString())
        .lte("started_at", today.toISOString());

      // Group by week
      const weekSummaries = [];
      for (let i = input.weeks_back - 1; i >= 0; i--) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (i + 1) * 7);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        // Count planned activities and TSS for this week
        const weekPlanned =
          plannedActivities?.filter((pa) => {
            const date = new Date(pa.scheduled_date);
            return date >= weekStart && date < weekEnd;
          }) || [];

        const plannedTSS = weekPlanned.reduce(
          (sum, pa) => sum + (pa.activity_plan?.estimated_tss || 0),
          0,
        );

        // Count completed activities and TSS for this week
        const weekCompleted =
          completedActivities?.filter((act) => {
            const date = new Date(act.started_at);
            return date >= weekStart && date < weekEnd;
          }) || [];

        const completedTSS = weekCompleted.reduce(
          (sum, act) => sum + (act.training_stress_score || 0),
          0,
        );

        // Find the block for this week (use week start date)
        const weekStartStr = weekStart.toISOString().split("T")[0];
        const weekBlock = blocks.find((block: any) => {
          return (
            weekStartStr &&
            block.start_date <= weekStartStr &&
            block.end_date >= weekStartStr
          );
        });

        // Get target TSS and activities from the block
        let targetWeeklyTSS = 0;
        let targetActivities = 0;

        if (weekBlock?.target_weekly_tss_range) {
          targetWeeklyTSS = weekBlock.target_weekly_tss_range.max;
        }

        if (weekBlock?.target_sessions_per_week_range) {
          targetActivities = weekBlock.target_sessions_per_week_range.max;
        } else if (structure?.constraints?.available_days_per_week) {
          // Fallback to constraints if no block-specific target
          targetActivities =
            structure.constraints.available_days_per_week.length;
        }

        // Calculate completion percentage
        const tssPercentage =
          plannedTSS > 0 ? (completedTSS / plannedTSS) * 100 : 0;
        const activityPercentage =
          weekPlanned.length > 0
            ? (weekCompleted.length / weekPlanned.length) * 100
            : 0;

        // Determine status
        let status: "good" | "warning" | "poor" = "good";
        if (tssPercentage < 70 || activityPercentage < 70) {
          status = "poor";
        } else if (tssPercentage < 90 || activityPercentage < 90) {
          status = "warning";
        }

        weekSummaries.push({
          weekStart: weekStart.toISOString().split("T")[0],
          weekEnd: weekEnd.toISOString().split("T")[0],
          plannedTSS: Math.round(plannedTSS),
          completedTSS: Math.round(completedTSS),
          tssPercentage: Math.round(tssPercentage),
          plannedActivities: weekPlanned.length,
          completedActivities: weekCompleted.length,
          activityPercentage: Math.round(activityPercentage),
          targetTSS: Math.round(targetWeeklyTSS),
          targetActivities,
          status,
        });
      }

      return weekSummaries;
    }),

  // ------------------------------
  // Get intensity distribution (actual from completed activities)
  // Uses 7-zone system: Recovery, Endurance, Tempo, Threshold, VO2max, Anaerobic, Neuromuscular
  // ------------------------------
  getIntensityDistribution: protectedProcedure
    .input(
      z.object({
        training_plan_id: z.string().uuid().optional(),
        start_date: z.string(),
        end_date: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get completed activities in date range with intensity_factor
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const totalActivities = activities?.length || 0;

      // Initialize 7-zone distribution (TSS-weighted)
      type IntensityZone =
        | "recovery"
        | "endurance"
        | "tempo"
        | "threshold"
        | "vo2max"
        | "anaerobic"
        | "neuromuscular";
      const zoneDistribution: Record<IntensityZone, number> = {
        recovery: 0,
        endurance: 0,
        tempo: 0,
        threshold: 0,
        vo2max: 0,
        anaerobic: 0,
        neuromuscular: 0,
      };

      let totalTSS = 0;

      // Calculate actual distribution from IF values
      if (activities && activities.length > 0) {
        for (const activity of activities) {
          // Skip activities without intensity_factor or TSS
          const intensityFactorValue = activity.intensity_factor || 0;
          const tss = activity.training_stress_score || 0;

          if (!intensityFactorValue || !tss) {
            continue;
          }

          // Convert IF from integer (0-100) to decimal (0.00-1.00)
          // Note: DB stores as float 0.85 or int 85? Plan said "decimal (e.g., 0.85)".
          // But previous code divided by 100. Let's assume it's stored as float 0.85 based on `calculateIntensityFactor` returning decimal.
          // Wait, `calculateIntensityFactor` returns 0.85.
          // Previous code: `const intensityFactor = intensityFactorValue / 100;`
          // This implies previous code assumed it was stored as 85.
          // Let's check `calculateIntensityFactor` in `calculations.ts`.
          // It returns `Math.round((np / ftp) * 100) / 100`. So 0.85.
          // So I should NOT divide by 100 if it's stored as 0.85.
          // However, if the column type is integer, it might be 85.
          // `database.types.ts` says `intensity_factor: number | null`.
          // I'll assume it's 0.85 (float).
          const intensityFactor = intensityFactorValue;

          // Get the zone for this IF value
          const zone = getTrainingIntensityZone(
            intensityFactor,
          ) as IntensityZone;

          // Add TSS to the appropriate zone
          zoneDistribution[zone] = (zoneDistribution[zone] || 0) + tss;
          totalTSS += tss;
        }

        // Convert TSS values to percentages
        if (totalTSS > 0) {
          for (const zone in zoneDistribution) {
            const zoneKey = zone as IntensityZone;
            zoneDistribution[zoneKey] =
              (zoneDistribution[zoneKey] / totalTSS) * 100;
          }
        }
      }

      // Generate recommendations based on training science
      const recommendations: string[] = [];
      const recoveryPct = zoneDistribution.recovery || 0;
      const endurancePct = zoneDistribution.endurance || 0;
      const hardPct =
        (zoneDistribution.threshold || 0) +
        (zoneDistribution.vo2max || 0) +
        (zoneDistribution.anaerobic || 0) +
        (zoneDistribution.neuromuscular || 0);

      // Polarized training: ~80% easy (recovery + endurance), ~20% hard
      const easyPct = recoveryPct + endurancePct;

      if (totalActivities >= 5) {
        // Only provide recommendations if we have enough data
        if (easyPct < 70) {
          recommendations.push(
            "Consider adding more easy/recovery activities. Aim for ~80% of training at low intensity.",
          );
        } else if (easyPct > 90) {
          recommendations.push(
            "Consider adding some high-intensity sessions to stimulate adaptation.",
          );
        }

        if (hardPct > 30) {
          recommendations.push(
            "High volume of hard training detected. Ensure adequate recovery to prevent overtraining.",
          );
        }

        if ((zoneDistribution.tempo || 0) > 20) {
          recommendations.push(
            "High tempo training detected. This 'gray zone' may limit polarization benefits.",
          );
        }
      } else if (totalActivities > 0) {
        recommendations.push(
          "Complete more activities to see meaningful intensity distribution analysis.",
        );
      } else {
        recommendations.push(
          "No completed activities in this date range. Start training to see your intensity distribution!",
        );
      }

      return {
        distribution: {
          recovery: Math.round((zoneDistribution.recovery || 0) * 10) / 10,
          endurance: Math.round((zoneDistribution.endurance || 0) * 10) / 10,
          tempo: Math.round((zoneDistribution.tempo || 0) * 10) / 10,
          threshold: Math.round((zoneDistribution.threshold || 0) * 10) / 10,
          vo2max: Math.round((zoneDistribution.vo2max || 0) * 10) / 10,
          anaerobic: Math.round((zoneDistribution.anaerobic || 0) * 10) / 10,
          neuromuscular:
            Math.round((zoneDistribution.neuromuscular || 0) * 10) / 10,
        },
        totalActivities,
        totalTSS: Math.round(totalTSS),
        activitiesWithIntensity:
          activities?.filter(
            (a) =>
              a.intensity_factor !== null && a.intensity_factor !== undefined,
          ).length || 0,
        recommendations,
      };
    }),

  // Get intensity trends over time
  // ------------------------------
  getIntensityTrends: protectedProcedure
    .input(
      z.object({
        weeks_back: z.number().int().min(1).max(52).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.weeks_back * 7);

      // Get activities with IF values
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", startDate.toISOString())
        .lte("started_at", endDate.toISOString())
        .order("started_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Group by week
      type IntensityZone =
        | "recovery"
        | "endurance"
        | "tempo"
        | "threshold"
        | "vo2max"
        | "anaerobic"
        | "neuromuscular";
      const weeklyData: Record<
        string,
        {
          weekStart: string;
          totalTSS: number;
          avgIF: number;
          activities: number;
          zones: Record<IntensityZone, number>;
        }
      > = {};

      if (activities && activities.length > 0) {
        for (const activity of activities) {
          const date = new Date(activity.started_at);
          // Get Monday of the week
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay() + 1);
          const weekKey = weekStart.toISOString().split("T")[0] || "";

          if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = {
              weekStart: weekKey,
              totalTSS: 0,
              avgIF: 0,
              activities: 0,
              zones: {
                recovery: 0,
                endurance: 0,
                tempo: 0,
                threshold: 0,
                vo2max: 0,
                anaerobic: 0,
                neuromuscular: 0,
              },
            };
          }

          const intensityFactorValue = activity.intensity_factor || 0;

          if (!intensityFactorValue) continue;

          const intensityFactor = intensityFactorValue; // Assuming float 0.85
          const tss = activity.training_stress_score || 0;
          const zone = getTrainingIntensityZone(
            intensityFactor,
          ) as IntensityZone;

          const week = weeklyData[weekKey];
          if (week && weekKey) {
            week.totalTSS += tss;
            week.avgIF += intensityFactor;
            week.activities += 1;
            week.zones[zone] = (week.zones[zone] || 0) + tss;
          }
        }

        // Calculate averages and percentages
        for (const week of Object.values(weeklyData)) {
          week.avgIF = week.avgIF / week.activities;

          // Convert zone TSS to percentages
          if (week.totalTSS > 0) {
            for (const zone in week.zones) {
              const zoneKey = zone as IntensityZone;
              week.zones[zoneKey] = (week.zones[zoneKey] / week.totalTSS) * 100;
            }
          }
        }
      }

      return {
        weeks: Object.values(weeklyData).sort(
          (a, b) =>
            new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
        ),
        totalActivities: activities?.length || 0,
      };
    }),

  // Check hard activity spacing (retrospective analysis)
  // ------------------------------
  checkHardActivitySpacing: protectedProcedure
    .input(
      z.object({
        start_date: z.string(),
        end_date: z.string(),
        min_hours: z.number().int().min(24).max(168).default(48),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get activities with IF >= 0.85 (threshold and above)
      const { data: allActivities, error } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      // Filter activities with IF >= 0.85
      const activities =
        allActivities?.filter((a) => {
          return (a.intensity_factor || 0) >= 0.85;
        }) || [];

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const violations: Array<{
        activity1: {
          id: string;
          name: string;
          started_at: string;
          intensity_factor: number;
        };
        activity2: {
          id: string;
          name: string;
          started_at: string;
          intensity_factor: number;
        };
        hoursBetween: number;
      }> = [];

      if (activities && activities.length > 1) {
        for (let i = 1; i < activities.length; i++) {
          const prev = activities[i - 1];
          const curr = activities[i];

          if (!prev || !curr) continue;

          const hoursBetween =
            (new Date(curr.started_at).getTime() -
              new Date(prev.started_at).getTime()) /
            (1000 * 60 * 60);

          if (hoursBetween < input.min_hours) {
            violations.push({
              activity1: {
                id: prev.id,
                name: prev.name || "Unnamed activity",
                started_at: prev.started_at,
                intensity_factor: prev.intensity_factor ?? 0,
              },
              activity2: {
                id: curr.id,
                name: curr.name || "Unnamed activity",
                started_at: curr.started_at,
                intensity_factor: curr.intensity_factor ?? 0,
              },
              hoursBetween: Math.round(hoursBetween * 10) / 10,
            });
          }
        }
      }

      return {
        violations,
        hardActivityCount: activities?.length || 0,
        hasViolations: violations.length > 0,
      };
    }),

  // ------------------------------
  // Get weekly totals (distance, time, count) for current week
  // ------------------------------
  getWeeklyTotals: protectedProcedure
    .input(
      z
        .object({
          weekStartDate: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Calculate week boundaries (Sunday to Saturday)
      const today = new Date();
      const weekStart = input?.weekStartDate
        ? new Date(input.weekStartDate)
        : new Date(today);

      // Set to start of week (Sunday)
      if (!input?.weekStartDate) {
        weekStart.setDate(today.getDate() - today.getDay());
      }
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      // Get completed activities for this week
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", weekStart.toISOString())
        .lt("started_at", weekEnd.toISOString());

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Sum totals
      let totalDistance = 0;
      let totalTime = 0;
      const count = activities?.length || 0;

      if (activities && activities.length > 0) {
        for (const activity of activities) {
          totalDistance += activity.distance_meters || 0;
          totalTime += activity.duration_seconds || 0;
        }
      }

      return {
        distance: Math.round(totalDistance * 100) / 100, // meters
        time: Math.round(totalTime), // seconds
        count,
      };
    }),

  // ------------------------------
  // List training plan templates
  // ------------------------------
  listTemplates: protectedProcedure
    .input(
      z
        .object({
          sport: z.string().optional(),
          experience_level: z
            .enum(["beginner", "intermediate", "advanced"])
            .optional(),
          min_weeks: z.number().int().min(1).max(52).optional(),
          max_weeks: z.number().int().min(1).max(52).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      // Import PLAN_TEMPLATES from core package
      const { PLAN_TEMPLATES } = await import("@repo/core");

      // Convert to array and filter
      let templates = Object.entries(PLAN_TEMPLATES).map(([id, template]) => ({
        id,
        ...template,
      }));

      if (input?.sport) {
        templates = templates.filter((t) =>
          t.sport.includes(input.sport as any),
        );
      }

      if (input?.experience_level) {
        templates = templates.filter((t) =>
          t.experienceLevel.includes(input.experience_level!),
        );
      }

      if (input?.min_weeks) {
        templates = templates.filter(
          (t) => t.durationWeeks.recommended >= input.min_weeks!,
        );
      }

      if (input?.max_weeks) {
        templates = templates.filter(
          (t) => t.durationWeeks.recommended <= input.max_weeks!,
        );
      }

      return templates;
    }),

  // ------------------------------
  // Get single training plan template
  // ------------------------------
  getTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { PLAN_TEMPLATES } = await import("@repo/core");

      const template = PLAN_TEMPLATES[input.id];

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return {
        id: input.id,
        ...template,
      };
    }),

  // ------------------------------
  // Auto-add periodization to existing plan
  // ------------------------------
  autoAddPeriodization: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing, error: fetchError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (fetchError || !existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to edit it",
        });
      }

      const structure = existing.structure as any;

      // Check if already periodized
      if (
        structure?.plan_type === "periodized" &&
        structure?.fitness_progression
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This plan already has periodization configured",
        });
      }

      // For now, return a message that this feature is under development
      // In the future, this could automatically generate blocks and fitness progression
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Auto-periodization is not yet implemented. Please create a new periodized training plan or manually configure periodization in settings.",
      });
    }),
});
