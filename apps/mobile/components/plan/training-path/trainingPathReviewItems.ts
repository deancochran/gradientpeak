import type { TrainingPathCompletedActivity, TrainingPathScheduledItem } from "./trainingPathTypes";

export type ScheduledWeekEvent = {
  id?: string | null;
  event_type?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  notes?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  all_day?: boolean | null;
  recurrence_rule?: string | null;
  recurrence?: { rule?: string | null } | null;
  series_id?: string | null;
  scheduled_date?: string | null;
  linked_activity_id?: string | null;
  training_plan_id?: string | null;
  completed?: boolean | null;
  status?: string | null;
  activity_plan?: {
    id?: string | null;
    name?: string | null;
    title?: string | null;
    activity_category?: string | null;
    description?: string | null;
    notes?: string | null;
    estimated_tss?: number | null;
    authoritative_metrics?: {
      estimated_duration?: number | null;
      estimated_tss?: number | null;
      intensity_factor?: number | null;
      estimated_distance?: number | null;
    } | null;
  } | null;
  owner?: ActivityOwner | null;
};

export type CompletedWeekActivity = {
  id: string;
  profile_id?: string | null;
  name?: string | null;
  started_at?: string | Date | null;
  derived?: {
    tss?: number | null;
    stress?: {
      tss?: number | null;
    } | null;
  } | null;
};

export type ActivityOwner = {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

export type TrainingPathGroupReviewEvent = NonNullable<TrainingPathScheduledItem["groupEvent"]>;

function getScheduledEventDate(event: ScheduledWeekEvent) {
  return event.scheduled_date ?? event.starts_at?.split("T")[0] ?? null;
}

function getScheduledEventTitle(event: ScheduledWeekEvent) {
  return (
    event.activity_plan?.name ??
    event.activity_plan?.title ??
    event.title ??
    event.name ??
    "Scheduled session"
  );
}

function getScheduledEventLoad(event: ScheduledWeekEvent) {
  return (
    event.activity_plan?.authoritative_metrics?.estimated_tss ??
    event.activity_plan?.estimated_tss ??
    null
  );
}

export function toTrainingPathScheduledItem(
  event: ScheduledWeekEvent,
  index: number,
): TrainingPathScheduledItem | null {
  const date = getScheduledEventDate(event);
  if (!date) return null;
  return {
    id: event.id ?? `${date}-${index}`,
    title: getScheduledEventTitle(event),
    date,
    estimatedLoad: getScheduledEventLoad(event),
    activityPlanId: event.activity_plan?.id ?? null,
    event: {
      id: event.id ?? `${date}-${index}`,
      event_type: event.event_type,
      title: event.title ?? event.name ?? null,
      description: event.description,
      notes: event.notes,
      scheduled_date: event.scheduled_date,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      all_day: event.all_day,
      recurrence_rule: event.recurrence_rule,
      recurrence: event.recurrence,
      series_id: event.series_id,
      linked_activity_id: event.linked_activity_id,
      training_plan_id: event.training_plan_id,
      completed: event.completed,
      status: event.status,
      owner: event.owner ?? null,
      activity_plan: event.activity_plan,
    },
    activityPlan: event.activity_plan?.id
      ? {
          id: event.activity_plan.id,
          name: getScheduledEventTitle(event),
          activity_category: event.activity_plan.activity_category ?? "other",
          description: event.activity_plan.description,
          notes: event.activity_plan.notes,
          authoritative_metrics: event.activity_plan.authoritative_metrics,
        }
      : null,
    plannedActivity: event.activity_plan?.id
      ? {
          id: event.id ?? `${date}-${index}`,
          activity_plan_id: event.activity_plan.id,
          scheduled_date: event.starts_at ?? event.scheduled_date ?? date,
          activity_plan: {
            id: event.activity_plan.id,
            name: getScheduledEventTitle(event),
            activity_category: event.activity_plan.activity_category ?? "other",
            description: event.activity_plan.description,
            notes: event.activity_plan.notes,
            authoritative_metrics: event.activity_plan.authoritative_metrics,
          },
        }
      : null,
  };
}

export function buildTrainingPathScheduledReviewItems(input: {
  plannedEvents?: ScheduledWeekEvent[] | null;
  groupScheduledActivityPlanEvents?: ScheduledWeekEvent[] | null;
  groupEvents?: TrainingPathGroupReviewEvent[] | null;
}) {
  const scheduledEvents = [
    ...(input.plannedEvents ?? []),
    ...(input.groupScheduledActivityPlanEvents ?? []),
  ]
    .map(toTrainingPathScheduledItem)
    .filter((item): item is TrainingPathScheduledItem => item != null);
  const groupEvents = (input.groupEvents ?? [])
    .filter(
      (event) =>
        event.viewerRsvp?.status !== "declined" && event.viewerSeriesRsvp?.status !== "declined",
    )
    .map<TrainingPathScheduledItem | null>((event, index) => {
      const date = event.starts_at.split("T")[0] ?? null;
      if (!date) return null;
      return {
        id: event.id ?? `${date}-group-${index}`,
        title: event.title ?? "Group event",
        date,
        groupEvent: event,
      } satisfies TrainingPathScheduledItem;
    })
    .filter((item): item is TrainingPathScheduledItem => item != null);

  return [...scheduledEvents, ...groupEvents].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export function buildTrainingPathEventReviewItems(input: {
  events?: ScheduledWeekEvent[] | null;
  owner?: ActivityOwner | null;
}) {
  const seenEventIds = new Set<string>();

  return (input.events ?? [])
    .filter((event) => {
      if (!event.id) return true;
      if (seenEventIds.has(event.id)) return false;

      seenEventIds.add(event.id);
      return true;
    })
    .map((event, index) =>
      toTrainingPathScheduledItem({ ...event, owner: event.owner ?? input.owner }, index),
    )
    .filter((item): item is TrainingPathScheduledItem => item != null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function buildTrainingPathGroupEventReviewItems(input: {
  groupEvents?: TrainingPathGroupReviewEvent[] | null;
}) {
  return (input.groupEvents ?? [])
    .filter(
      (event) =>
        event.viewerRsvp?.status !== "declined" && event.viewerSeriesRsvp?.status !== "declined",
    )
    .map<TrainingPathScheduledItem | null>((event, index) => {
      const date = event.starts_at.split("T")[0] ?? null;
      if (!date) return null;
      return {
        id: event.id ?? `${date}-group-${index}`,
        title: event.title ?? "Group event",
        date,
        groupEvent: event,
      } satisfies TrainingPathScheduledItem;
    })
    .filter((item): item is TrainingPathScheduledItem => item != null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function getCompletedActivityDate(activity: CompletedWeekActivity) {
  if (!activity.started_at) return null;
  const value =
    activity.started_at instanceof Date ? activity.started_at.toISOString() : activity.started_at;
  return value.split("T")[0] ?? null;
}

export function toTrainingPathCompletedActivity(
  activity: CompletedWeekActivity,
  owner: ActivityOwner | null,
): TrainingPathCompletedActivity | null {
  const date = getCompletedActivityDate(activity);
  if (!date) return null;
  return {
    id: activity.id,
    title: activity.name?.trim() || "Completed activity",
    date,
    load: activity.derived?.stress?.tss ?? activity.derived?.tss ?? null,
    activity: owner ? { ...activity, profile: owner } : activity,
  };
}
