import { describe, expect, it } from "vitest";

import { materializePlanToEvents } from "../materializePlanToEvents";

const activityPlanIdA = "11111111-1111-4111-8111-111111111111";
const activityPlanIdB = "22222222-2222-4222-8222-222222222222";

describe("materializePlanToEvents", () => {
  it("preserves nested block, week, and day offsets", () => {
    const events = materializePlanToEvents(
      {
        start_date: "2026-04-06",
        blocks: [
          {
            name: "Build",
            offset_weeks: 1,
            weeks: [
              {
                name: "Week 1",
                offset_weeks: 1,
                days: [
                  {
                    name: "Wednesday",
                    offset_days: 2,
                    sessions: [
                      {
                        title: "Threshold Run",
                        activity_plan_id: activityPlanIdA,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      "2026-04-06",
    );

    expect(events).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-04-22",
        title: "Threshold Run",
        activity_plan_id: activityPlanIdA,
      }),
    ]);
  });

  it("preserves explicit scheduled_date over inherited offsets", () => {
    const events = materializePlanToEvents(
      {
        start_date: "2026-04-06",
        blocks: [
          {
            name: "Build",
            offset_weeks: 3,
            days: [
              {
                offset_days: 4,
                sessions: [
                  {
                    title: "Race Rehearsal",
                    scheduled_date: "2026-05-01",
                    activity_plan_id: activityPlanIdA,
                  },
                ],
              },
            ],
          },
        ],
      },
      "2026-04-06",
    );

    expect(events).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-05-01",
        title: "Race Rehearsal",
      }),
    ]);
  });

  it("keeps repeated weekly titles on distinct dates instead of collapsing them", () => {
    const events = materializePlanToEvents(
      {
        start_date: "2026-04-06",
        blocks: [
          {
            name: "Build",
            weeks: [
              {
                name: "Week 1",
                offset_weeks: 0,
                sessions: [
                  {
                    title: "Easy Run",
                    offset_days: 1,
                    activity_plan_id: activityPlanIdA,
                  },
                ],
              },
              {
                name: "Week 1",
                offset_weeks: 1,
                sessions: [
                  {
                    title: "Easy Run",
                    offset_days: 1,
                    activity_plan_id: activityPlanIdA,
                  },
                ],
              },
            ],
          },
        ],
      },
      "2026-04-06",
    );

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.scheduled_date)).toEqual(["2026-04-07", "2026-04-14"]);
  });

  it("preserves same-day multi-session output when dates match", () => {
    const events = materializePlanToEvents(
      {
        start_date: "2026-04-06",
        days: [
          {
            offset_days: 3,
            sessions: [
              {
                title: "AM Easy Run",
                activity_plan_id: activityPlanIdA,
              },
              {
                title: "PM Strength",
                activity_plan_id: activityPlanIdB,
              },
            ],
          },
        ],
      },
      "2026-04-06",
    );

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.scheduled_date)).toEqual(["2026-04-09", "2026-04-09"]);
    expect(events.map((event) => event.title)).toEqual(["AM Easy Run", "PM Strength"]);
  });

  it("skips explicit rest-day sessions instead of materializing synthetic events", () => {
    const events = materializePlanToEvents(
      {
        start_date: "2026-04-06",
        days: [
          {
            offset_days: 1,
            sessions: [
              {
                title: "Rest",
                session_type: "rest_day",
              },
              {
                title: "Easy Run",
                activity_plan_id: activityPlanIdA,
              },
            ],
          },
          {
            offset_days: 2,
            sessions: [
              {
                title: "Recovery",
                session_type: "rest",
              },
            ],
          },
        ],
      },
      "2026-04-06",
    );

    expect(events).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-04-07",
        title: "Easy Run",
        event_type: "planned",
      }),
    ]);
  });
});
