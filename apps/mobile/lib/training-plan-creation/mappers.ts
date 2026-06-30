import {
  canonicalTrainingPlanStructureSchema,
  mapPlanningContextToCanonicalTrainingPlanStructure,
  mapPlanningContextToTrainingPlanCreateInput,
  mapPlanningContextToTrainingPlanUpdateInput,
  type PlanningSnapshotOptions,
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

export type TrainingPlanBuilderPlanningSnapshotOptions = PlanningSnapshotOptions;

type HydratableTrainingPlan = {
  id: string;
  name: string;
  description?: string | null;
  structure: unknown;
  template_visibility?: string | null;
};

type HydratableActivityPlan = {
  id: string;
  name: string;
  template_visibility?: string | null;
  is_public?: boolean | null;
  is_system_template?: boolean | null;
  authoritative_metrics?: {
    estimated_tss?: number | null;
    estimated_duration?: number | null;
  } | null;
};

function toActivityPlanFacts(activityPlan: HydratableActivityPlan): TrainingPlanActivityPlanFacts {
  return {
    id: activityPlan.id,
    name: activityPlan.name,
    published:
      activityPlan.template_visibility === "public" ||
      activityPlan.is_public === true ||
      activityPlan.is_system_template === true,
    accessible: true,
    estimatedTss: activityPlan.authoritative_metrics?.estimated_tss ?? null,
    estimatedDurationSeconds: activityPlan.authoritative_metrics?.estimated_duration ?? null,
  };
}

export function toTrainingPlanStructure(
  state: TrainingPlanBuilderState,
  options: TrainingPlanBuilderPlanningSnapshotOptions = {},
): TrainingPlanStructure {
  return mapPlanningContextToCanonicalTrainingPlanStructure(
    createTrainingPlanPlanningContext(state),
    options,
  );
}

export function toTrainingPlanCreatePayload(
  state: TrainingPlanBuilderState,
  options: TrainingPlanBuilderPlanningSnapshotOptions = {},
): TrainingPlanFinalCreatePayload {
  return mapPlanningContextToTrainingPlanCreateInput({
    context: createTrainingPlanPlanningContext(state),
    name: state.details.name.trim(),
    description: state.details.description,
    isActive: true,
    snapshotOptions: options,
  });
}

export function toTrainingPlanUpdatePayload(
  planId: string,
  state: TrainingPlanBuilderState,
  options: TrainingPlanBuilderPlanningSnapshotOptions = {},
): TrainingPlanFinalUpdatePayload {
  return mapPlanningContextToTrainingPlanUpdateInput({
    planId,
    context: createTrainingPlanPlanningContext(state),
    name: state.details.name.trim(),
    description: state.details.description,
    snapshotOptions: options,
  });
}

export function getTrainingPlanStructureActivityPlanIds(structure: unknown): string[] {
  const parsed = canonicalTrainingPlanStructureSchema.safeParse(structure);
  if (!parsed.success) {
    return [];
  }

  return Array.from(new Set(parsed.data.sessions.map((session) => session.activity_plan_id)));
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
  const structure = canonicalTrainingPlanStructureSchema.parse(plan.structure);
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
      templateVisibility: plan.template_visibility === "public" ? "public" : "private",
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
          estimatedTss: null,
          estimatedDurationSeconds: null,
        },
        ...(session.event_overrides ? { eventOverrides: session.event_overrides } : {}),
      })),
    },
    scheduling: {
      ...defaultState.scheduling,
      startDate: planningSnapshot?.scheduling.start_date ?? anchorDate,
      preferredWeekdays:
        planningSnapshot?.scheduling.preferred_weekdays ??
        defaultState.scheduling.preferredWeekdays,
    },
  });
}
