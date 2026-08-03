import { describe, expect, it } from "vitest";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";
import { aggregateScheduledLoadByDate } from "./scheduledLoadAggregation";

describe("aggregateScheduledLoadByDate", () => {
  it("counts each returned recurring event occurrence once", () => {
    const result = aggregateScheduledLoadByDate({
      scheduledWindowStart: "2026-06-01",
      scheduledWindowEnd: "2026-06-30",
      scheduledEvents: [
        {
          id: "event-1",
          starts_at: "2026-06-15T12:00:00.000Z",
          recurrence_rule: "FREQ=WEEKLY;COUNT=8;BYDAY=MO",
          activity_plan: {
            id: "activity-plan-1",
            prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
              id: "activity-plan-1",
              load: 65,
            }),
          },
          tentative: true,
        },
      ],
    });

    expect(result.scheduledLoadByDate.get("2026-06-15") ?? 0).toBe(0);
    expect(result.tentativeScheduledLoadByDate.get("2026-06-15")).toBeCloseTo(65);
    expect(
      [...result.tentativeScheduledLoadByDate.values()].reduce((total, value) => total + value, 0),
    ).toBeCloseTo(65);
  });

  it("dedupes the same event occurrence when schedule query windows overlap", () => {
    const scheduledEvent = {
      id: "event-1",
      scheduled_date: "2026-06-15",
      starts_at: "2026-06-15T12:00:00.000Z",
      activity_plan: {
        id: "activity-plan-1",
        prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
          id: "activity-plan-1",
          load: 70,
        }),
      },
    };

    const result = aggregateScheduledLoadByDate({
      scheduledWindowStart: "2026-06-01",
      scheduledWindowEnd: "2026-06-30",
      scheduledEvents: [scheduledEvent, scheduledEvent],
    });

    expect(result.scheduledLoadByDate.get("2026-06-15")).toBeCloseTo(70);
    expect(result.tentativeScheduledLoadByDate.get("2026-06-15") ?? 0).toBe(0);
  });
});
