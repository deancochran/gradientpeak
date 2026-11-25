import { type CalendarProjectionItem, calendarProjectionItemSchema } from "@repo/core";
import { createActivityDisplay } from "./activity-display-fixture";

type CalendarProjectionFixtureInput = Partial<CalendarProjectionItem> &
  Pick<CalendarProjectionItem, "id" | "kind" | "title">;

export function createCalendarProjectionItem(
  input: CalendarProjectionFixtureInput,
): CalendarProjectionItem {
  const calendarDate = input.calendarDate ?? "2026-05-01";
  return calendarProjectionItemSchema.parse({
    calendarDate,
    timing: {
      startsAt: null,
      endsAt: null,
      allDay: true,
      timezone: "UTC",
    },
    subtitle: null,
    status: input.kind === "completed_activity" ? "completed" : "active",
    navigation: {
      target: input.kind === "completed_activity" ? "activity" : "event",
      href: `/calendar/${input.id}`,
    },
    metrics: [],
    estimated: false,
    partial: false,
    plan: null,
    activity:
      input.kind === "completed_activity"
        ? createActivityDisplay({ id: input.id, title: input.title })
        : null,
    event:
      input.kind === "planned_activity" || input.kind === "event"
        ? { type: input.kind === "planned_activity" ? "planned" : "custom", trainingPlanId: null }
        : null,
    groupEvent:
      input.kind === "group_event"
        ? { group: { id: "group-1", name: "Test group" }, viewerRsvpStatus: null }
        : null,
    goal: input.kind === "goal" ? { typeLabel: "Goal", objectiveSummary: "Complete goal" } : null,
    ...input,
  });
}
