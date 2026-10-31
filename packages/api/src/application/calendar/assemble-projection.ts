import {
  activityDisplayModelSchema,
  type CalendarProjectionItem,
  type CalendarProjectionRange,
  calendarProjectionRangeSchema,
  compareCalendarProjectionItems,
  type SemanticMetric,
} from "@repo/core";
import { buildPlannedSessionComparison, plannedSessionSchema } from "@repo/core/calendar";
import { groupEventRsvpStatusSchema, resolveGroupEventRsvpStatus } from "@repo/core/groups";
import { z } from "zod";

import { toScheduledActivityPlanSummary } from "../activity-plans/read-projections";
import {
  type CurrentPlannedSessionPlan,
  materializeCurrentPlannedSessionProjection,
} from "./current-planned-session-projection";

const eventSourceSchema = z.looseObject({
  id: z.string(),
  event_type: z.enum(["custom", "race_target"]),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  scheduled_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  all_day: z.boolean(),
  status: z.enum(["scheduled", "completed", "cancelled", "expired"]),
  linked_activity_id: z.string().nullable(),
  linkedActivityDisplay: activityDisplayModelSchema.nullable().optional(),
});

const completedActivitySourceSchema = z.looseObject({
  id: z.string(),
  name: z.string().nullable().optional(),
  scheduled_date: z.string(),
  started_at: z.string().nullable(),
  display: activityDisplayModelSchema,
});

const plannedSessionSourceSchema = z
  .object({
    session: plannedSessionSchema,
    linkedActivityDisplay: activityDisplayModelSchema.nullable(),
    currentPlan: z.unknown().nullable().optional(),
  })
  .strict();

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
  viewerRsvp: z.looseObject({ status: groupEventRsvpStatusSchema }).nullable(),
  viewerSeriesRsvp: z.looseObject({ status: groupEventRsvpStatusSchema }).nullable(),
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

function observationFromDisplay(display: z.infer<typeof activityDisplayModelSchema> | null) {
  const metric = (key: "distance" | "elapsed_duration") =>
    display?.metrics.find((item) => item.key === key)?.value ?? null;
  return {
    durationSeconds: metric("elapsed_duration"),
    distanceMeters: metric("distance"),
  };
}

export function assembleCalendarProjectionRange(input: {
  viewerId: string;
  startDate: string;
  endDateExclusive: string;
  timezone: string;
  events: unknown[];
  plannedSessions: unknown[];
  completedActivities: unknown[];
  goals: unknown[];
  groupEvents: unknown[];
  truncation: {
    events: boolean;
    plannedSessions: boolean;
    completedActivities: boolean;
    groupEvents: boolean;
    goals: boolean;
  };
}): CalendarProjectionRange {
  const items: CalendarProjectionItem[] = [];
  const isInRange = (calendarDate: string) =>
    calendarDate >= input.startDate && calendarDate < input.endDateExclusive;
  const plannedSessionSources = plannedSessionSourceSchema
    .array()
    .parse(input.plannedSessions)
    .filter((item) => isInRange(item.session.planningDate));
  const linkedCompletionIds = new Set(
    plannedSessionSources.flatMap((source) =>
      source.session.lifecycle.status === "completed" &&
      source.session.lifecycle.completion.state === "linked"
        ? [source.session.lifecycle.completion.activityId]
        : [],
    ),
  );

  for (const event of eventSourceSchema
    .array()
    .parse(input.events)
    .filter((item) => isInRange(item.scheduled_date))) {
    const duration = metric(
      "elapsed_duration",
      "Duration",
      eventDurationSeconds(event),
      "seconds",
      false,
    );
    const isCompleted = event.status === "completed";
    const completionMetrics = event.linkedActivityDisplay?.metrics ?? [];
    const projectedMetrics = isCompleted ? completionMetrics : duration ? [duration] : [];
    items.push({
      id: event.id,
      calendarDate: event.scheduled_date,
      timing: {
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        allDay: event.all_day,
        timezone: input.timezone,
      },
      kind: "event",
      title: event.title?.trim() ?? "Event",
      subtitle: event.description?.trim() || event.notes?.trim() || null,
      status: event.status,
      navigation: { target: "event", href: `/calendar/events/${event.id}` },
      metrics: projectedMetrics,
      // A linked completion carries observations. If its activity projection is
      // unavailable, leave metrics unknown rather than rebranding the plan estimate.
      estimated: false,
      partial:
        (isCompleted && !event.linkedActivityDisplay) ||
        projectedMetrics.some((item) => item.status !== "available"),
      plan: null,
      plannedSession: null,
      plannedActual: null,
      activity: isCompleted ? (event.linkedActivityDisplay ?? null) : null,
      event: {
        type: event.event_type,
        trainingPlanId: null,
      },
      groupEvent: null,
      goal: null,
    });
  }

  for (const source of plannedSessionSources) {
    const session = source.session;
    const currentPlan = materializeCurrentPlannedSessionProjection(
      (source.currentPlan as CurrentPlannedSessionPlan | null | undefined) ?? null,
    );
    const metrics =
      source.linkedActivityDisplay?.metrics ??
      (session.lifecycle.status === "completed" ? [] : (currentPlan?.metrics ?? []));
    const plannedActual = buildPlannedSessionComparison({
      session: {
        ...(session.prescription ? { prescription: session.prescription } : {}),
        lifecycle: session.lifecycle,
      },
      actual: observationFromDisplay(source.linkedActivityDisplay),
    });
    items.push({
      id: session.id,
      calendarDate: session.planningDate,
      timing: { startsAt: null, endsAt: null, allDay: true, timezone: input.timezone },
      kind: "planned_activity",
      title: currentPlan?.title ?? "Scheduled session",
      subtitle: null,
      status: session.lifecycle.status,
      navigation: source.linkedActivityDisplay
        ? { target: "activity", href: source.linkedActivityDisplay.href }
        : { target: "activity_plan", href: "/record" },
      metrics,
      estimated:
        session.lifecycle.status === "scheduled" &&
        source.linkedActivityDisplay === null &&
        metrics.length > 0,
      partial:
        (session.lifecycle.status === "completed" && source.linkedActivityDisplay === null) ||
        metrics.some((item) => item.status !== "available"),
      plan: null,
      plannedSession: {
        id: session.id,
        profileId: session.profileId,
        sessionRevision: session.sessionRevision,
        planningDate: session.planningDate,
        source: session.source,
        prescription: session.prescription,
        lifecycle: session.lifecycle,
      },
      plannedActual,
      activity: source.linkedActivityDisplay,
      event: null,
      groupEvent: null,
      goal: null,
    });
  }

  for (const activity of completedActivitySourceSchema
    .array()
    .parse(input.completedActivities)
    .filter((item) => isInRange(item.scheduled_date) && !linkedCompletionIds.has(item.id))) {
    const metrics = activity.display.metrics;
    items.push({
      id: activity.id,
      calendarDate: activity.scheduled_date,
      timing: {
        startsAt: activity.started_at,
        endsAt: null,
        allDay: activity.started_at === null,
        timezone: input.timezone,
      },
      kind: "completed_activity",
      title: activity.name?.trim() || "Completed activity",
      subtitle: null,
      status: "completed",
      navigation: { target: "activity", href: `/activities/${activity.id}` },
      metrics,
      estimated: false,
      partial: metrics.some((item) => item.status !== "available"),
      plan: null,
      plannedSession: null,
      plannedActual: null,
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
      plannedSession: null,
      plannedActual: null,
      activity: null,
      event: null,
      groupEvent: {
        group: event.group,
        viewerRsvpStatus: resolveGroupEventRsvpStatus({
          occurrenceStatus: event.viewerRsvp?.status,
          seriesStatus: event.viewerSeriesRsvp?.status,
        }),
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
      plannedSession: null,
      plannedActual: null,
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
