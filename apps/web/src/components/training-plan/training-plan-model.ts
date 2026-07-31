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

export function moveScheduledActivity<T extends { id: string; scheduled_date: string }>(
  activities: readonly T[],
  activityId: string,
  days: number,
): T[] {
  return activities.map((activity) => {
    if (activity.id !== activityId) return { ...activity };
    const date = new Date(`${activity.scheduled_date}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return { ...activity, scheduled_date: date.toISOString().slice(0, 10) };
  });
}

export function buildActivityReorderInput<
  T extends { id: string; scheduled_date: string; training_plan_id: string },
>(original: readonly T[], next: readonly T[]) {
  const originalById = new Map(original.map((activity) => [activity.id, activity]));
  const changed = next.filter(
    (activity) => originalById.get(activity.id)?.scheduled_date !== activity.scheduled_date,
  );
  if (changed.length === 0) return null;

  const trainingPlanId = changed[0]?.training_plan_id;
  if (
    !trainingPlanId ||
    changed.some((activity) => activity.training_plan_id !== trainingPlanId) ||
    changed.some((activity) => originalById.get(activity.id)?.training_plan_id !== trainingPlanId)
  ) {
    throw new Error("Save changes for one training plan at a time.");
  }

  return {
    training_plan_id: trainingPlanId,
    changes: changed.map((activity) => {
      const previous = originalById.get(activity.id);
      if (!previous) throw new Error("Activity schedule changed; reload and try again.");
      return {
        event_id: activity.id,
        expected_scheduled_date: previous.scheduled_date,
        requested_scheduled_date: activity.scheduled_date,
      };
    }),
  };
}
