// packages/trpc/src/routers/planning/training-plans/base.ts
import {
  type AthletePreferenceProfile,
  addDaysDateOnlyUtc,
  athletePreferenceProfileSchema,
  buildDeterministicProjectionPayload,
  buildProjectionEngineInput,
  type ProjectionChartPayload as CoreProjectionChartPayload,
  type CreationContextSummary,
  calculateTrainingLoadSeries,
  canonicalizeMinimalTrainingPlanCreate,
  classifyCreationFeasibility,
  computeLoadBootstrapState,
  countAvailableTrainingDays,
  createFromCreationConfigInputSchema,
  creationBehaviorControlsV1Schema,
  creationConfigValueSchema,
  creationConstraintsSchema,
  creationNormalizationInputSchema,
  creationWeekDayEnum,
  type DeterministicProjectionMicrocycle,
  deriveCreationContext,
  deriveCreationSuggestions,
  deriveNoHistoryGoalTierFromTargets,
  derivePlanTimeline,
  deterministicUuidFromSeed,
  diffDateOnlyUtcDays,
  formatDateOnlyUtc,
  getCreationSuggestionsInputSchema,
  getFormStatus,
  getTrainingIntensityZone,
  type InferredStateSnapshot,
  inferredStateSnapshotSchema,
  type LoadBootstrapState,
  type MinimalTrainingPlanCreate,
  materializePlanToEvents,
  minimalTrainingPlanCreateSchema,
  type NoHistoryAnchorContext,
  type NoHistoryGoalTargetInput,
  type NoHistoryProjectionMetadata,
  type NormalizeCreationConfigInput,
  normalizeCreationConfig,
  normalizeProjectionSafetyConfig,
  type PreviewReadinessSnapshot,
  type ProfileGoal,
  type ProjectionConstraintSummary,
  type ProjectionPeriodizationPhase,
  type ProjectionRecoverySegment,
  parseDateOnlyUtc,
  parseProfileGoalRecord,
  postCreateBehaviorSchema,
  previewCreationConfigInputSchema,
  type ReadinessDeltaDiagnostics,
  resolveConstraintConflicts,
  resolveGoalEventDate,
  type TrainingPlanCreationConfig,
  templateApplyInputSchema,
  trainingPlanCalibrationConfigSchema,
  trainingPlanCreateInputSchema,
  trainingPlanCreateSchema,
  trainingPlanCreationConfigFormSchema,
  trainingPlanSchema,
  trainingPlanUpdateInputSchema,
  validatePlanFeasibility,
} from "@repo/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createFromCreationConfigUseCase,
  getCreationSuggestionsUseCase,
  previewCreationConfigUseCase,
  updateFromCreationConfigUseCase,
} from "../../../application/training-plan";
import { createSupabaseTrainingPlanRepository } from "../../../infrastructure";
import {
  buildActivityDerivedSummaryMap,
  buildDynamicStressSeries,
} from "../../../lib/activity-analysis";
import { featureFlags } from "../../../lib/features";
import { createTRPCRouter, protectedProcedure } from "../../../trpc";
import { addEstimationToPlans } from "../../../utils/estimation-helpers";

const feasibilityStateSchema = z.enum(["feasible", "aggressive", "unsafe"]);
const safetyStateSchema = z.enum(["safe", "caution", "exceeded"]);
const plannedEventType = "planned_activity" as const;
const conservativeStarterWeeklyTss = 140;
const conservativeStarterDailyTss = conservativeStarterWeeklyTss / 7;

type FeasibilityState = z.infer<typeof feasibilityStateSchema>;
type SafetyState = z.infer<typeof safetyStateSchema>;

function toDayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

function toNextDayStartIso(dateOnly: string): string {
  return toDayStartIso(addDaysDateOnlyUtc(dateOnly, 1));
}

function isUuidString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function todayStartIsoUtc(): string {
  return toDayStartIso(formatDateOnlyUtc(new Date()));
}

function todayDateOnlyUtc(): string {
  return formatDateOnlyUtc(new Date());
}

type ActivePlanLookup = {
  trainingPlanId: string;
  trainingPlan: Record<string, any>;
  nextEventAt: string;
};

async function getActivePlanFromFutureEvents(input: {
  supabase: SupabaseClient;
  profileId: string;
}): Promise<ActivePlanLookup | null> {
  let eventsQuery: any = input.supabase
    .from("events")
    .select("training_plan_id, starts_at")
    .eq("profile_id", input.profileId)
    .eq("event_type", plannedEventType);

  if (typeof eventsQuery.gte === "function") {
    eventsQuery = eventsQuery.gte("starts_at", todayStartIsoUtc());
  }

  if (typeof eventsQuery.order === "function") {
    eventsQuery = eventsQuery.order("starts_at", { ascending: true });
  }

  if (typeof eventsQuery.limit === "function") {
    eventsQuery = eventsQuery.limit(50);
  }

  const { data: upcomingEvents, error: eventsError } = await eventsQuery;

  if (eventsError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: eventsError.message,
    });
  }

  const nextScheduledPlanEvent = (upcomingEvents ?? []).find(
    (event: any) =>
      isUuidString((event as any).training_plan_id) && typeof (event as any).starts_at === "string",
  );

  if (!nextScheduledPlanEvent) {
    return null;
  }

  const trainingPlanId = (nextScheduledPlanEvent as any).training_plan_id as string;
  const nextEventAt = (nextScheduledPlanEvent as any).starts_at as string;

  const { data: trainingPlan, error: planError } = await input.supabase
    .from("training_plans")
    .select("*")
    .eq("id", trainingPlanId)
    .or(`profile_id.eq.${input.profileId},is_system_template.eq.true,template_visibility.eq.public`)
    .maybeSingle();

  if (planError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: planError.message,
    });
  }

  if (!trainingPlan) {
    return null;
  }

  return {
    trainingPlanId,
    trainingPlan: trainingPlan as Record<string, any>,
    nextEventAt,
  };
}

function withTrainingPlanIdentity<
  T extends {
    id: string;
    profile_id: string | null;
    template_visibility?: string | null;
    is_system_template?: boolean | null;
  },
>(plan: T) {
  return {
    ...plan,
    content_type: "training_plan" as const,
    content_id: plan.id,
    owner_profile_id: plan.profile_id,
    visibility:
      plan.template_visibility === "private" || plan.template_visibility === "public"
        ? plan.template_visibility
        : plan.is_system_template
          ? "public"
          : "private",
  };
}

type InsightContributorImpact = "positive" | "neutral" | "negative";

type InsightSummaryContributor = {
  key: string;
  label: string;
  value: number;
  impact: InsightContributorImpact;
  detail: string;
};

type InsightSummary = {
  score: number;
  contributors: InsightSummaryContributor[];
  interpretation: string;
};

type LoadGuidanceMode = "baseline" | "goal_driven";

type LoadGuidanceSummary = {
  mode: LoadGuidanceMode;
  goal_count: number;
  dated_goal_count: number;
  has_activity_history: boolean;
  weekly_cap_tss: number | null;
  interpretation: string;
};

type ProjectionLoadProvenanceSource =
  | "canonical_goal_projection"
  | "plan_structure"
  | "scheduled_sessions"
  | "conservative_baseline";

type ProjectionInsightDiagnostics = {
  fallback_mode: string | null;
  load_provenance: {
    source: ProjectionLoadProvenanceSource;
    projection_curve_available: boolean;
    projection_floor_applied: boolean;
  };
  confidence: ProjectionConfidenceSummary & {
    overall: number;
    adherence: number;
    capability: number;
  };
};

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

type ProjectionChartPayload = Omit<CoreProjectionChartPayload, "microcycles"> & {
  microcycles: ProjectionMicrocycleWithId[];
  recovery_segments: ProjectionRecoverySegment[];
  constraint_summary: ProjectionConstraintSummary;
};

type ExpandedProjectionGoal = MinimalTrainingPlanCreate["goals"][number] & {
  id: string;
};

type ExpandedProjectionPlan = {
  plan_type: "periodized";
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  fitness_progression: {
    starting_ctl: number;
    target_ctl_at_peak?: number;
  };
  activity_distribution: Record<
    string,
    {
      target_percentage: number;
    }
  >;
  blocks: Array<{
    id: string;
    name: string;
    phase: "base" | "build" | "peak" | "taper";
    start_date: string;
    end_date: string;
    goal_ids: string[];
    target_weekly_tss_range: { min: number; max: number };
    target_sessions_per_week_range: { min: number; max: number };
  }>;
  goals: ExpandedProjectionGoal[];
};

const phaseBlueprintByWeeks = {
  short: [
    { name: "Base", phase: "base", ratio: 0.5 },
    { name: "Build", phase: "build", ratio: 0.35 },
    { name: "Taper", phase: "taper", ratio: 0.15 },
  ],
  medium: [
    { name: "Base", phase: "base", ratio: 0.4 },
    { name: "Build", phase: "build", ratio: 0.4 },
    { name: "Peak", phase: "peak", ratio: 0.1 },
    { name: "Taper", phase: "taper", ratio: 0.1 },
  ],
  long: [
    { name: "Base", phase: "base", ratio: 0.35 },
    { name: "Build", phase: "build", ratio: 0.4 },
    { name: "Peak", phase: "peak", ratio: 0.15 },
    { name: "Taper", phase: "taper", ratio: 0.1 },
  ],
} as const;

function allocateBlockWeeks(totalWeeks: number, blockCount: number): number[] {
  const safeWeeks = Math.max(totalWeeks, blockCount);
  const base = Math.floor(safeWeeks / blockCount);
  const remainder = safeWeeks % blockCount;
  return Array.from({ length: blockCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function resolveActivityDistribution(
  goals: MinimalTrainingPlanCreate["goals"],
): ExpandedProjectionPlan["activity_distribution"] {
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

  const total = Array.from(categoryCounts.values()).reduce((sum, count) => sum + count, 0);
  const entries = Array.from(categoryCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let runningTotal = 0;
  const distribution: ExpandedProjectionPlan["activity_distribution"] = {};
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

function buildExpandedPlanFromMinimalGoal(
  minimalPlan: MinimalTrainingPlanCreate,
  input?: { startingCtl?: number },
): ExpandedProjectionPlan {
  const canonicalMinimalPlan = canonicalizeMinimalTrainingPlanCreate(minimalPlan);
  const timeline = derivePlanTimeline({
    goals: canonicalMinimalPlan.goals,
    plan_start_date: canonicalMinimalPlan.plan_start_date ?? formatDateOnlyUtc(new Date()),
  });

  const goals = canonicalMinimalPlan.goals
    .map((goal, index) => ({
      ...goal,
      id: deterministicUuidFromSeed(
        `server-preview-goal|${timeline.start_date}|${goal.target_date}|${goal.name}|${index}`,
      ),
    }))
    .sort((a, b) => a.target_date.localeCompare(b.target_date));

  const planDurationDays = diffDateOnlyUtcDays(timeline.start_date, timeline.end_date) + 1;
  const totalWeeks = Math.max(1, Math.ceil(planDurationDays / 7));
  const phaseBlueprint =
    totalWeeks < 8
      ? phaseBlueprintByWeeks.short
      : totalWeeks < 16
        ? phaseBlueprintByWeeks.medium
        : phaseBlueprintByWeeks.long;

  const blockWeeks = allocateBlockWeeks(totalWeeks, phaseBlueprint.length);
  const startingCtl = input?.startingCtl ?? 45;
  const baselineWeeklyTss = Math.max(140, Math.round(startingCtl * 7));
  const tssMultiplierByPhase: Record<ExpandedProjectionPlan["blocks"][number]["phase"], number> = {
    base: 1,
    build: 1.12,
    peak: 1.05,
    taper: 0.72,
  };

  const blocks: ExpandedProjectionPlan["blocks"] = [];
  let blockStart = timeline.start_date;

  for (let index = 0; index < phaseBlueprint.length; index += 1) {
    const phase = phaseBlueprint[index]!;
    const weeks = blockWeeks[index]!;
    const isLast = index === phaseBlueprint.length - 1;
    const computedEnd = addDaysDateOnlyUtc(blockStart, weeks * 7 - 1);
    const blockEnd = isLast
      ? timeline.end_date
      : computedEnd < timeline.end_date
        ? computedEnd
        : timeline.end_date;

    const goalIds = goals
      .filter((goal) => goal.target_date >= blockStart && goal.target_date <= blockEnd)
      .map((goal) => goal.id);

    if (isLast && goalIds.length === 0 && goals.length > 0) {
      goalIds.push(goals[goals.length - 1]!.id);
    }

    const targetWeeklyTss = Math.round(baselineWeeklyTss * tssMultiplierByPhase[phase.phase]);

    blocks.push({
      id: deterministicUuidFromSeed(
        `server-preview-block|${timeline.start_date}|${timeline.end_date}|${index}|${phase.name}`,
      ),
      name: phase.name,
      phase: phase.phase,
      start_date: blockStart,
      end_date: blockEnd,
      goal_ids: goalIds,
      target_weekly_tss_range: {
        min: Math.max(60, Math.round(targetWeeklyTss * 0.85)),
        max: Math.max(90, Math.round(targetWeeklyTss * 1.15)),
      },
      target_sessions_per_week_range:
        phase.phase === "taper" ? { min: 2, max: 4 } : { min: 3, max: 6 },
    });

    if (!isLast) {
      blockStart = addDaysDateOnlyUtc(blockEnd, 1);
    }
  }

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
    name: goals.length === 1 ? `${goals[0]!.name} Plan` : "Multi-goal Training Plan",
    start_date: timeline.start_date,
    end_date: timeline.end_date,
    fitness_progression: {
      starting_ctl: startingCtl,
      ...(typeof peakTargetCtl === "number" ? { target_ctl_at_peak: peakTargetCtl } : {}),
    },
    activity_distribution: resolveActivityDistribution(goals),
    blocks,
    goals,
    description: undefined,
  };
}

type PreviewCreationConfigResponse = {
  normalized_creation_config: Awaited<ReturnType<typeof evaluateCreationConfig>>["finalConfig"];
  creation_context_summary: Awaited<ReturnType<typeof evaluateCreationConfig>>["contextSummary"];
  derived_suggestions: Awaited<ReturnType<typeof evaluateCreationConfig>>["suggestionPayload"];
  feasibility_safety: Awaited<ReturnType<typeof evaluateCreationConfig>>["feasibilitySummary"];
  projection_feasibility: {
    state: "feasible" | "aggressive" | "unsafe";
    reasons: string[];
  };
  conflicts: {
    is_blocking: boolean;
    items: CreationConflictItem[];
  };
  override_audit: {
    request: {
      requested: boolean;
      allow_blocking_conflicts: boolean;
      scope: "objective_risk_budget" | null;
      reason: string | null;
    };
    effective: {
      enabled: boolean;
      overridden_conflict_codes: string[];
      unresolved_blocking_conflict_codes: string[];
      rationale_codes: string[];
    };
  };
  plan_preview: {
    name: string;
    start_date: string;
    end_date: string;
    goal_count: number;
    block_count: number;
  };
  projection_chart: ProjectionChartPayload;
  readiness_delta_diagnostics?: ReadinessDeltaDiagnostics;
  preview_snapshot_baseline: PreviewReadinessSnapshot | null;
  preview_snapshot: {
    version: string;
    token: string;
  };
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function getWorstFeasibilityState(states: FeasibilityState[]): FeasibilityState {
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
    typeof targetCtlAtPeak === "number" ? (targetCtlAtPeak - currentCtl) / weeksUntilGoal : null;

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

  if ((goal.priority ?? 1) >= 8 && daysUntilGoal < 84 && feasibilityState === "feasible") {
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
    assessSingleGoal(goal, input.referenceDate, input.currentCtl, input.targetCtlAtPeak),
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

function adherenceScore(idealTss: number, scheduledTss: number, actualTss: number): number {
  const actualVsScheduled = ratioScore(actualTss, scheduledTss);
  const scheduledVsIdeal = ratioScore(scheduledTss, idealTss);
  return clampNumber(Math.round(actualVsScheduled * 0.7 + scheduledVsIdeal * 0.3), 0, 100);
}

function getContributorImpact(
  value: number,
  positiveThreshold: number,
  negativeThreshold: number,
): InsightContributorImpact {
  if (value >= positiveThreshold) {
    return "positive";
  }

  if (value <= negativeThreshold) {
    return "negative";
  }

  return "neutral";
}

function buildAdherenceSummary(
  timeline: Array<{
    ideal_tss: number;
    scheduled_tss: number;
    actual_tss: number;
    adherence_score: number;
    boundary_state: SafetyState;
  }>,
): InsightSummary {
  if (timeline.length === 0) {
    return {
      score: 0,
      contributors: [
        {
          key: "schedule_alignment",
          label: "Schedule alignment",
          value: 0,
          impact: "neutral",
          detail: "No timeline days available in this window",
        },
      ],
      interpretation: "No adherence data is available for this date range.",
    };
  }

  const scheduleAlignment =
    timeline.reduce((sum, point) => sum + ratioScore(point.scheduled_tss, point.ideal_tss), 0) /
    timeline.length;

  const executionAlignment =
    timeline.reduce((sum, point) => sum + ratioScore(point.actual_tss, point.scheduled_tss), 0) /
    timeline.length;

  const cautionDays = timeline.filter((point) => point.boundary_state === "caution").length;
  const exceededDays = timeline.filter((point) => point.boundary_state === "exceeded").length;

  const guardrailCompliance = clampNumber(100 - cautionDays * 8 - exceededDays * 20, 0, 100);

  const score =
    Math.round(timeline.reduce((sum, point) => sum + point.adherence_score, 0) / timeline.length) ||
    0;

  return {
    score,
    contributors: [
      {
        key: "schedule_alignment",
        label: "Schedule alignment",
        value: Math.round(scheduleAlignment),
        impact: getContributorImpact(scheduleAlignment, 80, 60),
        detail: "How closely scheduled load tracks ideal load",
      },
      {
        key: "execution_alignment",
        label: "Execution alignment",
        value: Math.round(executionAlignment),
        impact: getContributorImpact(executionAlignment, 80, 60),
        detail: "How closely completed load tracks scheduled load",
      },
      {
        key: "boundary_compliance",
        label: "Boundary compliance",
        value: Math.round(guardrailCompliance),
        impact: getContributorImpact(guardrailCompliance, 85, 60),
        detail: "Penalty for caution and exceeded boundary days",
      },
    ],
    interpretation:
      score >= 85
        ? "Adherence is strong and load execution is tracking the intended plan."
        : score >= 70
          ? "Adherence is stable with moderate variance across planned and completed load."
          : "Adherence is inconsistent; projection confidence remains conservative until execution stabilizes.",
  };
}

function buildReadinessSummary(input: {
  planFeasibilityState: FeasibilityState;
  planSafetyState: SafetyState;
  adherenceConfidence: number;
  capabilityConfidence: number;
  adherenceScore: number;
}): InsightSummary {
  const feasibilityScoreByState: Record<FeasibilityState, number> = {
    feasible: 100,
    aggressive: 70,
    unsafe: 35,
  };
  const safetyScoreByState: Record<SafetyState, number> = {
    safe: 100,
    caution: 65,
    exceeded: 30,
  };

  const feasibilityScore = feasibilityScoreByState[input.planFeasibilityState];
  const safetyScore = safetyScoreByState[input.planSafetyState];
  const adherenceConfidenceScore = clampNumber(Math.round(input.adherenceConfidence * 100), 0, 100);
  const capabilityConfidenceScore = clampNumber(
    Math.round(input.capabilityConfidence * 100),
    0,
    100,
  );
  const adherenceConsistencyScore = clampNumber(Math.round(input.adherenceScore), 0, 100);

  const score = Math.round(
    feasibilityScore * 0.3 +
      safetyScore * 0.25 +
      adherenceConfidenceScore * 0.2 +
      capabilityConfidenceScore * 0.15 +
      adherenceConsistencyScore * 0.1,
  );

  return {
    score,
    contributors: [
      {
        key: "plan_feasibility",
        label: "Plan feasibility",
        value: feasibilityScore,
        impact: getContributorImpact(feasibilityScore, 90, 55),
        detail: "Readiness impact from timeline and ramp feasibility state",
      },
      {
        key: "plan_safety",
        label: "Plan safety",
        value: safetyScore,
        impact: getContributorImpact(safetyScore, 90, 55),
        detail: "Readiness impact from current safety boundary exposure",
      },
      {
        key: "projection_confidence",
        label: "Projection confidence",
        value: adherenceConfidenceScore,
        impact: getContributorImpact(adherenceConfidenceScore, 70, 45),
        detail: "Confidence in at-goal projection from recent adherence",
      },
      {
        key: "evidence_density",
        label: "Evidence density",
        value: capabilityConfidenceScore,
        impact: getContributorImpact(capabilityConfidenceScore, 70, 35),
        detail: "Confidence supported by available activity evidence",
      },
      {
        key: "adherence_consistency",
        label: "Adherence consistency",
        value: adherenceConsistencyScore,
        impact: getContributorImpact(adherenceConsistencyScore, 80, 60),
        detail: "Consistency of day-level adherence across this window",
      },
    ],
    interpretation:
      input.planSafetyState === "exceeded"
        ? "Readiness is limited by boundary overreach; reduce load volatility before progressing."
        : score >= 80
          ? "Readiness is tracking well for the current objective with supportive safety signals."
          : score >= 60
            ? "Readiness is mixed; maintain consistency to improve confidence at the goal date."
            : "Readiness is constrained by feasibility, safety, or limited evidence in this window.",
  };
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

function deriveWeeklyTssFromBounds(input: {
  exact?: unknown;
  min?: unknown;
  max?: unknown;
}): number | null {
  if (typeof input.exact === "number" && Number.isFinite(input.exact)) {
    return Math.max(0, input.exact);
  }

  const min =
    typeof input.min === "number" && Number.isFinite(input.min) ? Math.max(0, input.min) : null;
  const max =
    typeof input.max === "number" && Number.isFinite(input.max) ? Math.max(0, input.max) : null;

  if (min !== null && max !== null) {
    return (min + max) / 2;
  }

  return min ?? max;
}

function deriveStructureWeeklyTssTarget(
  structure: Record<string, unknown> | null | undefined,
  date: string,
): number | null {
  if (!structure) {
    return null;
  }

  const blocks = Array.isArray(structure.blocks)
    ? (structure.blocks as Array<Record<string, unknown>>)
    : [];

  const currentBlock = blocks.find((block) => {
    return (
      typeof block.start_date === "string" &&
      typeof block.end_date === "string" &&
      block.start_date <= date &&
      block.end_date >= date
    );
  });

  if (currentBlock) {
    const blockRange =
      currentBlock.target_weekly_tss_range &&
      typeof currentBlock.target_weekly_tss_range === "object"
        ? (currentBlock.target_weekly_tss_range as Record<string, unknown>)
        : null;

    const blockWeeklyTss = deriveWeeklyTssFromBounds({
      min: blockRange?.min,
      max: blockRange?.max,
    });

    if (blockWeeklyTss !== null) {
      return blockWeeklyTss;
    }
  }

  const rootRange =
    structure.target_weekly_tss_range && typeof structure.target_weekly_tss_range === "object"
      ? (structure.target_weekly_tss_range as Record<string, unknown>)
      : null;

  return deriveWeeklyTssFromBounds({
    exact: structure.target_weekly_tss,
    min: rootRange?.min ?? structure.target_weekly_tss_min,
    max: rootRange?.max ?? structure.target_weekly_tss_max,
  });
}

function hasPlanStructureProjectionAnchor(
  structure: Record<string, unknown> | null | undefined,
  date: string,
): boolean {
  if (!structure) {
    return false;
  }

  if (deriveStructureWeeklyTssTarget(structure, date) !== null) {
    return true;
  }

  if (Array.isArray(structure.blocks) && structure.blocks.length > 0) {
    return true;
  }

  if (Array.isArray(structure.goals) && structure.goals.length > 0) {
    return true;
  }

  const fitnessProgression =
    structure.fitness_progression && typeof structure.fitness_progression === "object"
      ? (structure.fitness_progression as Record<string, unknown>)
      : null;

  return (
    typeof fitnessProgression?.starting_ctl === "number" ||
    typeof fitnessProgression?.target_ctl_at_peak === "number"
  );
}

function getWeekStartDateOnly(dateOnly: string): string {
  const date = parseDateOnlyUtc(dateOnly);
  const dayOfWeek = date.getUTCDay();
  const offsetToMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offsetToMonday);
  return formatDateOnlyUtc(date);
}

function estimateWeeklyTssFromDailyMap(dailyTss: Map<string, number>): number | null {
  if (dailyTss.size === 0) {
    return null;
  }

  const weeklyTotals = new Map<string, number>();
  for (const [date, tss] of dailyTss.entries()) {
    if (!(typeof tss === "number") || !Number.isFinite(tss) || tss <= 0) {
      continue;
    }

    const weekStart = getWeekStartDateOnly(date);
    weeklyTotals.set(weekStart, (weeklyTotals.get(weekStart) || 0) + tss);
  }

  if (weeklyTotals.size === 0) {
    return null;
  }

  const total = [...weeklyTotals.values()].reduce((sum, value) => sum + value, 0);
  return total / weeklyTotals.size;
}

async function estimateWeeklyTssFromStructuredActivities(input: {
  supabase: SupabaseClient;
  profileId: string;
  structure: Record<string, unknown> | null | undefined;
  startDate: string;
}): Promise<{
  weeklyTss: number | null;
  latestScheduledDate: string | null;
}> {
  if (!input.structure) {
    return { weeklyTss: null, latestScheduledDate: null };
  }

  const materializedEvents = materializePlanToEvents(input.structure, input.startDate).filter(
    (event) => event.event_type === "planned" && typeof event.activity_plan_id === "string",
  );

  const latestScheduledDate =
    materializedEvents
      .map((event) => event.scheduled_date)
      .filter((date) => typeof date === "string" && date.length > 0)
      .sort((a, b) => a.localeCompare(b))
      .at(-1) ?? null;

  const activityPlanIds = [...new Set(materializedEvents.map((event) => event.activity_plan_id))];
  if (activityPlanIds.length === 0) {
    return {
      weeklyTss: null,
      latestScheduledDate,
    };
  }

  const { data: activityPlans, error } = await input.supabase
    .from("activity_plans")
    .select("*")
    .in("id", activityPlanIds);

  if (error || !activityPlans || activityPlans.length === 0) {
    return {
      weeklyTss: null,
      latestScheduledDate,
    };
  }

  const plansWithEstimations = await addEstimationToPlans(
    activityPlans as any,
    input.supabase,
    input.profileId,
  );

  const estimatedTssByPlanId = new Map(
    plansWithEstimations.map((plan) => [plan.id, plan.estimated_tss || 0]),
  );

  const dailyTss = new Map<string, number>();
  for (const event of materializedEvents) {
    if (!event.activity_plan_id) {
      continue;
    }

    const estimatedTss = estimatedTssByPlanId.get(event.activity_plan_id) || 0;
    if (estimatedTss <= 0) {
      continue;
    }

    dailyTss.set(event.scheduled_date, (dailyTss.get(event.scheduled_date) || 0) + estimatedTss);
  }

  return {
    weeklyTss: estimateWeeklyTssFromDailyMap(dailyTss),
    latestScheduledDate,
  };
}

function resolveIdealDailyTss(input: {
  date: string;
  projectedIdealTss?: number;
  blocks: Array<{
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>;
  structure: Record<string, unknown> | null | undefined;
}): number {
  if (typeof input.projectedIdealTss === "number" && Number.isFinite(input.projectedIdealTss)) {
    return Math.round(Math.max(0, input.projectedIdealTss) * 10) / 10;
  }

  const structureWeeklyTss = deriveStructureWeeklyTssTarget(input.structure, input.date);
  if (structureWeeklyTss !== null) {
    return Math.round((structureWeeklyTss / 7) * 10) / 10;
  }

  const blockDailyTss = estimateIdealDailyTss(input.date, input.blocks);
  if (blockDailyTss > 0) {
    return blockDailyTss;
  }

  return conservativeStarterDailyTss;
}

function resolveBaselineDailyTss(input: {
  date: string;
  structure: Record<string, unknown> | null | undefined;
  blocks: Array<{
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>;
  hasActivityHistory: boolean;
}): number {
  const structuredWeeklyTss = deriveStructureWeeklyTssTarget(input.structure, input.date);
  if (structuredWeeklyTss !== null) {
    const boundedWeeklyTss = input.hasActivityHistory
      ? structuredWeeklyTss
      : Math.min(structuredWeeklyTss, conservativeStarterWeeklyTss);
    return Math.round((boundedWeeklyTss / 7) * 10) / 10;
  }

  const blockDailyTss = estimateIdealDailyTss(input.date, input.blocks);
  if (blockDailyTss > 0) {
    return input.hasActivityHistory
      ? blockDailyTss
      : Math.min(blockDailyTss, conservativeStarterDailyTss);
  }

  return conservativeStarterDailyTss;
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
  return blocks.find((block) => block.start_date <= date && block.end_date >= date);
}

function buildProjectionChartPayload(input: {
  expandedPlan: ExpandedProjectionPlan;
  startingCtl?: number;
  startingAtl?: number;
  priorInferredSnapshot?: InferredStateSnapshot;
  normalizedCreationConfig?: TrainingPlanCreationConfig;
  noHistoryContext?: NoHistoryAnchorContext;
}): ProjectionChartPayload {
  const { expandedPlan } = input;

  const periodizationPhases: ProjectionPeriodizationPhase[] = expandedPlan.blocks.map(
    (block, index) => ({
      id: deterministicUuidFromSeed(
        `projection-phase|${expandedPlan.start_date}|${expandedPlan.end_date}|${index}|${block.name}|${block.start_date}|${block.end_date}`,
      ),
      name: block.name,
      start_date: block.start_date,
      end_date: block.end_date,
      target_weekly_tss_min: Math.round((block.target_weekly_tss_range?.min ?? 0) * 10) / 10,
      target_weekly_tss_max: Math.round((block.target_weekly_tss_range?.max ?? 0) * 10) / 10,
    }),
  );

  const deterministicProjection = buildDeterministicProjectionPayload(
    buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: input.normalizedCreationConfig,
      starting_ctl: input.startingCtl,
      starting_atl: input.startingAtl,
      prior_inferred_snapshot: input.priorInferredSnapshot,
      no_history_context: input.noHistoryContext,
    }),
  );

  const microcycles: ProjectionMicrocycleWithId[] = deterministicProjection.microcycles.map(
    (microcycle) => ({
      id: deterministicUuidFromSeed(
        `projection-microcycle|${expandedPlan.start_date}|${microcycle.week_start_date}|${microcycle.week_end_date}`,
      ),
      ...microcycle,
    }),
  );

  const deterministicProjectionCompat =
    deterministicProjection as typeof deterministicProjection & {
      prediction_uncertainty?: CoreProjectionChartPayload["prediction_uncertainty"];
      goal_target_distributions?: CoreProjectionChartPayload["goal_target_distributions"];
    };

  return {
    start_date: expandedPlan.start_date,
    end_date: expandedPlan.end_date,
    points: deterministicProjection.points,
    display_points: deterministicProjection.display_points,
    goal_markers: deterministicProjection.goal_markers,
    periodization_phases: periodizationPhases,
    microcycles,
    recovery_segments: deterministicProjection.recovery_segments,
    constraint_summary: deterministicProjection.constraint_summary,
    inferred_current_state: deterministicProjection.inferred_current_state,
    no_history: toNoHistoryMetadataOrUndefined(deterministicProjection.no_history),
    readiness_score: deterministicProjection.readiness_score,
    readiness_confidence: deterministicProjection.readiness_confidence,
    readiness_rationale_codes: deterministicProjection.readiness_rationale_codes,
    capacity_envelope: deterministicProjection.capacity_envelope,
    feasibility_band: deterministicProjection.feasibility_band,
    risk_score: deterministicProjection.risk_score,
    risk_level: deterministicProjection.risk_level,
    risk_flags: deterministicProjection.risk_flags,
    caps_applied: deterministicProjection.caps_applied,
    projection_diagnostics: deterministicProjection.projection_diagnostics,
    prediction_uncertainty: deterministicProjectionCompat.prediction_uncertainty,
    goal_target_distributions: deterministicProjectionCompat.goal_target_distributions,
    optimization_tradeoff_summary: deterministicProjection.optimization_tradeoff_summary,
    goal_assessments: deterministicProjection.goal_assessments,
  };
}

function toNoHistoryMetadataOrUndefined(
  metadata: NoHistoryProjectionMetadata,
): NoHistoryProjectionMetadata | undefined {
  if (
    !metadata.projection_floor_applied &&
    !metadata.evidence_confidence &&
    !metadata.projection_feasibility
  ) {
    return undefined;
  }

  return metadata;
}

function deriveNoHistoryAnchorContext(input: {
  expandedPlan: ExpandedProjectionPlan;
  contextSummary: CreationContextSummary;
  finalConfig: Awaited<ReturnType<typeof evaluateCreationConfig>>["finalConfig"];
  startingCtlOverride?: number;
}): NoHistoryAnchorContext | undefined {
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

  const demandAnchorGoal = input.expandedPlan.goals.length > 1 ? latestGoal : earliestGoal;

  return {
    history_availability_state: input.contextSummary.history_availability_state,
    age: input.contextSummary.user_age,
    gender: input.contextSummary.user_gender,
    goal_tier: deriveNoHistoryGoalTierFromTargets(
      input.expandedPlan.goals.flatMap((goal) => goal.targets ?? []) as NoHistoryGoalTargetInput[],
    ),
    goal_targets: input.expandedPlan.goals.flatMap(
      (goal) => goal.targets ?? [],
    ) as NoHistoryGoalTargetInput[],
    weeks_to_event: Math.max(
      0,
      diffDateOnlyUtcDays(
        input.expandedPlan.start_date,
        (demandAnchorGoal ?? earliestGoal).target_date,
      ) / 7,
    ),
    total_horizon_weeks: latestGoal
      ? Math.max(0, diffDateOnlyUtcDays(input.expandedPlan.start_date, latestGoal.target_date) / 7)
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

    if (!tssRamp.clamped && tssRamp.previous_week_tss > 0 && tssRamp.max_weekly_tss_ramp_pct > 0) {
      const requestedRampPct =
        ((tssRamp.requested_weekly_tss - tssRamp.previous_week_tss) / tssRamp.previous_week_tss) *
        100;
      if (requestedRampPct >= tssRamp.max_weekly_tss_ramp_pct * nearCapThreshold) {
        tssNearCapWeeks += 1;
      }
    }

    if (!ctlRamp.clamped && ctlRamp.max_ctl_ramp_per_week > 0) {
      if (ctlRamp.requested_ctl_ramp >= ctlRamp.max_ctl_ramp_per_week * nearCapThreshold) {
        ctlNearCapWeeks += 1;
      }
    }
  }

  const reasons: string[] = [];
  let state: FeasibilityState = "feasible";

  if (projectionChart.constraint_summary.tss_ramp_clamp_weeks > 0) {
    state = "aggressive";
    reasons.push("required_tss_ramp_exceeds_configured_cap");
  }

  if (projectionChart.constraint_summary.ctl_ramp_clamp_weeks > 0) {
    state = "aggressive";
    reasons.push("required_ctl_ramp_exceeds_configured_cap");
  }

  if (tssNearCapWeeks > 0) {
    state = "aggressive";
    reasons.push("required_tss_ramp_near_configured_cap");
  }

  if (ctlNearCapWeeks > 0) {
    state = "aggressive";
    reasons.push("required_ctl_ramp_near_configured_cap");
  }

  reasons.unshift("safety_first_best_safe_projection");

  return {
    state,
    reasons: uniqueReasons(reasons),
    diagnostics: {
      tss_ramp_near_cap_weeks: tssNearCapWeeks,
      ctl_ramp_near_cap_weeks: ctlNearCapWeeks,
      tss_ramp_clamp_weeks: projectionChart.constraint_summary.tss_ramp_clamp_weeks,
      ctl_ramp_clamp_weeks: projectionChart.constraint_summary.ctl_ramp_clamp_weeks,
      recovery_weeks: projectionChart.constraint_summary.recovery_weeks,
    },
  };
}

function deriveProjectionDrivenConflicts(input: {
  expandedPlan: ExpandedProjectionPlan;
  projectionChart: ProjectionChartPayload;
  postGoalRecoveryDays: number;
}): CreationConflictItem[] {
  const conflicts: CreationConflictItem[] = [];

  if (input.projectionChart.constraint_summary.tss_ramp_clamp_weeks > 0) {
    conflicts.push({
      code: "required_tss_ramp_exceeds_cap",
      severity: "warning",
      message: "Required week-to-week TSS progression exceeds current safety guardrails",
      field_paths: ["behavior_controls_v1.aggressiveness", "optimization_profile"],
      suggestions: [
        "Lower aggressiveness or spike frequency",
        "Move one or more goals farther out",
        "Pick a less conservative optimization profile",
      ],
    });
  }

  if (input.projectionChart.constraint_summary.ctl_ramp_clamp_weeks > 0) {
    conflicts.push({
      code: "required_ctl_ramp_exceeds_cap",
      severity: "warning",
      message: "Required CTL progression exceeds current safety guardrails",
      field_paths: ["behavior_controls_v1.aggressiveness", "optimization_profile"],
      suggestions: [
        "Lower aggressiveness or increase recovery priority",
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
    const recoveryEnd = addDaysDateOnlyUtc(currentGoal.target_date, input.postGoalRecoveryDays);
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

const insightTimelineInputSchema = z.object({
  training_plan_id: z.string().uuid().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
});

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const safeFallbackHrThresholdBpm = 160;
const projectionTargetTestDurationSeconds = 1200;
const creationWeekDays = creationWeekDayEnum.options;

type GoalProjectionSource = {
  goal: ProfileGoal;
  targetDate: string;
};

type ProjectionConfidenceSummary = {
  readiness: number | null;
  planning: number | null;
  evidence_score: number | null;
  evidence_state: string | null;
  rationale_codes: string[];
};

type ProjectionContextDiagnostics = {
  fallback_mode: string | null;
  projection_curve_available: boolean;
  projection_floor_applied: boolean;
  confidence: ProjectionConfidenceSummary;
};

function buildSafeHrThresholdFallbackTarget(input?: {
  preferredValue?: number | null;
}): MinimalTrainingPlanCreate["goals"][number]["targets"][number] {
  const preferred = input?.preferredValue;
  const targetLthrBpm =
    typeof preferred === "number" && Number.isFinite(preferred) && preferred > 0
      ? clampNumber(Math.round(preferred), 120, 220)
      : safeFallbackHrThresholdBpm;

  return {
    target_type: "hr_threshold",
    target_lthr_bpm: targetLthrBpm,
  };
}

function inferFallbackRaceTargetSpeedMps(input: {
  activityCategory: "run" | "bike" | "swim" | "other";
  distanceMeters: number;
}): number {
  const distanceKm = input.distanceMeters / 1000;

  if (input.activityCategory === "bike") {
    if (distanceKm >= 150) return 7.8;
    if (distanceKm >= 80) return 8.5;
    return 9.2;
  }

  if (input.activityCategory === "swim") {
    return 0.75;
  }

  if (distanceKm >= 42) return 2.7;
  if (distanceKm >= 21) return 3;
  if (distanceKm >= 10) return 3.3;
  return 3.6;
}

function buildRacePerformanceTarget(input: {
  distanceMeters: number;
  activityCategory: "run" | "bike" | "swim" | "other";
  targetTimeSeconds?: number;
  targetSpeedMps?: number;
}): MinimalTrainingPlanCreate["goals"][number]["targets"][number] {
  const speedMps =
    typeof input.targetSpeedMps === "number" && input.targetSpeedMps > 0
      ? input.targetSpeedMps
      : inferFallbackRaceTargetSpeedMps({
          activityCategory: input.activityCategory,
          distanceMeters: input.distanceMeters,
        });

  const targetTimeSeconds =
    typeof input.targetTimeSeconds === "number" && input.targetTimeSeconds > 0
      ? Math.round(input.targetTimeSeconds)
      : Math.max(1, Math.round(input.distanceMeters / Math.max(0.1, speedMps)));

  return {
    target_type: "race_performance",
    distance_m: input.distanceMeters,
    target_time_s: targetTimeSeconds,
    activity_category: input.activityCategory,
  };
}

function mapCanonicalGoalToMinimalPlanGoal(
  source: GoalProjectionSource,
): MinimalTrainingPlanCreate["goals"][number] {
  const { goal, targetDate } = source;

  const target: MinimalTrainingPlanCreate["goals"][number]["targets"][number] = (() => {
    switch (goal.objective.type) {
      case "event_performance":
        return buildRacePerformanceTarget({
          distanceMeters: goal.objective.distance_m ?? 5000,
          activityCategory: goal.activity_category,
          targetTimeSeconds: goal.objective.target_time_s,
          targetSpeedMps: goal.objective.target_speed_mps,
        });
      case "threshold":
        switch (goal.objective.metric) {
          case "pace":
            return {
              target_type: "pace_threshold",
              target_speed_mps: goal.objective.value,
              test_duration_s:
                goal.objective.test_duration_s ?? projectionTargetTestDurationSeconds,
              activity_category: goal.activity_category,
            };
          case "power":
            return {
              target_type: "power_threshold",
              target_watts: goal.objective.value,
              test_duration_s:
                goal.objective.test_duration_s ?? projectionTargetTestDurationSeconds,
              activity_category: goal.activity_category,
            };
          case "hr":
            return buildSafeHrThresholdFallbackTarget({
              preferredValue: goal.objective.value,
            });
        }
      case "completion": {
        const distanceMeters = goal.objective.distance_m ?? 5000;
        return buildRacePerformanceTarget({
          distanceMeters,
          activityCategory: goal.activity_category,
          targetTimeSeconds: goal.objective.duration_s,
        });
      }
      case "consistency":
        return buildSafeHrThresholdFallbackTarget();
    }
  })();

  return {
    name: goal.title,
    target_date: targetDate,
    priority: goal.priority,
    targets: [target],
  };
}

async function loadProfileGoalsWithTargetDates(input: {
  supabase: SupabaseClient;
  profileId: string;
  startDate: string;
}): Promise<GoalProjectionSource[]> {
  let query: any = input.supabase
    .from("profile_goals")
    .select(
      "id, profile_id, milestone_event_id, title, priority, activity_category, target_payload",
    )
    .eq("profile_id", input.profileId)
    .order("created_at", { ascending: true })
    .limit(40);

  const { data, error } = await query;

  if (error) {
    console.warn(
      "Failed to load profile goals for insight timeline projection fallback.",
      error.message,
    );
    return [];
  }

  const parsedGoals = ((data ?? []) as unknown[]).flatMap((item: unknown) => {
    try {
      return [parseProfileGoalRecord(item)];
    } catch (parseError) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const sanitizedItem = {
          ...(item as Record<string, unknown>),
          profile_id: deterministicUuidFromSeed(
            `insight-timeline-goal-profile|${String(
              (item as Record<string, unknown>).profile_id ?? input.profileId,
            )}`,
          ),
        };

        try {
          return [parseProfileGoalRecord(sanitizedItem)];
        } catch {
          // Fall through to warn using the original parse error.
        }
      }

      console.warn(
        "Skipping invalid canonical profile goal for insight timeline projection.",
        parseError,
      );
      return [];
    }
  });

  if (parsedGoals.length === 0) {
    return [];
  }

  const milestoneEventIds = [
    ...new Set(parsedGoals.map((goal: ProfileGoal) => goal.milestone_event_id)),
  ];
  const { data: eventRows, error: eventError } = await input.supabase
    .from("events")
    .select("id, starts_at")
    .in("id", milestoneEventIds);

  if (eventError) {
    console.warn(
      "Failed to load milestone events for insight timeline projection fallback.",
      eventError.message,
    );
    return [];
  }

  const eventById = new Map(
    (eventRows ?? [])
      .filter(
        (event): event is { id: string; starts_at: string } =>
          typeof event?.id === "string" && typeof event?.starts_at === "string",
      )
      .map((event) => [event.id, event]),
  );

  return parsedGoals
    .flatMap((goal: ProfileGoal) => {
      const linkedEvent = eventById.get(goal.milestone_event_id);
      if (!linkedEvent) {
        return [];
      }

      try {
        const targetDate = resolveGoalEventDate(goal, linkedEvent);
        if (!dateOnlyPattern.test(targetDate) || targetDate < input.startDate) {
          return [];
        }

        return [{ goal, targetDate }];
      } catch (resolutionError) {
        console.warn(
          "Failed to resolve canonical goal milestone date for insight timeline projection.",
          resolutionError,
        );
        return [];
      }
    })
    .sort((left: GoalProjectionSource, right: GoalProjectionSource) =>
      left.targetDate.localeCompare(right.targetDate),
    );
}

async function loadProfileTrainingSettingsCreationDefaults(input: {
  supabase: SupabaseClient;
  profileId: string;
}): Promise<z.infer<typeof creationNormalizationInputSchema>> {
  const { data, error } = await input.supabase
    .from("profile_training_settings")
    .select("settings")
    .eq("profile_id", input.profileId)
    .maybeSingle();

  if (error || !data?.settings) {
    return {};
  }

  const defaults = extractCreationDefaultsFromProfileSettings(data.settings);

  if (Object.keys(defaults).length === 0) {
    return {};
  }

  return { defaults };
}

function mapProjectionMicrocyclesToIdealTssByDate(
  microcycles: ProjectionChartPayload["microcycles"],
): Map<string, number> {
  const map = new Map<string, number>();

  for (const microcycle of microcycles || []) {
    const startDate = microcycle.week_start_date;
    const endDate = microcycle.week_end_date;

    if (!startDate || !endDate) continue;

    if (
      typeof microcycle.planned_weekly_tss !== "number" ||
      !Number.isFinite(microcycle.planned_weekly_tss)
    ) {
      continue;
    }

    const dates = buildDateRange(startDate, endDate);
    if (dates.length === 0) continue;

    const dailyTss =
      Math.round((Math.max(0, microcycle.planned_weekly_tss) / dates.length) * 10) / 10;

    for (const date of dates) {
      map.set(date, dailyTss);
    }
  }

  return map;
}

async function deriveInsightTimelineProjectionIdealTssByDate(input: {
  supabase: SupabaseClient;
  profileId: string;
  startDate: string;
}): Promise<{
  idealTssByDate: Map<string, number> | null;
  goalCount: number;
  datedGoalCount: number;
  diagnostics: ProjectionContextDiagnostics;
}> {
  try {
    const rawGoals = await loadProfileGoalsWithTargetDates({
      supabase: input.supabase,
      profileId: input.profileId,
      startDate: input.startDate,
    });

    const goalCount = rawGoals.length;

    if (rawGoals.length === 0) {
      return {
        idealTssByDate: null,
        goalCount,
        datedGoalCount: 0,
        diagnostics: {
          fallback_mode: "no_dated_goals",
          projection_curve_available: false,
          projection_floor_applied: false,
          confidence: {
            readiness: null,
            planning: null,
            evidence_score: null,
            evidence_state: null,
            rationale_codes: ["no_dated_goals"],
          },
        },
      };
    }

    const mappedGoals = rawGoals.map((goal) => mapCanonicalGoalToMinimalPlanGoal(goal));

    if (mappedGoals.length === 0) {
      return {
        idealTssByDate: null,
        goalCount,
        datedGoalCount: 0,
        diagnostics: {
          fallback_mode: "unsupported_goal_objective",
          projection_curve_available: false,
          projection_floor_applied: false,
          confidence: {
            readiness: null,
            planning: null,
            evidence_score: null,
            evidence_state: null,
            rationale_codes: ["unsupported_goal_objective"],
          },
        },
      };
    }

    const minimalPlanResult = minimalTrainingPlanCreateSchema.safeParse({
      plan_start_date: input.startDate,
      goals: mappedGoals,
    });

    if (!minimalPlanResult.success) {
      console.warn(
        "Failed to map profile goals into minimal training plan for insight projection.",
      );
      return {
        idealTssByDate: null,
        goalCount,
        datedGoalCount: mappedGoals.length,
        diagnostics: {
          fallback_mode: "invalid_projection_inputs",
          projection_curve_available: false,
          projection_floor_applied: false,
          confidence: {
            readiness: null,
            planning: null,
            evidence_score: null,
            evidence_state: null,
            rationale_codes: ["invalid_projection_inputs"],
          },
        },
      };
    }

    const creationInput = await loadProfileTrainingSettingsCreationDefaults({
      supabase: input.supabase,
      profileId: input.profileId,
    });

    const profileContext = await deriveProfileAwareCreationContext({
      supabase: input.supabase,
      profileId: input.profileId,
    });

    const creationConfig = await evaluateCreationConfig({
      supabase: input.supabase,
      profileId: input.profileId,
      creationInput,
    });

    const projectionArtifacts = buildCreationProjectionArtifacts({
      minimalPlan: minimalPlanResult.data,
      loadBootstrapState: profileContext.loadBootstrapState,
      finalConfig: creationConfig.finalConfig,
      contextSummary: profileContext.contextSummary,
      startingCtlOverride: profileContext.globalCtlOverride,
      startingAtlOverride: profileContext.globalAtlOverride,
    });

    const idealTssByDate = mapProjectionMicrocyclesToIdealTssByDate(
      projectionArtifacts.projectionChart.microcycles,
    );

    return {
      idealTssByDate: idealTssByDate.size > 0 ? idealTssByDate : null,
      goalCount,
      datedGoalCount: mappedGoals.length,
      diagnostics: {
        fallback_mode: projectionArtifacts.projectionChart.no_history?.projection_floor_applied
          ? "conservative_priors"
          : null,
        projection_curve_available: idealTssByDate.size > 0,
        projection_floor_applied:
          projectionArtifacts.projectionChart.no_history?.projection_floor_applied ?? false,
        confidence: {
          readiness: projectionArtifacts.projectionChart.readiness_confidence ?? null,
          planning: projectionArtifacts.projectionChart.planning_confidence ?? null,
          evidence_score:
            projectionArtifacts.projectionChart.no_history?.evidence_confidence?.score ?? null,
          evidence_state:
            projectionArtifacts.projectionChart.no_history?.evidence_confidence?.state ?? null,
          rationale_codes: [
            ...(projectionArtifacts.projectionChart.readiness_rationale_codes ?? []),
            ...(projectionArtifacts.projectionChart.planning_confidence_reasons ?? []),
          ],
        },
      },
    };
  } catch (error) {
    console.warn(
      "Insight timeline projection derivation failed. Falling back to block-based ideal TSS.",
      error,
    );
    return {
      idealTssByDate: null,
      goalCount: 0,
      datedGoalCount: 0,
      diagnostics: {
        fallback_mode: "projection_error",
        projection_curve_available: false,
        projection_floor_applied: false,
        confidence: {
          readiness: null,
          planning: null,
          evidence_score: null,
          evidence_state: null,
          rationale_codes: ["projection_error"],
        },
      },
    };
  }
}

async function estimateCurrentCtl(supabase: SupabaseClient, profileId: string): Promise<number> {
  const asOf = new Date();
  const since = new Date(asOf);
  since.setDate(since.getDate() - 90);

  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, type, started_at, finished_at, duration_seconds, moving_seconds, distance_meters, avg_heart_rate, max_heart_rate, avg_power, max_power, avg_speed_mps, max_speed_mps, normalized_power, normalized_speed_mps, normalized_graded_speed_mps",
    )
    .eq("profile_id", profileId)
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: true });

  if (error || !data) {
    return 0;
  }

  const derivedMap = await buildActivityDerivedSummaryMap({
    supabase,
    profileId,
    activities: data,
  });

  const bootstrap = computeLoadBootstrapState({
    activities: data.map((activity) => ({
      occurred_at: activity.started_at,
      tss: derivedMap.get(activity.id)?.tss ?? null,
      duration_seconds: activity.duration_seconds,
    })),
    as_of: asOf.toISOString(),
  });

  return bootstrap.starting_ctl;
}

const goalSnapshotSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  target_date: z.string().optional(),
  priority: z.number().optional(),
});

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

const CREATION_PREVIEW_SNAPSHOT_VERSION = "creation_preview_v2";

const previewCreationConfigRouterInputSchema = previewCreationConfigInputSchema.extend({
  prior_inferred_snapshot: inferredStateSnapshotSchema.optional(),
});

const createFromCreationConfigRouterInputSchema = createFromCreationConfigInputSchema.extend({
  prior_inferred_snapshot: inferredStateSnapshotSchema.optional(),
});

const updateFromCreationConfigRouterInputSchema = createFromCreationConfigRouterInputSchema.extend({
  plan_id: z.string().uuid(),
});

function mergeCalibrationInput(
  base?: z.input<typeof trainingPlanCalibrationConfigSchema>,
  override?: z.input<typeof trainingPlanCalibrationConfigSchema>,
): z.infer<typeof trainingPlanCalibrationConfigSchema> {
  const fallback = trainingPlanCalibrationConfigSchema.parse({});
  const baseline = base
    ? trainingPlanCalibrationConfigSchema.parse({ ...base, version: 1 })
    : fallback;

  if (!override) {
    return baseline;
  }

  const overrideInput = { ...override, version: 1 };
  return trainingPlanCalibrationConfigSchema.parse({
    ...baseline,
    ...overrideInput,
    version: 1,
    readiness_composite: {
      ...baseline.readiness_composite,
      ...overrideInput.readiness_composite,
    },
    readiness_timeline: {
      ...baseline.readiness_timeline,
      ...overrideInput.readiness_timeline,
    },
    envelope_penalties: {
      ...baseline.envelope_penalties,
      ...overrideInput.envelope_penalties,
    },
    durability_penalties: {
      ...baseline.durability_penalties,
      ...overrideInput.durability_penalties,
    },
    no_history: {
      ...baseline.no_history,
      ...overrideInput.no_history,
    },
    optimizer: {
      ...baseline.optimizer,
      ...overrideInput.optimizer,
    },
  });
}

function formatIssuePath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "root";
  }

  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : `${segment}`))
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

function enforceNoAutonomousPostCreateMutation(
  input?: z.infer<typeof postCreateBehaviorSchema>,
): void {
  if (input?.autonomous_mutation_enabled) {
    throwPathValidationError("Autonomous post-create mutation is not supported in MVP", [
      {
        path: ["post_create_behavior", "autonomous_mutation_enabled"],
        message:
          "Set this to false. Post-create plan changes require explicit user confirmation in MVP.",
      },
    ]);
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
  const sortedEntries = Object.entries(objectValue).sort(([a], [b]) => a.localeCompare(b));

  return Object.fromEntries(
    sortedEntries.map(([key, nestedValue]) => [
      key,
      canonicalizeForDeterministicToken(nestedValue),
    ]),
  );
}

function buildCreationPreviewSnapshotToken(input: {
  minimalPlan: z.infer<typeof minimalTrainingPlanCreateSchema>;
  finalConfig: Awaited<ReturnType<typeof evaluateCreationConfig>>["finalConfig"];
  loadBootstrapState: LoadBootstrapState;
  projectionConstraintSummary: ProjectionConstraintSummary;
  projectionFeasibility: ProjectionFeasibilitySummary;
  noHistoryMetadata?: NoHistoryProjectionMetadata;
}): string {
  const normalizedCreationConfigSnapshot = {
    availability_config: input.finalConfig.availability_config,
    recent_influence: input.finalConfig.recent_influence,
    recent_influence_action: input.finalConfig.recent_influence_action,
    constraints: input.finalConfig.constraints,
    optimization_profile: input.finalConfig.optimization_profile,
    post_goal_recovery_days: input.finalConfig.post_goal_recovery_days,
    behavior_controls_v1: input.finalConfig.behavior_controls_v1,
    calibration: input.finalConfig.calibration,
  };

  const snapshotPayload = {
    version: CREATION_PREVIEW_SNAPSHOT_VERSION,
    minimal_plan: canonicalizeMinimalTrainingPlanCreate(input.minimalPlan),
    normalized_creation_config: normalizedCreationConfigSnapshot,
    estimated_current_ctl: Math.round(input.loadBootstrapState.starting_ctl * 10) / 10,
    projection_constraint_summary: input.projectionConstraintSummary,
    projection_feasibility: input.projectionFeasibility,
    ...(input.noHistoryMetadata ? { projection_no_history: input.noHistoryMetadata } : {}),
  };

  const canonicalSnapshotPayload = canonicalizeForDeterministicToken(snapshotPayload);

  return deterministicUuidFromSeed(
    `creation-preview-snapshot|${JSON.stringify(canonicalSnapshotPayload)}`,
  );
}

function buildCreationProjectionArtifacts(input: {
  minimalPlan: z.infer<typeof minimalTrainingPlanCreateSchema>;
  loadBootstrapState: LoadBootstrapState;
  priorInferredSnapshot?: InferredStateSnapshot;
  startingCtlOverride?: number;
  startingAtlOverride?: number;
  finalConfig: Awaited<ReturnType<typeof evaluateCreationConfig>>["finalConfig"];
  contextSummary: CreationContextSummary;
}): {
  expandedPlan: ExpandedProjectionPlan;
  projectionChart: ProjectionChartPayload;
  projectionFeasibility: ProjectionFeasibilitySummary;
} {
  const effectiveStartingCtl = input.startingCtlOverride ?? input.loadBootstrapState.starting_ctl;
  const effectiveStartingAtl = input.startingAtlOverride ?? input.loadBootstrapState.starting_atl;

  const expandedPlan = buildExpandedPlanFromMinimalGoal(input.minimalPlan, {
    startingCtl: effectiveStartingCtl,
  });

  const noHistoryContext = deriveNoHistoryAnchorContext({
    expandedPlan,
    contextSummary: input.contextSummary,
    finalConfig: input.finalConfig,
    startingCtlOverride: effectiveStartingCtl,
  });

  const projectionChart = buildProjectionChartPayload({
    expandedPlan,
    startingCtl: effectiveStartingCtl,
    startingAtl: effectiveStartingAtl,
    priorInferredSnapshot: input.priorInferredSnapshot,
    normalizedCreationConfig: input.finalConfig,
    noHistoryContext,
  });

  const projectionPoints = projectionChart.points;
  const startingFitnessCtl = projectionPoints[0]?.predicted_fitness_ctl;
  const endingFitnessCtl = projectionPoints.at(-1)?.predicted_fitness_ctl;

  if (
    typeof startingFitnessCtl === "number" &&
    typeof endingFitnessCtl === "number" &&
    endingFitnessCtl < startingFitnessCtl
  ) {
    const lastPoint = projectionPoints.at(-1);
    if (lastPoint) {
      lastPoint.predicted_fitness_ctl = startingFitnessCtl;
    }

    const displayLastPoint = projectionChart.display_points?.at(-1);
    if (displayLastPoint) {
      displayLastPoint.predicted_fitness_ctl = startingFitnessCtl;
    }

    if (projectionChart.inferred_current_state?.mean) {
      projectionChart.inferred_current_state.mean.ctl = Math.max(
        projectionChart.inferred_current_state.mean.ctl,
        startingFitnessCtl,
      );
    }
  }

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

  const [activitiesResult, effortsResult, profileMetricsResult, profileResult, settingsResult] =
    await Promise.all([
      input.supabase
        .from("activities")
        .select(
          "id, type, started_at, finished_at, duration_seconds, moving_seconds, distance_meters, avg_heart_rate, max_heart_rate, avg_power, max_power, avg_speed_mps, max_speed_mps, normalized_power, normalized_speed_mps, normalized_graded_speed_mps",
        )
        .eq("profile_id", input.profileId)
        .gte("started_at", recentActivitiesCutoff.toISOString())
        .order("started_at", { ascending: false })
        .limit(300),
      input.supabase
        .from("activity_efforts")
        .select("recorded_at, effort_type, duration_seconds, value, activity_category")
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
      input.supabase.from("profiles").select("dob, gender").eq("id", input.profileId).limit(1),
      input.supabase
        .from("profile_training_settings")
        .select("settings")
        .eq("profile_id", input.profileId)
        .maybeSingle(),
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

  if (profileResult.error) {
    console.warn(
      "Failed to load profile for creation context. Falling back to null profile signals.",
      profileResult.error.message,
    );
  }

  const activityRows = activitiesResult.error ? [] : (activitiesResult.data ?? []);
  const activityDerivedMap = await buildActivityDerivedSummaryMap({
    supabase: input.supabase,
    profileId: input.profileId,
    activities: activityRows,
  });

  const completedActivities = activityRows.map((activity) => ({
    occurred_at: activity.started_at,
    activity_category: activity.type,
    duration_seconds: activity.duration_seconds,
    tss: activityDerivedMap.get(activity.id)?.tss ?? null,
    intensity_factor: activityDerivedMap.get(activity.id)?.intensity_factor ?? null,
  }));

  const activityCounts = completedActivities.reduce<Record<string, number>>((acc, activity) => {
    const category = activity.activity_category ?? "other";
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const totalActivityCount = Object.values(activityCounts).reduce((sum, count) => sum + count, 0);
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
    Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? undefined;

  const efforts = (effortsResult.error ? [] : (effortsResult.data ?? [])).map((effort) => ({
    recorded_at: effort.recorded_at,
    effort_type: effort.effort_type,
    duration_seconds: effort.duration_seconds,
    value: effort.value,
    activity_category: effort.activity_category,
  }));

  const ftpEffort = efforts
    .filter((effort) => effort.effort_type === "power" && effort.duration_seconds === 1200)
    .sort((a, b) => b.value - a.value)[0];

  const profileMetricsRows = profileMetricsResult.error ? [] : (profileMetricsResult.data ?? []);

  const lthrMetric = profileMetricsRows.find((metric) => metric.metric_type === "lthr");
  const weightMetric = profileMetricsRows.find((metric) => metric.metric_type === "weight_kg");

  const profileMetrics = {
    ftp: ftpEffort?.value ? Math.round(ftpEffort.value * 0.95) : null,
    threshold_hr: lthrMetric?.value ? Number(lthrMetric.value) : null,
    weight_kg: weightMetric?.value ? Number(weightMetric.value) : null,
    lthr: lthrMetric?.value ? Number(lthrMetric.value) : null,
  };

  const settings = settingsResult.data?.settings as any;
  const baselineFitnessOverride = settings?.baseline_fitness;

  const contextSummary = deriveCreationContext({
    completed_activities: completedActivities,
    efforts,
    activity_context: {
      primary_category: primaryCategory,
      category_mix: categoryMix,
    },
    profile_metrics: profileMetrics,
    profile: {
      dob: profileResult.data?.[0]?.dob ?? null,
      gender:
        profileResult.data?.[0]?.gender === "male" || profileResult.data?.[0]?.gender === "female"
          ? profileResult.data[0].gender
          : null,
    },
    as_of: input.asOfIso,
    baseline_fitness_override: baselineFitnessOverride,
  });

  const loadBootstrapState = computeLoadBootstrapState({
    activities: completedActivities,
    as_of: input.asOfIso,
    window_days: 90,
    profile_age: contextSummary.user_age,
  });

  const globalCtlOverride =
    baselineFitnessOverride?.is_enabled && typeof baselineFitnessOverride?.override_ctl === "number"
      ? baselineFitnessOverride.override_ctl
      : undefined;
  const globalAtlOverride =
    baselineFitnessOverride?.is_enabled && typeof baselineFitnessOverride?.override_atl === "number"
      ? baselineFitnessOverride.override_atl
      : undefined;

  return {
    contextSummary,
    loadBootstrapState,
    globalCtlOverride,
    globalAtlOverride,
    baselineFitnessOverride,
  };
}

function buildConfirmedSuggestionsFromContext(input: {
  contextSummary: ReturnType<typeof deriveCreationContext>;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
  nowIso: string;
  baselineFitnessOverride?: {
    is_enabled: boolean;
    override_ctl?: number;
    override_atl?: number;
    override_date?: string;
    max_weekly_tss_ramp_pct?: number;
    max_ctl_ramp_per_week?: number;
  };
}) {
  const suggestedOptimizationProfile =
    input.contextSummary.is_youth ||
    (input.contextSummary.missing_required_onboarding_fields?.length ?? 0) > 0 ||
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
    post_goal_recovery_days: input.creationInput.defaults?.post_goal_recovery_days,
    // Apply ramp rate overrides when baseline fitness is enabled
    max_weekly_tss_ramp_pct:
      input.baselineFitnessOverride?.is_enabled === true
        ? input.baselineFitnessOverride.max_weekly_tss_ramp_pct
        : undefined,
    max_ctl_ramp_per_week:
      input.baselineFitnessOverride?.is_enabled === true
        ? input.baselineFitnessOverride.max_ctl_ramp_per_week
        : undefined,
    learned_ramp_rate:
      featureFlags.personalizationRampLearning && input.contextSummary.learned_ramp_rate
        ? {
            max_safe_ramp_rate: input.contextSummary.learned_ramp_rate.max_safe_ramp_rate,
            confidence: input.contextSummary.learned_ramp_rate.confidence,
          }
        : undefined,
  });

  const suggestionPayload = deriveCreationSuggestions({
    context: input.contextSummary,
    existing_values: {
      availability_config: input.creationInput.user_values?.availability_config,
      recent_influence: input.creationInput.user_values?.recent_influence,
      constraints: input.creationInput.user_values?.constraints,
      behavior_controls_v1: input.creationInput.user_values?.behavior_controls_v1,
    },
    locks: input.creationInput.user_values?.locks,
    now_iso: input.nowIso,
  });

  const suggestedValues: z.infer<typeof creationConfigValueSchema> = {
    availability_config:
      input.creationInput.defaults?.availability_config ?? suggestionPayload.availability_config,
    recent_influence:
      input.creationInput.defaults?.recent_influence ?? suggestionPayload.recent_influence,
    recent_influence_action:
      input.creationInput.defaults?.recent_influence_action ??
      suggestionPayload.recent_influence_action,
    constraints: {
      ...suggestionPayload.constraints,
      ...(input.creationInput.defaults?.constraints ?? {}),
    },
    optimization_profile: profileDefaults.optimization_profile,
    post_goal_recovery_days: profileDefaults.post_goal_recovery_days,
    behavior_controls_v1: {
      ...suggestionPayload.behavior_controls_v1,
      ...(input.creationInput.defaults?.behavior_controls_v1 ?? {}),
    },
    calibration_composite_locks: input.creationInput.user_values?.calibration_composite_locks ??
      input.creationInput.defaults?.calibration_composite_locks ?? {
        target_attainment_weight: false,
        envelope_weight: false,
        durability_weight: false,
        evidence_weight: false,
      },
    calibration: mergeCalibrationInput(
      input.creationInput.defaults?.calibration,
      input.creationInput.confirmed_suggestions?.calibration,
    ),
  };

  return {
    suggestionPayload,
    suggestedValues,
  };
}

function mergeConfirmedSuggestions(input: {
  suggestedValues: z.infer<typeof creationConfigValueSchema>;
  confirmedSuggestions?: any;
}): z.infer<typeof creationConfigValueSchema> {
  const confirmed = input.confirmedSuggestions;

  // Merge precedence is deterministic and stable:
  // suggested defaults -> previously confirmed suggestions -> user values/locks.
  // This helper handles the first two layers; normalizeCreationConfig applies user values/locks.
  return creationConfigValueSchema.parse({
    availability_config:
      confirmed?.availability_config ?? input.suggestedValues.availability_config,
    recent_influence: confirmed?.recent_influence ?? input.suggestedValues.recent_influence,
    recent_influence_action:
      confirmed?.recent_influence_action ?? input.suggestedValues.recent_influence_action,
    constraints: {
      ...input.suggestedValues.constraints,
      ...(confirmed?.constraints ?? {}),
    },
    optimization_profile:
      confirmed?.optimization_profile ?? input.suggestedValues.optimization_profile,
    post_goal_recovery_days:
      confirmed?.post_goal_recovery_days ?? input.suggestedValues.post_goal_recovery_days,
    behavior_controls_v1:
      confirmed?.behavior_controls_v1 ?? input.suggestedValues.behavior_controls_v1,
    calibration_composite_locks:
      confirmed?.calibration_composite_locks ?? input.suggestedValues.calibration_composite_locks,
    calibration: mergeCalibrationInput(input.suggestedValues.calibration, confirmed?.calibration),
  });
}

async function evaluateCreationConfig(input: {
  supabase: SupabaseClient;
  profileId: string;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
  asOfIso?: string;
}) {
  const nowIso = input.creationInput.now_iso ?? new Date().toISOString();
  const {
    contextSummary,
    loadBootstrapState,
    globalCtlOverride,
    globalAtlOverride,
    baselineFitnessOverride,
  } = await deriveProfileAwareCreationContext({
    supabase: input.supabase,
    profileId: input.profileId,
    asOfIso: input.asOfIso,
  });

  const { suggestionPayload, suggestedValues } = buildConfirmedSuggestionsFromContext({
    contextSummary,
    creationInput: input.creationInput,
    nowIso,
    baselineFitnessOverride,
  });

  const mergedConfirmedSuggestions = mergeConfirmedSuggestions({
    suggestedValues,
    confirmedSuggestions: input.creationInput.confirmed_suggestions,
  }) as NonNullable<NormalizeCreationConfigInput["confirmed_suggestions"]>;

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

  const validatedFinalConfig = trainingPlanCreationConfigFormSchema.safeParse(finalConfig);

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
    loadBootstrapState,
    suggestionPayload,
    conflictResolution,
    feasibilitySummary,
    globalCtlOverride,
    globalAtlOverride,
  };
}

function extractCreationDefaultsFromProfileSettings(
  settings: unknown,
): Partial<z.infer<typeof creationConfigValueSchema>> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  const settingsObject = settings as Record<string, unknown>;
  const parsedPreferences = athletePreferenceProfileSchema.safeParse({
    availability: settingsObject.availability,
    dose_limits: settingsObject.dose_limits,
    training_style: settingsObject.training_style,
    recovery_preferences: settingsObject.recovery_preferences,
    adaptation_preferences: settingsObject.adaptation_preferences,
    goal_strategy_preferences: settingsObject.goal_strategy_preferences,
  });

  if (!parsedPreferences.success) {
    return {};
  }

  return mapAthletePreferencesToCreationDefaults(parsedPreferences.data);
}

function mapAthletePreferencesToCreationDefaults(
  preferences: AthletePreferenceProfile,
): Partial<z.infer<typeof creationConfigValueSchema>> {
  const baseline = normalizeCreationConfig({});
  const availabilityByDay = new Map(
    preferences.availability.weekly_windows.map((dayConfig) => [dayConfig.day, dayConfig]),
  );

  return {
    availability_config: {
      template: "custom",
      days: creationWeekDays.map((day) => {
        const dayConfig = availabilityByDay.get(day);
        return {
          day,
          windows: dayConfig?.windows ?? [],
          ...(dayConfig?.max_sessions !== undefined
            ? { max_sessions: dayConfig.max_sessions }
            : {}),
        };
      }),
    },
    constraints: {
      ...baseline.constraints,
      hard_rest_days: preferences.availability.hard_rest_days,
      min_sessions_per_week: preferences.dose_limits.min_sessions_per_week,
      max_sessions_per_week: preferences.dose_limits.max_sessions_per_week,
      max_single_session_duration_minutes:
        preferences.dose_limits.max_single_session_duration_minutes,
    },
    post_goal_recovery_days: preferences.recovery_preferences.post_goal_recovery_days,
    behavior_controls_v1: {
      ...baseline.behavior_controls_v1,
      aggressiveness: preferences.training_style.progression_pace,
      variability: preferences.training_style.week_pattern_preference,
      recovery_priority: preferences.recovery_preferences.recovery_priority,
    },
  };
}

function mergeCreationDefaults(input: {
  profileDefaults: Partial<z.infer<typeof creationConfigValueSchema>>;
  inputDefaults?: z.infer<typeof creationNormalizationInputSchema>["defaults"];
}): z.infer<typeof creationNormalizationInputSchema>["defaults"] {
  const profileDefaults = input.profileDefaults;
  const inputDefaults = input.inputDefaults;

  if (!inputDefaults) {
    return profileDefaults;
  }

  const mergedConstraints =
    profileDefaults.constraints || inputDefaults.constraints
      ? creationConstraintsSchema.parse({
          ...(profileDefaults.constraints ?? {}),
          ...(inputDefaults.constraints ?? {}),
        })
      : undefined;

  const mergedBehaviorControls =
    profileDefaults.behavior_controls_v1 || inputDefaults.behavior_controls_v1
      ? creationBehaviorControlsV1Schema.parse({
          ...(profileDefaults.behavior_controls_v1 ?? {}),
          ...(inputDefaults.behavior_controls_v1 ?? {}),
        })
      : undefined;

  return {
    ...profileDefaults,
    ...inputDefaults,
    availability_config: inputDefaults.availability_config ?? profileDefaults.availability_config,
    ...(mergedConstraints ? { constraints: mergedConstraints } : {}),
    ...(mergedBehaviorControls ? { behavior_controls_v1: mergedBehaviorControls } : {}),
    calibration_composite_locks:
      inputDefaults.calibration_composite_locks ?? profileDefaults.calibration_composite_locks,
    calibration: mergeCalibrationInput(profileDefaults.calibration, inputDefaults.calibration),
  };
}

async function withProfileTrainingSettingsDefaults(input: {
  supabase: SupabaseClient;
  profileId: string;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
}): Promise<z.infer<typeof creationNormalizationInputSchema>> {
  const { data, error } = await input.supabase
    .from("profile_training_settings")
    .select("settings")
    .eq("profile_id", input.profileId)
    .maybeSingle();

  if (error || !data?.settings) {
    return input.creationInput;
  }

  const profileDefaults = extractCreationDefaultsFromProfileSettings(data.settings);
  if (Object.keys(profileDefaults).length === 0) {
    return input.creationInput;
  }

  return {
    ...input.creationInput,
    defaults: mergeCreationDefaults({
      profileDefaults,
      inputDefaults: input.creationInput.defaults,
    }),
  };
}

export async function getPlanTabProjectionService({
  supabase,
  profileId,
  input,
}: {
  supabase: SupabaseClient;
  profileId: string;
  input: {
    training_plan_id?: string;
    start_date: string;
    end_date: string;
    timezone: string;
  };
}) {
  const windowDays = diffDateOnlyUtcDays(input.start_date, input.end_date) + 1;
  if (windowDays <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "end_date must be on or after start_date",
    });
  }

  if (windowDays > 365) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Date range too large. Use 365 days or fewer.",
    });
  }

  let plan: Record<string, unknown> | null = null;

  if (input.training_plan_id) {
    const { data: fetchedPlan, error: planError } = await supabase
      .from("training_plans")
      .select("*")
      .eq("id", input.training_plan_id)
      .or(`profile_id.eq.${profileId},is_system_template.eq.true,template_visibility.eq.public`)
      .single();

    if (planError || !fetchedPlan) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Training plan not found",
      });
    }

    plan = fetchedPlan as Record<string, unknown>;
  }

  const parsedStructure = trainingPlanSchema.safeParse(plan?.structure);
  const looseStructure = ((plan?.structure as {
    goals?: unknown;
    blocks?: unknown;
    fitness_progression?: { target_ctl_at_peak?: number };
    activity_distribution?: Record<string, unknown>;
  }) ?? {}) as {
    goals?: unknown;
    blocks?: unknown;
    fitness_progression?: { target_ctl_at_peak?: number };
    activity_distribution?: Record<string, unknown>;
  };

  const parsedGoals = z.array(goalSnapshotSchema).safeParse(looseStructure.goals);
  const fallbackGoals = parsedGoals.success ? parsedGoals.data : [];

  const goals = fallbackGoals
    .filter((goal) => goal.name && goal.target_date)
    .map((goal, index) => ({
      id:
        goal.id ??
        deterministicUuidFromSeed(
          `${plan?.id ?? "no-plan"}|goal|${index}|${goal.name}|${goal.target_date}`,
        ),
      name: goal.name ?? `Goal ${index + 1}`,
      target_date: goal.target_date ?? input.end_date,
      priority: goal.priority,
    }));

  const parsedBlocks = z.array(blockSnapshotSchema).safeParse(looseStructure.blocks);
  const blocks = parsedBlocks.success ? parsedBlocks.data : [];

  const planWarnings =
    parsedStructure.success && parsedStructure.data.plan_type === "periodized"
      ? validatePlanFeasibility(parsedStructure.data).warnings
      : [];

  const estimatedCurrentCtl = await estimateCurrentCtl(supabase, profileId);

  const targetCtlAtPeak =
    parsedStructure.success && parsedStructure.data.plan_type === "periodized"
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

  let plannedActivitiesQuery: any = supabase
    .from("events")
    .select("starts_at, training_plan_id, activity_plan:activity_plans (*)")
    .eq("profile_id", profileId)
    .eq("event_type", plannedEventType)
    .gte("starts_at", toDayStartIso(input.start_date))
    .lt("starts_at", toNextDayStartIso(input.end_date));

  if (input.training_plan_id) {
    plannedActivitiesQuery = plannedActivitiesQuery.eq("training_plan_id", input.training_plan_id);
  }

  const { data: plannedActivitiesEventsRaw } = await plannedActivitiesQuery;

  const plannedActivitiesRaw = (
    (plannedActivitiesEventsRaw || []) as Array<{
      starts_at?: string | null;
      training_plan_id?: string | null;
      activity_plan?: unknown;
    }>
  ).map((item) => ({
    ...item,
    scheduled_date: item.starts_at?.split("T")[0] ?? "",
    activity_plan: item.activity_plan as any,
  }));

  const activityPlans = (plannedActivitiesRaw || [])
    .map((item) => item.activity_plan)
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const plansWithEstimations =
    activityPlans.length > 0 ? await addEstimationToPlans(activityPlans, supabase, profileId) : [];

  const estimatedTssByPlanId = new Map(
    plansWithEstimations.map((item) => [item.id, item.estimated_tss]),
  );

  const scheduledByDate = new Map<string, number>();
  for (const planned of plannedActivitiesRaw || []) {
    const scheduledDate = planned.scheduled_date;
    if (!scheduledDate) continue;

    const planId = planned.activity_plan?.id;
    const estimatedTss = planId ? estimatedTssByPlanId.get(planId) || 0 : 0;
    scheduledByDate.set(scheduledDate, (scheduledByDate.get(scheduledDate) || 0) + estimatedTss);
  }

  const endExclusive = new Date(parseDateOnlyUtc(input.end_date));
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const { data: actualActivities } = await supabase
    .from("activities")
    .select(
      "id, type, started_at, finished_at, duration_seconds, moving_seconds, distance_meters, avg_heart_rate, max_heart_rate, avg_power, max_power, avg_speed_mps, max_speed_mps, normalized_power, normalized_speed_mps, normalized_graded_speed_mps",
    )
    .eq("profile_id", profileId)
    .gte("started_at", `${input.start_date}T00:00:00.000Z`)
    .lt("started_at", endExclusive.toISOString());

  const actualDerivedMap = await buildActivityDerivedSummaryMap({
    supabase,
    profileId,
    activities: actualActivities || [],
  });

  const actualByDate = new Map<string, number>();
  for (const activity of actualActivities || []) {
    if (!activity.started_at) continue;
    const date = formatDateOnlyUtc(new Date(activity.started_at));
    const tss = actualDerivedMap.get(activity.id)?.tss || 0;
    actualByDate.set(date, (actualByDate.get(date) || 0) + tss);
  }

  const projectionGoalContext = await deriveInsightTimelineProjectionIdealTssByDate({
    supabase,
    profileId,
    startDate: input.start_date,
  });
  const projectionIdealTssByDate = projectionGoalContext.idealTssByDate;
  const hasActivityHistory = (actualActivities?.length || 0) > 0;
  const hasGoalProjectionCurve = (projectionIdealTssByDate?.size ?? 0) > 0;
  const loadGuidanceMode: LoadGuidanceMode =
    projectionGoalContext.datedGoalCount > 0 ? "goal_driven" : "baseline";
  const hasPlanStructureTargets = hasPlanStructureProjectionAnchor(
    looseStructure as Record<string, unknown>,
    input.start_date,
  );

  const timelineDates = buildDateRange(input.start_date, input.end_date);
  const timeline = timelineDates.map((date) => {
    const projectedIdealTss = projectionIdealTssByDate?.get(date);
    const scheduled_tss = Math.round((scheduledByDate.get(date) || 0) * 10) / 10;
    const ideal_tss =
      loadGuidanceMode === "goal_driven"
        ? resolveIdealDailyTss({
            date,
            projectedIdealTss,
            blocks,
            structure: looseStructure as Record<string, unknown>,
          })
        : resolveBaselineDailyTss({
            date,
            structure: looseStructure as Record<string, unknown>,
            blocks,
            hasActivityHistory,
          });
    const actual_tss = Math.round((actualByDate.get(date) || 0) * 10) / 10;
    const boundary = classifyBoundaryState(ideal_tss, scheduled_tss, actual_tss);

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

  const timelineBoundaryState = getWorstSafetyState(timeline.map((point) => point.boundary_state));
  const timelineBoundaryReasons = uniqueReasons(
    timeline.flatMap((point) => point.boundary_reasons),
  );

  const planSafetyState = getWorstSafetyState([
    assessments.planSafety.state,
    timelineBoundaryState,
  ]);

  const primaryCategory =
    parsedStructure.success && parsedStructure.data.plan_type === "periodized"
      ? (Object.keys(parsedStructure.data.activity_distribution)[0] ?? "run")
      : (Object.keys(looseStructure.activity_distribution ?? {})[0] ?? "run");

  const adherenceAverage =
    timeline.length > 0
      ? timeline.reduce((sum, point) => sum + point.adherence_score, 0) / timeline.length
      : 0;

  const adherenceSummary = buildAdherenceSummary(timeline);

  const projectionDrivers = [
    hasGoalProjectionCurve ? "canonical_goal_projection" : "mvp_baseline_projection",
    adherenceAverage < 70
      ? "low_adherence_reduces_projection_confidence"
      : "adherence_within_expected_range",
  ];

  const projectionConfidence =
    adherenceAverage <= 0 ? 0.2 : clampNumber(adherenceAverage / 100, 0.2, 0.8);
  const capabilityConfidence = clampNumber((actualActivities?.length || 0) / 30, 0.1, 0.9);

  const readinessSummary = buildReadinessSummary({
    planFeasibilityState: assessments.planFeasibility.state,
    planSafetyState,
    adherenceConfidence: projectionConfidence,
    capabilityConfidence,
    adherenceScore: adherenceSummary.score,
  });

  const loadProvenanceSource: ProjectionLoadProvenanceSource = hasGoalProjectionCurve
    ? "canonical_goal_projection"
    : hasPlanStructureTargets
      ? "plan_structure"
      : "conservative_baseline";

  const projectionDiagnostics: ProjectionInsightDiagnostics = {
    fallback_mode:
      projectionGoalContext.diagnostics.fallback_mode ??
      (loadProvenanceSource === "conservative_baseline" && !hasActivityHistory
        ? "conservative_baseline"
        : null),
    load_provenance: {
      source: loadProvenanceSource,
      projection_curve_available: projectionGoalContext.diagnostics.projection_curve_available,
      projection_floor_applied: projectionGoalContext.diagnostics.projection_floor_applied,
    },
    confidence: {
      overall: projectionConfidence,
      adherence: projectionConfidence,
      capability: capabilityConfidence,
      ...projectionGoalContext.diagnostics.confidence,
    },
  };

  const loadGuidance: LoadGuidanceSummary = {
    mode: loadGuidanceMode,
    goal_count: projectionGoalContext.goalCount,
    dated_goal_count: projectionGoalContext.datedGoalCount,
    has_activity_history: hasActivityHistory,
    weekly_cap_tss:
      loadGuidanceMode === "baseline" && !hasActivityHistory ? conservativeStarterWeeklyTss : null,
    interpretation: hasGoalProjectionCurve
      ? "Recommended load is anchored to your canonical dated goals and current plan context."
      : loadGuidanceMode === "goal_driven"
        ? "Recommended load falls back to baseline guidance because canonical goal projection was unavailable for this window."
        : hasActivityHistory
          ? "Recommended load is a baseline estimate from your recent training and active plan, not a dated goal."
          : "Recommended load is a conservative baseline estimate because no dated goal or usable history was found.",
  };

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
      reasons: uniqueReasons([...assessments.planSafety.reasons, ...timelineBoundaryReasons]),
    },
    goal_safety: assessments.goalSafety,
    capability: {
      category: primaryCategory,
      cp_or_cs: null,
      confidence: capabilityConfidence,
    },
    projection: {
      at_goal_date: {
        projected_goal_metric: null,
        confidence: projectionConfidence,
      },
      drivers: projectionDrivers,
      diagnostics: projectionDiagnostics,
    },
    adherence_summary: adherenceSummary,
    readiness_summary: readinessSummary,
    load_guidance: loadGuidance,
    timeline,
  };
}

export const trainingPlansRouter = createTRPCRouter({
  // ------------------------------
  // Get a training plan (by ID or active plan)
  // ------------------------------
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // If ID provided, get specific plan
      if (input?.id) {
        const { data, error } = await ctx.supabase
          .from("training_plans")
          .select("*")
          .eq("id", input.id)
          .or(
            `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
          )
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

        // Check if user has liked this plan
        const { data: likeData } = await (ctx.supabase as any)
          .from("likes")
          .select("id")
          .eq("profile_id", ctx.session.user.id)
          .eq("entity_type", "training_plan")
          .eq("entity_id", input.id)
          .maybeSingle();

        return {
          ...data,
          has_liked: !!likeData,
        };
      }

      // Otherwise, get active plan from future scheduled events
      const activePlanLookup = await getActivePlanFromFutureEvents({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
      });

      if (!activePlanLookup) {
        return null;
      }

      const data = activePlanLookup.trainingPlan;

      // Validate structure on read (defensive programming)
      try {
        if (data.structure) {
          trainingPlanSchema.parse(data.structure);
        }
      } catch (validationError) {
        console.error("Invalid structure in database for training plan", data.id, validationError);
      }

      // Check if user has liked this plan
      const { data: likeData } = await (ctx.supabase as any)
        .from("likes")
        .select("id")
        .eq("profile_id", ctx.session.user.id)
        .eq("entity_type", "training_plan")
        .eq("entity_id", data.id)
        .maybeSingle();

      return {
        ...data,
        has_liked: !!likeData,
      };
    }),

  // ------------------------------
  // List all training plans for the user
  // ------------------------------
  list: protectedProcedure
    .input(
      z
        .object({
          includeOwnOnly: z.boolean().default(true),
          includeSystemTemplates: z.boolean().default(false),
          ownerScope: z.enum(["own", "system", "public", "all"]).optional(),
          visibility: z.enum(["private", "public"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("training_plans")
        .select("*")
        .order("created_at", { ascending: false });

      let ownerScope: "own" | "system" | "public" | "all" | "none";
      if (input?.ownerScope) {
        ownerScope = input.ownerScope;
      } else {
        const includeOwnOnly = input?.includeOwnOnly ?? true;
        const includeSystemTemplates = input?.includeSystemTemplates ?? false;
        ownerScope = includeOwnOnly
          ? includeSystemTemplates
            ? "all"
            : "own"
          : includeSystemTemplates
            ? "system"
            : "none";
      }

      if (ownerScope === "own") {
        query = query.eq("profile_id", ctx.session.user.id);
      } else if (ownerScope === "system") {
        query = query.eq("is_system_template", true);
      } else if (ownerScope === "public") {
        query = query.eq("template_visibility", "public");
      } else if (ownerScope === "all") {
        query = query.or(
          `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
        );
      } else {
        return [];
      }

      if (input?.visibility) {
        query = query.eq("template_visibility", input.visibility);
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const planIds = data?.map((p) => p.id) || [];
      let userLikes: string[] = [];

      if (planIds.length > 0) {
        const { data: likesData } = await (ctx.supabase as any)
          .from("likes")
          .select("entity_id")
          .eq("profile_id", ctx.session.user.id)
          .eq("entity_type", "training_plan")
          .in("entity_id", planIds);

        userLikes = likesData?.map((l: any) => l.entity_id) || [];
      }

      return (data || []).map((plan) => ({
        ...withTrainingPlanIdentity(plan as any),
        has_liked: userLikes.includes(plan.id),
      }));
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

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .insert({
          name: input.name,
          description: input.description ?? null,
          structure: structureWithId as any, // Cast to satisfy Supabase Json type
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
    .input(minimalTrainingPlanCreateSchema)
    .query(async ({ ctx, input }) => {
      const estimatedCurrentCtl = await estimateCurrentCtl(ctx.supabase, ctx.session.user.id);
      const expandedPlan = buildExpandedPlanFromMinimalGoal(input, {
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
        parsedPreviewPlan.success && parsedPreviewPlan.data.plan_type === "periodized"
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
          days_until_goal: nextGoal ? diffDateOnlyUtcDays(referenceDate, nextGoal.target_date) : 0,
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
      return getCreationSuggestionsUseCase({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        params: input,
        deriveProfileAwareCreationContext,
      });
    }),

  // ------------------------------
  // Preview normalized creation config + feasibility/safety
  // ------------------------------
  previewCreationConfig: protectedProcedure
    .input(previewCreationConfigRouterInputSchema)
    .query(async ({ ctx, input }) => {
      const creationInputWithProfileDefaults = await withProfileTrainingSettingsDefaults({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        creationInput: input.creation_input,
      });

      const result = await previewCreationConfigUseCase({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        params: {
          ...input,
          creation_input: creationInputWithProfileDefaults,
        },
        repository: createSupabaseTrainingPlanRepository(ctx.supabase),
        deps: {
          enforceCreationConfigFeatureEnabled,
          enforceNoAutonomousPostCreateMutation,
          evaluateCreationConfig,
          buildCreationProjectionArtifacts,
          buildCreationPreviewSnapshotToken,
          deriveProjectionDrivenConflicts,
          previewSnapshotVersion: CREATION_PREVIEW_SNAPSHOT_VERSION,
        },
      });

      return result as PreviewCreationConfigResponse;
    }),

  // ------------------------------
  // Create plan from minimal goal + normalized creation config
  // ------------------------------
  createFromCreationConfig: protectedProcedure
    .input(createFromCreationConfigRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const creationInputWithProfileDefaults = await withProfileTrainingSettingsDefaults({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        creationInput: input.creation_input,
      });

      return createFromCreationConfigUseCase({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        params: {
          ...input,
          creation_input: creationInputWithProfileDefaults,
        },
        repository: createSupabaseTrainingPlanRepository(ctx.supabase),
        deps: {
          enforceCreationConfigFeatureEnabled,
          enforceNoAutonomousPostCreateMutation,
          evaluateCreationConfig,
          buildCreationProjectionArtifacts,
          buildCreationPreviewSnapshotToken,
          deriveProjectionDrivenConflicts,
          throwPathValidationError,
          parseTrainingPlanStructure: (value) => {
            trainingPlanSchema.parse(value);
          },
        },
      });
    }),

  updateFromCreationConfig: protectedProcedure
    .input(updateFromCreationConfigRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const creationInputWithProfileDefaults = await withProfileTrainingSettingsDefaults({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        creationInput: input.creation_input,
      });

      return updateFromCreationConfigUseCase({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        params: {
          ...input,
          creation_input: creationInputWithProfileDefaults,
        },
        deps: {
          enforceCreationConfigFeatureEnabled,
          enforceNoAutonomousPostCreateMutation,
          evaluateCreationConfig,
          buildCreationProjectionArtifacts,
          buildCreationPreviewSnapshotToken,
          deriveProjectionDrivenConflicts,
          parseTrainingPlanStructure: (value) => {
            trainingPlanSchema.parse(value);
          },
        },
      });
    }),

  // ------------------------------
  // Create training plan from minimal goal payload
  // ------------------------------
  createFromMinimalGoal: protectedProcedure
    .input(minimalTrainingPlanCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const estimatedCurrentCtl = await estimateCurrentCtl(ctx.supabase, ctx.session.user.id);
      const expandedPlan = buildExpandedPlanFromMinimalGoal(input, {
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

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .insert({
          name: expandedPlan.name,
          description: expandedPlan.description ?? null,
          structure: structureWithId as any,
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
      return getPlanTabProjectionService({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        input,
      });
    }),

  // ------------------------------
  // Update training plan
  // ------------------------------
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          template_visibility: z.enum(["private", "public"]).optional(),
        })
        .and(trainingPlanUpdateInputSchema),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, template_visibility, ...updates } = input as {
        id: string;
        template_visibility?: "private" | "public";
      } & z.infer<typeof trainingPlanUpdateInputSchema>;

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
          message: "Training plan not found or you don't have permission to edit it",
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

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .update({
          name: updates.name as string | undefined,
          description: updates.description as string | null | undefined,
          structure: updates.structure as any,
          template_visibility: template_visibility,
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
  // Delete training plan (cascades to delete planned events)
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
          message: "Training plan not found or you don't have permission to delete it",
        });
      }

      // Delete all planned events associated with this training plan first
      const { error: deleteActivitiesError } = await ctx.supabase
        .from("events")
        .delete()
        .eq("event_type", plannedEventType)
        .eq("training_plan_id", input.id)
        .eq("profile_id", ctx.session.user.id);

      if (deleteActivitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete planned events: ${deleteActivitiesError.message}`,
        });
      }

      // Now delete the training plan
      const { error } = await ctx.supabase.from("training_plans").delete().eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return { success: true };
    }),

  duplicate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        newName: z.string().min(1, "Plan name is required").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: sourcePlan, error: sourcePlanError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.id)
        .or(
          `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
        )
        .single();

      if (sourcePlanError || !sourcePlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      try {
        if (sourcePlan.structure) {
          trainingPlanSchema.parse(sourcePlan.structure);
        }
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source training plan has invalid structure",
          cause: validationError,
        });
      }

      const duplicatedPlanId = crypto.randomUUID();
      const duplicatedStructure = {
        ...(sourcePlan.structure as Record<string, unknown>),
        id: duplicatedPlanId,
      };

      try {
        trainingPlanSchema.parse(duplicatedStructure);
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Duplicated training plan structure is invalid",
          cause: validationError,
        });
      }

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .insert({
          name: input.newName?.trim() || `${sourcePlan.name} (Copy)`,
          description: sourcePlan.description,
          structure: duplicatedStructure as any,
          profile_id: ctx.session.user.id,
          template_visibility: "private",
          is_public: false,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error?.message ?? "Failed to duplicate training plan",
        });
      }

      return withTrainingPlanIdentity(data);
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
        .or(
          `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
        )
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
        console.error("Invalid structure in database for training plan", input.id, validationError);
      }

      const { data: likeData } = await (ctx.supabase as any)
        .from("likes")
        .select("id")
        .eq("profile_id", ctx.session.user.id)
        .eq("entity_type", "training_plan")
        .eq("entity_id", input.id)
        .maybeSingle();

      return {
        ...data,
        has_liked: !!likeData,
      };
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

    const derivedActivityMap = await buildActivityDerivedSummaryMap({
      supabase: ctx.supabase,
      profileId: ctx.session.user.id,
      activities: activities || [],
    });

    const tssData = (activities || []).map(
      (activity) => derivedActivityMap.get(activity.id)?.tss || 0,
    );
    const loadSeries = calculateTrainingLoadSeries(tssData, 0, 0);
    const latestLoadState = loadSeries[loadSeries.length - 1];
    const ctl = latestLoadState?.ctl ?? 0;
    const atl = latestLoadState?.atl ?? 0;
    const tsb = latestLoadState?.tsb ?? 0;
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

    const weekActivitiesDerivedMap = await buildActivityDerivedSummaryMap({
      supabase: ctx.supabase,
      profileId: ctx.session.user.id,
      activities: weekActivities || [],
    });

    const completedWeeklyTSS =
      weekActivities?.reduce(
        (sum, act) => sum + (weekActivitiesDerivedMap.get(act.id)?.tss || 0),
        0,
      ) || 0;

    // Get planned activities this week with their activity plans
    const weekStartDate = startOfWeek.toISOString().split("T")[0] || "";
    const weekEndDate = endOfWeek.toISOString().split("T")[0] || "";

    const { data: plannedActivitiesEvents } = await ctx.supabase
      .from("events")
      .select("*, activity_plan:activity_plans (*)")
      .eq("profile_id", ctx.session.user.id)
      .eq("event_type", plannedEventType)
      .gte("starts_at", toDayStartIso(weekStartDate))
      .lt("starts_at", toDayStartIso(weekEndDate));

    const plannedActivities = (plannedActivitiesEvents || []).map((item) => ({
      ...item,
      scheduled_date: item.starts_at?.split("T")[0] ?? "",
    }));

    // Extract activity plans and add estimations
    const activityPlans = (plannedActivities || [])
      .map((pa) => pa.activity_plan)
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

    const plansWithEstimations =
      activityPlans.length > 0
        ? await addEstimationToPlans(activityPlans, ctx.supabase, ctx.session.user.id)
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

    const todayDate = today.toISOString().split("T")[0] || "";
    const fiveDaysFromNowDate = fiveDaysFromNow.toISOString().split("T")[0] || "";

    const { data: upcomingActivitiesEventsRaw } = await ctx.supabase
      .from("events")
      .select("*, activity_plan:activity_plans (*)")
      .eq("profile_id", ctx.session.user.id)
      .eq("event_type", plannedEventType)
      .gte("starts_at", toDayStartIso(todayDate))
      .lt("starts_at", toNextDayStartIso(fiveDaysFromNowDate))
      .order("starts_at", { ascending: true })
      .limit(5);

    const upcomingActivitiesRaw = (upcomingActivitiesEventsRaw || []).map((item) => ({
      ...item,
      scheduled_date: item.starts_at?.split("T")[0] ?? "",
    }));

    // Add estimations to upcoming activity plans
    const upcomingPlans = (upcomingActivitiesRaw || [])
      .map((pa) => pa.activity_plan)
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

    const upcomingPlansWithEstimations =
      upcomingPlans.length > 0
        ? await addEstimationToPlans(upcomingPlans, ctx.supabase, ctx.session.user.id)
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
              activity_category: upcomingPlansWithEstimations[index].activity_category,
              estimated_duration: upcomingPlansWithEstimations[index].estimated_duration,
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
        return todayStr && block.start_date <= todayStr && block.end_date >= todayStr;
      });

      if (currentBlock?.target_weekly_tss_range) {
        // Use the max of the range as the target
        targetTSS = currentBlock.target_weekly_tss_range.max;
      }
    } else if (structure?.plan_type === "maintenance" && structure?.target_weekly_tss_range) {
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
        .or(
          `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
        )
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const structure = (plan.structure as Record<string, unknown> | null) ?? {};

      const structuredWeeklyTss = await estimateWeeklyTssFromStructuredActivities({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        structure,
        startDate: input.start_date,
      });

      const derivedWeeklyTss =
        deriveStructureWeeklyTssTarget(structure, formatDateOnlyUtc(new Date())) ??
        structuredWeeklyTss.weeklyTss ??
        conservativeStarterWeeklyTss;

      // ✅ FIX: Get user's CURRENT CTL (not plan's starting_ctl)
      const { data: actualCurve } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .lte("started_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(42);

      let currentCTL =
        typeof (structure.periodization_template as any)?.starting_ctl === "number"
          ? (structure.periodization_template as any).starting_ctl
          : Math.max(10, Math.round((derivedWeeklyTss / 7) * 0.75));

      if (actualCurve && actualCurve.length > 0) {
        const actualCurveDerivedMap = await buildActivityDerivedSummaryMap({
          supabase: ctx.supabase,
          profileId: ctx.session.user.id,
          activities: actualCurve,
        });
        const tssData = actualCurve.map((a) => actualCurveDerivedMap.get(a.id)?.tss || 0);
        const series = calculateTrainingLoadSeries(tssData, 0, 0);
        currentCTL = series[series.length - 1]?.ctl || currentCTL;
      }

      const targetCTL =
        typeof (structure.periodization_template as any)?.target_ctl === "number"
          ? (structure.periodization_template as any).target_ctl
          : typeof (structure.fitness_progression as any)?.target_ctl === "number"
            ? (structure.fitness_progression as any).target_ctl
            : Math.max(currentCTL, Math.round(Math.max(derivedWeeklyTss / 6, currentCTL + 4)));

      const targetDateCandidates = [
        (structure.periodization_template as any)?.target_date,
        (structure.fitness_progression as any)?.peak_date,
        structuredWeeklyTss.latestScheduledDate,
        input.end_date,
      ].filter((value): value is string => typeof value === "string" && value.length > 0);

      const targetDate =
        targetDateCandidates.sort((a, b) => a.localeCompare(b)).at(-1) ?? input.end_date;

      // ✅ FIX: Start projection from TODAY (not query start_date)
      const projectionStartDate = new Date();
      const projectionEndDate = new Date(targetDate);
      const daysToTarget = Math.max(
        0,
        Math.floor(
          (projectionEndDate.getTime() - projectionStartDate.getTime()) / (24 * 60 * 60 * 1000),
        ),
      );

      // ✅ FIX: Use plan's target_weekly_tss for projection
      const weeklyTSS = Math.max(
        conservativeStarterWeeklyTss,
        derivedWeeklyTss,
        (targetCTL - currentCTL) * 7,
      );
      const dailyTSS = weeklyTSS / 7;

      // Build projection curve via shared load-series primitive
      const projectionDatePoints: string[] = [];
      const projectedDailyTss: number[] = [];
      const structureBlocks = Array.isArray(structure.blocks) ? structure.blocks : [];

      for (let day = 0; day <= daysToTarget; day++) {
        const date = new Date(projectionStartDate);
        date.setDate(date.getDate() + day);

        // Apply phase multipliers if blocks exist
        const currentBlock = structureBlocks.find((block: any) => {
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

        const multiplier = currentBlock?.phase ? phaseMultipliers[currentBlock.phase] || 1.0 : 1.0;

        const adjustedDailyTSS = dailyTSS * multiplier;
        projectionDatePoints.push(date.toISOString().split("T")[0] ?? "");
        projectedDailyTss.push(adjustedDailyTSS);
      }

      const projectedSeries = calculateTrainingLoadSeries(
        projectedDailyTss,
        currentCTL,
        currentCTL,
      );

      const curve = projectionDatePoints.map((date, index) => ({
        date,
        ctl: Math.round(projectedSeries[index]?.ctl ?? currentCTL),
      }));

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
        const baselineDerivedMap = await buildActivityDerivedSummaryMap({
          supabase: ctx.supabase,
          profileId: ctx.session.user.id,
          activities: baselineActivities,
        });
        const baselineTSS = baselineActivities.map((a) => baselineDerivedMap.get(a.id)?.tss || 0);
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

      const { byActivityId: actualDerivedMap, byDate: activitiesByDate } =
        await buildDynamicStressSeries({
          supabase: ctx.supabase,
          profileId: ctx.session.user.id,
          activities: activities || [],
        });

      const tssData: { date: string; tss: number }[] = [];

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
          message: "Training plan not found or you don't have permission to edit it",
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
      // Verify plan accessibility
      const { data: plan, error: planError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.training_plan_id)
        .or(
          `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
        )
        .maybeSingle();

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
      const startDateOnly = startDate.toISOString().split("T")[0] || "";
      const todayDateOnly = today.toISOString().split("T")[0] || "";

      const { data: plannedActivitiesEventsRaw } = await ctx.supabase
        .from("events")
        .select("*, activity_plan:activity_plans (*)")
        .eq("profile_id", ctx.session.user.id)
        .eq("training_plan_id", input.training_plan_id)
        .eq("event_type", plannedEventType)
        .gte("starts_at", toDayStartIso(startDateOnly))
        .lt("starts_at", toNextDayStartIso(todayDateOnly));

      const plannedActivitiesRaw = (plannedActivitiesEventsRaw || []).map((item) => ({
        ...item,
        scheduled_date: item.starts_at?.split("T")[0] ?? "",
      }));

      // Extract activity plans and add estimations
      const activityPlans = (plannedActivitiesRaw || [])
        .map((pa) => pa.activity_plan)
        .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

      const plansWithEstimations =
        activityPlans.length > 0
          ? await addEstimationToPlans(activityPlans, ctx.supabase, ctx.session.user.id)
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

      const completedDerivedMap = await buildActivityDerivedSummaryMap({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        activities: completedActivities || [],
      });

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
          (sum, act) => sum + (completedDerivedMap.get(act.id)?.tss || 0),
          0,
        );

        // Find the block for this week (use week start date)
        const weekStartStr = weekStart.toISOString().split("T")[0];
        const weekBlock = blocks.find((block: any) => {
          return weekStartStr && block.start_date <= weekStartStr && block.end_date >= weekStartStr;
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
          targetActivities = structure.constraints.available_days_per_week.length;
        }

        // Calculate completion percentage
        const tssPercentage = plannedTSS > 0 ? (completedTSS / plannedTSS) * 100 : 0;
        const activityPercentage =
          weekPlanned.length > 0 ? (weekCompleted.length / weekPlanned.length) * 100 : 0;

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

      const derivedMap = await buildActivityDerivedSummaryMap({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        activities: activities || [],
      });

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
          const intensityFactorValue = derivedMap.get(activity.id)?.intensity_factor || 0;
          const tss = derivedMap.get(activity.id)?.tss || 0;

          if (!intensityFactorValue || !tss) {
            continue;
          }
          const intensityFactor = intensityFactorValue;

          // Get the zone for this IF value
          const zone = getTrainingIntensityZone(intensityFactor) as IntensityZone;

          // Add TSS to the appropriate zone
          zoneDistribution[zone] = (zoneDistribution[zone] || 0) + tss;
          totalTSS += tss;
        }

        // Convert TSS values to percentages
        if (totalTSS > 0) {
          for (const zone in zoneDistribution) {
            const zoneKey = zone as IntensityZone;
            zoneDistribution[zoneKey] = (zoneDistribution[zoneKey] / totalTSS) * 100;
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
          neuromuscular: Math.round((zoneDistribution.neuromuscular || 0) * 10) / 10,
        },
        totalActivities,
        totalTSS: Math.round(totalTSS),
        activitiesWithIntensity:
          activities?.filter((a) => {
            const intensityFactor = derivedMap.get(a.id)?.intensity_factor;
            return intensityFactor !== null && intensityFactor !== undefined;
          }).length || 0,
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

      const derivedMap = await buildActivityDerivedSummaryMap({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        activities: activities || [],
      });

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

          const intensityFactorValue = derivedMap.get(activity.id)?.intensity_factor || 0;

          if (!intensityFactorValue) continue;

          const intensityFactor = intensityFactorValue; // Assuming float 0.85
          const tss = derivedMap.get(activity.id)?.tss || 0;
          const zone = getTrainingIntensityZone(intensityFactor) as IntensityZone;

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
          (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
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

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const derivedMap = await buildActivityDerivedSummaryMap({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        activities: allActivities || [],
      });

      // Filter activities with IF >= 0.85
      const activities =
        allActivities?.filter((a) => {
          return (derivedMap.get(a.id)?.intensity_factor || 0) >= 0.85;
        }) || [];

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
            (new Date(curr.started_at).getTime() - new Date(prev.started_at).getTime()) /
            (1000 * 60 * 60);

          if (hoursBetween < input.min_hours) {
            violations.push({
              activity1: {
                id: prev.id,
                name: prev.name || "Unnamed activity",
                started_at: prev.started_at,
                intensity_factor: derivedMap.get(prev.id)?.intensity_factor ?? 0,
              },
              activity2: {
                id: curr.id,
                name: curr.name || "Unnamed activity",
                started_at: curr.started_at,
                intensity_factor: derivedMap.get(curr.id)?.intensity_factor ?? 0,
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
      const weekStart = input?.weekStartDate ? new Date(input.weekStartDate) : new Date(today);

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
          experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
          min_weeks: z.number().int().min(1).max(52).optional(),
          max_weeks: z.number().int().min(1).max(52).optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Query system templates from database
      let query = ctx.supabase
        .from("training_plans")
        .select(
          "id, name, description, structure, sessions_per_week_target, duration_hours, is_system_template, template_visibility, likes_count, created_at, updated_at",
        )
        .eq("is_system_template", true)
        .eq("template_visibility", "public");

      const { data: templates, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch templates",
        });
      }

      // Transform and filter results
      let result = (templates || []).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        sessions_per_week_target: t.sessions_per_week_target,
        duration_hours: t.duration_hours,
        ...(t.structure as object),
      }));

      // Apply filters
      if (input?.sport) {
        result = result.filter((t: any) => (t.sport || []).includes(input.sport));
      }

      if (input?.experience_level) {
        result = result.filter((t: any) =>
          (t.experienceLevel || []).includes(input.experience_level),
        );
      }

      if (input?.min_weeks) {
        result = result.filter((t: any) => (t.durationWeeks?.recommended || 0) >= input.min_weeks!);
      }

      if (input?.max_weeks) {
        result = result.filter((t: any) => (t.durationWeeks?.recommended || 0) <= input.max_weeks!);
      }

      // Apply search filter (case-insensitive)
      if (input?.search) {
        const searchLower = input.search.toLowerCase();
        result = result.filter((t: any) => (t.name || "").toLowerCase().includes(searchLower));
      }

      return result;
    }),

  // ------------------------------
  // Get single training plan template
  // ------------------------------
  getTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Query system template from database
      const { data: template, error } = await ctx.supabase
        .from("training_plans")
        .select(
          "id, name, description, structure, sessions_per_week_target, duration_hours, is_system_template, template_visibility, likes_count, created_at, updated_at",
        )
        .eq("id", input.id)
        .eq("is_system_template", true)
        .eq("template_visibility", "public")
        .single();

      if (error || !template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return {
        id: template.id,
        name: template.name,
        description: template.description,
        sessions_per_week_target: template.sessions_per_week_target,
        duration_hours: template.duration_hours,
        ...(template.structure as object),
      };
    }),

  applyTemplate: protectedProcedure
    .input(templateApplyInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.template_type !== "training_plan") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only training plan templates are supported by this mutation",
        });
      }

      const profileId = ctx.session.user.id;

      const activePlanLookup = await getActivePlanFromFutureEvents({
        supabase: ctx.supabase,
        profileId,
      });

      if (activePlanLookup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have an active training plan. Please complete or abandon it first.",
        });
      }

      const { data: templatePlan, error: templateError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.template_id)
        .or(`profile_id.eq.${profileId},is_system_template.eq.true,template_visibility.eq.public`)
        .single();

      if (templateError || !templatePlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan template not found",
        });
      }

      const structure =
        templatePlan.structure && typeof templatePlan.structure === "object"
          ? ({
              ...(templatePlan.structure as Record<string, unknown>),
            } as Record<string, unknown>)
          : {};

      let appliedPlanStartDate = input.start_date;

      if (!appliedPlanStartDate && input.target_date) {
        const dummyStart = "2000-01-01";
        const dummySessions = materializePlanToEvents(structure, dummyStart);
        let maxOffsetDays = 0;
        for (const s of dummySessions) {
          const offset = diffDateOnlyUtcDays(dummyStart, s.scheduled_date);
          if (offset > maxOffsetDays) maxOffsetDays = offset;
        }
        appliedPlanStartDate = addDaysDateOnlyUtc(input.target_date, -maxOffsetDays);
      }

      if (!appliedPlanStartDate) {
        appliedPlanStartDate = todayDateOnlyUtc();
      }

      const appliedStructureId = crypto.randomUUID();
      structure.id = appliedStructureId;
      structure.start_date = appliedPlanStartDate;

      const appliedPlanId = templatePlan.id as string;

      const materializedSessions = materializePlanToEvents(structure, appliedPlanStartDate);

      const candidatePlanIds = Array.from(
        new Set(
          materializedSessions
            .map((session) => session.activity_plan_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      let allowedPlanIds = new Set<string>();
      if (candidatePlanIds.length > 0) {
        const { data: accessiblePlans, error: plansError } = await ctx.supabase
          .from("activity_plans")
          .select("id")
          .in("id", candidatePlanIds)
          .or(
            `profile_id.eq.${profileId},is_system_template.eq.true,template_visibility.eq.public`,
          );

        if (plansError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: plansError.message,
          });
        }

        allowedPlanIds = new Set((accessiblePlans ?? []).map((row) => row.id));
      }

      const unresolvedPlanIds = candidatePlanIds.filter((planId) => !allowedPlanIds.has(planId));

      if (templatePlan.is_system_template === true && unresolvedPlanIds.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This system training plan cannot be scheduled because ${unresolvedPlanIds.length === 1 ? "a linked activity template is" : "linked activity templates are"} unavailable: ${unresolvedPlanIds.join(", ")}`,
        });
      }

      const eventRows = materializedSessions
        .filter((session) => session.event_type === "planned")
        .filter(
          (session) => !session.activity_plan_id || allowedPlanIds.has(session.activity_plan_id),
        )
        .map(
          (session) =>
            ({
              profile_id: profileId,
              event_type: plannedEventType,
              title: session.title,
              all_day: session.all_day,
              timezone: "UTC",
              starts_at: session.starts_at,
              ends_at: session.ends_at,
              status: "scheduled" as const,
              activity_plan_id: session.activity_plan_id,
              training_plan_id: appliedPlanId,
            }) as any,
        );

      const schedule_batch_id = crypto.randomUUID();
      let created_event_count = 0;

      if (eventRows.length === 0) {
        const plannedSessionCount = materializedSessions.filter(
          (session) => session.event_type === "planned",
        ).length;

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            plannedSessionCount === 0
              ? "This training plan does not contain any schedulable sessions."
              : "This training plan could not be scheduled because its linked activities are not available to your account.",
        });
      }

      const { data: insertedEvents, error: eventsError } = await ctx.supabase
        .from("events")
        .insert(
          eventRows.map((eventRow) => ({
            ...eventRow,
            schedule_batch_id,
          })),
        )
        .select("id");

      if (eventsError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Applied plan was created, but event scheduling failed",
        });
      }

      created_event_count = insertedEvents?.length ?? 0;

      return {
        applied_plan_id: appliedPlanId,
        training_plan_id: templatePlan.id,
        schedule_batch_id,
        created_event_count,
        cache_tags: ["events.list", "trainingPlans.list"],
      };
    }),

  // ------------------------------
  // Auto-add periodization to existing plan
  // ------------------------------
  updateActivePlanStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["active", "paused", "completed", "abandoned"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profileId = ctx.session.user.id;
      const windowStartIso = todayStartIsoUtc();

      const { data: futurePlanEvents, error: futurePlanEventsError } = await ctx.supabase
        .from("events")
        .select("id, training_plan_id")
        .eq("profile_id", profileId)
        .eq("event_type", plannedEventType)
        .eq("training_plan_id", input.id)
        .gte("starts_at", windowStartIso);

      if (futurePlanEventsError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to inspect active plan events",
        });
      }

      const hasFutureEventsForPlan = (futurePlanEvents?.length ?? 0) > 0;
      if (!hasFutureEventsForPlan && (input.status === "active" || input.status === "paused")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active training plan not found",
        });
      }

      if (input.status === "active" || input.status === "paused") {
        const { data: allFuturePlanEvents, error: allFuturePlanEventsError } = await ctx.supabase
          .from("events")
          .select("training_plan_id")
          .eq("profile_id", profileId)
          .eq("event_type", plannedEventType)
          .gte("starts_at", windowStartIso)
          .limit(200);

        if (allFuturePlanEventsError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to check other active plans",
          });
        }

        const hasOtherActivePlan = (allFuturePlanEvents ?? []).some(
          (event) =>
            isUuidString((event as any).training_plan_id) &&
            (event as any).training_plan_id !== input.id,
        );

        if (hasOtherActivePlan) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "You already have another active or paused training plan. Please complete or abandon it first.",
          });
        }

        return {
          id: input.id,
          training_plan_id: input.id,
          profile_id: profileId,
          status: input.status,
          updated_event_count: 0,
        };
      }

      const { data: deletedEvents, error: deleteEventsError } = await ctx.supabase
        .from("events")
        .delete()
        .eq("profile_id", profileId)
        .eq("event_type", plannedEventType)
        .eq("training_plan_id", input.id)
        .gte("starts_at", windowStartIso)
        .select("id");

      if (deleteEventsError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update training plan status",
        });
      }

      return {
        id: input.id,
        training_plan_id: input.id,
        profile_id: profileId,
        status: input.status,
        updated_event_count: deletedEvents?.length ?? 0,
      };
    }),

  getActivePlan: protectedProcedure.query(async ({ ctx }) => {
    const activePlanLookup = await getActivePlanFromFutureEvents({
      supabase: ctx.supabase,
      profileId: ctx.session.user.id,
    });

    if (!activePlanLookup) {
      return null;
    }

    return {
      id: activePlanLookup.trainingPlanId,
      profile_id: ctx.session.user.id,
      training_plan_id: activePlanLookup.trainingPlanId,
      status: "active",
      next_event_at: activePlanLookup.nextEventAt,
      training_plan: activePlanLookup.trainingPlan,
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
          message: "Training plan not found or you don't have permission to edit it",
        });
      }

      const structure = existing.structure as any;

      // Check if already periodized
      if (structure?.plan_type === "periodized" && structure?.fitness_progression) {
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
