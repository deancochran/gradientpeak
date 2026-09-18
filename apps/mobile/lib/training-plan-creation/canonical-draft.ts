import {
  type ActivityPlanSummary,
  type CanonicalTrainingPlanStructure,
  type ContentVisibility,
  canonicalGoalObjectiveSchema,
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
} from "@repo/core";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderEventOverrides,
  TrainingPlanBuilderState,
} from "./types";

export function buildCanonicalTrainingPlanStructure(
  state: TrainingPlanBuilderState,
): CanonicalTrainingPlanStructure {
  const goalBlueprints = state.goalContext.selectedGoals
    .filter((goal) => goal.title.trim().length > 0)
    .map((goal) => ({
      title: goal.title.trim(),
      priority: goal.priority,
      activity_category: goal.activityCategory,
      ...(goal.targetOffsetDays !== null ? { target_offset_days: goal.targetOffsetDays } : {}),
      ...(goal.objective ? { objective: goal.objective } : {}),
    }));

  return canonicalTrainingPlanStructureSchema.parse({
    version: 1,
    ...(goalBlueprints.length > 0 ? { goal_blueprints: goalBlueprints } : {}),
    plan_preferences: state.planPreferences,
    sessions: state.structure.sessions.map((session) => {
      const eventOverrides = normalizeEventOverrides(session.eventOverrides);
      return {
        id: session.id,
        offset_days: session.offsetDays,
        demand: session.demand,
        activity_plan_id: session.activityPlan?.id ?? null,
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
    return Array.from(
      new Set(
        canonical.data.sessions.flatMap((session) =>
          session.activity_plan_id === null ? [] : [session.activity_plan_id],
        ),
      ),
    );
  }
  const persisted = persistedTrainingPlanStructureSchema.safeParse(structure);
  if (!persisted.success) return [];
  return Array.from(
    new Set(
      persisted.data.sessions.flatMap((session) =>
        session.activity_plan_id === null ? [] : [session.activity_plan_id],
      ),
    ),
  );
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

  return {
    ...defaultState,
    details: {
      name: plan.name,
      description: plan.description ?? "",
      contentVisibility: plan.content_visibility,
    },
    anchorDate,
    goalContext: {
      selectedGoals: (structure.goal_blueprints ?? []).map((goal, index) => {
        const objective = canonicalGoalObjectiveSchema.safeParse(goal.objective);
        const sourceProfileGoalId =
          "source_profile_goal_id" in goal && typeof goal.source_profile_goal_id === "string"
            ? goal.source_profile_goal_id
            : null;
        const targetDate =
          "target_date" in goal && typeof goal.target_date === "string" ? goal.target_date : null;
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
    planPreferences: structure.plan_preferences,
    structure: {
      sessions: structure.sessions.map((session) => ({
        id: session.id,
        localId: session.id,
        offsetDays: session.offset_days,
        demand: session.demand,
        activityPlan:
          session.activity_plan_id === null
            ? null
            : (activityPlanFactsById.get(session.activity_plan_id) ?? {
                id: session.activity_plan_id,
                name: "Unavailable activity plan",
                published: false,
                accessible: false,
                prescriptionQuantification: null,
              }),
        ...(session.event_overrides ? { eventOverrides: session.event_overrides } : {}),
      })),
    },
    scheduling: {
      ...defaultState.scheduling,
      startDate: anchorDate,
      preferredWeekdays: structure.plan_preferences.preferred_weekdays,
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
