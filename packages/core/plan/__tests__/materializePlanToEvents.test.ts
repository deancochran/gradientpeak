import { describe, expect, it } from "vitest";

import { materializePlanToEvents } from "../materializePlanToEvents";

const activityPlanIdA = "11111111-1111-4111-8111-111111111111";
const activityPlanIdB = "22222222-2222-4222-8222-222222222222";

describe("materializePlanToEvents", () => {
  it("materializes canonical relative sessions from the application start date with overrides", () => {
    const events = materializePlanToEvents(
      {
        version: 1,
        sessions: [
          {
            offset_days: 2,
            activity_plan_id: activityPlanIdA,
            event_overrides: {
              title: "Tempo before work",
              description: "Keep the opening controlled.",
              start_time: "07:30",
            },
          },
        ],
      },
      "2026-04-06",
      "UTC",
    );

    expect(events).toEqual([
      {
        scheduled_date: "2026-04-08",
        starts_at: "2026-04-08T07:30:00.000Z",
        ends_at: null,
        timezone: "UTC",
        title: "Tempo before work",
        description: "Keep the opening controlled.",
        event_title_override: "Tempo before work",
        event_type: "planned",
        activity_plan_id: activityPlanIdA,
        all_day: false,
        source_day_offset: 2,
        source_path: "sessions.0",
      },
    ]);
  });

  it("accepts strict persisted canonical input and preserves event-first timing semantics", () => {
    const events = materializePlanToEvents(
      {
        id: "33333333-3333-4333-8333-333333333333",
        version: 1,
        sessions: [{ offset_days: 4, activity_plan_id: activityPlanIdA }],
      },
      "2026-04-06",
      "America/Los_Angeles",
    );

    expect(events[0]).toMatchObject({
      scheduled_date: "2026-04-10",
      starts_at: "2026-04-10T07:00:00.000Z",
      ends_at: "2026-04-11T07:00:00.000Z",
      all_day: true,
      source_day_offset: 4,
      source_path: "sessions.0",
    });
  });

  it.each([
    {
      name: "nested blocks",
      structure: {
        start_date: "2026-04-06",
        blocks: [{ sessions: [{ offset_days: 1, activity_plan_id: activityPlanIdA }] }],
      },
    },
    {
      name: "legacy root session fields",
      structure: {
        start_date: "2026-05-01",
        sessions: [{ offset_days: 1, name: "Legacy", activity_plan_id: activityPlanIdA }],
      },
    },
    {
      name: "canonical-looking input with an unknown field",
      structure: {
        version: 1,
        sessions: [{ offset_days: 1, activity_plan_id: activityPlanIdA }],
        metadata: {},
      },
    },
  ])("rejects noncanonical $name input", ({ structure }) => {
    expect(() => materializePlanToEvents(structure, "2026-04-06", "UTC")).toThrow();
  });

  it("keeps opaque activity plan ids without deriving a session sport category", () => {
    const events = materializePlanToEvents(
      {
        version: 1,
        sessions: [{ offset_days: 0, activity_plan_id: activityPlanIdB }],
      },
      "2026-04-06",
      "UTC",
    );

    expect(events[0]?.activity_plan_id).toBe(activityPlanIdB);
  });
});
