import { describe, expect, it } from "vitest";

import { assembleCalendarProjectionRange } from "./assemble-projection";

const completedDisplay = {
  contractVersion: "activity-display-v1" as const,
  id: "completed-1",
  href: "/activities/completed-1",
  owner: { id: "profile-1", username: null, avatarUrl: null },
  time: { startedAt: "2026-08-01T08:00:00.000Z", finishedAt: null },
  activityComposition: { kind: "single" as const, categories: ["run" as const] },
  title: "Morning run",
  notes: null,
  metrics: [
    {
      key: "common_load" as const,
      label: "Load",
      status: "partial" as const,
      value: 42,
      unit: "score",
      reason: "quantification_partial",
    },
    {
      key: "normalized_intensity" as const,
      label: "Intensity",
      status: "unavailable" as const,
      value: null,
      unit: "ratio",
      reason: "quantification_unavailable",
    },
    {
      key: "elapsed_duration" as const,
      label: "Elapsed",
      status: "available" as const,
      value: 1_800,
      unit: "seconds",
      reason: null,
    },
  ],
  visibility: "private" as const,
  engagement: { likes: 0, comments: 0, viewerHasLiked: false },
  capabilities: {
    canLike: true,
    canComment: true,
    canShare: false,
    canEdit: true,
    canDelete: true,
    hasRoute: false,
  },
};

describe("assembleCalendarProjectionRange", () => {
  it("preserves completed metric availability instead of zero-normalizing observations", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "UTC",
      events: [],
      completedActivities: [
        {
          id: "completed-1",
          name: "Morning run",
          scheduled_date: "2026-08-01",
          started_at: "2026-08-01T08:00:00.000Z",
          display: completedDisplay,
        },
      ],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items[0]).toMatchObject({
      kind: "completed_activity",
      estimated: false,
      partial: true,
      metrics: completedDisplay.metrics,
    });
  });

  it("uses only a canonically linked activity as completed plan evidence", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "America/Denver",
      events: [
        {
          id: "planned-1",
          event_type: "planned",
          title: "Planned run",
          scheduled_date: "2026-08-01",
          starts_at: "2026-08-01T06:00:00.000-06:00",
          ends_at: null,
          all_day: true,
          status: "completed",
          linked_activity_id: "completed-1",
          linkedActivityDisplay: completedDisplay,
          training_plan_id: null,
          activity_plan: null,
        },
      ],
      completedActivities: [],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      status: "completed",
      estimated: false,
      partial: true,
      metrics: completedDisplay.metrics,
      activity: completedDisplay,
      timing: { timezone: "America/Denver" },
    });
  });

  it("keeps missing linked observations unknown instead of substituting a plan estimate", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "UTC",
      events: [
        {
          id: "planned-unknown",
          event_type: "planned",
          title: "Planned run",
          scheduled_date: "2026-08-01",
          starts_at: "2026-08-01T06:00:00.000Z",
          ends_at: null,
          all_day: true,
          status: "completed",
          linked_activity_id: "outside-range",
          linkedActivityDisplay: null,
          training_plan_id: null,
          activity_plan: null,
        },
      ],
      completedActivities: [],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items[0]).toMatchObject({
      status: "completed",
      estimated: false,
      partial: true,
      metrics: [],
      activity: null,
    });
  });

  it("projects an occurrence going response ahead of a declined series response", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "UTC",
      events: [],
      completedActivities: [],
      goals: [],
      groupEvents: [
        {
          id: "group-event-1",
          title: "Saturday ride",
          scheduled_date: "2026-08-01",
          starts_at: "2026-08-01T08:00:00.000Z",
          ends_at: null,
          timezone: "UTC",
          selectedActivityPlan: null,
          group: { id: "group-1", name: "Riders" },
          viewerRsvp: { status: "going" },
          viewerSeriesRsvp: { status: "declined" },
        },
      ],
      truncation: {
        events: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items[0]?.groupEvent?.viewerRsvpStatus).toBe("going");
  });
});
