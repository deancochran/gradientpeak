import { ROUTES } from "@/lib/constants/routes";

type CalendarEventType = "planned" | "rest_day" | "race_target" | "custom" | "imported";

interface CalendarRoutingEvent {
  id: string;
  event_type?: CalendarEventType;
}

export function buildOpenEventRoute(event: CalendarRoutingEvent): string | null {
  if (event.event_type === "planned") {
    return ROUTES.PLAN.EVENT_DETAIL(event.id);
  }

  if (
    event.event_type === "rest_day" ||
    event.event_type === "race_target" ||
    event.event_type === "custom"
  ) {
    return ROUTES.PLAN.EVENT_DETAIL(event.id);
  }

  return null;
}

export function buildEditEventRoute(event: CalendarRoutingEvent): string | null {
  if (
    event.event_type === "rest_day" ||
    event.event_type === "race_target" ||
    event.event_type === "custom"
  ) {
    return ROUTES.PLAN.EVENT_DETAIL(event.id, "edit");
  }

  return null;
}
