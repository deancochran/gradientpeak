import { toDateKey } from "@/lib/calendar/dateMath";
import type { CalendarEventActivityPlan } from "@/lib/calendar/normalizeEvents";
import type { GroupEventListItem } from "@/lib/groups";

export type CalendarGroupEvent = GroupEventListItem & {
  selectedActivityPlan?: CalendarEventActivityPlan | null;
  selectedActivityPlanOptionLabel?: string | null;
  selectedActivityPlanTentative?: boolean;
};

type GroupEventListItemWithActivityPlan = GroupEventListItem & {
  activity_plan?: CalendarEventActivityPlan | null;
};

export function getSelectedGroupEventActivityPlan(event: GroupEventListItemWithActivityPlan) {
  if (event.viewerRsvp?.status === "declined" || event.viewerRsvp?.status === "tentative") {
    return null;
  }

  if (event.viewerRsvp?.status === "accepted" || event.viewerSeriesRsvp?.status === "accepted") {
    return event.activity_plan ?? null;
  }

  return null;
}

export function getDisplayGroupEventActivityPlan(event: GroupEventListItemWithActivityPlan) {
  const selectedActivityPlan = getSelectedGroupEventActivityPlan(event);
  if (selectedActivityPlan) return { activityPlan: selectedActivityPlan, tentative: false };

  const activityPlan = event.activity_plan ?? null;
  if (!activityPlan) return null;

  if (event.viewerRsvp?.status === "declined" || event.viewerSeriesRsvp?.status === "declined") {
    return null;
  }

  if (event.viewerRsvp?.status === "tentative" || event.viewerSeriesRsvp?.status === "tentative") {
    return { activityPlan, tentative: true };
  }

  if (event.viewerRsvp?.status === "accepted" || event.viewerSeriesRsvp?.status === "accepted") {
    return { activityPlan, tentative: false };
  }

  if (!event.viewerRsvp && !event.viewerSeriesRsvp) {
    return { activityPlan, tentative: true };
  }

  return null;
}

export function getSelectedGroupEventActivityPlanId(event: GroupEventListItemWithActivityPlan) {
  return getSelectedGroupEventActivityPlan(event)?.id ?? event.activity_plan_id ?? null;
}

export function getSelectedGroupEventActivityPlanIds(events: GroupEventListItem[]) {
  return Array.from(
    new Set(
      events
        .map(
          (event) =>
            getDisplayGroupEventActivityPlan(event)?.activityPlan.id ?? event.activity_plan_id,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

export function attachSelectedGroupEventActivityPlans(
  events: GroupEventListItem[],
  activityPlans: CalendarEventActivityPlan[],
): CalendarGroupEvent[] {
  const planById = new Map(activityPlans.map((plan) => [plan.id, plan]));

  return events.map((event) => {
    const displayPlan = getDisplayGroupEventActivityPlan(event);
    const selectedActivityPlan = displayPlan?.activityPlan
      ? displayPlan.activityPlan.id
        ? (planById.get(displayPlan.activityPlan.id) ?? displayPlan.activityPlan)
        : displayPlan.activityPlan
      : event.activity_plan_id
        ? (planById.get(event.activity_plan_id) ?? null)
        : null;

    return {
      ...event,
      selectedActivityPlan,
      selectedActivityPlanOptionLabel: selectedActivityPlan?.name ?? null,
      selectedActivityPlanTentative: displayPlan?.tentative ?? false,
    };
  });
}

export function buildGroupEventsByDate(events: CalendarGroupEvent[]) {
  const map = new Map<string, CalendarGroupEvent[]>();

  for (const event of events) {
    const startsAt = new Date(event.starts_at);
    if (Number.isNaN(startsAt.getTime())) continue;
    const dateKey = toDateKey(startsAt);
    const items = map.get(dateKey) ?? [];
    items.push(event);
    map.set(dateKey, items);
  }

  for (const [dateKey, dayEvents] of map.entries()) {
    map.set(
      dateKey,
      [...dayEvents].sort(
        (left, right) =>
          new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime() ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      ),
    );
  }

  return map;
}

export function toGroupEventScheduledActivityPlanEvent(event: CalendarGroupEvent) {
  if (!event.selectedActivityPlan) return null;

  return {
    id: event.id,
    starts_at: event.starts_at,
    scheduled_date: toDateKey(new Date(event.starts_at)),
    recurrence_rule: event.recurrence_rule,
    activity_plan: event.selectedActivityPlan,
    tentative: event.selectedActivityPlanTentative ?? false,
  };
}
