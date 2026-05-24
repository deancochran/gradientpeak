import type { CalendarEventActivityPlan } from "@/lib/calendar/normalizeEvents";
import type { GroupEventListItem } from "@/lib/groups";

export type CalendarGroupEvent = GroupEventListItem & {
  selectedActivityPlan?: CalendarEventActivityPlan | null;
  selectedActivityPlanOptionLabel?: string | null;
  selectedActivityPlanTentative?: boolean;
};

type ActivityPlanLookupItem = CalendarEventActivityPlan & { id?: string | null };

export function getSelectedGroupEventActivityPlanOption(event: GroupEventListItem) {
  if (event.viewerRsvp?.status === "declined" || event.viewerRsvp?.status === "tentative") {
    return null;
  }

  const selectedOptionId = event.viewerRsvp?.selected_group_event_activity_plan_id ?? null;
  if (event.viewerRsvp?.status === "accepted" && selectedOptionId) {
    return event.activityPlanOptions.find((option) => option.id === selectedOptionId) ?? null;
  }

  if (
    (event.viewerRsvp?.status === "accepted" || event.viewerSeriesRsvp?.status === "accepted") &&
    event.activityPlanOptions.length === 1
  ) {
    return event.activityPlanOptions[0] ?? null;
  }

  return null;
}

export function getDisplayGroupEventActivityPlanOption(event: GroupEventListItem) {
  const selectedOption = getSelectedGroupEventActivityPlanOption(event);
  if (selectedOption) return { option: selectedOption, tentative: false };

  const defaultOption = event.activityPlanOptions[0];
  if (!defaultOption) return null;

  if (event.viewerRsvp?.status === "declined" || event.viewerSeriesRsvp?.status === "declined") {
    return null;
  }

  if (event.viewerRsvp?.status === "tentative" || event.viewerSeriesRsvp?.status === "tentative") {
    return { option: defaultOption, tentative: true };
  }

  if (event.viewerRsvp?.status === "accepted" || event.viewerSeriesRsvp?.status === "accepted") {
    return { option: defaultOption, tentative: false };
  }

  if (!event.viewerRsvp && !event.viewerSeriesRsvp) {
    return { option: defaultOption, tentative: true };
  }

  return null;
}

export function getSelectedGroupEventActivityPlanId(event: GroupEventListItem) {
  return getSelectedGroupEventActivityPlanOption(event)?.activity_plan_id ?? null;
}

export function getSelectedGroupEventActivityPlanIds(events: GroupEventListItem[]) {
  return Array.from(
    new Set(
      events
        .map(
          (event) => getDisplayGroupEventActivityPlanOption(event)?.option.activity_plan_id ?? null,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

export function attachSelectedGroupEventActivityPlans(
  events: GroupEventListItem[],
  activityPlans: ActivityPlanLookupItem[],
): CalendarGroupEvent[] {
  const planById = new Map(activityPlans.map((plan) => [plan.id, plan]));

  return events.map((event) => {
    const selectedOption = getDisplayGroupEventActivityPlanOption(event);
    const selectedActivityPlan = selectedOption?.option
      ? (planById.get(selectedOption.option.activity_plan_id) ?? null)
      : null;

    return {
      ...event,
      selectedActivityPlan,
      selectedActivityPlanOptionLabel: selectedOption?.option.label ?? null,
      selectedActivityPlanTentative: selectedOption?.tentative ?? false,
    };
  });
}

export function buildGroupEventsByDate(events: CalendarGroupEvent[]) {
  const map = new Map<string, CalendarGroupEvent[]>();

  for (const event of events) {
    const dateKey = event.starts_at.split("T")[0];
    if (!dateKey) continue;
    const items = map.get(dateKey) ?? [];
    items.push(event);
    map.set(dateKey, items);
  }

  for (const [dateKey, dayEvents] of map.entries()) {
    map.set(
      dateKey,
      [...dayEvents].sort(
        (left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
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
    scheduled_date: event.starts_at.split("T")[0] ?? null,
    recurrence_rule: event.recurrence_rule,
    activity_plan: event.selectedActivityPlan,
    tentative: event.selectedActivityPlanTentative ?? false,
  };
}
