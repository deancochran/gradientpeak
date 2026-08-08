import {
  type ActivityPrescriptionQuantificationBundle,
  type ContentVisibility,
  canonicalTrainingPlanStructureSchema,
  contentVisibilitySchema,
  mapPlanningContextToCanonicalTrainingPlanStructure,
  mapPlanningContextToTrainingPlanCreateInput,
  mapPlanningContextToTrainingPlanUpdateInput,
  trainingPlanSchema,
} from "@repo/core";
import type { z } from "zod";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import { createTrainingPlanPlanningContext } from "./planning-context";
import { trainingPlanBuilderStateSchema } from "./schemas";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderState,
  TrainingPlanFinalCreatePayload,
  TrainingPlanFinalUpdatePayload,
} from "./types";

type TrainingPlanStructure = z.output<typeof canonicalTrainingPlanStructureSchema>;

function parsePersistedCanonicalStructure(structure: unknown): TrainingPlanStructure {
  const persisted = trainingPlanSchema.safeParse(structure);
  if (persisted.success) {
    const { id: _id, ...canonical } = persisted.data;
    return canonicalTrainingPlanStructureSchema.parse(canonical);
  }
  return canonicalTrainingPlanStructureSchema.parse(structure);
}

type HydratableTrainingPlan = {
  id: string;
  name: string;
  description?: string | null;
  structure: unknown;
  content_visibility: ContentVisibility;
};

type HydratableActivityPlan = {
  id: string;
  name: string;
  content_visibility: string;
  is_system_template?: boolean | null;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
};

function toActivityPlanFacts(activityPlan: HydratableActivityPlan): TrainingPlanActivityPlanFacts {
  return {
    id: activityPlan.id,
    name: activityPlan.name,
    published:
      activityPlan.content_visibility === "public" || activityPlan.is_system_template === true,
    accessible: true,
    prescriptionQuantification: activityPlan.prescriptionQuantification ?? null,
  };
}

export function toTrainingPlanStructure(state: TrainingPlanBuilderState): TrainingPlanStructure {
  return mapPlanningContextToCanonicalTrainingPlanStructure(
    createTrainingPlanPlanningContext(state),
  );
}

export function toTrainingPlanCreatePayload(
  state: TrainingPlanBuilderState,
): TrainingPlanFinalCreatePayload {
  return mapPlanningContextToTrainingPlanCreateInput({
    context: createTrainingPlanPlanningContext(state),
    name: state.details.name.trim(),
    description: state.details.description,
    isActive: true,
    contentVisibility: state.details.contentVisibility,
  });
}

export function toTrainingPlanUpdatePayload(
  planId: string,
  state: TrainingPlanBuilderState,
): TrainingPlanFinalUpdatePayload {
  return mapPlanningContextToTrainingPlanUpdateInput({
    planId,
    context: createTrainingPlanPlanningContext(state),
    name: state.details.name.trim(),
    description: state.details.description,
    contentVisibility: state.details.contentVisibility,
  });
}

export function getTrainingPlanStructureActivityPlanIds(structure: unknown): string[] {
  let parsed: TrainingPlanStructure;
  try {
    parsed = parsePersistedCanonicalStructure(structure);
  } catch {
    return [];
  }

  return Array.from(new Set(parsed.sessions.map((session) => session.activity_plan_id)));
}

export function createTrainingPlanBuilderStateFromExistingPlan({
  activityPlans,
  fallbackDate,
  plan,
}: {
  activityPlans: HydratableActivityPlan[];
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

  return trainingPlanBuilderStateSchema.parse({
    ...defaultState,
    details: {
      name: plan.name,
      description: plan.description ?? "",
      contentVisibility: contentVisibilitySchema.parse(plan.content_visibility),
    },
    anchorDate,
    goalContext: {
      selectedGoals: (
        planningSnapshot?.goal_context.selected_goals ??
        structure.goal_blueprints ??
        []
      ).map((goal, index) => ({
        localId: `existing-goal-${index}`,
        title: goal.title,
        sourceProfileGoalId:
          "source_profile_goal_id" in goal ? goal.source_profile_goal_id : undefined,
        targetOffsetDays: goal.target_offset_days ?? null,
        targetDate: "target_date" in goal ? goal.target_date : undefined,
        priority: goal.priority,
        activityCategory: goal.activity_category ?? null,
        objective: goal.objective ?? null,
      })),
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
  });
}
