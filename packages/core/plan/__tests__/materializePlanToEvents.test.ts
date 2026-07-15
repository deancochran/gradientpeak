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

  it("materializes local timed and all-day instants across a DST boundary", () => {
    const events = materializePlanToEvents(
      {
        version: 1,
        sessions: [
          {
            offset_days: 1,
            activity_plan_id: activityPlanIdA,
            event_overrides: { start_time: "07:30" },
          },
          {
            offset_days: 2,
            activity_plan_id: activityPlanIdA,
            event_overrides: { start_time: "07:30" },
          },
          {
            offset_days: 1,
            activity_plan_id: activityPlanIdB,
          },
        ],
      },
      "2026-03-07",
      "America/Los_Angeles",
    );

    expect(
      events.map(({ scheduled_date, starts_at, ends_at, all_day, timezone }) => ({
        scheduled_date,
        starts_at,
        ends_at,
        all_day,
        timezone,
      })),
    ).toEqual([
      {
        scheduled_date: "2026-03-08",
        starts_at: "2026-03-08T08:00:00.000Z",
        ends_at: "2026-03-09T07:00:00.000Z",
        all_day: true,
        timezone: "America/Los_Angeles",
      },
      {
        scheduled_date: "2026-03-08",
        starts_at: "2026-03-08T14:30:00.000Z",
        ends_at: null,
        all_day: false,
        timezone: "America/Los_Angeles",
      },
      {
        scheduled_date: "2026-03-09",
        starts_at: "2026-03-09T14:30:00.000Z",
        ends_at: null,
        all_day: false,
        timezone: "America/Los_Angeles",
      },
    ]);
  });

  it("uses the application start date for persisted canonical input with boundary-owned fields", () => {
    const events = materializePlanToEvents(
      {
        id: "33333333-3333-4333-8333-333333333333",
        version: 1,
        start_date: "2040-01-01",
        sessions: [{ offset_days: 4, activity_plan_id: activityPlanIdA }],
      },
      "2026-04-06",
      "UTC",
    );

    expect(events[0]).toMatchObject({
      scheduled_date: "2026-04-10",
      source_day_offset: 4,
      source_path: "sessions.0",
    });
  });

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
      "UTC",
    );

    expect(events).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-04-22",
        title: "Threshold Run",
        event_title_override: null,
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
      "UTC",
    );

    expect(events).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-05-01",
        title: "Race Rehearsal",
        event_title_override: null,
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
      "UTC",
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
      "UTC",
    );

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.scheduled_date)).toEqual(["2026-04-09", "2026-04-09"]);
    expect(events.map((event) => event.title)).toEqual(["AM Easy Run", "PM Strength"]);
    expect(events.map((event) => event.event_title_override)).toEqual([null, null]);
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
      "UTC",
    );

    expect(events).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-04-07",
        title: "Easy Run",
        event_title_override: null,
        event_type: "planned",
      }),
    ]);
  });

  it("prefers explicit event_title_override over legacy title fields", () => {
    const events = materializePlanToEvents(
      {
        start_date: "2026-04-06",
        sessions: [
          {
            offset_days: 0,
            title: "Legacy Session Name",
            event_title_override: "Race Prep",
            activity_plan_id: activityPlanIdA,
          },
        ],
      },
      "2026-04-06",
      "UTC",
    );

    expect(events).toEqual([
      expect.objectContaining({
        title: "Race Prep",
        event_title_override: "Race Prep",
        activity_plan_id: activityPlanIdA,
      }),
    ]);
  });

  it("retains legacy all-day and start_date behavior behind the fallback path", () => {
    const events = materializePlanToEvents(
      {
        start_date: "2026-05-01",
        sessions: [
          {
            offset_days: 1,
            name: "Legacy named session",
            activity_plan_id: activityPlanIdA,
          },
        ],
      },
      "2026-04-06",
      "UTC",
    );

    expect(events).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-05-02",
        starts_at: "2026-05-02T00:00:00.000Z",
        ends_at: "2026-05-03T00:00:00.000Z",
        timezone: "UTC",
        title: "Legacy named session",
        description: null,
        all_day: true,
      }),
    ]);
  });
});
