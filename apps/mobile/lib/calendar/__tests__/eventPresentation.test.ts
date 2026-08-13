import { describe, expect, it } from "vitest";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";

import {
  getEventPrimaryMeta,
  getEventStatusLabel,
  getEventSupportingLine,
  getEventTimeLabel,
  isAuthoritativeCompletedCalendarEvent,
} from "../eventPresentation";

describe("calendar event presentation", () => {
  it("builds rich planned-event metadata without extra badge noise", () => {
    const event = {
      id: "planned-1",
      event_type: "planned",
      starts_at: "2026-03-23T06:30:00.000Z",
      activity_plan: {
        id: "plan-1",
        activity_category: "run",
        prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
          durationSeconds: 3_600,
          estimated: false,
        }),
        description: "Progressive tempo with a strong finish.",
      },
    };

    expect(getEventTimeLabel(event)).not.toBe("Scheduled");
    expect(getEventPrimaryMeta(event)).toEqual([
      "Run",
      "~1h",
      "Common Load 64",
      "Normalized intensity 0.80",
    ]);
    expect(getEventSupportingLine(event)).toBe("Progressive tempo with a strong finish.");
    expect(getEventStatusLabel(event)).toBeNull();
  });

  it("prefers a single calm status label when a planned activity has a persisted link", () => {
    const event = {
      id: "planned-2",
      event_type: "planned",
      linked_activity_id: "activity-2",
      recurrence_rule: "RRULE:FREQ=WEEKLY",
      activity_plan: {
        id: "plan-2",
        activity_category: "bike",
        prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
          activityCategory: "bike",
          estimated: false,
        }),
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual([
      "Bike",
      "~1h",
      "Common Load 64",
      "Normalized intensity 0.80",
    ]);
    expect(getEventStatusLabel(event)).toBe("Completed");
  });

  it("shows completion labels without a persisted activity link as unverified", () => {
    const event = {
      id: "planned-unverified",
      event_type: "planned",
      status: "completed",
      completed: true,
      activity_plan: { id: "plan-unverified", activity_category: "run" },
    };

    expect(getEventStatusLabel(event)).toBe("Unverified");
  });

  it("gives cancellation precedence over a retained activity link", () => {
    const event = {
      id: "planned-cancelled",
      event_type: "planned",
      status: "cancelled",
      linked_activity_id: "activity-cancelled",
      activity_plan: { id: "plan-cancelled", activity_category: "run" },
    };

    expect(isAuthoritativeCompletedCalendarEvent(event)).toBe(false);
    expect(getEventStatusLabel(event)).toBe("Cancelled");
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

  it("formats scheduled event times in the event timezone", () => {
    expect(
      getEventTimeLabel({
        id: "timezone-1",
        event_type: "custom",
        starts_at: "2026-06-02T16:30:00.000Z",
        timezone: "America/Los_Angeles",
      }),
    ).toBe("9:30 AM");
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

  it("omits missing canonical load instead of exposing legacy metrics", () => {
    const event = {
      id: "planned-external-load",
      event_type: "planned",
      activity_plan: {
        id: "plan-external-load",
        activity_category: "run",
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual(["Run"]);
    expect(getEventPrimaryMeta(event).join(" ")).not.toMatch(/TSS|\bIF\b/);
  });

  it("does not treat plan-shaped rows without an id as associated activity plans", () => {
    const event = {
      id: "planned-empty-plan",
      event_type: "planned",
      title: "Activity Plan - May 19, 2026 10:53 AM",
      completed: true,
      activity_plan: {
        activity_category: "run",
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual([]);
    expect(getEventStatusLabel(event)).toBeNull();
  });
});
