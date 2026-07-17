import { describe, expect, it } from "vitest";
import {
  buildTrainingPathEventReviewItems,
  buildTrainingPathScheduledReviewItems,
} from "./trainingPathReviewItems";

describe("buildTrainingPathEventReviewItems", () => {
  it("buckets timed events in the planning zone while retaining their event timezone", () => {
    const items = buildTrainingPathEventReviewItems({
      planningTimezone: "America/Los_Angeles",
      events: [
        {
          id: "event-1",
          title: "Tokyo call",
          starts_at: "2026-04-06T06:30:00.000Z",
          timezone: "Asia/Tokyo",
        },
      ],
    });

    expect(items[0]).toMatchObject({
      date: "2026-04-05",
      event: { timezone: "Asia/Tokyo" },
    });
  });

  it("deduplicates events returned by overlapping recent and upcoming queries", () => {
    const items = buildTrainingPathEventReviewItems({
      planningTimezone: "America/Los_Angeles",
      events: [
        {
          id: "event-1",
          title: "Tempo run",
          starts_at: "2026-04-20T18:30:00.000Z",
          scheduled_date: "2026-04-20",
        },
        {
          id: "event-1",
          title: "Tempo run",
          starts_at: "2026-04-20T18:30:00.000Z",
          scheduled_date: "2026-04-20",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("event-1");
  });

  it("abstains rather than assigning timed events to a fallback timezone", () => {
    expect(
      buildTrainingPathEventReviewItems({
        planningTimezone: null,
        events: [{ id: "event-1", starts_at: "2026-04-06T06:30:00.000Z" }],
      }),
    ).toEqual([]);
  });
});

describe("buildTrainingPathScheduledReviewItems", () => {
  it("includes a scheduled activity plan when the same source contributes tentative planned load", () => {
    const input = {
      planningTimezone: "America/Los_Angeles",
      plannedEvents: [],
      groupEvents: [
        {
          id: "group-event-1",
          title: "Saturday Group Ride",
          starts_at: "2026-04-14T15:00:00.000Z",
          viewerRsvp: { status: "tentative" },
        } as any,
      ],
      groupScheduledActivityPlanEvents: [
        {
          starts_at: "2026-04-14T15:00:00.000Z",
          scheduled_date: "2026-04-14",
          tentative: true,
          activity_plan: {
            id: "activity-plan-1",
            name: "Tempo Builder",
            categories: ["bike"],
            primary_category: "bike",
            authoritative_metrics: { estimated_tss: 65 },
          },
        },
      ],
    } as Parameters<typeof buildTrainingPathScheduledReviewItems>[0] & {
      groupScheduledActivityPlanEvents: unknown[];
    };

    const items = buildTrainingPathScheduledReviewItems(input);

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-14",
          activityPlanId: "activity-plan-1",
          activityPlan: expect.objectContaining({ name: "Tempo Builder" }),
          plannedActivity: expect.objectContaining({ activity_plan_id: "activity-plan-1" }),
        }),
      ]),
    );
  });

  it("keeps regular events, group event shells, and group activity-plan selections for the same week", () => {
    const input = {
      planningTimezone: "America/Los_Angeles",
      plannedEvents: [
        {
          id: "calendar-event-1",
          title: "Scheduled event",
          starts_at: "2026-04-20T18:30:00.000Z",
          scheduled_date: "2026-04-20",
        },
      ],
      groupEvents: [
        {
          id: "group-event-1",
          title: "Track Tuesday",
          starts_at: "2026-04-23T18:30:00.000Z",
          viewerRsvp: { status: "tentative" },
        } as any,
      ],
      groupScheduledActivityPlanEvents: [
        {
          starts_at: "2026-04-23T18:30:00.000Z",
          scheduled_date: "2026-04-23",
          tentative: true,
          activity_plan: {
            id: "activity-plan-1",
            name: "Tempo Builder",
            categories: ["run"],
            primary_category: "run",
            authoritative_metrics: { estimated_tss: 65 },
          },
        },
      ],
    } as Parameters<typeof buildTrainingPathScheduledReviewItems>[0] & {
      groupScheduledActivityPlanEvents: unknown[];
    };

    const items = buildTrainingPathScheduledReviewItems(input);

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: expect.objectContaining({ id: "calendar-event-1" }) }),
        expect.objectContaining({ groupEvent: expect.objectContaining({ id: "group-event-1" }) }),
        expect.objectContaining({ activityPlanId: "activity-plan-1" }),
      ]),
    );
  });
});
