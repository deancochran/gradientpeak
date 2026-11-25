import {
  type CanonicalActivityCategory,
  type CanonicalTrainingPlanStructure,
  type CanonicalTrainingPlanStructureSession,
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
} from "@repo/core";

export type TrainingPlanSessionDraft = {
  activityPlanId: string | null;
  activityCategory: CanonicalActivityCategory;
  draftId?: string;
  offsetDays: number;
  source?: CanonicalTrainingPlanStructureSession;
  title: string;
};

export function buildTrainingPlanStructure(
  sessions: readonly TrainingPlanSessionDraft[],
  sourceStructure?: unknown,
): CanonicalTrainingPlanStructure {
  const source = sourceStructure
    ? parseCanonicalStructure(sourceStructure)
    : defaultTrainingPlanStructure;

  return canonicalTrainingPlanStructureSchema.parse({
    ...source,
    sessions: [...sessions]
      .sort((left, right) => left.offsetDays - right.offsetDays)
      .map((session) => {
        const sessionSource = session.source;
        const { event_overrides: _sourceEventOverrides, ...sessionBase } = sessionSource ?? {};
        const sourceTitle = sessionSource?.event_overrides?.title ?? "";
        const title = session.title.trim();
        const { title: _sourceTitle, ...sourceOverrides } = sessionSource?.event_overrides ?? {};
        const eventOverrides =
          title === sourceTitle
            ? sessionSource?.event_overrides
            : title
              ? { ...sourceOverrides, title }
              : Object.keys(sourceOverrides).length > 0
                ? sourceOverrides
                : undefined;

        return {
          ...sessionBase,
          id: session.draftId ?? crypto.randomUUID(),
          activity_plan_id: session.activityPlanId,
          demand: {
            importance: "normal",
            target_common_load: null,
            target_duration_minutes: null,
            training_intent: "general_maintenance",
            ...sessionSource?.demand,
            activity_category: session.activityCategory,
          },
          offset_days: session.offsetDays,
          ...(eventOverrides ? { event_overrides: eventOverrides } : {}),
        };
      }),
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
    activityCategory: session.demand.activity_category,
    draftId: session.id,
    offsetDays: session.offset_days,
    source: session,
    title: session.event_overrides?.title ?? "",
  }));
}

const defaultTrainingPlanStructure: CanonicalTrainingPlanStructure = {
  version: 1,
  plan_preferences: {
    weekly_session_count: null,
    target_weekly_duration_minutes: null,
    maximum_session_duration_minutes: null,
    preferred_weekdays: [],
    rest_days: [],
    progression_style: null,
    recovery_priority: null,
  },
  sessions: [],
};

function parseCanonicalStructure(structure: unknown): CanonicalTrainingPlanStructure {
  const canonical = canonicalTrainingPlanStructureSchema.safeParse(structure);
  if (canonical.success) return canonical.data;

  const persisted = persistedTrainingPlanStructureSchema.parse(structure);
  const { id: _id, ...withoutId } = persisted;
  return canonicalTrainingPlanStructureSchema.parse(withoutId);
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
