import { z } from "zod";
import { trainingPlanCreateInputSchema, trainingPlanUpdateInputSchema } from "../schemas";
import {
  type CanonicalTrainingPlanStructure,
  canonicalTrainingPlanStructureSchema,
} from "../schemas/training_plan_structure";
import type { PlanningContext } from "./planningContext";

const uuidSchema = z.string().uuid();

export const planningTrainingPlanCreateInputSchema = trainingPlanCreateInputSchema.strict();

export const planningTrainingPlanUpdateInputSchema = trainingPlanUpdateInputSchema
  .strict()
  .extend({ id: uuidSchema });

export type PlanningTrainingPlanCreateInput = z.infer<typeof planningTrainingPlanCreateInputSchema>;
export type PlanningTrainingPlanUpdateInput = z.infer<typeof planningTrainingPlanUpdateInputSchema>;

export type PlanningSnapshotOptions = {
  backendPlanning?: {
    projectionSource: "backend" | "local" | null;
    previewSnapshotToken: string | null;
  };
};

export function mapPlanningContextToCanonicalTrainingPlanStructure(
  context: PlanningContext,
  options: PlanningSnapshotOptions = {},
): CanonicalTrainingPlanStructure {
  const goalBlueprints = context.goals
    .filter((goal) => goal.title.trim().length > 0)
    .map((goal) => ({
      title: goal.title.trim(),
      priority: goal.priority,
      activity_category: goal.activityCategory,
      ...(goal.targetOffsetDays !== null ? { target_offset_days: goal.targetOffsetDays } : {}),
      ...(goal.objective ? { objective: goal.objective } : {}),
    }));
  const selectedGoals = context.goals.map((goal) => ({
    title: goal.title,
    target_offset_days: goal.targetOffsetDays,
    ...(goal.targetDate !== undefined ? { target_date: goal.targetDate } : {}),
    priority: goal.priority,
    activity_category: goal.activityCategory,
    objective: goal.objective,
    ...(goal.sourceProfileGoalId ? { source_profile_goal_id: goal.sourceProfileGoalId } : {}),
  }));

  return canonicalTrainingPlanStructureSchema.parse({
    version: 1,
    ...(goalBlueprints.length > 0 ? { goal_blueprints: goalBlueprints } : {}),
    builder_planning_snapshot: {
      version: 1,
      plan_preferences: {
        duration_weeks: context.preferences.durationWeeks,
        weekly_session_count: context.preferences.weeklySessionCount,
        target_weekly_hours: context.preferences.targetWeeklyHours,
        rest_days_per_week: context.preferences.restDaysPerWeek,
      },
      scheduling: {
        start_date: context.scheduling.startDate,
        preferred_weekdays: context.scheduling.preferredWeekdays,
      },
      goal_context: {
        selected_goals: selectedGoals,
      },
      ...(options.backendPlanning
        ? {
            backend_planning: {
              projection_source: options.backendPlanning.projectionSource,
              preview_snapshot_token: options.backendPlanning.previewSnapshotToken,
            },
          }
        : {}),
    },
    sessions: context.sessions
      .filter((session) => session.activityPlan !== null)
      .map((session) => {
        const eventOverrides = normalizeEventOverrides(session.eventOverrides);
        return {
          offset_days: session.offsetDays,
          activity_plan_id: session.activityPlan?.id,
          ...(eventOverrides ? { event_overrides: eventOverrides } : {}),
        };
      }),
  });
}

export function mapPlanningContextToTrainingPlanCreateInput({
  context,
  description,
  isActive = true,
  name,
  snapshotOptions = {},
}: {
  context: PlanningContext;
  description?: string | null;
  isActive?: boolean;
  name: string;
  snapshotOptions?: PlanningSnapshotOptions;
}): PlanningTrainingPlanCreateInput {
  return planningTrainingPlanCreateInputSchema.parse({
    name: name.trim(),
    description: description?.trim() || null,
    is_active: isActive,
    structure: mapPlanningContextToCanonicalTrainingPlanStructure(context, snapshotOptions),
  });
}

export function mapPlanningContextToTrainingPlanUpdateInput({
  context,
  description,
  name,
  planId,
  snapshotOptions = {},
}: {
  context: PlanningContext;
  description?: string | null;
  name: string;
  planId: string;
  snapshotOptions?: PlanningSnapshotOptions;
}): PlanningTrainingPlanUpdateInput {
  return planningTrainingPlanUpdateInputSchema.parse({
    id: planId,
    name: name.trim(),
    description: description?.trim() || null,
    structure: mapPlanningContextToCanonicalTrainingPlanStructure(context, snapshotOptions),
  });
}

function normalizeEventOverrides(
  eventOverrides: NonNullable<PlanningContext["sessions"][number]["eventOverrides"]> | undefined,
) {
  if (!eventOverrides) {
    return undefined;
  }

  const normalized: NonNullable<PlanningContext["sessions"][number]["eventOverrides"]> = {};
  if (eventOverrides.title) {
    normalized.title = eventOverrides.title;
  }
  if (eventOverrides.description) {
    normalized.description = eventOverrides.description;
  }
  if (eventOverrides.start_time) {
    normalized.start_time = eventOverrides.start_time;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
