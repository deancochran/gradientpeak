import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/plan/dateGrouping", () => ({
  isActivityCompleted: (event: { completed?: boolean | null; status?: string | null }) =>
    event.completed === true || event.status === "completed",
}));

import {
  adaptCalendarEventToTimelineEvent,
  adaptGoalToTimelineEvent,
  buildTimelineEvents,
  buildTimelineEventsByDate,
  getTimelineEventAuthority,
} from "../timelineEvents";

describe("timeline events", () => {
  it("treats completed activity events as immutable historical truth", () => {
    const event = adaptCalendarEventToTimelineEvent({
      todayKey: "2026-05-06",
      event: {
        id: "event-1",
        event_type: "planned",
        scheduled_date: "2026-05-01",
        completed: true,
        activity_plan: { name: "Tempo run" },
      },
    });

    expect(event).toMatchObject({
      type: "completed_activity",
      status: "completed",
      isMutable: false,
      isDraggable: false,
    });
    expect(getTimelineEventAuthority(event!)).toEqual({
      isHistoricalTruth: true,
      canReschedule: false,
    });
  });

  it("marks only future planned activity events as draggable", () => {
    const futureEvent = adaptCalendarEventToTimelineEvent({
      todayKey: "2026-05-06",
      event: {
        id: "event-2",
        event_type: "planned",
        scheduled_date: "2026-05-09",
        activity_plan: { name: "Long ride" },
      },
    });
    const pastEvent = adaptCalendarEventToTimelineEvent({
      todayKey: "2026-05-06",
      event: {
        id: "event-3",
        event_type: "planned",
        scheduled_date: "2026-05-01",
        activity_plan: { name: "Intervals" },
      },
    });

    expect(futureEvent).toMatchObject({ status: "planned", isMutable: true, isDraggable: true });
    expect(pastEvent).toMatchObject({ status: "missed", isMutable: false, isDraggable: false });
  });

  it("adapts goals and groups mixed timeline events by date", () => {
    const goal = adaptGoalToTimelineEvent({
      id: "goal-1",
      title: "Spring marathon",
      target_date: "2026-05-09",
      activity_category: "run",
      priority: 8,
      objective: { type: "completion", distance_m: 42195 },
    } as any);
    const events = buildTimelineEvents({
      todayKey: "2026-05-06",
      goals: [
        {
          id: "goal-1",
          title: "Spring marathon",
          target_date: "2026-05-09",
          activity_category: "run",
          priority: 8,
          objective: { type: "completion", distance_m: 42195 },
        } as any,
      ],
      calendarEvents: [
        {
          id: "event-4",
          event_type: "planned",
          scheduled_date: "2026-05-09",
          activity_plan: { name: "Shakeout" },
        },
      ],
    });

    expect(goal).toMatchObject({ type: "goal", isDraggable: false, sourceType: "profile_goal" });
    expect(
      buildTimelineEventsByDate(events)
        .get("2026-05-09")
        ?.map((event) => event.type),
    ).toEqual(["goal", "planned_activity"]);
  });
});
