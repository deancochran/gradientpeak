// packages/api/src/routers/planning/training-plans/base.ts
import {
  type ActivityObservationQuantificationBundle,
  type AthletePreferenceProfile,
  addDaysDateOnlyUtc,
  athletePreferenceProfileSchema,
  type BuildReadinessForecastTimelineInput,
  bindPrescriptionQuantificationToScheduledEvent,
  buildDailyLoadRecommendation,
  buildDeterministicProjectionPayload,
  buildGoalAnchoredProjectionPlan,
  buildProjectionChartPayloadFromDeterministicProjection,
  buildProjectionEngineInput,
  buildReadinessForecastTimeline,
  type CanonicalActivityCategory,
  type CreationContextSummary,
  canonicalActivityCategorySchema,
  canonicalizeMinimalTrainingPlanCreate,
  classifyCreationFeasibility,
  classifyProjectionFeasibility,
  computeLoadBootstrapState,
  countAvailableTrainingDays,
  createAthletePlanningContextFromSnapshot,
  createObservationQuantificationBundle,
  createPrescriptionQuantificationBundle,
  creationBehaviorControlsSchema,
  creationConfigValueSchema,
  creationConstraintsSchema,
  type creationNormalizationInputSchema,
  deriveCreationContext,
  deriveCreationSuggestions,
  deriveNoHistoryGoalTierFromTargets,
  deterministicUuidFromSeed,
  diffDateOnlyUtcDays,
  type ForecastConfidenceReasonCode,
  formatDateOnlyUtc,
  type GoalAnchoredProjectionPlan,
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
  projectAthletePerformanceTargetFacts,
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
import {
  COMMON_LOAD_HISTORY_POLICY_VERSION,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadHistoryResult,
  calculateCommonLoadFitnessSeries,
  commonLoadHistoryResultSchema,
  commonLoadResultSchema,
  getLoadBalanceStatus,
} from "@repo/core/load";
import { type ProfileGoalRow, schema, type TrainingPlanRow } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { readCurrentProfileCommonLoadHistory } from "../../../application/activities/read-current-profile-common-load-history";
import { buildEffectiveAthleteSnapshot } from "../../../application/athlete-state/build-effective-athlete-snapshot";
import { getAthletePerformanceModelAsOf } from "../../../application/performance-model/get-athlete-performance-model-as-of";
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
  calculatePlanAlignment,
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
  reorderTrainingPlanActivitiesUseCase,
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
  type buildActivityDerivedSummaryMap,
  buildActivitySegmentDerivedSummaries,
  buildDynamicStressSeries,
  deriveActivityDurations,
  loadActivitySegmentsByActivityId,
  orderedActivitySegments,
  summarizeSegmentCommonLoad,
  summarizeSegmentQuantification,
} from "../../../lib/activity-analysis";
import { featureFlags } from "../../../lib/features";
import { createContentAccessPermissions } from "../../../permissions/content-access";
import { createAthletePerformanceModelRepository } from "../../../repositories/athlete-performance-model-repository";
import { createTRPCRouter, protectedProcedure } from "../../../trpc";
import { getActivityPlansDerivedMetrics } from "../../../utils/activity-plan-derived-metrics";
import { indexCursorSchema } from "../../../utils/index-cursor";
import {
  filterObservationsAfterLatestTombstone,
  filterSupersededProfileOverrides,
} from "../../../utils/profile-override-observations";

const feasibilityStateSchema = z.enum(["feasible", "aggressive", "unsafe"]);
const safetyStateSchema = z.enum(["safe", "caution", "exceeded"]);
const trainingPlanTemplateVisibilitySchema = z.enum(["private", "followers", "public"]);
const historyIdentityProbeSchema = z
  .object({
    status: z.literal("available"),
    identity: z
      .object({
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        commonLoad: z
          .object({ model: z.string().min(1), version: z.string().min(1) })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
const commonLoadIdentityProbeSchema = z
  .object({ model: z.string().min(1), version: z.string().min(1) })
  .passthrough();

function normalizeCommonLoadHistoryResult(
  value: unknown,
  fallbackDate: string,
): CommonLoadHistoryResult {
  const parsed = commonLoadHistoryResultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const identity = historyIdentityProbeSchema.safeParse(value);
  if (
    identity.success &&
    (identity.data.identity.commonLoad.model !== COMMON_RELATIVE_LOAD_MODEL ||
      identity.data.identity.commonLoad.version !== COMMON_RELATIVE_LOAD_VERSION)
  ) {
    return commonLoadHistoryResultSchema.parse({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "incompatible_model_version",
      context: {
        date: identity.data.identity.endDate,
        expectedModel: COMMON_RELATIVE_LOAD_MODEL,
        expectedVersion: COMMON_RELATIVE_LOAD_VERSION,
        actualModel: identity.data.identity.commonLoad.model,
        actualVersion: identity.data.identity.commonLoad.version,
      },
    });
  }
  return commonLoadHistoryResultSchema.parse({
    status: "unavailable",
    policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
    reason: "invalid_input",
    context: {
      path: "commonLoadHistory",
      message: `Common Load history was invalid as of ${fallbackDate}`,
    },
  });
}
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
const reorderTrainingPlanActivitiesInputSchema = z
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
            message: "Requested activity date must differ from the expected date",
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
          message: "Activity event IDs must be unique",
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
} as const;

async function attachActivitySegments<
  T extends Omit<
    Parameters<typeof buildActivityDerivedSummaryMap>[0]["activities"][number],
    "segments"
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
    training_plan_id: z.string().uuid(),
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
  input?: { startingLongTermLoad?: number },
): ExpandedProjectionPlan {
  return buildGoalAnchoredProjectionPlan({
    minimalPlan,
    startingLongTermLoad: input?.startingLongTermLoad,
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

function adherenceScore(
  recommendedLoad: number,
  scheduledLoad: number,
  completedLoad: number,
): number {
  const completedVsScheduled = ratioScore(completedLoad, scheduledLoad);
  const scheduledVsRecommended = ratioScore(scheduledLoad, recommendedLoad);
  return clampNumber(Math.round(completedVsScheduled * 0.7 + scheduledVsRecommended * 0.3), 0, 100);
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
    recommended_load: number;
    scheduled_load: number;
    completed_load: number;
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
    timeline.reduce(
      (sum, point) => sum + ratioScore(point.scheduled_load, point.recommended_load),
      0,
    ) / timeline.length;

  const executionAlignment =
    timeline.reduce(
      (sum, point) => sum + ratioScore(point.completed_load, point.scheduled_load),
      0,
    ) / timeline.length;

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
        detail: "How closely scheduled load tracks recommended load",
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
  recommendedLoad: number,
  scheduledLoad: number,
  completedLoad: number,
): { state: SafetyState; reasons: string[] } {
  const reasons: string[] = [];
  let state: SafetyState = "safe";

  if (recommendedLoad > 0 && scheduledLoad > recommendedLoad * 1.35) {
    state = "exceeded";
    reasons.push("scheduled_load_above_recommended_boundary");
  } else if (recommendedLoad > 0 && scheduledLoad > recommendedLoad * 1.15) {
    state = "caution";
    reasons.push("scheduled_load_near_recommended_boundary");
  }

  if (scheduledLoad > 0 && completedLoad > scheduledLoad * 1.35) {
    state = "exceeded";
    reasons.push("completed_load_above_scheduled_boundary");
  } else if (scheduledLoad > 0 && completedLoad > scheduledLoad * 1.15) {
    state = state === "exceeded" ? "exceeded" : "caution";
    reasons.push("completed_load_near_scheduled_boundary");
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
  db: DbClient;
  planningTimezone: string;
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
    activityPlans,
    input.db,
    estimationStore,
    input.profileId,
  );

  const estimatedTssByPlanId = new Map(
    plansWithEstimations.map((plan) => [
      plan.id,
      plan.prescriptionQuantification.summary.commonLoad.status === "complete" ||
      plan.prescriptionQuantification.summary.commonLoad.status === "partial"
        ? plan.prescriptionQuantification.summary.commonLoad.load
        : null,
    ]),
  );

  const dailyTss = new Map<string, number>();
  let hasUnavailableScheduledLoad = false;
  for (const event of materializedEvents) {
    if (!event.activity_plan_id) {
      continue;
    }

    const estimatedTss = estimatedTssByPlanId.get(event.activity_plan_id);
    if (estimatedTss === null || estimatedTss === undefined) {
      hasUnavailableScheduledLoad = true;
      continue;
    }
    if (estimatedTss <= 0) {
      continue;
    }

    dailyTss.set(event.scheduled_date, (dailyTss.get(event.scheduled_date) || 0) + estimatedTss);
  }

  return {
    weeklyTss: hasUnavailableScheduledLoad ? null : estimateWeeklyTssFromDailyMap(dailyTss),
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

function readStructureSessionsForDailyLoadRecommendation(
  structure: Record<string, unknown> | null | undefined,
) {
  const parsed = trainingPlanSchema.safeParse(structure);
  if (!parsed.success) return [];
  return parsed.data.sessions.map((session) => ({
    offsetDays: session.offset_days,
    estimatedTss: null,
    estimatedDurationMinutes: null,
    intentType: null,
    // TrainingPlan categories describe plan scope, not a linked ActivityPlan session.
    activityCategory: null,
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
  const points = buildDailyLoadRecommendation({
    mode: "recommended-load",
    startDate: input.startDate,
    endDate: input.endDate,
    weeklyTargets,
    preferredWeekdays: readPlanningSnapshotPreferredWeekdays(input.structure),
    sessions: readStructureSessionsForDailyLoadRecommendation(input.structure),
  });

  return new Map(
    points.flatMap((point) =>
      point.actionableRecommendation
        ? [[point.date, point.actionableRecommendation.recommendedLoad] as const]
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
  startingLongTermLoad?: number;
  startingRecentLoad?: number;
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
      starting_longTermLoad: input.startingLongTermLoad,
      starting_recentLoad: input.startingRecentLoad,
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
  startingLongTermLoadOverride?: number;
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
    starting_longTermLoad_override: input.startingLongTermLoadOverride,
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

  if (input.projectionChart.constraint_summary.load_ramp_clamp_weeks > 0) {
    conflicts.push({
      code: "required_load_ramp_exceeds_cap",
      severity: "warning",
      message: "Required week-to-week load progression exceeds current safety guardrails",
      field_paths: ["behavior_controls.aggressiveness", "optimization_profile"],
      suggestions: [
        "Lower aggressiveness or spike frequency",
        "Move one or more goals farther out",
        "Pick a less conservative optimization profile",
      ],
    });
  }

  if (input.projectionChart.constraint_summary.longTermLoad_ramp_clamp_weeks > 0) {
    conflicts.push({
      code: "required_longTermLoad_ramp_exceeds_cap",
      severity: "warning",
      message: "Required long-term load progression exceeds current safety guardrails",
      field_paths: ["behavior_controls.aggressiveness", "optimization_profile"],
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
  activity_category_load_states: ProjectionChartPayload["activity_category_load_states"];
  recovery_segments: ProjectionChartPayload["recovery_segments"];
  readiness_points: Array<{
    date: string;
    readiness_score: number;
    predicted_fitness_longTermLoad: number;
  }>;
  microcycles: Array<{
    week_start_date: string;
    week_end_date: string;
    phase: string;
    planned_weekly_load: number;
    projected_longTermLoad: number;
    constraints: string[];
    recovery_active: boolean;
    demand_floor_load: number | null;
    demand_gap_unmet_weekly_load: number | null;
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
    .filter(([, load]) => Number.isFinite(load) && load > 0)
    .map(([date, load]) => ({ date, load: Math.round(load * 10) / 10 }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mapScheduledDailyLoadFromDateTotals(
  map: Map<string, number>,
): ScheduledReadinessDailyLoadInput[] {
  return [...map.entries()]
    .filter(([, load]) => Number.isFinite(load) && load > 0)
    .map(([date, load]) => ({
      date,
      load: Math.round(load * 10) / 10,
      confidence: "medium" as const,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mapRecommendedDailyLoadFromTimeline(
  timeline: Array<{ date: string; recommended_load: number }>,
): ReadinessDailyLoadInput[] {
  return timeline
    .filter((point) => Number.isFinite(point.recommended_load) && point.recommended_load > 0)
    .map((point) => ({
      date: point.date,
      load: Math.round(point.recommended_load * 10) / 10,
    }))
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
    loadDelta: boundedDelta,
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

function inferFallbackRaceTargetSpeedMps(input: {
  activityCategory: CanonicalActivityCategory;
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
  activityCategory: CanonicalActivityCategory;
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

export function mapCanonicalGoalToMinimalPlanGoal(
  source: GoalProjectionSource,
): MinimalTrainingPlanCreate["goals"][number] | null {
  const { goal, targetDate } = source;

  const target: MinimalTrainingPlanCreate["goals"][number]["targets"][number] | null = (() => {
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
            return {
              target_type: "hr_threshold",
              target_lthr_bpm: goal.objective.value,
            };
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
        return null;
    }
  })();

  if (target === null) return null;

  return {
    name: goal.title,
    target_date: targetDate,
    priority: goal.priority,
    targets: [target],
  };
}

async function loadProfileGoalsWithTargetDates(input: {
  db: DbClient;
  profileId: string;
  startDate: string;
}): Promise<GoalProjectionSource[]> {
  let goalRows: unknown[] = [];

  {
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
  db: DbClient;
  profileId: string;
}): Promise<z.infer<typeof creationNormalizationInputSchema>> {
  const settingsRow = await readParsedProfileTrainingSettings(input.db, input.profileId);

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
      typeof microcycle.planned_weekly_load !== "number" ||
      !Number.isFinite(microcycle.planned_weekly_load)
    ) {
      continue;
    }

    const dates = buildDateRange(startDate, endDate);
    if (dates.length === 0) continue;

    const dailyLoad =
      Math.round((Math.max(0, microcycle.planned_weekly_load) / dates.length) * 10) / 10;

    for (const date of dates) {
      map.set(date, dailyLoad);
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
    activity_category_load_states: input.projectionChart.activity_category_load_states ?? [],
    recovery_segments: input.projectionChart.recovery_segments ?? [],
    readiness_points: input.projectionChart.points.map((point) => ({
      date: point.date,
      readiness_score: point.readiness_score,
      predicted_fitness_longTermLoad: point.predicted_fitness_longTermLoad,
    })),
    microcycles: input.projectionChart.microcycles.map((microcycle) => ({
      week_start_date: microcycle.week_start_date,
      week_end_date: microcycle.week_end_date,
      phase: microcycle.phase,
      planned_weekly_load: microcycle.planned_weekly_load,
      projected_longTermLoad: microcycle.projected_longTermLoad,
      constraints: microcycle.metadata.load_resolution.constraints,
      recovery_active: microcycle.metadata.recovery.active,
      demand_floor_load: microcycle.metadata.load_resolution.demand_floor_load,
      demand_gap_unmet_weekly_load:
        microcycle.metadata.load_ramp.demand_gap_unmet_weekly_load ?? null,
    })),
    goal_forecasts: goalForecasts,
  };
}

async function deriveInsightTimelineProjectionIdealTssByDate(input: {
  db: DbClient;
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

    const mappedGoals = rawGoals.flatMap((goal) => {
      const mappedGoal = mapCanonicalGoalToMinimalPlanGoal(goal);
      return mappedGoal === null ? [] : [mappedGoal];
    });

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
      profileId: input.profileId,
    });
    const asOfIso = new Date().toISOString();

    const profileContext = await deriveProfileAwareCreationContext({
      db: input.db,
      store: input.store,
      profileId: input.profileId,
      asOfIso,
    });

    const creationConfig = await evaluateCreationConfig({
      db: input.db,
      store: input.store,
      profileId: input.profileId,
      creationInput,
      asOfIso,
    });

    const projectionArtifacts = buildCreationProjectionArtifacts({
      minimalPlan: minimalPlanResult.data,
      loadBootstrapState: profileContext.loadBootstrapState,
      finalConfig: creationConfig.finalConfig,
      preferenceProfile: profileContext.preferenceProfile,
      contextSummary: profileContext.contextSummary,
      startingLongTermLoadOverride: profileContext.globalLongTermLoadOverride,
      startingRecentLoadOverride: profileContext.globalRecentLoadOverride,
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
  db: DbClient;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
}): Promise<number> {
  const { store, profileId } = input;
  const asOf = new Date();
  const since = new Date(asOf);
  since.setDate(since.getDate() - 90);

  const data = await input.db
    .select(activitySummaryColumns)
    .from(schema.activities)
    .where(
      and(eq(schema.activities.profile_id, profileId), gte(schema.activities.started_at, since)),
    )
    .orderBy(asc(schema.activities.started_at));

  const activitiesWithSegments = await attachActivitySegments(input.db, data);
  const segmentDerived = await buildActivitySegmentDerivedSummaries({
    store,
    profileId,
    activities: activitiesWithSegments,
  });

  const bootstrap = computeLoadBootstrapState({
    activities: data.map((activity: any) => ({
      occurred_at: activity.started_at,
      load: (() => {
        const summary = summarizeSegmentCommonLoad(segmentDerived, new Set([activity.id]));
        return summary.status === "complete" ? summary.load : null;
      })(),
      duration_seconds:
        deriveActivityDurations(activity).active_seconds ??
        deriveActivityDurations(activity).elapsed_seconds,
    })),
    as_of: asOf.toISOString(),
  });

  return bootstrap.starting_longTermLoad;
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
    behavior_controls: input.finalConfig.behavior_controls,
    calibration: input.finalConfig.calibration,
  };

  const snapshotPayload = {
    version: CREATION_PREVIEW_SNAPSHOT_VERSION,
    minimal_plan: canonicalizeMinimalTrainingPlanCreate(input.minimalPlan),
    normalized_creation_config: normalizedCreationConfigSnapshot,
    estimated_current_longTermLoad:
      Math.round(input.loadBootstrapState.starting_longTermLoad * 10) / 10,
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
  startingLongTermLoadOverride?: number;
  startingRecentLoadOverride?: number;
  finalConfig: Awaited<ReturnType<typeof evaluateCreationConfig>>["finalConfig"];
  preferenceProfile?: AthletePreferenceProfile;
  contextSummary: CreationContextSummary;
}): {
  expandedPlan: ExpandedProjectionPlan;
  projectionChart: ProjectionChartPayload;
  projectionFeasibility: ProjectionFeasibilitySummary;
} {
  const effectiveStartingLongTermLoad =
    input.startingLongTermLoadOverride ?? input.loadBootstrapState.starting_longTermLoad;
  const effectiveStartingRecentLoad =
    input.startingRecentLoadOverride ?? input.loadBootstrapState.starting_recentLoad;

  const expandedPlan = buildExpandedPlanFromMinimalGoal(input.minimalPlan, {
    startingLongTermLoad: effectiveStartingLongTermLoad,
  });

  const noHistoryContext = deriveNoHistoryAnchorContext({
    expandedPlan,
    contextSummary: input.contextSummary,
    finalConfig: input.finalConfig,
    startingLongTermLoadOverride: effectiveStartingLongTermLoad,
  });

  const projectionChart = buildProjectionChartPayload({
    expandedPlan,
    startingLongTermLoad: effectiveStartingLongTermLoad,
    startingRecentLoad: effectiveStartingRecentLoad,
    priorInferredSnapshot: input.priorInferredSnapshot,
    normalizedCreationConfig: input.finalConfig,
    preferenceProfile: input.preferenceProfile,
    noHistoryContext,
  });

  const projectionPoints = projectionChart.points;
  const startingFitnessLongTermLoad = projectionPoints[0]?.predicted_fitness_longTermLoad;
  const endingFitnessLongTermLoad = projectionPoints.at(-1)?.predicted_fitness_longTermLoad;

  if (
    typeof startingFitnessLongTermLoad === "number" &&
    typeof endingFitnessLongTermLoad === "number" &&
    endingFitnessLongTermLoad < startingFitnessLongTermLoad
  ) {
    const lastPoint = projectionPoints.at(-1);
    if (lastPoint) {
      lastPoint.predicted_fitness_longTermLoad = startingFitnessLongTermLoad;
    }

    if (projectionChart.inferred_current_state?.mean) {
      projectionChart.inferred_current_state.mean.longTermLoad = Math.max(
        projectionChart.inferred_current_state.mean.longTermLoad,
        startingFitnessLongTermLoad,
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
  db: DbClient;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
  asOfIso: string;
}) {
  const asOf = new Date(input.asOfIso);
  const recentActivitiesCutoff = new Date(asOf);
  recentActivitiesCutoff.setDate(recentActivitiesCutoff.getDate() - 84);

  const recentEffortsCutoff = new Date(asOf);
  recentEffortsCutoff.setDate(recentEffortsCutoff.getDate() - 90);

  const [activitiesResult, effortsResult, profileMetricsResult, profileResult, settingsResult] =
    await Promise.all([
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
    ]);
  const activityRows = activitiesResult.data ?? [];
  const activitiesWithSegments = await attachActivitySegments(input.db, activityRows);
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
        activity_category: segment.activity_category,
        duration_seconds:
          (segment.active_ms ?? segment.end_offset_ms - segment.start_offset_ms) / 1_000,
        common_load: (() => {
          const parsed = commonLoadResultSchema.safeParse(
            derived?.observationQuantification.members[0]?.commonLoad,
          );
          return parsed.success ? parsed.data : null;
        })(),
      };
    }),
  );

  const activityCounts = completedActivities.reduce(
    (acc: Record<string, number>, activity: any) => {
      const activity_category = activity.activity_category ?? "other";
      acc[activity_category] = (acc[activity_category] ?? 0) + 1;
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
          (Object.entries(activityCounts) as Array<[string, number]>).map(
            ([activity_category, count]) => [
              activity_category,
              Number((count / totalActivityCount).toFixed(3)),
            ],
          ),
        )
      : undefined;

  const primaryCategory =
    Object.entries(activityCounts).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] ?? undefined;

  const efforts = filterSupersededProfileOverrides(
    effortsResult.data ?? [],
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
    profileMetricsResult.data ?? [],
    (metric: any) => metric.metric_type,
  );
  // Planning context uses the same cross-category common Load history as Trends,
  // rather than a nullable legacy TSS fitness snapshot.
  const commonLoadHistory = await readCurrentProfileCommonLoadHistory({
    db: input.db,
    profileId: input.profileId,
    now: asOf,
  });
  const commonLoadHistoryResult = normalizeCommonLoadHistoryResult(
    commonLoadHistory.result,
    asOf.toISOString().slice(0, 10),
  );
  const currentCommonLoad =
    commonLoadHistoryResult.status === "available"
      ? (commonLoadHistoryResult.points.at(-1) ?? null)
      : null;
  // One operation as-of anchors both the canonical model and Core planning context.
  const performanceTargets = projectAthletePerformanceTargetFacts(
    await getAthletePerformanceModelAsOf(
      { athleteId: input.profileId, asOf },
      createAthletePerformanceModelRepository(input.db),
    ),
  );

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
    profileMetrics: profileMetricsRows.map((metric) => {
      const provenance = z.record(z.string(), z.unknown()).safeParse(metric.provenance);
      return {
        metric_type: metric.metric_type,
        value: Number(metric.value),
        unit: metric.unit,
        recorded_at: metric.recorded_at,
        source: metric.source,
        method: metric.method,
        calculation_version: metric.calculation_version,
        quality_score: metric.quality_score === null ? undefined : metric.quality_score,
        provenance: provenance.success ? provenance.data : undefined,
      };
    }),
    currentFitness:
      currentCommonLoad === null
        ? null
        : {
            longTermLoad: currentCommonLoad.longTermLoad,
            recentLoad: currentCommonLoad.recentLoad,
            loadBalance: currentCommonLoad.loadBalance,
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
              ? (effort.provenance as Record<string, unknown>)
              : undefined,
        },
      ];
    }),
    coverage: {
      profileMetrics: "complete",
      activityEfforts: (effortsResult.data?.length ?? 0) >= 200 ? "possibly_truncated" : "complete",
    },
    performanceTargets,
  });
  const athleteContext = createAthletePlanningContextFromSnapshot(effectiveAthleteSnapshot);

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
    performance_targets: performanceTargets,
    weight_kg: athleteContext.body.weightKg.value,
    profile: {
      dob: profileResult.data?.[0]?.dob?.toISOString() ?? null,
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

  const globalLongTermLoadOverride =
    baselineFitnessOverride?.is_enabled &&
    typeof baselineFitnessOverride?.override_longTermLoad === "number"
      ? baselineFitnessOverride.override_longTermLoad
      : undefined;
  const globalRecentLoadOverride =
    baselineFitnessOverride?.is_enabled &&
    typeof baselineFitnessOverride?.override_recentLoad === "number"
      ? baselineFitnessOverride.override_recentLoad
      : undefined;

  return {
    athleteContext,
    contextSummary,
    loadBootstrapState,
    globalLongTermLoadOverride,
    globalRecentLoadOverride,
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
    override_longTermLoad?: number;
    override_recentLoad?: number;
    override_date?: string;
    max_weekly_load_ramp_pct?: number;
    max_longTermLoad_ramp_per_week?: number;
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
    max_weekly_load_ramp_pct:
      input.baselineFitnessOverride?.is_enabled === true
        ? input.baselineFitnessOverride.max_weekly_load_ramp_pct
        : undefined,
    max_longTermLoad_ramp_per_week:
      input.baselineFitnessOverride?.is_enabled === true
        ? input.baselineFitnessOverride.max_longTermLoad_ramp_per_week
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
      behavior_controls: input.creationInput.user_values?.behavior_controls,
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
    behavior_controls: {
      ...suggestionPayload.behavior_controls,
      ...(input.creationInput.defaults?.behavior_controls ?? {}),
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
    behavior_controls: confirmed?.behavior_controls ?? input.suggestedValues.behavior_controls,
    calibration_composite_locks:
      confirmed?.calibration_composite_locks ?? input.suggestedValues.calibration_composite_locks,
    calibration: mergeCalibrationInput(input.suggestedValues.calibration, confirmed?.calibration),
  });
}

async function evaluateCreationConfig(input: {
  db: DbClient;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
  asOfIso?: string;
}) {
  const nowIso = input.asOfIso ?? input.creationInput.now_iso ?? new Date().toISOString();
  const {
    contextSummary,
    loadBootstrapState,
    globalLongTermLoadOverride,
    globalRecentLoadOverride,
    baselineFitnessOverride,
  } = await deriveProfileAwareCreationContext({
    db: input.db,
    store: input.store,
    profileId: input.profileId,
    asOfIso: nowIso,
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
    globalLongTermLoadOverride,
    globalRecentLoadOverride,
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
    profileDefaults.behavior_controls || inputDefaults.behavior_controls
      ? creationBehaviorControlsSchema.parse({
          ...(profileDefaults.behavior_controls ?? {}),
          ...(inputDefaults.behavior_controls ?? {}),
        })
      : undefined;

  return {
    ...profileDefaults,
    ...inputDefaults,
    availability_config: inputDefaults.availability_config ?? profileDefaults.availability_config,
    ...(mergedConstraints ? { constraints: mergedConstraints } : {}),
    ...(mergedBehaviorControls ? { behavior_controls: mergedBehaviorControls } : {}),
    calibration_composite_locks:
      inputDefaults.calibration_composite_locks ?? profileDefaults.calibration_composite_locks,
    calibration: mergeCalibrationInput(profileDefaults.calibration, inputDefaults.calibration),
  };
}

async function withProfileTrainingSettingsDefaults(input: {
  db: DbClient;
  profileId: string;
  creationInput: z.infer<typeof creationNormalizationInputSchema>;
}): Promise<z.infer<typeof creationNormalizationInputSchema>> {
  const settingsRow = await readParsedProfileTrainingSettings(input.db, input.profileId);

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
  store,
  profileId,
  input,
}: {
  db: DbClient;
  store: ReturnType<typeof createActivityAnalysisStore>;
  profileId: string;
  input: {
    training_plan_id?: string;
    start_date: string;
    end_date: string;
    timezone: string;
    schedule_adjustment?: {
      date: string;
      load_delta: number;
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

  let plan: Record<string, unknown> | null = null;

  if (input.training_plan_id) {
    const fetchedPlan = await getAccessibleTrainingPlan({
      db,
      planId: input.training_plan_id,
      profileId,
    });

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

  const estimatedCurrentCtl = await estimateCurrentCtl({ db, store, profileId });

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
  const projectionInputs = await createEventReadRepository(db).getAccessibleTrainingPlanProjection({
    profileId,
    trainingPlanId: input.training_plan_id,
    startDateIso: toDayStartIso(input.start_date),
    endDateExclusiveIso: endExclusiveIso,
  });

  const plannedActivitiesRaw = projectionInputs.plannedActivities;

  const activityPlans = (plannedActivitiesRaw || [])
    .map((item: any) => item.activity_plan)
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const ownedActivityPlansRaw = await loadOwnedActivityPlansForScheduleGap({
    db,
    profileId,
  });
  const estimationPlans = [...activityPlans, ...ownedActivityPlansRaw].filter(
    (plan, index, plans) => plans.findIndex((candidate) => candidate.id === plan.id) === index,
  );

  const estimationReader = createEventReadRepository(db);
  const plansWithEstimations =
    estimationPlans.length > 0
      ? await getActivityPlansDerivedMetrics(estimationPlans, db, estimationReader, profileId)
      : [];
  const failedEstimations = plansWithEstimations.filter(
    (item) => item.estimate_source === "failed",
  );

  const commonLoadByPlanId = new Map(
    plansWithEstimations
      .filter((item) => item.estimate_source !== "failed")
      .map((item) => [item.id, item.prescriptionQuantification.summary.commonLoad]),
  );

  const scheduledByDate = new Map<string, number>();
  for (const planned of plannedActivitiesRaw || []) {
    const scheduledDate = planned.scheduled_date;
    if (!scheduledDate) continue;

    const planId = planned.activity_plan?.id;
    const commonLoad = planId ? commonLoadByPlanId.get(planId) : undefined;
    if (commonLoad?.status !== "complete") continue;
    scheduledByDate.set(scheduledDate, (scheduledByDate.get(scheduledDate) ?? 0) + commonLoad.load);
  }

  const actualActivityParents = await db
    .select(activitySummaryColumns)
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.profile_id, profileId),
        gte(schema.activities.started_at, new Date(`${input.start_date}T00:00:00.000Z`)),
        lt(schema.activities.started_at, new Date(endExclusiveIso)),
      ),
    );
  const actualActivities = await attachActivitySegments(db, actualActivityParents);
  const actualSegments = await buildActivitySegmentDerivedSummaries({
    store,
    profileId,
    activities: actualActivities,
  });

  const actualByDate = new Map<string, number>();
  for (const activity of actualActivities) {
    const date = formatDateOnlyUtc(new Date(activity.started_at));
    const commonLoad = summarizeSegmentCommonLoad(actualSegments, new Set([activity.id]));
    actualByDate.set(
      date,
      (actualByDate.get(date) || 0) +
        (commonLoad.status === "complete" ? (commonLoad.load ?? 0) : 0),
    );
  }

  const projectionGoalContext = await deriveInsightTimelineProjectionIdealTssByDate({
    db,
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
    const scheduled_load = Math.round((scheduledByDate.get(date) ?? 0) * 10) / 10;
    const recommended_load =
      baselineRecommendedTssByDate.get(date) ??
      resolveBaselineDailyTss({
        date,
        blocks,
        hasActivityHistory,
      });
    const completed_load = Math.round((actualByDate.get(date) ?? 0) * 10) / 10;
    const boundary = classifyBoundaryState(recommended_load, scheduled_load, completed_load);

    return {
      date,
      recommended_load,
      scheduled_load,
      tentative_scheduled_load: 0,
      completed_load,
      adherence_score: adherenceScore(recommended_load, scheduled_load, completed_load),
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

  // A plan-level category list cannot identify a particular session's category.
  // This projection has no linked ActivityPlan category at this point, so it abstains.
  const primaryCategory = null;

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
            affected_plan_ids: failedEstimations.map((item) => item.id),
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
      estimatedCurrentLongTermLoad: estimatedCurrentCtl,
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
    commonLoadByPlanId,
    today,
    horizonEnd: addDaysDateOnlyUtc(today, 14),
    recommendedByDate: new Map(timeline.map((point) => [point.date, point.recommended_load])),
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
    activityPlanMatchTarget.targetLoadDelta && activityPlanMatchTarget.targetLoadDelta > 0
      ? ownedActivityPlansRaw.map((plan) => estimatedPlansById.get(plan.id) ?? plan)
      : [];
  const activityPlanMatches = buildScheduleGapActivityPlanMatches({
    targetDate: activityPlanMatchTarget.targetDate,
    targetLoadDelta: activityPlanMatchTarget.targetLoadDelta,
    primaryActivityCategory: primaryCategory,
    plans: ownedActivityPlans,
    today,
  });
  const scheduleSimulation = input.schedule_adjustment
    ? simulateReadinessScheduleAdjustment({
        forecastInput: readinessForecastInput,
        date: input.schedule_adjustment.date,
        loadDelta: input.schedule_adjustment.load_delta,
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
      activity_category: primaryCategory,
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
        planningTemplateRepository: createPlanningTemplateRepository(db),
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
    const commonLoadHistoryResult = normalizeCommonLoadHistoryResult(
      commonLoadHistory.result,
      today.toISOString().slice(0, 10),
    );
    const availableLoadHistory =
      commonLoadHistoryResult.status === "available" ? commonLoadHistoryResult : null;
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
    const effectiveIdentity = commonLoadIdentityProbeSchema.safeParse(effectiveWeekLoad);
    const validatedEffectiveWeekLoad =
      effectiveIdentity.success &&
      effectiveIdentity.data.model === COMMON_RELATIVE_LOAD_MODEL &&
      effectiveIdentity.data.version === COMMON_RELATIVE_LOAD_VERSION
        ? effectiveWeekLoad
        : null;

    const estimationStore = createEventReadRepository(db);

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
      scheduled_date: item.scheduled_date,
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
        return {
          id: pa.id,
          scheduled_date: pa.scheduled_date,
          activity_plan: estimatedPlan
            ? {
                id: estimatedPlan.id,
                name: estimatedPlan.name,
                activity_category:
                  estimatedPlan.prescriptionQuantification.summary.activity_categories[0] ??
                  "other",
                common_load: estimatedPlan.common_load,
                prescriptionQuantification: estimatedPlan.prescriptionQuantification,
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
    return {
      asOf: commonLoadHistory.computedAt,
      weekBounds,
      loadHistory: commonLoadHistoryResult,
      currentLoadStatus:
        latestLoadState === null || availableLoadHistory === null
          ? null
          : {
              longTermLoad: Math.round(latestLoadState.longTermLoad * 10) / 10,
              recentLoad: Math.round(latestLoadState.recentLoad * 10) / 10,
              loadBalance: Math.round(latestLoadState.loadBalance * 10) / 10,
              loadBalanceStatus: getLoadBalanceStatus(latestLoadState.loadBalance),
              recordedAt: commonLoadHistory.computedAt,
              maturity: availableLoadHistory.maturity.status,
              coverageStatus: availableLoadHistory.coverageStatus,
            },
      commonWeekProgress:
        validatedEffectiveWeekLoad?.status === "available"
          ? {
              status: validatedEffectiveWeekLoad.effective.status,
              completed: validatedEffectiveWeekLoad.completed,
              remaining: validatedEffectiveWeekLoad.remaining,
              tentative: validatedEffectiveWeekLoad.tentative,
              completedObservationQuantification:
                validatedEffectiveWeekLoad.completedObservationQuantification,
              remainingPrescriptionQuantification:
                validatedEffectiveWeekLoad.remainingPrescriptionQuantification,
              tentativePrescriptionQuantification:
                validatedEffectiveWeekLoad.tentativePrescriptionQuantification,
              effective: validatedEffectiveWeekLoad.effective,
              sourceCounts: validatedEffectiveWeekLoad.sourceCounts,
            }
          : {
              status: "unavailable" as const,
              reason:
                validatedEffectiveWeekLoad?.status === "unavailable"
                  ? validatedEffectiveWeekLoad.reason
                  : "incompatible_common_load_identity",
              sourceCounts: effectiveWeekLoad.sourceCounts,
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
        const actualCurveSegmentDerived = await buildActivitySegmentDerivedSummaries({
          store: createActivityAnalysisStore(db),
          profileId: ctx.session.user.id,
          activities: actualCurveWithSegments,
        });
        const tssData = actualCurve.map((activity) => {
          const summary = summarizeSegmentCommonLoad(
            actualCurveSegmentDerived,
            new Set([activity.id]),
          );
          return summary.status === "complete" ? (summary.load ?? 0) : 0;
        });
        const series = calculateCommonLoadFitnessSeries(tssData, 0, 0);
        currentCTL = series[series.length - 1]?.longTermLoad ?? currentCTL;
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

      const projectedSeries = calculateCommonLoadFitnessSeries(
        projectedDailyTss,
        currentCTL,
        currentCTL,
      );

      const curve = projectionDatePoints.map((date, index) => ({
        date,
        longTermLoad: Math.round(projectedSeries[index]?.longTermLoad ?? currentCTL),
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
      const series = calculateCommonLoadFitnessSeries(
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
            longTermLoad: Math.round(point.longTermLoad * 10) / 10,
            recentLoad: Math.round(point.recentLoad * 10) / 10,
            loadBalance: Math.round(point.loadBalance * 10) / 10,
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
        planningTemplateRepository: createPlanningTemplateRepository(db),
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

      const today = new Date();
      const [planningProfile] = await db
        .select({ planningTimezone: schema.profiles.planning_timezone })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, ctx.session.user.id))
        .limit(1);
      const parsedPlanningTimezone = ianaTimezoneSchema.safeParse(
        planningProfile?.planningTimezone,
      );
      const planningTimezone = parsedPlanningTimezone.success ? parsedPlanningTimezone.data : "UTC";
      const currentWeek = getCurrentPlanningWeek(today, planningTimezone);
      const firstPriorWeekStart = addDaysDateOnlyUtc(currentWeek.startDate, -input.weeks_back * 7);
      const plannedActivitiesEventsRaw = await db
        .select({
          id: schema.events.id,
          starts_at: schema.events.starts_at,
          scheduled_date: schema.events.scheduled_date,
          status: schema.events.status,
          linked_activity_id: schema.events.linked_activity_id,
          activity_plan: schema.activityPlans,
        })
        .from(schema.events)

        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .where(
          and(
            eq(schema.events.profile_id, ctx.session.user.id),
            eq(schema.events.training_plan_id, input.training_plan_id),
            eq(schema.events.event_type, plannedEventType),
            gte(schema.events.scheduled_date, firstPriorWeekStart),
            lt(schema.events.scheduled_date, currentWeek.startDate),
          ),
        );

      const plannedActivitiesRaw = plannedActivitiesEventsRaw.map((item) => ({
        ...item,
        starts_at: item.starts_at.toISOString(),
        scheduled_date: item.scheduled_date,
      }));

      // Extract activity plans and add estimations
      const activityPlans = (plannedActivitiesRaw || [])
        .map((pa) => pa.activity_plan)
        .filter((plan: unknown): plan is NonNullable<typeof plan> => plan !== null);

      const estimationStore = createEventReadRepository(db);
      const plansWithEstimations =
        activityPlans.length > 0
          ? await getActivityPlansDerivedMetrics(
              activityPlans,
              db,
              estimationStore,
              ctx.session.user.id,
            )
          : [];

      // Retain the complete canonical projection; reducing this to authoritative metrics
      // discards quantification identity and makes unavailable Load look like zero.
      const estimationMap = new Map(plansWithEstimations.map((plan) => [plan.id, plan]));

      // Map planned activities with their estimations
      const plannedActivities =
        plannedActivitiesRaw?.map((pa) => ({
          ...pa,
          activity_plan: pa.activity_plan ? (estimationMap.get(pa.activity_plan.id) ?? null) : null,
        })) || [];

      const linkedActivityIds = [
        ...new Set(
          plannedActivitiesRaw
            .map((event) => event.linked_activity_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const linkedActivityOccurrenceRows =
        linkedActivityIds.length > 0
          ? await db
              .select({
                linked_activity_id: schema.events.linked_activity_id,
              })
              .from(schema.events)
              .where(
                and(
                  eq(schema.events.profile_id, ctx.session.user.id),
                  inArray(schema.events.linked_activity_id, linkedActivityIds),
                ),
              )
          : [];
      const linkedActivityOccurrenceCounts = new Map<string, number>();
      for (const event of linkedActivityOccurrenceRows) {
        if (event.linked_activity_id) {
          linkedActivityOccurrenceCounts.set(
            event.linked_activity_id,
            (linkedActivityOccurrenceCounts.get(event.linked_activity_id) ?? 0) + 1,
          );
        }
      }
      // Load only candidate linked activities and retain an ownership check in memory for defensive test doubles.
      const completedActivities =
        linkedActivityIds.length > 0
          ? await db
              .select(activitySummaryColumns)
              .from(schema.activities)
              .where(
                and(
                  eq(schema.activities.profile_id, ctx.session.user.id),
                  inArray(schema.activities.id, linkedActivityIds),
                ),
              )
          : [];

      const completedActivitiesWithSegments = await attachActivitySegments(db, completedActivities);
      const completedSegments = await buildActivitySegmentDerivedSummaries({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: completedActivitiesWithSegments,
      });

      const requestedLinkedActivityIds = new Set(linkedActivityIds);
      const ownedActivities = (
        completedActivities as Array<{ id: string; profile_id: string }>
      ).filter(
        (activity) =>
          activity.profile_id === ctx.session.user.id &&
          requestedLinkedActivityIds.has(activity.id),
      );
      const activitiesById = new Map(ownedActivities.map((activity) => [activity.id, activity]));
      const completedQuantificationById = new Map<string, ActivityObservationQuantificationBundle>(
        ownedActivities.map((activity) => {
          const observationQuantification = summarizeSegmentQuantification(
            completedSegments,
            new Set([activity.id]),
          );
          return [activity.id, observationQuantification] as const;
        }),
      );
      const completedCommonLoadById = new Map(
        ownedActivities.map((activity) => {
          const quantification = summarizeSegmentQuantification(
            completedSegments,
            new Set([activity.id]),
          );
          return [
            activity.id,
            quantification.summary.commonLoad.status === "complete"
              ? quantification.summary.commonLoad.load
              : null,
          ] as const;
        }),
      );

      const weekRanges = Array.from({ length: input.weeks_back }, (_, index) => {
        const startDate = addDaysDateOnlyUtc(firstPriorWeekStart, index * 7);
        return { startDate, endDate: addDaysDateOnlyUtc(startDate, 7) };
      });

      const weekSummaries = [];
      for (const weekRange of weekRanges) {
        // Scheduled events, not activity start dates, own weekly plan attribution.
        const weekPlanned =
          plannedActivities?.filter((pa) => {
            return (
              pa.scheduled_date >= weekRange.startDate &&
              pa.scheduled_date < weekRange.endDate &&
              pa.status !== "cancelled"
            );
          }) || [];

        const plannedMembers = weekPlanned.flatMap((event) => {
          const prescriptionQuantification = event.activity_plan?.prescriptionQuantification;
          return !prescriptionQuantification || prescriptionQuantification.members.length === 0
            ? []
            : bindPrescriptionQuantificationToScheduledEvent({
                prescriptionQuantification,
                eventId: event.id,
              }).members;
        });
        const plannedQuantification =
          plannedMembers.length > 0
            ? createPrescriptionQuantificationBundle({ members: plannedMembers })
            : null;

        const alignmentCalculation = calculatePlanAlignment(
          weekPlanned.map((event) => {
            const linkedActivity = event.linked_activity_id
              ? activitiesById.get(event.linked_activity_id)
              : null;
            const linkedActivityOccurrenceCount = event.linked_activity_id
              ? linkedActivityOccurrenceCounts.get(event.linked_activity_id)
              : undefined;
            return {
              status: event.status,
              linkedActivityId: event.linked_activity_id,
              ...(linkedActivityOccurrenceCount === undefined
                ? {}
                : { linkedActivityOccurrenceCount }),
              linkedActivityExists: Boolean(linkedActivity),
              linkedActivityProfileOwned: linkedActivity?.profile_id === ctx.session.user.id,
              plannedCommonLoad:
                event.activity_plan?.prescriptionQuantification.summary.commonLoad.status ===
                  "complete" ||
                event.activity_plan?.prescriptionQuantification.summary.commonLoad.status ===
                  "partial"
                  ? event.activity_plan.prescriptionQuantification.summary.commonLoad.load
                  : null,
              completedCommonLoad: event.linked_activity_id
                ? (completedCommonLoadById.get(event.linked_activity_id) ?? null)
                : null,
            };
          }),
        );
        const {
          completedActivityIds: _completedActivityIds,
          assessableActivityIds: _assessableActivityIds,
          assessedPlannedCommonLoad,
          assessedCompletedCommonLoad,
          ...planAlignment
        } = alignmentCalculation;
        const completedLoadAvailable = planAlignment.status === "available";
        const completedCommonLoad = completedLoadAvailable ? assessedCompletedCommonLoad : null;
        const plannedCommonLoad =
          plannedQuantification?.summary.commonLoad.status === "complete" ||
          plannedQuantification?.summary.commonLoad.status === "partial"
            ? plannedQuantification.summary.commonLoad.load
            : null;
        const completedMembers = alignmentCalculation.assessableActivityIds.flatMap(
          (activityId) => completedQuantificationById.get(activityId)?.members ?? [],
        );
        const completedQuantification =
          completedMembers.length > 0
            ? createObservationQuantificationBundle({ members: completedMembers })
            : null;

        const targetCommonLoad = plannedCommonLoad;
        const targetActivities =
          structure.builder_planning_snapshot?.plan_preferences.weekly_session_count ??
          weekPlanned.length;

        // Determine status
        let status: "good" | "warning" | "poor" = "good";
        if (planAlignment.status !== "available") {
          status = "warning";
        } else if (planAlignment.score !== null && planAlignment.score < 70) {
          status = "poor";
        } else if (planAlignment.score !== null && planAlignment.score < 90) {
          status = "warning";
        }

        weekSummaries.push({
          weekStart: weekRange.startDate,
          weekEnd: addDaysDateOnlyUtc(weekRange.endDate, -1),
          prescriptionQuantification: plannedQuantification,
          observationQuantification: completedQuantification,
          plannedCommonLoad: plannedCommonLoad === null ? null : Math.round(plannedCommonLoad),
          completedCommonLoad:
            completedCommonLoad === null ? null : Math.round(completedCommonLoad),
          commonLoadComplete: completedLoadAvailable,
          plannedActivities: weekPlanned.length,
          completedActivities: planAlignment.completedSessions,
          planAlignment,
          targetCommonLoad: targetCommonLoad === null ? null : Math.round(targetCommonLoad),
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
          activity_category: canonicalActivityCategorySchema.optional(),
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
        trainingPlanId: input.training_plan_id,
      });
    }),

  reorderActivities: protectedProcedure
    .input(reorderTrainingPlanActivitiesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return reorderTrainingPlanActivitiesUseCase({
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
