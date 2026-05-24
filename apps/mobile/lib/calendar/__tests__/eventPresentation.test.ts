import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/plan/dateGrouping", () => ({
  isActivityCompleted: (event: { completed?: boolean | null }) => event.completed === true,
}));

import {
  getEventPrimaryMeta,
  getEventStatusLabel,
  getEventSupportingLine,
  getEventTimeLabel,
} from "../eventPresentation";

describe("calendar event presentation", () => {
  it("builds rich planned-event metadata without extra badge noise", () => {
    const event = {
      id: "planned-1",
      event_type: "planned",
      starts_at: "2026-03-23T06:30:00.000Z",
      activity_plan: {
        id: "plan-1",
        activity_category: "outdoor_run",
        authoritative_metrics: {
          estimated_duration: 3600,
          estimated_tss: 72,
        },
        description: "Progressive tempo with a strong finish.",
      },
    };

    expect(getEventTimeLabel(event)).not.toBe("Scheduled");
    expect(getEventPrimaryMeta(event)).toEqual(["Outdoor Run", "~1h"]);
    expect(getEventSupportingLine(event)).toBe("Progressive tempo with a strong finish.");
    expect(getEventStatusLabel(event)).toBeNull();
  });

  it("prefers a single calm status label when planned activity is completed", () => {
    const event = {
      id: "planned-2",
      event_type: "planned",
      completed: true,
      recurrence_rule: "RRULE:FREQ=WEEKLY",
      activity_plan: {
        id: "plan-2",
        activity_category: "indoor_bike",
        authoritative_metrics: {
          estimated_tss: 88,
        },
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual(["Indoor Bike", "~88 TSS"]);
    expect(getEventStatusLabel(event)).toBe("Completed");
  });

  it("keeps non-planned events focused on time state and one supporting line", () => {
    const event = {
      id: "custom-1",
      event_type: "custom",
      all_day: true,
      notes: "Bring passport and race packet.",
      description: "Travel day",
    };

    expect(getEventTimeLabel(event)).toBe("All day");
    expect(getEventPrimaryMeta(event)).toEqual([]);
    expect(getEventSupportingLine(event)).toBe("Bring passport and race packet.");
  });

  it("does not present planned-event metadata when no activity plan is associated", () => {
    const event = {
      id: "planned-without-plan",
      event_type: "planned",
      title: "Club meetup",
      completed: true,
      notes: "Bring lights.",
      activity_plan: null,
    };

    expect(getEventPrimaryMeta(event)).toEqual([]);
    expect(getEventSupportingLine(event)).toBe("Bring lights.");
    expect(getEventStatusLabel(event)).toBeNull();
  });

  it("does not treat plan-shaped rows without an id as associated activity plans", () => {
    const event = {
      id: "planned-empty-plan",
      event_type: "planned",
      title: "Activity Plan - May 19, 2026 10:53 AM",
      completed: true,
      activity_plan: {
        activity_category: "run",
        authoritative_metrics: { estimated_tss: 55 },
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual([]);
    expect(getEventStatusLabel(event)).toBeNull();
  });

  it("marks imported events as read-only without extra secondary badges", () => {
    const event = {
      id: "imported-1",
      event_type: "imported",
      starts_at: "2026-03-23T14:00:00.000Z",
      description: "Pulled in from provider sync.",
    };

    expect(getEventTimeLabel(event)).not.toBe("Scheduled");
    expect(getEventSupportingLine(event)).toBe("Pulled in from provider sync.");
    expect(getEventStatusLabel(event)).toBe("Read-only");
  });
});
