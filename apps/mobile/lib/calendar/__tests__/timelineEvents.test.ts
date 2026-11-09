import type { ProfileGoal } from "@repo/core";
import { describe, expect, it } from "vitest";

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
        linked_activity_id: "activity-1",
        activity_plan: { name: "Tempo run" },
      },
    });

    expect(event).toMatchObject({
      type: "completed_activity",
      status: "completed",
      isMutable: false,
      isDraggable: false,
    });
    expect(event).not.toBeNull();
    if (!event) throw new Error("Expected a completed timeline event");
    expect(getTimelineEventAuthority(event)).toEqual({
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
    expect(pastEvent).toMatchObject({
      status: "unverified",
      isMutable: false,
      isDraggable: false,
    });
  });

  it("does not treat a completion label without an activity link as historical truth", () => {
    const event = adaptCalendarEventToTimelineEvent({
      todayKey: "2026-05-06",
      event: {
        id: "event-unverified",
        event_type: "planned",
        scheduled_date: "2026-05-01",
        status: "completed",
        completed: true,
        activity_plan: { name: "Tempo run" },
      },
    });

    expect(event).toMatchObject({
      type: "planned_activity",
      status: "unverified",
      isMutable: false,
      isDraggable: false,
    });
    expect(event).not.toBeNull();
    if (!event) throw new Error("Expected an unverified timeline event");
    expect(getTimelineEventAuthority(event)).toEqual({
      isHistoricalTruth: false,
      canReschedule: false,
    });
  });

  it("gives cancellation precedence over a retained activity link", () => {
    const event = adaptCalendarEventToTimelineEvent({
      todayKey: "2026-05-06",
      event: {
        id: "event-cancelled",
        event_type: "planned",
        scheduled_date: "2026-05-01",
        status: "cancelled",
        linked_activity_id: "activity-cancelled",
        activity_plan: { name: "Cancelled ride" },
      },
    });

    expect(event).toMatchObject({
      type: "planned_activity",
      status: "cancelled",
      isMutable: false,
      isDraggable: false,
    });
    expect(event).not.toBeNull();
    if (!event) throw new Error("Expected a cancelled timeline event");
    expect(getTimelineEventAuthority(event)).toEqual({
      isHistoricalTruth: false,
      canReschedule: false,
    });
  });

  it("adapts goals and groups mixed timeline events by date", () => {
    const goal = adaptGoalToTimelineEvent({
      id: "goal-1",
      profile_id: "00000000-0000-4000-8000-000000000001",
      title: "Spring marathon",
      target_date: "2026-05-09",
      activity_category: "run",
      priority: 8,
      objective: { type: "completion", distance_m: 42195 },
    } satisfies ProfileGoal);
    const events = buildTimelineEvents({
      todayKey: "2026-05-06",
      goals: [
        {
          id: "goal-1",
          profile_id: "00000000-0000-4000-8000-000000000001",
          title: "Spring marathon",
          target_date: "2026-05-09",
          activity_category: "run",
          priority: 8,
          objective: { type: "completion", distance_m: 42195 },
        } satisfies ProfileGoal,
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
