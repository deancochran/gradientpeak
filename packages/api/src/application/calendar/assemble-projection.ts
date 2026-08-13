import {
  activityDisplayModelSchema,
  type CalendarProjectionItem,
  type CalendarProjectionRange,
  calendarProjectionRangeSchema,
  compareCalendarProjectionItems,
  type SemanticMetric,
} from "@repo/core";
import { z } from "zod";

import { toScheduledActivityPlanSummary } from "../activity-plans/read-projections";

const eventSourceSchema = z.looseObject({
  id: z.string(),
  event_type: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  scheduled_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  all_day: z.boolean(),
  status: z.enum(["scheduled", "completed", "cancelled", "expired"]),
  linked_activity_id: z.string().nullable(),
  training_plan_id: z.string().nullable().optional(),
  activity_plan: z.unknown().nullable(),
});

const completedActivitySourceSchema = z.looseObject({
  id: z.string(),
  name: z.string().nullable().optional(),
  scheduled_date: z.string(),
  started_at: z.string(),
  distance_meters: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  display: activityDisplayModelSchema,
});

const groupEventSourceSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  scheduled_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable().optional(),
  timezone: z.string(),
  selectedActivityPlan: z.unknown().nullable(),
  group: z.strictObject({ id: z.string(), name: z.string() }),
  viewerRsvp: z.looseObject({ status: z.string() }).nullable(),
});

const goalSourceSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  target_date: z.string(),
  goalTypeLabel: z.string(),
  objectiveSummary: z.string(),
});

function metric(
  key: SemanticMetric["key"],
  label: string,
  value: number | null | undefined,
  unit: string,
  estimated = false,
): SemanticMetric | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return estimated
    ? { key, label, status: "partial", value, unit, reason: "estimate" }
    : { key, label, status: "available", value, unit, reason: null };
}

function eventDurationSeconds(event: z.infer<typeof eventSourceSchema>): number | null {
  if (event.all_day || !event.ends_at) return null;
  const duration = (Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 1_000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function assembleCalendarProjectionRange(input: {
  viewerId: string;
  startDate: string;
  endDateExclusive: string;
  timezone: string;
  events: unknown[];
  completedActivities: unknown[];
  goals: unknown[];
  groupEvents: unknown[];
  truncation: {
    events: boolean;
    completedActivities: boolean;
    groupEvents: boolean;
    goals: boolean;
  };
}): CalendarProjectionRange {
  const items: CalendarProjectionItem[] = [];
  const isInRange = (calendarDate: string) =>
    calendarDate >= input.startDate && calendarDate < input.endDateExclusive;

  for (const event of eventSourceSchema
    .array()
    .parse(input.events)
    .filter((item) => isInRange(item.scheduled_date))) {
    const isPlanned = event.event_type === "planned" && event.activity_plan !== null;
    const plan = isPlanned
      ? toScheduledActivityPlanSummary({
          plan: event.activity_plan,
          viewerId: input.viewerId,
          eventId: event.id,
          calendarDate: event.scheduled_date,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          allDay: event.all_day,
          status: event.status,
          trainingPlanId: event.training_plan_id ?? null,
        })
      : null;
    const duration = metric(
      "elapsed_duration",
      "Duration",
      eventDurationSeconds(event),
      "seconds",
      isPlanned,
    );
    items.push({
      id: event.id,
      calendarDate: event.scheduled_date,
      timing: {
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        allDay: event.all_day,
        timezone: input.timezone,
      },
      kind: isPlanned ? "planned_activity" : "event",
      title: plan?.name ?? event.title?.trim() ?? "Event",
      subtitle: event.description?.trim() || event.notes?.trim() || null,
      status: event.status,
      navigation: { target: "event", href: `/calendar/events/${event.id}` },
      metrics: plan?.metrics ?? (duration ? [duration] : []),
      estimated: isPlanned,
      partial: plan?.metrics.some((item) => item.status !== "available") ?? false,
      plan,
      activity: null,
      event: {
        type: z.enum(["planned", "race_target", "custom"]).parse(event.event_type),
        trainingPlanId: event.training_plan_id ?? null,
      },
      groupEvent: null,
      goal: null,
    });
  }

  for (const activity of completedActivitySourceSchema
    .array()
    .parse(input.completedActivities)
    .filter((item) => isInRange(item.scheduled_date))) {
    const metrics = [
      metric("distance", "Distance", activity.distance_meters, "meters"),
      metric("elapsed_duration", "Duration", activity.duration_seconds, "seconds"),
    ].filter((item): item is SemanticMetric => item !== null);
    items.push({
      id: activity.id,
      calendarDate: activity.scheduled_date,
      timing: {
        startsAt: activity.started_at,
        endsAt: null,
        allDay: false,
        timezone: input.timezone,
      },
      kind: "completed_activity",
      title: activity.name?.trim() || "Completed activity",
      subtitle: null,
      status: "completed",
      navigation: { target: "activity", href: `/activities/${activity.id}` },
      metrics,
      estimated: false,
      partial: false,
      plan: null,
      activity: activity.display,
      event: null,
      groupEvent: null,
      goal: null,
    });
  }

  for (const event of groupEventSourceSchema
    .array()
    .parse(input.groupEvents)
    .filter((item) => isInRange(item.scheduled_date))) {
    const plan = event.selectedActivityPlan
      ? toScheduledActivityPlanSummary({
          plan: event.selectedActivityPlan,
          viewerId: input.viewerId,
          eventId: event.id,
          calendarDate: event.scheduled_date,
          startsAt: event.starts_at,
          endsAt: event.ends_at ?? null,
          allDay: false,
          status: "scheduled",
          trainingPlanId: null,
        })
      : null;
    items.push({
      id: event.id,
      calendarDate: event.scheduled_date,
      timing: {
        startsAt: event.starts_at,
        endsAt: event.ends_at ?? null,
        allDay: false,
        timezone: event.timezone,
      },
      kind: "group_event",
      title: event.title,
      subtitle: event.description?.trim() || null,
      status: "scheduled",
      navigation: { target: "group_event", href: `/groups/events/${event.id}` },
      metrics: plan?.metrics ?? [],
      estimated: plan !== null,
      partial: plan?.metrics.some((item) => item.status !== "available") ?? false,
      plan,
      activity: null,
      event: null,
      groupEvent: {
        group: event.group,
        viewerRsvpStatus: event.viewerRsvp?.status === "declined" ? "declined" : null,
      },
      goal: null,
    });
  }

  for (const goal of goalSourceSchema
    .array()
    .parse(input.goals)
    .filter((item) => isInRange(item.target_date))) {
    items.push({
      id: goal.id,
      calendarDate: goal.target_date,
      timing: { startsAt: null, endsAt: null, allDay: true, timezone: input.timezone },
      kind: "goal",
      title: goal.title,
      subtitle: null,
      status: "active",
      navigation: { target: "goal", href: `/goals/${goal.id}` },
      metrics: [],
      estimated: false,
      partial: false,
      plan: null,
      activity: null,
      event: null,
      groupEvent: null,
      goal: {
        typeLabel: goal.goalTypeLabel,
        objectiveSummary: goal.objectiveSummary,
      },
    });
  }

  const sorted = items.sort(compareCalendarProjectionItems);
  const truncated = Object.values(input.truncation).some(Boolean);
  return calendarProjectionRangeSchema.parse({
    contractVersion: "calendar-projection-v1",
    startDate: input.startDate,
    endDateExclusive: input.endDateExclusive,
    timezone: input.timezone,
    items: sorted,
    truncated,
    truncation: input.truncation,
  });
}
