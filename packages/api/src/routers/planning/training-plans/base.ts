// packages/api/src/routers/planning/training-plans/base.ts
import {
  type AthletePreferenceProfile,
  addDaysDateOnlyUtc,
  athletePreferenceProfileSchema,
  type BuildReadinessForecastTimelineInput,
  buildDailyRecommendedLoad,
  buildDeterministicProjectionPayload,
  buildGoalAnchoredProjectionPlan,
  buildProjectionChartPayloadFromDeterministicProjection,
  buildProjectionEngineInput,
  buildReadinessForecastTimeline,
  type CanonicalSport,
  type CreationContextSummary,
  calculateTrainingLoadSeries,
  canonicalizeMinimalTrainingPlanCreate,
  classifyCreationFeasibility,
  classifyProjectionFeasibility,
  computeLoadBootstrapState,
  countAvailableTrainingDays,
  createAthletePlanningContextFromSnapshot,
  creationBehaviorControlsV1Schema,
  creationConfigValueSchema,
  creationConstraintsSchema,
  type creationNormalizationInputSchema,
  type DailyRecommendedLoadActivityCategory,
  deriveCreationContext,
  deriveCreationSuggestions,
  deriveNoHistoryGoalTierFromTargets,
  deterministicUuidFromSeed,
  diffDateOnlyUtcDays,
  type ForecastConfidenceReasonCode,
  formatDateOnlyUtc,
  type GoalAnchoredProjectionPlan,
  getFormStatus,
  type InferredStateSnapshot,
  ianaTimezoneSchema,
  inferredStateSnapshotSchema,
  type LoadBootstrapState,
  type MinimalTrainingPlanCreate,
  mapAthletePreferencesToCreationDefaults,
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
  type ProjectionChartPayloadWithDeterministicIds,
  type ProjectionConstraintSummary,
  type ProjectionFeasibilitySummary,
  type ProjectionRecoverySegment,
  parseDateOnlyUtc,
  parseProfileGoalRecord,
  type postCreateBehaviorSchema,
  previewCreationConfigInputSchema,
  type ReadinessDailyLoadInput,
  type ReadinessDeltaDiagnostics,
  type ReadinessForecastGoalInput,
  resolveConstraintConflicts,
  type ScheduledReadinessDailyLoadInput,
  simulateReadinessScheduleAdjustment,
  type TrainingPlanCreationConfig,
  templateApplyInputSchema,
  trainingPlanCalibrationConfigSchema,
  trainingPlanCreateInputSchema,
  trainingPlanCreationConfigFormSchema,
  trainingPlanSchema,
  trainingPlanUpdateInputSchema,
} from "@repo/core";
import { getAuthoritativeActivityPlanMetrics } from "@repo/core/activity-plan";
import { getScheduledDateKey } from "@repo/core/utils/schedule-date";
import { type ProfileGoalRow, schema, type TrainingPlanRow } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { readCurrentProfileCommonLoadHistory } from "../../../application/activities/read-current-profile-common-load-history";
import { buildEffectiveAthleteSnapshot } from "../../../application/athlete-state/build-effective-athlete-snapshot";
import {
  parseProfileTrainingSettings,
  readParsedProfileTrainingSettings,
} from "../../../application/profile-settings/profileTrainingSettings";
import {
  applyQuickAdjustmentUseCase,
  applyTrainingPlanTemplateUseCase,
  buildReadinessForecastBaseline,
  buildScheduleGapActivityPlanMatches,
  buildScheduleRecommendation,
  buildUpcomingActivityImpact,
  buildWeeklyLoadComparison,
  CanonicalTrainingPlanResolutionError,
  createTrainingPlanUseCase,
  deleteTrainingPlanUseCase,
  duplicateTrainingPlanUseCase,
  getActivePlanUseCase,
  getCurrentStatusTrainingPlanUseCase,
  getTrainingPlanByIdUseCase,
  getTrainingPlanTemplateUseCase,
  getTrainingPlanUseCase,
  listTrainingPlansUseCase,
  listTrainingPlanTemplatesUseCase,
  loadOwnedActivityPlansForScheduleGap,
  previewCreationConfigUseCase,
  removeAppliedScheduleUseCase,
  reorderTrainingPlanWorkoutsUseCase,
  resolveCanonicalTrainingPlan,
  resolveScheduleGapActivityPlanMatchTarget,
  type ScheduleRecommendation,
  updateTrainingPlanUseCase,
} from "../../../application/training-plan";
import { getCurrentPlanningWeek } from "../../../application/training-plan/current-planning-week";
import { getEffectivePlanLoad } from "../../../application/training-plan/get-effective-plan-load";
import { getRequiredDb } from "../../../db";
import {
  createPlanningTemplateRepository,
  createTrainingPlanRepository,
} from "../../../infrastructure";
import {
  createActivityAnalysisStore,
  createEventReadRepository,
} from "../../../infrastructure/repositories";
import {
  buildActivityDerivedSummaryMap,
  buildActivitySegmentDerivedSummaries,
  buildDynamicStressSeries,
  deriveActivityDurations,
  deriveNormalizedPowerCompatibilityProjectionFromSegments,
  loadActivitySegmentsByActivityId,
  orderedActivitySegments,
  summarizeSegmentTss,
} from "../../../lib/activity-analysis";
import { featureFlags } from "../../../lib/features";
import { createContentAccessPermissions } from "../../../permissions/content-access";
import { createTRPCRouter, protectedProcedure } from "../../../trpc";
import { getActivityPlansDerivedMetrics } from "../../../utils/activity-plan-derived-metrics";
import { addEstimationToPlans } from "../../../utils/estimation-helpers";
import { indexCursorSchema } from "../../../utils/index-cursor";
import {
  filterObservationsAfterLatestTombstone,
  filterSupersededProfileOverrides,
} from "../../../utils/profile-override-observations";

const feasibilityStateSchema = z.enum(["feasible", "aggressive", "unsafe"]);
const safetyStateSchema = z.enum(["safe", "caution", "exceeded"]);
const trainingPlanTemplateVisibilitySchema = z.enum(["private", "followers", "public"]);
const trainingPlanUpdateMutationInputSchema = trainingPlanUpdateInputSchema
  .extend({
    id: z.string().uuid(),
    expectedStructureHash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
    template_visibility: trainingPlanTemplateVisibilitySchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Object.keys(input).every((key) => ["id", "expectedStructureHash"].includes(key))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one training plan update field is required",
      });
    }
  });
const applyQuickAdjustmentInputSchema = z
  .object({
    id: z.string().uuid(),
    expectedStructureHash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
    adjustedStructure: trainingPlanSchema,
  })
  .strict();
const reorderTrainingPlanWorkoutsInputSchema = z
  .object({
    training_plan_id: z.string().uuid(),
    changes: z
      .array(
        z
          .object({
            event_id: z.string().uuid(),
            expected_scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            requested_scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .strict()
          .refine((change) => change.expected_scheduled_date !== change.requested_scheduled_date, {
            message: "Requested workout date must differ from the expected date",
          }),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    const eventIds = new Set<string>();
    input.changes.forEach((change, index) => {
      if (eventIds.has(change.event_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Workout event IDs must be unique",
          path: ["changes", index, "event_id"],
        });
      }
      eventIds.add(change.event_id);
    });
  });
const plannedEventType = "planned" as const;
const conservativeStarterWeeklyTss = 140;
const conservativeStarterDailyTss = conservativeStarterWeeklyTss / 7;

type FeasibilityState = z.infer<typeof feasibilityStateSchema>;
type SafetyState = z.infer<typeof safetyStateSchema>;
type DbClient = ReturnType<typeof getRequiredDb>;
type LegacyPlanningReader = { from: (...args: any[]) => any };

type ProfileGoalSqlRow = Pick<
  ProfileGoalRow,
  "id" | "profile_id" | "title" | "priority" | "activity_category" | "target_payload"
>;

type TrainingPlanCountRow = { value: number | string };

const activitySummaryColumns = {
  id: schema.activities.id,
  profile_id: schema.activities.profile_id,
  started_at: schema.activities.started_at,
  finished_at: schema.activities.finished_at,
  elapsed_ms: schema.activities.elapsed_ms,
  active_ms: schema.activities.active_ms,
  moving_ms: schema.activities.moving_ms,
  timing_coverage: schema.activities.timing_coverage,
  distance_meters: schema.activities.distance_meters,
  avg_heart_rate: schema.activities.avg_heart_rate,
  max_heart_rate: schema.activities.max_heart_rate,
  avg_power: schema.activities.avg_power,
  max_power: schema.activities.max_power,
  avg_speed_mps: schema.activities.avg_speed_mps,
  max_speed_mps: schema.activities.max_speed_mps,
  normalized_speed_mps: schema.activities.normalized_speed_mps,
  normalized_graded_speed_mps: schema.activities.normalized_graded_speed_mps,
} as const;

async function attachActivitySegments<
  T extends Omit<
    Parameters<typeof buildActivityDerivedSummaryMap>[0]["activities"][number],
    "normalized_power" | "segments"
  >,
>(db: DbClient, rows: T[]) {
  const segments = await loadActivitySegmentsByActivityId(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => {
    const activitySegments = segments.get(row.id) ?? [];
    return {
      ...row,
      normalized_power: deriveNormalizedPowerCompatibilityProjectionFromSegments(activitySegments),
      segments: activitySegments,
    };
  });
}

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

async function getAccessibleTrainingPlan(input: {
  db: DbClient;
  planId: string;
  profileId: string;
}): Promise<TrainingPlanRow | null> {
  const result = await input.db.execute(sql<TrainingPlanRow>`
    select *
    from training_plans
    where id = ${input.planId}::uuid
      and (
        profile_id = ${input.profileId}::uuid
        or is_system_template = true
        or content_visibility = 'public'
        or (
          content_visibility = 'followers'
          and exists (
            select 1 from follows f
            where f.follower_id = ${input.profileId}::uuid
              and f.following_id = training_plans.profile_id
              and f.status = 'accepted'
          )
        )
        or exists (
          select 1
          from content_access_grants
          where content_access_grants.content_type = 'training_plan'
            and content_access_grants.content_id = training_plans.id
            and content_access_grants.grantee_profile_id = ${input.profileId}::uuid
            and content_access_grants.access_level = 'read'
            and content_access_grants.revoked_at is null
            and (content_access_grants.expires_at is null or content_access_grants.expires_at > now())
        )
      )
    limit 1
  `);

  return getSqlRows<TrainingPlanRow>(result)[0] ?? null;
}

async function getProfileDefaultContentVisibility(db: DbClient, profileId: string) {
  const [profile] = await db
    .select({ defaultContentVisibility: schema.profiles.default_content_visibility })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .limit(1);

  return profile?.defaultContentVisibility ?? "private";
}

async function _getOwnedTrainingPlan(input: {
  db: DbClient;
  planId: string;
  profileId: string;
}): Promise<TrainingPlanRow | null> {
  const result = await input.db.execute(sql<TrainingPlanRow>`
    select *
    from training_plans
    where id = ${input.planId}::uuid
      and profile_id = ${input.profileId}::uuid
    limit 1
  `);

  return getSqlRows<TrainingPlanRow>(result)[0] ?? null;
}

async function _countOwnedTrainingPlans(db: DbClient, profileId: string): Promise<number> {
  const result = await db.execute(sql<TrainingPlanCountRow>`
    select count(*)::int as value
    from training_plans
    where profile_id = ${profileId}::uuid
  `);

  return Number(getSqlRows<TrainingPlanCountRow>(result)[0]?.value ?? 0);
}

async function _listTrainingPlanLikedIds(input: {
  db: DbClient;
  profileId: string;
  planIds: string[];
}): Promise<string[]> {
  if (input.planIds.length === 0) {
    return [];
  }

  const rows = await input.db
    .select({ entity_id: schema.likes.entity_id })
    .from(schema.likes)
    .where(
      and(
        eq(schema.likes.profile_id, input.profileId),
        eq(schema.likes.entity_type, "training_plan"),
        inArray(schema.likes.entity_id, input.planIds),
      ),
    );

  return rows.map((row) => row.entity_id);
}

async function _hasTrainingPlanLike(input: {
  db: DbClient;
  profileId: string;
  planId: string;
}): Promise<boolean> {
  const rows = await input.db
    .select({ id: schema.likes.id })
    .from(schema.likes)
    .where(
      and(
        eq(schema.likes.profile_id, input.profileId),
        eq(schema.likes.entity_type, "training_plan"),
        eq(schema.likes.entity_id, input.planId),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

function toDayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

function toNextDayStartIso(dateOnly: string): string {
  return toDayStartIso(addDaysDateOnlyUtc(dateOnly, 1));
}

function todayStartIsoUtc(): string {
  return toDayStartIso(formatDateOnlyUtc(new Date()));
}

function _todayDateOnlyUtc(): string {
  return formatDateOnlyUtc(new Date());
}

const applicationScopedScheduleInputSchema = z
  .object({
    schedule_batch_id: z.string().uuid(),
  })
  .strict();

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

type LoadGuidanceMode = "baseline";

type LoadGuidanceSummary = {
  mode: LoadGuidanceMode;
  goal_count: number;
  dated_goal_count: number;
  has_activity_history: boolean;
  weekly_cap_tss: number | null;
  interpretation: string;
};

type ProjectionLoadProvenanceSource =
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
  estimation?: {
    failed_plan_count: number;
    excluded_from_scheduled_load_count: number;
    affected_plan_ids: string[];
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

type CreationConflictItem = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  field_paths: string[];
  suggestions: string[];
};

type ProjectionChartPayload = ProjectionChartPayloadWithDeterministicIds & {
  recovery_segments: ProjectionRecoverySegment[];
  constraint_summary: ProjectionConstraintSummary;
};

type ExpandedProjectionPlan = GoalAnchoredProjectionPlan & { description?: string };

function buildExpandedPlanFromMinimalGoal(
  minimalPlan: MinimalTrainingPlanCreate,
  input?: { startingCtl?: number },
): ExpandedProjectionPlan {
  return buildGoalAnchoredProjectionPlan({
    minimalPlan,
    startingCtl: input?.startingCtl,
  });
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

function hasPlanStructureProjectionAnchor(
  structure: Record<string, unknown> | null | undefined,
  _date: string,
): boolean {
  if (!structure) {
    return false;
  }

  const parsed = trainingPlanSchema.safeParse(structure);
  if (!parsed.success) return false;
  return (
    parsed.data.sessions.length > 0 ||
    (parsed.data.goal_blueprints?.length ?? 0) > 0 ||
    parsed.data.builder_planning_snapshot !== undefined
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
  db?: DbClient;
  planningTimezone: string;
  supabase?: LegacyPlanningReader;
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

  const materializedEvents = materializePlanToEvents(
    input.structure,
    input.startDate,
    input.planningTimezone,
  ).filter((event) => event.event_type === "planned" && typeof event.activity_plan_id === "string");

  const latestScheduledDate =
    materializedEvents
      .map((event: any) => event.scheduled_date)
      .filter((date) => typeof date === "string" && date.length > 0)
      .sort((a: any, b: any) => a.localeCompare(b))
      .at(-1) ?? null;

  const activityPlanIds = [
    ...new Set(materializedEvents.map((event: any) => event.activity_plan_id)),
  ];
  if (activityPlanIds.length === 0) {
    return {
      weeklyTss: null,
      latestScheduledDate,
    };
  }

  if (input.db) {
    const estimationStore = createEventReadRepository(input.db);
    const activityPlans = await input.db
      .select()
      .from(schema.activityPlans)
      .where(inArray(schema.activityPlans.id, activityPlanIds));

    if (activityPlans.length === 0) {
      return {
        weeklyTss: null,
        latestScheduledDate,
      };
    }

    const plansWithEstimations = await getActivityPlansDerivedMetrics(
      activityPlans as any,
      input.db,
      estimationStore,
      input.profileId,
    );

    const estimatedTssByPlanId = new Map(
      plansWithEstimations.map((plan: any) => [
        plan.id,
        getAuthoritativeActivityPlanMetrics(plan).estimated_tss ?? 0,
      ]),
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

  if (!input.supabase) {
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
    plansWithEstimations.map((plan: any) => [
      plan.id,
      getAuthoritativeActivityPlanMetrics(plan).estimated_tss ?? 0,
    ]),
  );

  const dailyTss = new Map<string, number>();
  for (const event of materializedEvents) {
    if (!event.activity_plan_id) {
      continue;
    }

    const estimatedTss = Number(estimatedTssByPlanId.get(event.activity_plan_id) || 0);
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

function resolveBaselineDailyTss(input: {
  date: string;
  blocks: Array<{
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>;
  hasActivityHistory: boolean;
}): number {
  const blockDailyTss = estimateIdealDailyTss(input.date, input.blocks);
  if (blockDailyTss > 0) {
    return input.hasActivityHistory
      ? blockDailyTss
      : Math.min(blockDailyTss, conservativeStarterDailyTss);
  }

  return conservativeStarterDailyTss;
}

function readPlanningSnapshotPreferredWeekdays(
  structure: Record<string, unknown> | null | undefined,
): number[] {
  const parsed = trainingPlanSchema.safeParse(structure);
  return parsed.success
    ? (parsed.data.builder_planning_snapshot?.scheduling.preferred_weekdays ?? [])
    : [];
}

function readDailyRecommendedLoadActivityCategory(
  value: unknown,
): DailyRecommendedLoadActivityCategory | null {
  return value === "run" ||
    value === "bike" ||
    value === "swim" ||
    value === "strength" ||
    value === "other"
    ? value
    : null;
}

function readStructureSessionsForDailyRecommendedLoad(
  structure: Record<string, unknown> | null | undefined,
) {
  const parsed = trainingPlanSchema.safeParse(structure);
  if (!parsed.success) return [];
  const activityCategory = readDailyRecommendedLoadActivityCategory(parsed.data.sport?.[0]);
  return parsed.data.sessions.map((session) => ({
    offsetDays: session.offset_days,
    estimatedTss: null,
    estimatedDurationMinutes: null,
    intentType: null,
    activityCategory,
  }));
}

export function buildBaselineDailyRecommendedTssByDate(input: {
  startDate: string;
  endDate: string;
  structure: Record<string, unknown> | null | undefined;
  blocks: Array<{
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>;
  hasActivityHistory: boolean;
}): Map<string, number> {
  const dates = buildDateRange(input.startDate, input.endDate);
  const weeklyTargets = dates
    .filter((_, index) => index % 7 === 0)
    .map((date, weekIndex) => {
      const rawWeeklyTss = Math.max(0, estimateIdealDailyTss(date, input.blocks) * 7);
      const targetTss = input.hasActivityHistory
        ? rawWeeklyTss
        : Math.min(rawWeeklyTss || conservativeStarterDailyTss * 7, conservativeStarterWeeklyTss);
      return { weekIndex, targetTss };
    });
  const points = buildDailyRecommendedLoad({
    startDate: input.startDate,
    endDate: input.endDate,
    weeklyTargets,
    preferredWeekdays: readPlanningSnapshotPreferredWeekdays(input.structure),
    sessions: readStructureSessionsForDailyRecommendedLoad(input.structure),
  });

  return new Map(
    points.flatMap((point) =>
      point.actionableRecommendation
        ? [[point.date, point.actionableRecommendation.recommendedLoadTss] as const]
        : [],
    ),
  );
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

function _findBlockForDate(
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
  preferenceProfile?: AthletePreferenceProfile;
  noHistoryContext?: NoHistoryAnchorContext;
}): ProjectionChartPayload {
  const { expandedPlan } = input;
  const deterministicProjection = buildDeterministicProjectionPayload(
    buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: input.normalizedCreationConfig,
      starting_ctl: input.startingCtl,
      starting_atl: input.startingAtl,
      prior_inferred_snapshot: input.priorInferredSnapshot,
      preference_profile: input.preferenceProfile,
      no_history_context: input.noHistoryContext,
    }),
  );

  return buildProjectionChartPayloadFromDeterministicProjection({
    expandedPlan,
    deterministicProjection,
  });
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

  const sortedGoals = [...input.expandedPlan.goals].sort((a: any, b: any) =>
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

type ProjectionDashboardSummary = {
  readiness_score: number | null;
  physiological_readiness_score: number | null;
  readiness_confidence: number | null;
  planning_confidence: number | null;
  planning_confidence_reasons: string[];
  readiness_rationale_codes: string[];
  feasibility_band: string | null;
  risk_score: number | null;
  risk_level: string | null;
  risk_flags: string[];
  caps_applied: string[];
  load_resolution_summary: ProjectionChartPayload["load_resolution_summary"] | null;
  dose_recommendation: ProjectionChartPayload["dose_recommendation"] | null;
  sport_load_states: ProjectionChartPayload["sport_load_states"];
  recovery_segments: ProjectionChartPayload["recovery_segments"];
  readiness_points: Array<{
    date: string;
    readiness_score: number;
    predicted_fitness_ctl: number;
  }>;
  microcycles: Array<{
    week_start_date: string;
    week_end_date: string;
    phase: string;
    planned_weekly_tss: number;
    projected_ctl: number;
    constraints: string[];
    recovery_active: boolean;
    demand_floor_tss: number | null;
    demand_gap_unmet_weekly_tss: number | null;
  }>;
  goal_forecasts: Array<{
    profile_goal_id: string;
    projection_goal_id: string;
    title: string;
    target_date: string;
    priority: number;
    readiness_target: number | null;
    readiness_score: number | null;
    state_readiness_score: number | null;
    alignment_loss_0_100: number | null;
    feasibility_band: string;
    limiter_shares: NonNullable<
      NonNullable<ProjectionChartPayload["goal_assessments"]>[number]["limiter_shares"]
    > | null;
    target_scores: NonNullable<ProjectionChartPayload["goal_assessments"]>[number]["target_scores"];
    conflict_notes: string[];
    interference_notes: string[];
  }>;
};

type ScheduleSimulation = ReturnType<typeof simulateReadinessScheduleAdjustment>;

function mapDailyLoadFromDateTotals(map: Map<string, number>): ReadinessDailyLoadInput[] {
  return [...map.entries()]
    .filter(([, tss]) => Number.isFinite(tss) && tss > 0)
    .map(([date, tss]) => ({ date, tss: Math.round(tss * 10) / 10 }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mapScheduledDailyLoadFromDateTotals(
  map: Map<string, number>,
): ScheduledReadinessDailyLoadInput[] {
  return [...map.entries()]
    .filter(([, tss]) => Number.isFinite(tss) && tss > 0)
    .map(([date, tss]) => ({
      date,
      tss: Math.round(tss * 10) / 10,
      confidence: "medium" as const,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mapRecommendedDailyLoadFromTimeline(
  timeline: Array<{ date: string; ideal_tss: number }>,
): ReadinessDailyLoadInput[] {
  return timeline
    .filter((point) => Number.isFinite(point.ideal_tss) && point.ideal_tss > 0)
    .map((point) => ({ date: point.date, tss: Math.round(point.ideal_tss * 10) / 10 }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildScheduleSimulation(input: {
  forecastInput: BuildReadinessForecastTimelineInput;
  recommendation: ScheduleRecommendation | null;
}): ScheduleSimulation | null {
  const recommendation = input.recommendation;
  if (!recommendation?.target_load_delta) {
    return null;
  }

  const boundedDelta =
    recommendation.type === "reduce_load"
      ? Math.max(recommendation.target_load_delta, -90)
      : recommendation.type === "add_load"
        ? Math.min(recommendation.target_load_delta, 90)
        : 0;

  if (Math.abs(boundedDelta) < 5) {
    return null;
  }

  return simulateReadinessScheduleAdjustment({
    forecastInput: input.forecastInput,
    date: recommendation.target_date,
    tssDelta: boundedDelta,
  });
}

function buildReadinessForecastGoals(input: {
  fallbackGoals: Array<{ id: string; name: string; target_date: string }>;
  dashboard: ProjectionDashboardSummary | null;
}): ReadinessForecastGoalInput[] {
  const projectionGoals = input.dashboard?.goal_forecasts ?? [];
  if (projectionGoals.length > 0) {
    return projectionGoals.map((goal) => ({
      goal_id: goal.profile_goal_id,
      title: goal.title,
      target_date: goal.target_date,
      target_readiness_min: null,
      target_readiness_max: null,
    }));
  }

  return input.fallbackGoals.map((goal) => ({
    goal_id: goal.id,
    title: goal.name,
    target_date: goal.target_date,
    target_readiness_min: null,
    target_readiness_max: null,
  }));
}

function buildReadinessForecastReasonCodes(input: {
  hasActualHistory: boolean;
  scheduledDailyLoad: ScheduledReadinessDailyLoadInput[];
  recommendedDailyLoad: ReadinessDailyLoadInput[];
  failedEstimations: unknown[];
  hasDatedGoals: boolean;
}): ForecastConfidenceReasonCode[] {
  const codes: ForecastConfidenceReasonCode[] = [
    ...(!input.hasActualHistory ? ["missing_recent_history" as const] : []),
    ...(input.scheduledDailyLoad.length === 0 ? ["scheduled_path_unavailable" as const] : []),
    ...(input.recommendedDailyLoad.length === 0 ? ["recommended_path_unavailable" as const] : []),
    ...(input.failedEstimations.length > 0 ? ["missing_scheduled_intensity" as const] : []),
    ...(input.scheduledDailyLoad.length > 0 ? ["inferred_scheduled_load" as const] : []),
    ...(!input.hasDatedGoals ? ["missing_goal_specificity" as const] : []),
  ];

  return uniqueReasons(codes) as ForecastConfidenceReasonCode[];
}

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
  activityCategory: CanonicalSport;
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
  activityCategory: CanonicalSport;
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
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  profileId: string;
  startDate: string;
}): Promise<GoalProjectionSource[]> {
  let goalRows: unknown[] = [];

  if (input.db) {
    const result = await input.db.execute(sql<ProfileGoalSqlRow>`
      select
        id,
        profile_id,
        title,
        target_date,
        priority,
        activity_category,
        target_payload
      from profile_goals
      where profile_id = ${input.profileId}::uuid
      order by created_at asc
      limit 40
    `);

    goalRows = getSqlRows<ProfileGoalSqlRow>(result);
  } else if (input.supabase) {
    const { data, error } = await input.supabase
      .from("profile_goals")
      .select("id, profile_id, title, target_date, priority, activity_category, target_payload")
      .eq("profile_id", input.profileId)
      .order("created_at", { ascending: true })
      .limit(40);

    if (error) {
      console.warn(
        "Failed to load profile goals for insight timeline projection fallback.",
        error.message,
      );
      return [];
    }

    goalRows = (data ?? []) as unknown[];
  } else {
    return [];
  }

  const parsedGoals = goalRows.flatMap((item: unknown) => {
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

  return parsedGoals
    .flatMap((goal: ProfileGoal) => {
      const targetDate = goal.target_date;
      if (!dateOnlyPattern.test(targetDate) || targetDate < input.startDate) {
        return [];
      }

      return [{ goal, targetDate }];
    })
    .sort((left: GoalProjectionSource, right: GoalProjectionSource) =>
      left.targetDate.localeCompare(right.targetDate),
    );
}

async function loadProfileTrainingSettingsCreationDefaults(input: {
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  profileId: string;
}): Promise<z.infer<typeof creationNormalizationInputSchema>> {
  const settingsRow = input.db
    ? await readParsedProfileTrainingSettings(input.db, input.profileId)
    : input.supabase
      ? await input.supabase
          .from("profile_training_settings")
          .select("settings")
          .eq("profile_id", input.profileId)
          .maybeSingle()
          .then(({ data, error }: { data: any; error: any }) => (error ? null : data))
      : null;

  if (!settingsRow?.settings) {
    return {};
  }

  const defaults = extractCreationDefaultsFromProfileSettings(settingsRow.settings);

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

function buildProjectionDashboardSummary(input: {
  projectionChart: ProjectionChartPayload;
  rawGoals: GoalProjectionSource[];
}): ProjectionDashboardSummary {
  const assessmentByGoalId = new Map(
    (input.projectionChart.goal_assessments ?? []).map((assessment) => [
      assessment.goal_id,
      assessment,
    ]),
  );

  const goalForecasts = input.rawGoals.map((source, index) => {
    const projectionGoal = input.projectionChart.goal_markers[index];
    const assessment = projectionGoal ? assessmentByGoalId.get(projectionGoal.id) : undefined;

    return {
      profile_goal_id: source.goal.id,
      projection_goal_id: projectionGoal?.id ?? source.goal.id,
      title: source.goal.title,
      target_date: source.targetDate,
      priority: source.goal.priority,
      readiness_target: assessment?.goal_readiness_target ?? null,
      readiness_score: assessment?.goal_readiness_score ?? null,
      state_readiness_score: assessment?.state_readiness_score ?? null,
      alignment_loss_0_100: assessment?.goal_alignment_loss_0_100 ?? null,
      feasibility_band:
        assessment?.feasibility_band ?? input.projectionChart.feasibility_band ?? "stretch",
      limiter_shares: assessment?.limiter_shares ?? null,
      target_scores: assessment?.target_scores ?? [],
      conflict_notes: assessment?.conflict_notes ?? [],
      interference_notes: assessment?.interference_notes ?? [],
    };
  });

  return {
    readiness_score: input.projectionChart.readiness_score ?? null,
    physiological_readiness_score: input.projectionChart.physiological_readiness_score ?? null,
    readiness_confidence: input.projectionChart.readiness_confidence ?? null,
    planning_confidence: input.projectionChart.planning_confidence ?? null,
    planning_confidence_reasons: input.projectionChart.planning_confidence_reasons ?? [],
    readiness_rationale_codes: input.projectionChart.readiness_rationale_codes ?? [],
    feasibility_band: input.projectionChart.feasibility_band ?? null,
    risk_score: input.projectionChart.risk_score ?? null,
    risk_level: input.projectionChart.risk_level ?? null,
    risk_flags: input.projectionChart.risk_flags ?? [],
    caps_applied: input.projectionChart.caps_applied ?? [],
    load_resolution_summary: input.projectionChart.load_resolution_summary ?? null,
    dose_recommendation: input.projectionChart.dose_recommendation ?? null,
    sport_load_states: input.projectionChart.sport_load_states ?? [],
    recovery_segments: input.projectionChart.recovery_segments ?? [],
    readiness_points: (input.projectionChart.display_points ?? input.projectionChart.points).map(
      (point) => ({
        date: point.date,
        readiness_score: point.readiness_score,
        predicted_fitness_ctl: point.predicted_fitness_ctl,
      }),
    ),
    microcycles: input.projectionChart.microcycles.map((microcycle) => ({
      week_start_date: microcycle.week_start_date,
      week_end_date: microcycle.week_end_date,
      phase: microcycle.phase,
      planned_weekly_tss: microcycle.planned_weekly_tss,
      projected_ctl: microcycle.projected_ctl,
      constraints: microcycle.metadata.load_resolution.constraints,
      recovery_active: microcycle.metadata.recovery.active,
      demand_floor_tss: microcycle.metadata.load_resolution.demand_floor_tss,
      demand_gap_unmet_weekly_tss: microcycle.metadata.tss_ramp.demand_gap_unmet_weekly_tss ?? null,
    })),
    goal_forecasts: goalForecasts,
  };
}

async function deriveInsightTimelineProjectionIdealTssByDate(input: {
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
  startDate: string;
}): Promise<{
  idealTssByDate: Map<string, number> | null;
  goalCount: number;
  datedGoalCount: number;
  diagnostics: ProjectionContextDiagnostics;
  dashboard: ProjectionDashboardSummary | null;
}> {
  try {
    const rawGoals = await loadProfileGoalsWithTargetDates({
      db: input.db,
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
        dashboard: null,
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
        dashboard: null,
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
        dashboard: null,
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
      db: input.db,
      supabase: input.supabase,
      profileId: input.profileId,
    });

    const profileContext = await deriveProfileAwareCreationContext({
      db: input.db,
      supabase: input.supabase,
      store: input.store,
      profileId: input.profileId,
    });

    const creationConfig = await evaluateCreationConfig({
      db: input.db,
      supabase: input.supabase,
      store: input.store,
      profileId: input.profileId,
      creationInput,
    });

    const projectionArtifacts = buildCreationProjectionArtifacts({
      minimalPlan: minimalPlanResult.data,
      loadBootstrapState: profileContext.loadBootstrapState,
      finalConfig: creationConfig.finalConfig,
      preferenceProfile: profileContext.preferenceProfile,
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
      dashboard: buildProjectionDashboardSummary({
        projectionChart: projectionArtifacts.projectionChart,
        rawGoals,
      }),
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
      dashboard: null,
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

async function estimateCurrentCtl(input: {
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
}): Promise<number> {
  const { store, profileId } = input;
  const asOf = new Date();
  const since = new Date(asOf);
  since.setDate(since.getDate() - 90);

  const data = input.db
    ? await input.db
        .select(activitySummaryColumns)
        .from(schema.activities)

        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            gte(schema.activities.started_at, since),
          ),
        )
        .orderBy(asc(schema.activities.started_at))
    : null;

  if (!input.db || !data) {
    return 0;
  }

  const activitiesWithSegments = await attachActivitySegments(input.db, data);
  const derivedMap = await buildActivityDerivedSummaryMap({
    store,
    profileId,
    activities: activitiesWithSegments,
  });

  const bootstrap = computeLoadBootstrapState({
    activities: data.map((activity: any) => ({
      occurred_at: activity.started_at,
      tss: derivedMap.get(activity.id)?.tss ?? null,
      duration_seconds:
        deriveActivityDurations(activity).active_seconds ??
        deriveActivityDurations(activity).elapsed_seconds,
    })),
    as_of: asOf.toISOString(),
  });

  return bootstrap.starting_ctl;
}

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
    return value.map((item: any) => canonicalizeForDeterministicToken(item));
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
  canonicalResolutionFingerprint: string;
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
    canonical_resolution_fingerprint: input.canonicalResolutionFingerprint,
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
  preferenceProfile?: AthletePreferenceProfile;
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
    preferenceProfile: input.preferenceProfile,
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
    projectionFeasibility: classifyProjectionFeasibility(projectionChart),
  };
}

async function resolveCanonicalCreationProjection(input: {
  db: DbClient;
  planId: string;
  projection: ExpandedProjectionPlan;
  dailyLoadPoints: ProjectionChartPayload["daily_load_points"];
}) {
  try {
    return await resolveCanonicalTrainingPlan({
      planId: input.planId,
      projection: input.projection,
      dailyLoadPoints: input.dailyLoadPoints ?? [],
      planningTemplateRepository: createPlanningTemplateRepository(input.db),
    });
  } catch (error) {
    if (error instanceof CanonicalTrainingPlanResolutionError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
    }
    throw error;
  }
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
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
  asOfIso?: string;
}) {
  const asOf = input.asOfIso ? new Date(input.asOfIso) : new Date();
  const recentActivitiesCutoff = new Date(asOf);
  recentActivitiesCutoff.setDate(recentActivitiesCutoff.getDate() - 84);

  const recentEffortsCutoff = new Date(asOf);
  recentEffortsCutoff.setDate(recentEffortsCutoff.getDate() - 90);

  const [activitiesResult, effortsResult, profileMetricsResult, profileResult, settingsResult] =
    input.db
      ? await Promise.all([
          input.db
            .select(activitySummaryColumns)
            .from(schema.activities)
            .where(
              and(
                eq(schema.activities.profile_id, input.profileId),
                gte(schema.activities.started_at, recentActivitiesCutoff),
                lte(schema.activities.started_at, asOf),
                lte(schema.activities.finished_at, asOf),
              ),
            )
            .orderBy(sql`${schema.activities.started_at} desc`)
            .limit(300)
            .then((data) => ({ data, error: null })),
          input.db
            .select({
              id: schema.activityEfforts.id,
              activity_id: schema.activityEfforts.activity_id,
              recorded_at: schema.activityEfforts.recorded_at,
              effort_type: schema.activityEfforts.effort_type,
              duration_seconds: schema.activityEfforts.duration_seconds,
              value: schema.activityEfforts.value,
              activity_category: schema.activityEfforts.activity_category,
              unit: schema.activityEfforts.unit,
              source: schema.activityEfforts.source,
              method: schema.activityEfforts.method,
              calculation_version: schema.activityEfforts.calculation_version,
              quality_score: schema.activityEfforts.quality_score,
              provenance: schema.activityEfforts.provenance,
            })
            .from(schema.activityEfforts)
            .where(
              and(
                eq(schema.activityEfforts.profile_id, input.profileId),
                gte(schema.activityEfforts.recorded_at, recentEffortsCutoff),
                lte(schema.activityEfforts.recorded_at, asOf),
              ),
            )
            .orderBy(desc(schema.activityEfforts.recorded_at), desc(schema.activityEfforts.id))
            .limit(200)
            .then((data) => ({ data, error: null })),
          input.db
            .select({
              id: schema.profileMetrics.id,
              metric_type: schema.profileMetrics.metric_type,
              value: schema.profileMetrics.value,
              recorded_at: schema.profileMetrics.recorded_at,
              unit: schema.profileMetrics.unit,
              source: schema.profileMetrics.source,
              method: schema.profileMetrics.method,
              calculation_version: schema.profileMetrics.calculation_version,
              quality_score: schema.profileMetrics.quality_score,
              provenance: schema.profileMetrics.provenance,
            })
            .from(schema.profileMetrics)
            .where(
              and(
                eq(schema.profileMetrics.profile_id, input.profileId),
                lte(schema.profileMetrics.recorded_at, asOf),
              ),
            )
            .orderBy(desc(schema.profileMetrics.recorded_at), desc(schema.profileMetrics.id))
            .then((data) => ({ data, error: null })),
          input.db
            .select({ dob: schema.profiles.dob, gender: schema.profiles.gender })
            .from(schema.profiles)
            .where(eq(schema.profiles.id, input.profileId))
            .limit(1)
            .then((data) => ({ data, error: null })),
          readParsedProfileTrainingSettings(input.db, input.profileId).then((data) => ({
            data,
            error: null,
          })),
        ])
      : await Promise.all([
          input.supabase
            ?.from("activities")
            .select(
              "id, profile_id, started_at, finished_at, elapsed_ms, active_ms, moving_ms, timing_coverage, distance_meters, avg_heart_rate, max_heart_rate, avg_power, max_power, avg_speed_mps, max_speed_mps, normalized_speed_mps, normalized_graded_speed_mps",
            )
            .eq("profile_id", input.profileId)
            .gte("started_at", recentActivitiesCutoff.toISOString())
            .lte("started_at", asOf.toISOString())
            .lte("finished_at", asOf.toISOString())
            .order("started_at", { ascending: false })
            .limit(300),
          input.supabase
            ?.from("activity_efforts")
            .select(
              "id, activity_id, recorded_at, effort_type, duration_seconds, value, activity_category, unit, source, method, calculation_version, quality_score, provenance",
            )
            .eq("profile_id", input.profileId)
            .gte("recorded_at", recentEffortsCutoff.toISOString())
            .lte("recorded_at", asOf.toISOString())
            .order("recorded_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(200),
          input.supabase
            ?.from("profile_metrics")
            .select(
              "id, metric_type, value, recorded_at, unit, source, method, calculation_version, quality_score, provenance",
            )
            .eq("profile_id", input.profileId)
            .lte("recorded_at", asOf.toISOString())
            .order("recorded_at", { ascending: false })
            .order("id", { ascending: false }),
          input.supabase?.from("profiles").select("dob, gender").eq("id", input.profileId).limit(1),
          input.supabase
            ?.from("profile_training_settings")
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
  const activitiesWithSegments = input.db
    ? await attachActivitySegments(input.db, activityRows)
    : [];
  const segmentDerived = await buildActivitySegmentDerivedSummaries({
    store: input.store,
    profileId: input.profileId,
    activities: activitiesWithSegments,
  });

  const completedActivities = activitiesWithSegments.flatMap((activity) =>
    orderedActivitySegments(activity.segments).map((segment) => {
      const derived = segmentDerived.find((candidate) => candidate.segment_id === segment.id);
      return {
        occurred_at: new Date(
          activity.started_at.getTime() + segment.start_offset_ms,
        ).toISOString(),
        activity_category: segment.category,
        duration_seconds:
          (segment.active_ms ?? segment.end_offset_ms - segment.start_offset_ms) / 1_000,
        tss: derived?.tss ?? null,
        intensity_factor: derived?.intensity_factor ?? null,
      };
    }),
  );

  const activityCounts = completedActivities.reduce(
    (acc: Record<string, number>, activity: any) => {
      const category = activity.activity_category ?? "other";
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const activityCountValues = Object.values(activityCounts) as number[];
  const totalActivityCount = activityCountValues.reduce(
    (sum: number, count: number) => sum + count,
    0,
  );
  const categoryMix =
    totalActivityCount > 0
      ? Object.fromEntries(
          (Object.entries(activityCounts) as Array<[string, number]>).map(([category, count]) => [
            category,
            Number((count / totalActivityCount).toFixed(3)),
          ]),
        )
      : undefined;

  const primaryCategory =
    Object.entries(activityCounts).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] ?? undefined;

  const efforts = filterSupersededProfileOverrides(
    effortsResult.error ? [] : (effortsResult.data ?? []),
    (effort: any) =>
      `${effort.activity_category}:${effort.effort_type}:${effort.duration_seconds}:${effort.unit}`,
  ).map((effort: any) => ({
    ...effort,
    recorded_at: effort.recorded_at,
    effort_type: effort.effort_type,
    duration_seconds: effort.duration_seconds,
    value: effort.value,
    activity_category: effort.activity_category,
  }));

  const profileMetricsRows = filterObservationsAfterLatestTombstone(
    profileMetricsResult.error ? [] : (profileMetricsResult.data ?? []),
    (metric: any) => metric.metric_type,
  );
  // Planning context uses the same cross-sport common Load history as Trends,
  // rather than a nullable legacy TSS fitness snapshot.
  const commonLoadHistory = input.db
    ? await readCurrentProfileCommonLoadHistory({
        db: input.db,
        profileId: input.profileId,
        now: asOf,
      })
    : null;
  const currentCommonLoad =
    commonLoadHistory?.result.status === "available"
      ? (commonLoadHistory.result.points.at(-1) ?? null)
      : null;

  const effectiveAthleteSnapshot = buildEffectiveAthleteSnapshot({
    asOf,
    profile: {
      dob: profileResult.data?.[0]?.dob ?? null,
      gender:
        profileResult.data?.[0]?.gender === "male" ||
        profileResult.data?.[0]?.gender === "female" ||
        profileResult.data?.[0]?.gender === "other"
          ? profileResult.data[0].gender
          : null,
    },
    profileMetrics: profileMetricsRows.map((metric) => ({
      metric_type: metric.metric_type,
      value: Number(metric.value),
      unit:
        metric.unit ??
        (metric.metric_type === "ftp" ? "W" : metric.metric_type === "lthr" ? "bpm" : "kg"),
      recorded_at: metric.recorded_at,
      source: metric.source,
      method: metric.method,
      calculation_version: metric.calculation_version,
      quality_score: metric.quality_score === null ? undefined : metric.quality_score,
      provenance:
        typeof metric.provenance === "object" && metric.provenance !== null
          ? metric.provenance
          : undefined,
    })),
    currentFitness:
      currentCommonLoad === null
        ? null
        : {
            ctl: currentCommonLoad.longTermLoad,
            atl: currentCommonLoad.recentLoad,
            tsb: currentCommonLoad.loadBalance,
            recorded_at: commonLoadHistory?.computedAt,
          },
    activityEfforts: efforts.flatMap((effort) => {
      const value = Number(effort.value);
      const recordedAt = new Date(effort.recorded_at);
      if (
        (effort.effort_type !== "power" && effort.effort_type !== "speed") ||
        !Number.isFinite(value) ||
        typeof effort.unit !== "string" ||
        effort.unit.length === 0 ||
        Number.isNaN(recordedAt.getTime())
      ) {
        return [];
      }
      return [
        {
          activity_category: effort.activity_category,
          effort_type: effort.effort_type,
          duration_seconds: effort.duration_seconds,
          value,
          unit: effort.unit,
          recorded_at: recordedAt,
          activity_id: effort.activity_id,
          source: effort.source,
          method: effort.method,
          calculation_version: effort.calculation_version,
          quality_score: effort.quality_score === null ? undefined : effort.quality_score,
          provenance:
            typeof effort.provenance === "object" && effort.provenance !== null
              ? effort.provenance
              : undefined,
        },
      ];
    }),
    coverage: {
      profileMetrics: profileMetricsResult.error ? "unknown" : "complete",
      activityEfforts: effortsResult.error
        ? "unknown"
        : (effortsResult.data?.length ?? 0) >= 200
          ? "possibly_truncated"
          : "complete",
    },
  });
  const athleteContext = createAthletePlanningContextFromSnapshot(effectiveAthleteSnapshot);

  const profileMetrics = {
    ftp:
      athleteContext.physiology.ftpWatts.value === null
        ? null
        : Math.round(athleteContext.physiology.ftpWatts.value),
    threshold_hr: athleteContext.physiology.thresholdHeartRateBpm.value,
    weight_kg: athleteContext.body.weightKg.value,
    lthr: athleteContext.physiology.thresholdHeartRateBpm.value,
  };

  const settings = parseProfileTrainingSettings(settingsResult.data?.settings);
  const preferenceProfile = settings ?? undefined;
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
    athleteContext,
    contextSummary,
    loadBootstrapState,
    globalCtlOverride,
    globalAtlOverride,
    baselineFitnessOverride,
    preferenceProfile,
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
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  store: ReturnType<typeof createActivityAnalysisStore>;
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
    db: input.db,
    supabase: input.supabase,
    store: input.store,
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
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  profileId: string;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
}): Promise<z.infer<typeof creationNormalizationInputSchema>> {
  const settingsRow = input.db
    ? await readParsedProfileTrainingSettings(input.db, input.profileId)
    : input.supabase
      ? await input.supabase
          .from("profile_training_settings")
          .select("settings")
          .eq("profile_id", input.profileId)
          .maybeSingle()
          .then(({ data, error }: { data: any; error: any }) => (error ? null : data))
      : null;

  if (!settingsRow?.settings) {
    return input.creationInput;
  }

  const profileDefaults = extractCreationDefaultsFromProfileSettings(settingsRow.settings);
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
  db,
  supabase,
  store,
  profileId,
  input,
}: {
  db?: DbClient;
  supabase?: LegacyPlanningReader;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
  input: {
    training_plan_id?: string;
    start_date: string;
    end_date: string;
    timezone: string;
    schedule_adjustment?: {
      date: string;
      tss_delta: number;
      comparison_date?: string;
    };
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

  if (!db && !supabase) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database client unavailable",
    });
  }

  const fallbackSupabase = supabase;

  let plan: Record<string, unknown> | null = null;

  if (input.training_plan_id) {
    const fetchedPlan = db
      ? await getAccessibleTrainingPlan({ db, planId: input.training_plan_id, profileId })
      : await fallbackSupabase
          ?.from("training_plans")
          .select("*")
          .eq("id", input.training_plan_id)
          .or(`profile_id.eq.${profileId},is_system_template.eq.true,content_visibility.eq.public`)
          .single()
          .then(({ data, error }: { data: any; error: any }) => (error ? null : data));

    if (!fetchedPlan) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Training plan not found",
      });
    }

    plan = fetchedPlan as Record<string, unknown>;
  }

  const parsedStructure = trainingPlanSchema.safeParse(plan?.structure);
  if (plan && !parsedStructure.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Training plan structure is not canonical version 1",
      cause: parsedStructure.error,
    });
  }
  const canonicalStructure = parsedStructure.success ? parsedStructure.data : null;
  const structureStartDate =
    canonicalStructure?.builder_planning_snapshot?.scheduling.start_date ?? null;
  const goals = (canonicalStructure?.goal_blueprints ?? []).flatMap((goal, index) => {
    if (goal.target_offset_days === undefined || !structureStartDate) return [];
    const targetDate = addDaysDateOnlyUtc(structureStartDate, goal.target_offset_days);
    return [
      {
        id: deterministicUuidFromSeed(
          `${plan?.id ?? "no-plan"}|goal-blueprint|${index}|${goal.title}|${targetDate}`,
        ),
        name: goal.title,
        target_date: targetDate,
        priority: goal.priority,
      },
    ];
  });
  const blocks: Array<z.infer<typeof blockSnapshotSchema>> = [];

  const planWarnings: string[] = [];

  const estimatedCurrentCtl = await estimateCurrentCtl({ db, supabase, store, profileId });

  const targetCtlAtPeak = undefined;

  const blockRampWarnings = collectBlockRampWarnings(blocks);
  const assessments = buildPlanAssessments({
    goals,
    referenceDate: formatDateOnlyUtc(new Date()),
    currentCtl: estimatedCurrentCtl,
    targetCtlAtPeak,
    planWarnings,
    blockRampWarnings,
  });

  const endExclusiveIso = toNextDayStartIso(input.end_date);
  const projectionInputs = db
    ? await createEventReadRepository(db).getAccessibleTrainingPlanProjection({
        profileId,
        trainingPlanId: input.training_plan_id,
        startDateIso: toDayStartIso(input.start_date),
        endDateExclusiveIso: endExclusiveIso,
      })
    : null;

  const plannedActivitiesRaw = projectionInputs
    ? projectionInputs.plannedActivities
    : await (async () => {
        let plannedActivitiesQuery: any = fallbackSupabase
          ?.from("events")
          .select(
            "id, starts_at, scheduled_date, training_plan_id, activity_plan:activity_plans (*)",
          )
          .eq("profile_id", profileId)
          .eq("event_type", plannedEventType)
          .gte("starts_at", toDayStartIso(input.start_date))
          .lt("starts_at", endExclusiveIso);

        if (input.training_plan_id) {
          plannedActivitiesQuery = plannedActivitiesQuery.eq(
            "training_plan_id",
            input.training_plan_id,
          );
        }

        const { data } = await plannedActivitiesQuery;

        return (
          (data || []) as Array<{
            starts_at?: string | null;
            scheduled_date?: string | null;
            training_plan_id?: string | null;
            activity_plan?: unknown;
          }>
        ).map((item: any) => ({
          ...item,
          scheduled_date:
            item.scheduled_date ??
            (item.starts_at ? getScheduledDateKey(item.starts_at, "UTC") : ""),
          activity_plan: item.activity_plan as any,
        }));
      })();

  const activityPlans = (plannedActivitiesRaw || [])
    .map((item: any) => item.activity_plan)
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const ownedActivityPlansRaw = await loadOwnedActivityPlansForScheduleGap({
    db,
    supabase: fallbackSupabase,
    profileId,
  });
  const estimationPlans = [...activityPlans, ...ownedActivityPlansRaw].filter(
    (plan, index, plans) => plans.findIndex((candidate) => candidate.id === plan.id) === index,
  );

  const estimationReader = db ? createEventReadRepository(db) : fallbackSupabase!;
  const plansWithEstimations =
    estimationPlans.length > 0
      ? db
        ? await getActivityPlansDerivedMetrics(
            estimationPlans as any,
            db,
            estimationReader as any,
            profileId,
          )
        : await addEstimationToPlans(estimationPlans, estimationReader as any, profileId)
      : [];
  const failedEstimations = plansWithEstimations.filter(
    (item: any) => item.counts_toward_aggregation === false,
  );

  const estimatedTssByPlanId = new Map(
    plansWithEstimations
      .filter((item: any) => item.counts_toward_aggregation !== false)
      .map((item: any) => [item.id, getAuthoritativeActivityPlanMetrics(item).estimated_tss]),
  );

  const scheduledByDate = new Map<string, number>();
  for (const planned of plannedActivitiesRaw || []) {
    const scheduledDate = planned.scheduled_date;
    if (!scheduledDate) continue;

    const planId = planned.activity_plan?.id;
    const estimatedTss = planId ? Number(estimatedTssByPlanId.get(planId) || 0) : 0;
    scheduledByDate.set(scheduledDate, (scheduledByDate.get(scheduledDate) || 0) + estimatedTss);
  }

  const actualActivityParents = db
    ? await db
        .select(activitySummaryColumns)
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            gte(schema.activities.started_at, new Date(`${input.start_date}T00:00:00.000Z`)),
            lt(schema.activities.started_at, new Date(endExclusiveIso)),
          ),
        )
    : [];
  const actualActivities = db ? await attachActivitySegments(db, actualActivityParents) : [];
  const actualSegments = await buildActivitySegmentDerivedSummaries({
    store,
    profileId,
    activities: actualActivities,
  });

  const actualByDate = new Map<string, number>();
  for (const activity of actualActivities) {
    const date = formatDateOnlyUtc(new Date(activity.started_at));
    const tss = actualSegments
      .filter((segment) => segment.activity_id === activity.id)
      .reduce((sum, segment) => sum + (segment.tss ?? 0), 0);
    actualByDate.set(date, (actualByDate.get(date) || 0) + tss);
  }

  const projectionGoalContext = await deriveInsightTimelineProjectionIdealTssByDate({
    db,
    supabase,
    store,
    profileId,
    startDate: input.start_date,
  });
  const projectionIdealTssByDate = projectionGoalContext.idealTssByDate;
  const hasActivityHistory = (actualActivities?.length || 0) > 0;
  const hasGoalProjectionCurve = (projectionIdealTssByDate?.size ?? 0) > 0;
  const loadGuidanceMode: LoadGuidanceMode = "baseline";
  const hasPlanStructureTargets = hasPlanStructureProjectionAnchor(
    canonicalStructure as Record<string, unknown> | null,
    input.start_date,
  );

  const timelineDates = buildDateRange(input.start_date, input.end_date);
  const baselineRecommendedTssByDate = buildBaselineDailyRecommendedTssByDate({
    startDate: input.start_date,
    endDate: input.end_date,
    structure: canonicalStructure as Record<string, unknown> | null,
    blocks,
    hasActivityHistory,
  });
  const timeline = timelineDates.map((date) => {
    const scheduled_tss = Math.round((scheduledByDate.get(date) || 0) * 10) / 10;
    const ideal_tss =
      baselineRecommendedTssByDate.get(date) ??
      resolveBaselineDailyTss({
        date,
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

  const primaryCategory = parsedStructure.success
    ? (parsedStructure.data.sport?.[0] ?? "run")
    : "run";

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

  const loadProvenanceSource: ProjectionLoadProvenanceSource = hasPlanStructureTargets
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
    ...(failedEstimations.length > 0
      ? {
          estimation: {
            failed_plan_count: failedEstimations.length,
            excluded_from_scheduled_load_count: failedEstimations.length,
            affected_plan_ids: failedEstimations.map((item: any) => item.id),
          },
        }
      : {}),
  };

  const loadGuidance: LoadGuidanceSummary = {
    mode: loadGuidanceMode,
    goal_count: projectionGoalContext.goalCount,
    dated_goal_count: projectionGoalContext.datedGoalCount,
    has_activity_history: hasActivityHistory,
    weekly_cap_tss:
      loadGuidanceMode === "baseline" && !hasActivityHistory ? conservativeStarterWeeklyTss : null,
    interpretation:
      projectionGoalContext.datedGoalCount > 0
        ? "Goals are evaluated separately; recommended load remains a baseline estimate instead of aggregating goal-derived planned load."
        : hasActivityHistory
          ? "Recommended load is a baseline estimate from your recent training and active plan, not a dated goal."
          : "Recommended load is a conservative baseline estimate because no dated goal or usable history was found.",
  };

  const today = formatDateOnlyUtc(new Date());
  const actualDailyLoad = mapDailyLoadFromDateTotals(actualByDate);
  const scheduledDailyLoad = mapScheduledDailyLoadFromDateTotals(scheduledByDate);
  const recommendedDailyLoad = mapRecommendedDailyLoadFromTimeline(timeline);
  const readinessForecastInput: BuildReadinessForecastTimelineInput = {
    startDate: input.start_date,
    endDate: input.end_date,
    today,
    baseline: buildReadinessForecastBaseline({
      startDate: input.start_date,
      today,
      hasActualHistory: actualDailyLoad.length > 0,
      estimatedCurrentCtl,
      projectionDashboard: projectionGoalContext.dashboard,
      readinessSummaryScore: readinessSummary.score,
    }),
    actualDailyLoad,
    scheduledDailyLoad,
    recommendedDailyLoad,
    goals: buildReadinessForecastGoals({
      fallbackGoals: goals,
      dashboard: projectionGoalContext.dashboard,
    }),
    confidenceReasonCodes: buildReadinessForecastReasonCodes({
      hasActualHistory: actualDailyLoad.length > 0,
      scheduledDailyLoad,
      recommendedDailyLoad,
      failedEstimations,
      hasDatedGoals: projectionGoalContext.datedGoalCount > 0,
    }),
  };
  const readinessForecast = buildReadinessForecastTimeline(readinessForecastInput);
  const loadComparison = buildWeeklyLoadComparison({
    timeline,
    goals,
    microcycles: projectionGoalContext.dashboard?.microcycles ?? null,
  });
  const upcomingImpact = buildUpcomingActivityImpact({
    plannedActivities: plannedActivitiesRaw || [],
    estimatedTssByPlanId,
    today,
    horizonEnd: addDaysDateOnlyUtc(today, 14),
    recommendedByDate: new Map(timeline.map((point) => [point.date, point.ideal_tss])),
  });
  const scheduleRecommendation = buildScheduleRecommendation({
    today,
    readinessForecast,
    loadComparison,
    upcomingImpact,
  });
  const activityPlanMatchTarget = resolveScheduleGapActivityPlanMatchTarget({
    today,
    scheduleRecommendation,
    loadComparison,
  });
  const estimatedPlansById = new Map(plansWithEstimations.map((plan: any) => [plan.id, plan]));
  const ownedActivityPlans =
    activityPlanMatchTarget.targetTssDelta && activityPlanMatchTarget.targetTssDelta > 0
      ? ownedActivityPlansRaw.map((plan) => estimatedPlansById.get(plan.id) ?? plan)
      : [];
  const activityPlanMatches = buildScheduleGapActivityPlanMatches({
    targetDate: activityPlanMatchTarget.targetDate,
    targetTssDelta: activityPlanMatchTarget.targetTssDelta,
    primaryCategory,
    plans: ownedActivityPlans,
    today,
  });
  const scheduleSimulation = input.schedule_adjustment
    ? simulateReadinessScheduleAdjustment({
        forecastInput: readinessForecastInput,
        date: input.schedule_adjustment.date,
        tssDelta: input.schedule_adjustment.tss_delta,
        comparisonDate: input.schedule_adjustment.comparison_date,
      })
    : buildScheduleSimulation({
        forecastInput: readinessForecastInput,
        recommendation: scheduleRecommendation,
      });

  return {
    window: {
      start_date: input.start_date,
      end_date: input.end_date,
      timezone: input.timezone,
    },
    plan_feasibility: assessments.planFeasibility,
    goal_feasibility: assessments.goalFeasibility.map((assessment) => ({
      ...assessment,
      target_date: goals.find((goal) => goal.id === assessment.goal_id)?.target_date ?? null,
    })),
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
    projection_dashboard: projectionGoalContext.dashboard,
    adherence_summary: adherenceSummary,
    readiness_summary: readinessSummary,
    load_guidance: loadGuidance,
    readiness_forecast: readinessForecast,
    load_comparison: loadComparison,
    upcoming_impact: upcomingImpact,
    schedule_recommendation: scheduleRecommendation,
    activity_plan_matches: activityPlanMatches,
    schedule_simulation: scheduleSimulation,
    timeline,
  };
}

export const trainingPlansProcedures = {
  // ------------------------------
  // Get a training plan (by ID or active plan)
  // ------------------------------
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return getTrainingPlanUseCase({
        db,
        id: input?.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
      });
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
          visibility: trainingPlanTemplateVisibilitySchema.optional(),
          search: z.string().trim().max(80).optional(),
          limit: z.number().int().min(1).max(50).default(25),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return listTrainingPlansUseCase({
        db,
        profileId: ctx.session.user.id,
        query: input,
        repository: createTrainingPlanRepository(db),
      });
    }),

  // ------------------------------
  // Create new training plan
  // Can create multiple plans; if is_active, deactivates others
  // ------------------------------
  create: protectedProcedure
    .input(trainingPlanCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return createTrainingPlanUseCase({
        db,
        planningTemplateRepository: createPlanningTemplateRepository(db),
        profileId: ctx.session.user.id,
        values: input,
      });
    }),

  // ------------------------------
  // Preview normalized creation config + feasibility/safety
  // ------------------------------
  previewCreationConfig: protectedProcedure
    .input(previewCreationConfigRouterInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const creationInputWithProfileDefaults = await withProfileTrainingSettingsDefaults({
        db,
        profileId: ctx.session.user.id,
        creationInput: input.creation_input,
      });
      const result = await previewCreationConfigUseCase({
        profileId: ctx.session.user.id,
        creationContextReader: db,
        params: {
          ...input,
          creation_input: creationInputWithProfileDefaults,
        },
        repository: createTrainingPlanRepository(db),
        deps: {
          enforceCreationConfigFeatureEnabled,
          enforceNoAutonomousPostCreateMutation,
          evaluateCreationConfig: ({ creationContextReader, ...params }) =>
            evaluateCreationConfig({
              db: creationContextReader,
              ...params,
              store: createActivityAnalysisStore(db),
            }),
          buildCreationProjectionArtifacts: buildCreationProjectionArtifacts as any,
          buildCreationPreviewSnapshotToken: buildCreationPreviewSnapshotToken as any,
          deriveProjectionDrivenConflicts: deriveProjectionDrivenConflicts as any,
          resolveCanonicalTrainingPlan: ({ planId, projection, dailyLoadPoints }) =>
            resolveCanonicalCreationProjection({
              db,
              planId,
              projection: projection as ExpandedProjectionPlan,
              dailyLoadPoints: dailyLoadPoints as ProjectionChartPayload["daily_load_points"],
            }),
          previewSnapshotVersion: CREATION_PREVIEW_SNAPSHOT_VERSION,
        },
      });

      return result as unknown as PreviewCreationConfigResponse;
    }),

  // ------------------------------
  // Canonical insight timeline (MVP deterministic baseline)
  // ------------------------------
  getInsightTimeline: protectedProcedure
    .input(insightTimelineInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return getPlanTabProjectionService({
        db,
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        input,
      });
    }),

  // ------------------------------
  // Update training plan
  // ------------------------------
  update: protectedProcedure
    .input(trainingPlanUpdateMutationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return updateTrainingPlanUseCase({
        db,
        planningTemplateRepository: createPlanningTemplateRepository(db),
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
        values: input,
      });
    }),

  // ------------------------------
  // Delete training plan (cascades to delete planned events)
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return deleteTrainingPlanUseCase({
        db,
        id: input.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
      });
    }),

  duplicate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        newName: z.string().min(1, "Plan name is required").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return duplicateTrainingPlanUseCase({
        db,
        id: input.id,
        newName: input.newName,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
      });
    }),

  // ------------------------------
  // Get training plan by ID (for verification)
  // ------------------------------
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return getTrainingPlanByIdUseCase({
        db,
        id: input.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
      });
    }),

  // ------------------------------
  // Get current training status (CTL/ATL/TSB)
  // ------------------------------
  getCurrentStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);
    const plan = await getCurrentStatusTrainingPlanUseCase({
      profileId: ctx.session.user.id,
      repository: createTrainingPlanRepository(db),
    });

    const today = new Date();
    const [planningProfile] = await db
      .select({ planningTimezone: schema.profiles.planning_timezone })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, ctx.session.user.id))
      .limit(1);
    const parsedPlanningTimezone = ianaTimezoneSchema.safeParse(planningProfile?.planningTimezone);
    // Preserve the effective-load use case's explicit unavailable response for a
    // missing/invalid profile timezone while retaining deterministic legacy reads.
    const planningTimezone = parsedPlanningTimezone.success ? parsedPlanningTimezone.data : "UTC";
    const weekBounds = getCurrentPlanningWeek(today, planningTimezone);
    const commonLoadHistory = await readCurrentProfileCommonLoadHistory({
      db,
      profileId: ctx.session.user.id,
      now: today,
    });
    const availableLoadHistory =
      commonLoadHistory.result.status === "available" ? commonLoadHistory.result : null;
    const latestLoadState = availableLoadHistory?.points.at(-1) ?? null;

    // Get this week's progress
    const weekStartDate = weekBounds.startDate;
    const weekEndDate = weekBounds.endDate;
    // This is the primary status/progress source. It resolves completed activity
    // Load and remaining scheduled Load with server-owned effective composition;
    // unavailable inputs stay unavailable rather than becoming zero.
    const effectiveWeekLoad = await getEffectivePlanLoad({
      db,
      profileId: ctx.session.user.id,
      repository: createEventReadRepository(db),
      request: { startDate: weekStartDate, endDate: weekEndDate },
    });

    // Get completed activities this week
    const weekActivities = await db
      .select(activitySummaryColumns)
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.profile_id, ctx.session.user.id),
          gte(schema.activities.started_at, weekBounds.startInstant),
          lt(schema.activities.started_at, weekBounds.endExclusiveInstant),
        ),
      );

    const weekActivitiesWithSegments = await attachActivitySegments(db, weekActivities);
    const weekActivitySegments = await buildActivitySegmentDerivedSummaries({
      store: createActivityAnalysisStore(db),
      profileId: ctx.session.user.id,
      activities: weekActivitiesWithSegments,
    });

    const completedWeeklyLoad = summarizeSegmentTss(
      weekActivitySegments,
      new Set(weekActivities.map((activity) => activity.id)),
    );
    const completedWeeklyTSS = completedWeeklyLoad.tss;

    // Get planned activities this week with their activity plans
    const plannedActivitiesEvents = await db
      .select({
        starts_at: schema.events.starts_at,
        scheduled_date: schema.events.scheduled_date,
        activity_plan: schema.activityPlans,
      })
      .from(schema.events)

      .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
      .where(
        and(
          eq(schema.events.profile_id, ctx.session.user.id),
          eq(schema.events.event_type, plannedEventType),
          gte(schema.events.starts_at, weekBounds.startInstant),
          lt(schema.events.starts_at, weekBounds.endExclusiveInstant),
        ),
      );

    const plannedActivities = plannedActivitiesEvents.map((item: any) => ({
      ...item,
      starts_at: item.starts_at.toISOString(),
      scheduled_date:
        item.scheduled_date ?? getScheduledDateKey(item.starts_at.toISOString(), "UTC"),
    }));

    // Extract activity plans and add estimations
    const activityPlans = (plannedActivities || [])
      .map((pa: any) => pa.activity_plan)
      .filter((plan: unknown): plan is NonNullable<typeof plan> => plan !== null);

    const estimationStore = createEventReadRepository(db);
    const plansWithEstimations =
      activityPlans.length > 0
        ? await getActivityPlansDerivedMetrics(
            activityPlans as any,
            db,
            estimationStore,
            ctx.session.user.id,
          )
        : [];

    const plannedWeeklyTSS = plansWithEstimations.reduce(
      (sum, plan) => sum + (plan.authoritative_metrics.estimated_tss ?? 0),
      0,
    );

    const totalPlannedActivities = plannedActivities?.length || 0;

    // Count completed activities this week
    const completedActivitiesCount = weekActivities.length;

    // Get upcoming activities (next 5 days)
    const fiveDaysFromNow = new Date(today);
    fiveDaysFromNow.setDate(today.getDate() + 5);

    const todayDate = today.toISOString().split("T")[0] || "";
    const fiveDaysFromNowDate = fiveDaysFromNow.toISOString().split("T")[0] || "";

    const upcomingActivitiesEventsRaw = await db
      .select({
        id: schema.events.id,
        starts_at: schema.events.starts_at,
        scheduled_date: schema.events.scheduled_date,
        activity_plan: schema.activityPlans,
      })
      .from(schema.events)

      .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
      .where(
        and(
          eq(schema.events.profile_id, ctx.session.user.id),
          eq(schema.events.event_type, plannedEventType),
          gte(schema.events.starts_at, new Date(toDayStartIso(todayDate))),
          lt(schema.events.starts_at, new Date(toNextDayStartIso(fiveDaysFromNowDate))),
        ),
      )
      .orderBy(asc(schema.events.starts_at))
      .limit(5);

    const upcomingActivitiesRaw = upcomingActivitiesEventsRaw.map((item: any) => ({
      ...item,
      starts_at: item.starts_at.toISOString(),
      scheduled_date:
        item.scheduled_date ?? getScheduledDateKey(item.starts_at.toISOString(), "UTC"),
    }));

    // Add estimations to upcoming activity plans
    const upcomingPlans = (upcomingActivitiesRaw || [])
      .map((pa: any) => pa.activity_plan)
      .filter((plan: unknown): plan is NonNullable<typeof plan> => plan !== null);

    const upcomingPlansWithEstimations =
      upcomingPlans.length > 0
        ? await getActivityPlansDerivedMetrics(
            upcomingPlans as any,
            db,
            estimationStore,
            ctx.session.user.id,
          )
        : [];
    const upcomingPlansById = new Map(upcomingPlansWithEstimations.map((plan) => [plan.id, plan]));

    // Map back to planned activities structure with estimated values
    const upcomingActivities =
      upcomingActivitiesRaw?.map((pa: any) => {
        const estimatedPlan = pa.activity_plan?.id
          ? upcomingPlansById.get(pa.activity_plan.id)
          : undefined;
        const metrics = getAuthoritativeActivityPlanMetrics(estimatedPlan);
        return {
          id: pa.id,
          scheduled_date: pa.scheduled_date,
          activity_plan: estimatedPlan
            ? {
                id: estimatedPlan.id,
                name: estimatedPlan.name,
                activity_category: estimatedPlan.activity_category,
                authoritative_metrics: estimatedPlan.authoritative_metrics,
                estimated_duration: metrics.estimated_duration,
                estimated_tss: metrics.estimated_tss,
              }
            : null,
        };
      }) || [];

    if (plan && !trainingPlanSchema.safeParse(plan.structure).success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Training plan structure is not canonical version 1",
      });
    }
    const targetTSS = plannedWeeklyTSS;

    return {
      asOf: commonLoadHistory.computedAt,
      weekBounds,
      loadHistory: commonLoadHistory.result,
      currentLoadStatus:
        latestLoadState === null || availableLoadHistory === null
          ? null
          : {
              longTermLoad: Math.round(latestLoadState.longTermLoad * 10) / 10,
              recentLoad: Math.round(latestLoadState.recentLoad * 10) / 10,
              loadBalance: Math.round(latestLoadState.loadBalance * 10) / 10,
              loadBalanceStatus: getFormStatus(latestLoadState.loadBalance),
              recordedAt: commonLoadHistory.computedAt,
              maturity: availableLoadHistory.maturity.status,
              coverageStatus: availableLoadHistory.coverageStatus,
            },
      /** @deprecated Use currentLoadStatus.longTermLoad. */
      ctl: latestLoadState === null ? null : Math.round(latestLoadState.longTermLoad * 10) / 10,
      /** @deprecated Use currentLoadStatus.recentLoad. */
      atl: latestLoadState === null ? null : Math.round(latestLoadState.recentLoad * 10) / 10,
      /** @deprecated Use currentLoadStatus.loadBalance. */
      tsb: latestLoadState === null ? null : Math.round(latestLoadState.loadBalance * 10) / 10,
      /** @deprecated Use currentLoadStatus.loadBalanceStatus. */
      form: latestLoadState === null ? null : getFormStatus(latestLoadState.loadBalance),
      commonWeekProgress:
        effectiveWeekLoad.status === "available"
          ? {
              status: effectiveWeekLoad.effective.status,
              completed: effectiveWeekLoad.completed,
              remaining: effectiveWeekLoad.remaining,
              tentative: effectiveWeekLoad.tentative,
              effective: effectiveWeekLoad.effective,
              sourceCounts: effectiveWeekLoad.sourceCounts,
            }
          : {
              status: "unavailable" as const,
              reason: effectiveWeekLoad.reason,
              sourceCounts: effectiveWeekLoad.sourceCounts,
            },
      legacyTssWeekProgress: {
        completedTSS: Math.round(completedWeeklyTSS * 10) / 10,
        tssComplete: completedWeeklyLoad.complete,
        plannedTSS: Math.round(plannedWeeklyTSS * 10) / 10,
        targetTSS: Math.round(targetTSS * 10) / 10,
        completedActivities: completedActivitiesCount || 0,
        totalPlannedActivities,
      },
      /** @deprecated Use legacyTssWeekProgress until common planned-load migration lands. */
      weekProgress: {
        completedTSS: Math.round(completedWeeklyTSS * 10) / 10,
        tssComplete: completedWeeklyLoad.complete,
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
      const db = getRequiredDb(ctx);
      // Get the training plan
      const plan = await getAccessibleTrainingPlan({
        db,
        planId: input.id,
        profileId: ctx.session.user.id,
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const parsedStructure = trainingPlanSchema.safeParse(plan.structure);
      if (!parsedStructure.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan structure is not canonical version 1",
          cause: parsedStructure.error,
        });
      }
      const structure = parsedStructure.data;
      const [profile] = await db
        .select({ planningTimezone: schema.profiles.planning_timezone })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, ctx.session.user.id))
        .limit(1);

      const structuredWeeklyTss = await estimateWeeklyTssFromStructuredActivities({
        db,
        planningTimezone: (() => {
          const parsed = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
          if (parsed.success) return parsed.data;
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A valid planning timezone is required for training plan projections.",
          });
        })(),
        profileId: ctx.session.user.id,
        structure,
        startDate: structure.builder_planning_snapshot?.scheduling.start_date ?? input.start_date,
      });

      const derivedWeeklyTss = structuredWeeklyTss.weeklyTss ?? conservativeStarterWeeklyTss;

      // ✅ FIX: Get user's CURRENT CTL (not plan's starting_ctl)
      const actualCurve = await db
        .select(activitySummaryColumns)
        .from(schema.activities)

        .where(
          and(
            eq(schema.activities.profile_id, ctx.session.user.id),
            lte(schema.activities.started_at, new Date()),
          ),
        )
        .orderBy(desc(schema.activities.started_at))
        .limit(42);

      let currentCTL = Math.max(10, Math.round((derivedWeeklyTss / 7) * 0.75));

      if (actualCurve && actualCurve.length > 0) {
        const actualCurveWithSegments = await attachActivitySegments(db, actualCurve);
        const actualCurveDerivedMap = await buildActivityDerivedSummaryMap({
          store: createActivityAnalysisStore(db),
          profileId: ctx.session.user.id,
          activities: actualCurveWithSegments,
        });
        const tssData = actualCurve.map((a: any) => actualCurveDerivedMap.get(a.id)?.tss || 0);
        const series = calculateTrainingLoadSeries(tssData, 0, 0);
        currentCTL = series[series.length - 1]?.ctl || currentCTL;
      }

      const targetCTL = Math.max(
        currentCTL,
        Math.round(Math.max(derivedWeeklyTss / 6, currentCTL + 4)),
      );

      const structureStartDate = structure.builder_planning_snapshot?.scheduling.start_date ?? null;
      const goalDates = (structure.goal_blueprints ?? []).flatMap((goal) =>
        goal.target_offset_days === undefined || !structureStartDate
          ? []
          : [addDaysDateOnlyUtc(structureStartDate, goal.target_offset_days)],
      );
      const targetDateCandidates = [
        ...goalDates,
        structuredWeeklyTss.latestScheduledDate,
        input.end_date,
      ].filter((value): value is string => typeof value === "string" && value.length > 0);

      const targetDate =
        targetDateCandidates.sort((a: any, b: any) => a.localeCompare(b)).at(-1) ?? input.end_date;

      // ✅ FIX: Start projection from TODAY (not query start_date)
      const projectionStartDate = new Date();
      const projectionEndDate = new Date(targetDate);
      const daysToTarget = Math.max(
        0,
        Math.floor(
          (projectionEndDate.getTime() - projectionStartDate.getTime()) / (24 * 60 * 60 * 1000),
        ),
      );

      const weeklyTSS = Math.max(
        conservativeStarterWeeklyTss,
        derivedWeeklyTss,
        (targetCTL - currentCTL) * 7,
      );
      const dailyTSS = weeklyTSS / 7;

      // Build projection curve via shared load-series primitive
      const projectionDatePoints: string[] = [];
      const projectedDailyTss: number[] = [];

      for (let day = 0; day <= daysToTarget; day++) {
        const date = new Date(projectionStartDate);
        date.setDate(date.getDate() + day);

        projectionDatePoints.push(date.toISOString().split("T")[0] ?? "");
        projectedDailyTss.push(dailyTSS);
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
      const db = getRequiredDb(ctx);
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);

      // ✅ FIX: Get baseline CTL from before start_date
      const extendedStart = new Date(startDate);
      extendedStart.setDate(startDate.getDate() - 42); // 42 days before

      const baselineActivities = await db
        .select(activitySummaryColumns)
        .from(schema.activities)

        .where(
          and(
            eq(schema.activities.profile_id, ctx.session.user.id),
            lt(schema.activities.started_at, startDate),
            gte(schema.activities.started_at, extendedStart),
          ),
        )
        .orderBy(asc(schema.activities.started_at));

      // Get activities in range
      const activities = await db
        .select(activitySummaryColumns)
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.profile_id, ctx.session.user.id),
            gte(schema.activities.started_at, startDate),
            lte(schema.activities.started_at, endDate),
          ),
        )
        .orderBy(asc(schema.activities.started_at));

      const historyActivities = [...baselineActivities, ...activities];
      const historyActivitiesWithSegments = await attachActivitySegments(db, historyActivities);
      const stressSeries = await buildDynamicStressSeries({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: historyActivitiesWithSegments,
      });

      // Abstain rather than drawing a zero curve when there is no load evidence,
      // any activity has unavailable load, or the history mixes incompatible series.
      if (historyActivities.length === 0 || !stressSeries.complete) {
        return { dataPoints: [] };
      }

      const historyDates = buildDateRange(
        formatDateOnlyUtc(extendedStart),
        formatDateOnlyUtc(endDate),
      );
      const series = calculateTrainingLoadSeries(
        historyDates.map((date) => stressSeries.byDate.get(date) ?? 0),
        0,
        0,
      );
      const requestedStartKey = formatDateOnlyUtc(startDate);
      const requestedEndKey = formatDateOnlyUtc(endDate);
      const dataPoints = historyDates.flatMap((date, index) => {
        if (date < requestedStartKey || date > requestedEndKey) return [];
        const point = series[index];
        if (!point) return [];
        return [
          {
            date,
            ctl: Math.round(point.ctl * 10) / 10,
            atl: Math.round(point.atl * 10) / 10,
            tsb: Math.round(point.tsb * 10) / 10,
          },
        ];
      });

      return { dataPoints };
    }),

  // ------------------------------
  // Apply quick adjustment to training plan
  // ------------------------------
  applyQuickAdjustment: protectedProcedure
    .input(applyQuickAdjustmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return applyQuickAdjustmentUseCase({
        adjustedStructure: input.adjustedStructure,
        db,
        expectedStructureHash: input.expectedStructureHash,
        id: input.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
      });
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
      const db = getRequiredDb(ctx);
      // Verify plan accessibility
      const plan = await getAccessibleTrainingPlan({
        db,
        planId: input.training_plan_id,
        profileId: ctx.session.user.id,
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const parsedStructure = trainingPlanSchema.safeParse(plan.structure);
      if (!parsedStructure.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan structure is not canonical version 1",
          cause: parsedStructure.error,
        });
      }
      const structure = parsedStructure.data;

      // Calculate date range
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - input.weeks_back * 7);

      // Get all planned activities in range with full activity plans
      const startDateOnly = startDate.toISOString().split("T")[0] || "";
      const todayDateOnly = today.toISOString().split("T")[0] || "";

      const plannedActivitiesEventsRaw = await db
        .select({
          starts_at: schema.events.starts_at,
          scheduled_date: schema.events.scheduled_date,
          activity_plan: schema.activityPlans,
        })
        .from(schema.events)

        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .where(
          and(
            eq(schema.events.profile_id, ctx.session.user.id),
            eq(schema.events.training_plan_id, input.training_plan_id),
            eq(schema.events.event_type, plannedEventType),
            gte(schema.events.starts_at, new Date(toDayStartIso(startDateOnly))),
            lt(schema.events.starts_at, new Date(toNextDayStartIso(todayDateOnly))),
          ),
        );

      const plannedActivitiesRaw = plannedActivitiesEventsRaw.map((item: any) => ({
        ...item,
        starts_at: item.starts_at.toISOString(),
        scheduled_date:
          item.scheduled_date ?? getScheduledDateKey(item.starts_at.toISOString(), "UTC"),
      }));

      // Extract activity plans and add estimations
      const activityPlans = (plannedActivitiesRaw || [])
        .map((pa: any) => pa.activity_plan)
        .filter((plan: unknown): plan is NonNullable<typeof plan> => plan !== null);

      const estimationStore = createEventReadRepository(db);
      const plansWithEstimations =
        activityPlans.length > 0
          ? await getActivityPlansDerivedMetrics(
              activityPlans as any,
              db,
              estimationStore,
              ctx.session.user.id,
            )
          : [];

      // Create a map for quick lookup of canonical metrics by plan ID.
      const estimationMap = new Map(
        plansWithEstimations.map((plan: any) => [plan.id, plan.authoritative_metrics]),
      );

      // Map planned activities with their estimations
      const plannedActivities =
        plannedActivitiesRaw?.map((pa: any) => ({
          ...pa,
          activity_plan: pa.activity_plan
            ? {
                ...pa.activity_plan,
                authoritative_metrics: estimationMap.get(pa.activity_plan.id) ?? null,
              }
            : null,
        })) || [];

      // Get all completed activities in range
      const completedActivities = await db
        .select(activitySummaryColumns)
        .from(schema.activities)

        .where(
          and(
            eq(schema.activities.profile_id, ctx.session.user.id),
            gte(schema.activities.started_at, startDate),
            lte(schema.activities.started_at, today),
          ),
        );

      const completedActivitiesWithSegments = await attachActivitySegments(db, completedActivities);
      const completedSegments = await buildActivitySegmentDerivedSummaries({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: completedActivitiesWithSegments,
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
          plannedActivities?.filter((pa: any) => {
            const date = new Date(pa.scheduled_date);
            return date >= weekStart && date < weekEnd;
          }) || [];

        const plannedTSS = weekPlanned.reduce(
          (sum: number, pa: any) =>
            sum + (getAuthoritativeActivityPlanMetrics(pa.activity_plan).estimated_tss ?? 0),
          0,
        );

        // Count completed activities and TSS for this week
        const weekCompleted =
          completedActivities?.filter((act: { started_at: string | Date }) => {
            const date = new Date(act.started_at);
            return date >= weekStart && date < weekEnd;
          }) || [];

        const completedLoad = summarizeSegmentTss(
          completedSegments,
          new Set(weekCompleted.map((activity: { id: string }) => activity.id)),
        );
        const completedTSS = completedLoad.tss;

        const targetWeeklyTSS = plannedTSS;
        const targetActivities =
          structure.builder_planning_snapshot?.plan_preferences.weekly_session_count ??
          weekPlanned.length;

        // Calculate completion percentage
        const tssPercentage = plannedTSS > 0 ? (completedTSS / plannedTSS) * 100 : 0;
        const activityPercentage =
          weekPlanned.length > 0 ? (weekCompleted.length / weekPlanned.length) * 100 : 0;

        // Determine status
        let status: "good" | "warning" | "poor" = "good";
        if (!completedLoad.complete) {
          status = "warning";
        } else if (tssPercentage < 70 || activityPercentage < 70) {
          status = "poor";
        } else if (tssPercentage < 90 || activityPercentage < 90) {
          status = "warning";
        }

        weekSummaries.push({
          weekStart: weekStart.toISOString().split("T")[0],
          weekEnd: weekEnd.toISOString().split("T")[0],
          plannedTSS: Math.round(plannedTSS),
          completedTSS: Math.round(completedTSS),
          tssComplete: completedLoad.complete,
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
          min_sessions_per_week: z.number().int().min(1).max(14).optional(),
          max_sessions_per_week: z.number().int().min(1).max(14).optional(),
          search: z.string().optional(),
          sort_by: z
            .enum([
              "newest",
              "oldest",
              "duration_desc",
              "duration_asc",
              "sessions_desc",
              "sessions_asc",
            ])
            .optional(),
          limit: z.number().int().min(1).max(50).default(25),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return listTrainingPlanTemplatesUseCase({
        db,
        profileId: ctx.session.user.id,
        query: input,
        repository: createTrainingPlanRepository(db),
      });
    }),

  // ------------------------------
  // Get single training plan template
  // ------------------------------
  getTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getTrainingPlanTemplateUseCase({
        id: input.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(getRequiredDb(ctx)),
      });
    }),

  applyTemplate: protectedProcedure
    .input(templateApplyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profileId = ctx.session.user.id;
      const db = getRequiredDb(ctx);
      const permissions = createContentAccessPermissions(db);
      return applyTrainingPlanTemplateUseCase({
        db,
        permissions,
        permissionsFactory: createContentAccessPermissions,
        profileId,
        repository: createTrainingPlanRepository(db),
        repositoryFactory: createTrainingPlanRepository,
        values: input,
      });
    }),

  removeAppliedSchedule: protectedProcedure
    .input(applicationScopedScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return removeAppliedScheduleUseCase({
        db,
        permissions: createContentAccessPermissions(db),
        permissionsFactory: createContentAccessPermissions,
        profileId: ctx.session.user.id,
        scheduleBatchId: input.schedule_batch_id,
      });
    }),

  reorderWorkouts: protectedProcedure
    .input(reorderTrainingPlanWorkoutsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return reorderTrainingPlanWorkoutsUseCase({
        changes: input.changes,
        db,
        profileId: ctx.session.user.id,
        trainingPlanId: input.training_plan_id,
      });
    }),

  getActivePlan: protectedProcedure.query(async ({ ctx }) => {
    return getActivePlanUseCase({
      profileId: ctx.session.user.id,
      repository: createTrainingPlanRepository(getRequiredDb(ctx)),
    });
  }),
};
