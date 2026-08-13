import {
  type CanonicalTrainingPlanStructure,
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
} from "@repo/core";

export type TrainingPlanSessionDraft = {
  activityPlanId: string;
  draftId?: string;
  offsetDays: number;
  title: string;
};

export function buildTrainingPlanStructure(
  sessions: readonly TrainingPlanSessionDraft[],
): CanonicalTrainingPlanStructure {
  return canonicalTrainingPlanStructureSchema.parse({
    version: 1,
    sessions: [...sessions]
      .sort((left, right) => left.offsetDays - right.offsetDays)
      .map((session) => ({
        activity_plan_id: session.activityPlanId,
        offset_days: session.offsetDays,
        ...(session.title.trim() ? { event_overrides: { title: session.title.trim() } } : {}),
      })),
    builder_planning_snapshot: {
      version: 1,
      plan_preferences: {
        duration_weeks: null,
        weekly_session_count: null,
        target_weekly_hours: null,
        rest_days_per_week: null,
      },
      scheduling: { preferred_weekdays: [] },
      goal_context: { selected_goals: [] },
    },
  });
}

export function toTrainingPlanSessionDrafts(structure: unknown): TrainingPlanSessionDraft[] {
  const parsed = canonicalTrainingPlanStructureSchema.safeParse(structure);
  const persisted = parsed.success
    ? parsed
    : persistedTrainingPlanStructureSchema.safeParse(structure);
  if (!persisted.success) return [];

  return persisted.data.sessions.map((session) => ({
    activityPlanId: session.activity_plan_id,
    draftId: `${session.offset_days}-${session.activity_plan_id}-${session.event_overrides?.title ?? ""}`,
    offsetDays: session.offset_days,
    title: session.event_overrides?.title ?? "",
  }));
}

export function summarizeTrainingPlan(structure: unknown) {
  const parsed = canonicalTrainingPlanStructureSchema.safeParse(structure);
  const persisted = parsed.success
    ? parsed
    : persistedTrainingPlanStructureSchema.safeParse(structure);
  if (!persisted.success || persisted.data.sessions.length === 0) {
    return { durationDays: 0, sessionCount: 0, weekCount: 0 };
  }

  const durationDays =
    Math.max(...persisted.data.sessions.map((session) => session.offset_days)) + 1;
  return {
    durationDays,
    sessionCount: persisted.data.sessions.length,
    weekCount: Math.ceil(durationDays / 7),
  };
}
