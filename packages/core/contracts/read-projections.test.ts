import { describe, expect, it } from "vitest";

import {
  activityDisplayModelSchema,
  calendarProjectionRangeSchema,
  compareCalendarProjectionItems,
  semanticMetricSchema,
} from "./read-projections";

describe("read projections", () => {
  const activityDisplay = activityDisplayModelSchema.parse({
    contractVersion: "activity-display-v1",
    id: "activity-1",
    href: "/activities/activity-1",
    owner: { id: "owner-1", username: null, avatarUrl: null },
    time: { startedAt: "2026-01-02T10:00:00.000Z", finishedAt: null },
    activityComposition: { kind: "single", categories: ["run"] },
    title: "Activity",
    notes: null,
    metrics: [],
    visibility: "private",
    engagement: { likes: 0, comments: 0, viewerHasLiked: false },
    capabilities: {
      canLike: true,
      canComment: true,
      canShare: false,
      canEdit: true,
      canDelete: true,
      hasRoute: false,
    },
  });
  it("keeps semantic metrics numeric and locale-neutral", () => {
    expect(
      semanticMetricSchema.parse({
        key: "distance",
        label: "Distance",
        status: "available",
        value: 10_000,
        unit: "meters",
        reason: null,
      }),
    ).toMatchObject({ value: 10_000, unit: "meters" });
    expect(() =>
      semanticMetricSchema.parse({
        key: "distance",
        label: "Distance",
        status: "available",
        value: "10 km",
        unit: "meters",
        reason: null,
      }),
    ).toThrow();
  });

  it("rejects persistence fields from the activity display boundary", () => {
    expect(() =>
      activityDisplayModelSchema.parse({
        contractVersion: "activity-display-v1",
        id: "activity-1",
        href: "/activities/activity-1",
        owner: { id: "owner-1", username: null, avatarUrl: null },
        time: { startedAt: "2026-01-01T10:00:00.000Z", finishedAt: null },
        activityComposition: { kind: "single", categories: ["run"] },
        title: "Activity",
        notes: null,
        metrics: [],
        visibility: "private",
        engagement: { likes: 0, comments: 0, viewerHasLiked: false },
        capabilities: {
          canLike: true,
          canComment: true,
          canShare: false,
          canEdit: true,
          canDelete: true,
          hasRoute: false,
        },
        profile_id: "owner-1",
      }),
    ).toThrow();
  });

  it("enforces range membership and canonical ordering", () => {
    const base = {
      timing: {
        startsAt: "2026-01-02T10:00:00.000Z",
        endsAt: null,
        allDay: false,
        timezone: "UTC",
      },
      title: "Activity",
      subtitle: null,
      status: "completed" as const,
      navigation: { target: "activity" as const, href: "/activities/activity-1" },
      metrics: [],
      estimated: false,
      partial: false,
      plan: null,
      activity: activityDisplay,
      event: null,
      groupEvent: null,
      goal: null,
    };
    const range = {
      contractVersion: "calendar-projection-v1" as const,
      startDate: "2026-01-01",
      endDateExclusive: "2026-01-03",
      timezone: "UTC",
      items: [
        {
          ...base,
          id: "activity-2",
          calendarDate: "2026-01-02",
          kind: "completed_activity" as const,
        },
        {
          ...base,
          id: "activity-1",
          calendarDate: "2026-01-01",
          kind: "completed_activity" as const,
        },
      ],
      truncated: false,
      truncation: { events: false, completedActivities: false, groupEvents: false, goals: false },
    };

    expect(calendarProjectionRangeSchema.safeParse(range).success).toBe(false);
    expect(
      calendarProjectionRangeSchema.parse({ ...range, items: [...range.items].reverse() }).items,
    ).toHaveLength(2);
  });

  it("orders timed items by instant and places untimed items deterministically", () => {
    const item = (
      id: string,
      startsAt: string | null,
      allDay = false,
    ): Parameters<typeof compareCalendarProjectionItems>[0] => ({
      id,
      calendarDate: "2026-05-01",
      timing: { startsAt, endsAt: null, allDay, timezone: "UTC" },
      kind: allDay ? "goal" : "event",
      title: id,
      subtitle: null,
      status: allDay ? "active" : "scheduled",
      navigation: {
        target: allDay ? "goal" : "event",
        href: allDay ? `/goals/${id}` : `/calendar/events/${id}`,
      },
      metrics: [],
      estimated: false,
      partial: false,
      plan: null,
      activity: null,
      event: allDay ? null : { type: "custom" as const, trainingPlanId: null },
      groupEvent: null,
      goal: allDay ? { typeLabel: "Goal", objectiveSummary: "Complete goal" } : null,
    });
    const values = [
      item("untimed", null),
      item("later", "2026-05-01T01:00:00.000-04:00"),
      item("all-day", null, true),
      item("earlier", "2026-05-01T04:30:00.000Z"),
    ];

    expect(values.sort(compareCalendarProjectionItems).map(({ id }) => id)).toEqual([
      "all-day",
      "earlier",
      "later",
      "untimed",
    ]);
  });
});
