import {
  type ActivityPlanSummary,
  type CanonicalTrainingPlanStructure,
  type ContentVisibility,
  canonicalGoalObjectiveSchema,
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
  type TrainingPlanCreate,
  trainingPlanCreateSchema,
} from "@repo/core";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderEventOverrides,
  TrainingPlanBuilderState,
} from "./types";

export function buildCanonicalTrainingPlanStructure(
  state: TrainingPlanBuilderState,
): TrainingPlanCreate {
  const selectedGoals = state.goalContext.selectedGoals.map((goal) => ({
    title: goal.title,
    target_offset_days: goal.targetOffsetDays,
    ...(goal.targetDate !== undefined ? { target_date: goal.targetDate } : {}),
    priority: goal.priority,
    activity_category: goal.activityCategory,
    objective: goal.objective,
    ...(goal.sourceProfileGoalId ? { source_profile_goal_id: goal.sourceProfileGoalId } : {}),
  }));
  const goalBlueprints = state.goalContext.selectedGoals
    .filter((goal) => goal.title.trim().length > 0)
    .map((goal) => ({
      title: goal.title.trim(),
      priority: goal.priority,
      activity_category: goal.activityCategory,
      ...(goal.targetOffsetDays !== null ? { target_offset_days: goal.targetOffsetDays } : {}),
      ...(goal.objective ? { objective: goal.objective } : {}),
    }));

  return trainingPlanCreateSchema.parse({
    version: 1,
    ...(goalBlueprints.length > 0 ? { goal_blueprints: goalBlueprints } : {}),
    builder_planning_snapshot: {
      version: 1,
      plan_preferences: {
        duration_weeks: state.planPreferences.durationWeeks,
        weekly_session_count: state.planPreferences.weeklySessionCount,
        target_weekly_hours: state.planPreferences.targetWeeklyHours,
        rest_days_per_week: state.planPreferences.restDaysPerWeek,
        max_single_session_duration_minutes: state.planPreferences.maxSingleSessionDurationMinutes,
        progression_pace: state.planPreferences.progressionPace,
        recovery_priority: state.planPreferences.recoveryPriority,
        week_pattern_preference: state.planPreferences.weekPatternPreference,
        strength_integration_priority: state.planPreferences.strengthIntegrationPriority,
        double_day_tolerance: state.planPreferences.doubleDayTolerance,
        long_session_fatigue_tolerance: state.planPreferences.longSessionFatigueTolerance,
        taper_style_preference: state.planPreferences.taperStylePreference,
      },
      scheduling: { preferred_weekdays: state.scheduling.preferredWeekdays },
      goal_context: { selected_goals: selectedGoals },
    },
    sessions: state.structure.sessions
      .filter(
        (session): session is typeof session & { activityPlan: TrainingPlanActivityPlanFacts } =>
          session.activityPlan !== null,
      )
      .map((session) => {
        const eventOverrides = normalizeEventOverrides(session.eventOverrides);
        return {
          offset_days: session.offsetDays,
          activity_plan_id: session.activityPlan.id,
          ...(session.activityPlanVariantId
            ? { activity_plan_variant_id: session.activityPlanVariantId }
            : {}),
          ...(eventOverrides ? { event_overrides: eventOverrides } : {}),
        };
      }),
  });
}

export function buildCanonicalTrainingPlanDraft(state: TrainingPlanBuilderState) {
  return {
    name: state.details.name.trim(),
    description: state.details.description.trim() || null,
    contentVisibility: state.details.contentVisibility,
    structure: buildCanonicalTrainingPlanStructure(state),
  };
}

function parsePersistedCanonicalStructure(structure: unknown): CanonicalTrainingPlanStructure {
  const direct = canonicalTrainingPlanStructureSchema.safeParse(structure);
  if (direct.success) return direct.data;

  const persisted = persistedTrainingPlanStructureSchema.parse(structure);
  const { id: _id, ...canonical } = persisted;
  return canonicalTrainingPlanStructureSchema.parse(canonical);
}

type HydratableTrainingPlan = {
  id: string;
  name: string;
  description?: string | null;
  structure: unknown;
  content_visibility: ContentVisibility;
};

function toActivityPlanFacts(activityPlan: ActivityPlanSummary): TrainingPlanActivityPlanFacts {
  return {
    id: activityPlan.id,
    name: activityPlan.name,
    published: activityPlan.visibility === "public" || activityPlan.isSystemTemplate,
    accessible: true,
    prescriptionQuantification: null,
  };
}

export function getTrainingPlanStructureActivityPlanIds(structure: unknown): string[] {
  const canonical = canonicalTrainingPlanStructureSchema.safeParse(structure);
  if (canonical.success) {
    return Array.from(new Set(canonical.data.sessions.map((session) => session.activity_plan_id)));
  }
  const persisted = persistedTrainingPlanStructureSchema.safeParse(structure);
  if (!persisted.success) return [];
  return Array.from(new Set(persisted.data.sessions.map((session) => session.activity_plan_id)));
}

export function createTrainingPlanBuilderStateFromExistingPlan({
  activityPlans,
  fallbackDate,
  plan,
}: {
  activityPlans: ActivityPlanSummary[];
  fallbackDate?: string;
  plan: HydratableTrainingPlan;
}): TrainingPlanBuilderState {
  const structure = parsePersistedCanonicalStructure(plan.structure);
  const defaultState = createDefaultTrainingPlanBuilderState();
  const activityPlanFactsById = new Map(
    activityPlans.map(
      (activityPlan) => [activityPlan.id, toActivityPlanFacts(activityPlan)] as const,
    ),
  );
  const anchorDate = fallbackDate ?? defaultState.anchorDate;
  const planningSnapshot = structure.builder_planning_snapshot;

  return {
    ...defaultState,
    details: {
      name: plan.name,
      description: plan.description ?? "",
      contentVisibility: plan.content_visibility,
    },
    anchorDate,
    goalContext: {
      selectedGoals: (
        planningSnapshot?.goal_context.selected_goals ??
        structure.goal_blueprints ??
        []
      ).map((goal, index) => {
        const objective = canonicalGoalObjectiveSchema.safeParse(goal.objective);
        const sourceProfileGoalId =
          "source_profile_goal_id" in goal ? goal.source_profile_goal_id : null;
        const targetDate = "target_date" in goal ? goal.target_date : null;
        return {
          localId: `existing-goal-${index}`,
          title: goal.title,
          ...(sourceProfileGoalId ? { sourceProfileGoalId } : {}),
          targetOffsetDays: goal.target_offset_days ?? null,
          ...(targetDate !== undefined ? { targetDate } : {}),
          priority: goal.priority,
          activityCategory: goal.activity_category ?? null,
          objective: objective.success ? objective.data : null,
        };
      }),
    },
    planPreferences: planningSnapshot
      ? {
          durationWeeks: planningSnapshot.plan_preferences.duration_weeks,
          weeklySessionCount: planningSnapshot.plan_preferences.weekly_session_count,
          targetWeeklyHours: planningSnapshot.plan_preferences.target_weekly_hours,
          restDaysPerWeek: planningSnapshot.plan_preferences.rest_days_per_week,
          maxSingleSessionDurationMinutes:
            planningSnapshot.plan_preferences.max_single_session_duration_minutes ?? null,
          progressionPace: planningSnapshot.plan_preferences.progression_pace ?? null,
          recoveryPriority: planningSnapshot.plan_preferences.recovery_priority ?? null,
          weekPatternPreference: planningSnapshot.plan_preferences.week_pattern_preference ?? null,
          strengthIntegrationPriority:
            planningSnapshot.plan_preferences.strength_integration_priority ?? null,
          doubleDayTolerance: planningSnapshot.plan_preferences.double_day_tolerance ?? null,
          longSessionFatigueTolerance:
            planningSnapshot.plan_preferences.long_session_fatigue_tolerance ?? null,
          taperStylePreference: planningSnapshot.plan_preferences.taper_style_preference ?? null,
        }
      : defaultState.planPreferences,
    structure: {
      sessions: structure.sessions.map((session, index) => ({
        localId: `existing-session-${index}`,
        offsetDays: session.offset_days,
        activityPlan: activityPlanFactsById.get(session.activity_plan_id) ?? {
          id: session.activity_plan_id,
          name: "Unavailable activity plan",
          published: false,
          accessible: false,
          prescriptionQuantification: null,
        },
        activityPlanVariantId: session.activity_plan_variant_id,
        ...(session.event_overrides ? { eventOverrides: session.event_overrides } : {}),
      })),
    },
    scheduling: {
      ...defaultState.scheduling,
      startDate: anchorDate,
      preferredWeekdays:
        planningSnapshot?.scheduling.preferred_weekdays ??
        defaultState.scheduling.preferredWeekdays,
    },
  };
}

function normalizeEventOverrides(eventOverrides: TrainingPlanBuilderEventOverrides | undefined) {
  if (!eventOverrides) return undefined;
  const normalized: TrainingPlanBuilderEventOverrides = {};
  if (eventOverrides.title) normalized.title = eventOverrides.title;
  if (eventOverrides.description) normalized.description = eventOverrides.description;
  if (eventOverrides.start_time) normalized.start_time = eventOverrides.start_time;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
