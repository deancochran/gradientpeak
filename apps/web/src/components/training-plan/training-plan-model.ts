import {
  type CanonicalTrainingPlanStructure,
  canonicalTrainingPlanStructureSchema,
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
  if (!parsed.success) return [];

  return parsed.data.sessions.map((session) => ({
    activityPlanId: session.activity_plan_id,
    draftId: `${session.offset_days}-${session.activity_plan_id}-${session.event_overrides?.title ?? ""}`,
    offsetDays: session.offset_days,
    title: session.event_overrides?.title ?? "",
  }));
}

export function summarizeTrainingPlan(structure: unknown) {
  const parsed = canonicalTrainingPlanStructureSchema.safeParse(structure);
  if (!parsed.success || parsed.data.sessions.length === 0) {
    return { durationDays: 0, sessionCount: 0, weekCount: 0 };
  }

  const durationDays = Math.max(...parsed.data.sessions.map((session) => session.offset_days)) + 1;
  return {
    durationDays,
    sessionCount: parsed.data.sessions.length,
    weekCount: Math.ceil(durationDays / 7),
  };
}

export function moveScheduledWorkout<T extends { id: string; scheduled_date: string }>(
  workouts: readonly T[],
  workoutId: string,
  days: number,
): T[] {
  return workouts.map((workout) => {
    if (workout.id !== workoutId) return { ...workout };
    const date = new Date(`${workout.scheduled_date}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return { ...workout, scheduled_date: date.toISOString().slice(0, 10) };
  });
}

export function buildWorkoutReorderInput<
  T extends { id: string; scheduled_date: string; training_plan_id: string },
>(original: readonly T[], next: readonly T[]) {
  const originalById = new Map(original.map((workout) => [workout.id, workout]));
  const changed = next.filter(
    (workout) => originalById.get(workout.id)?.scheduled_date !== workout.scheduled_date,
  );
  if (changed.length === 0) return null;

  const trainingPlanId = changed[0]?.training_plan_id;
  if (
    !trainingPlanId ||
    changed.some((workout) => workout.training_plan_id !== trainingPlanId) ||
    changed.some((workout) => originalById.get(workout.id)?.training_plan_id !== trainingPlanId)
  ) {
    throw new Error("Save changes for one training plan at a time.");
  }

  return {
    training_plan_id: trainingPlanId,
    changes: changed.map((workout) => {
      const previous = originalById.get(workout.id);
      if (!previous) throw new Error("Workout schedule changed; reload and try again.");
      return {
        event_id: workout.id,
        expected_scheduled_date: previous.scheduled_date,
        requested_scheduled_date: workout.scheduled_date,
      };
    }),
  };
}
