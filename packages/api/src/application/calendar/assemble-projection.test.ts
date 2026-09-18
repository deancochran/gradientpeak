import { SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it } from "vitest";

import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { assembleCalendarProjectionRange } from "./assemble-projection";

const activityPlan = SYSTEM_TEMPLATES[0]!;
const plannedSession = {
  contractVersion: "planned-session-v1" as const,
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
  sessionRevision: 2,
  planningDate: "2026-08-01",
  originalTargetDate: "2026-08-01",
  source: { kind: "direct" as const, operationId: "calendar_projection_operation_123456" },
  idempotencyKey: "direct:calendar_projection_operation_123456",
  groupEventId: null,
  prescription: {
    resolutionManifest: createResolutionManifestFixture({
      activityPlanId: activityPlan.id,
      structure: activityPlan.structure,
      demand: {
        activity_category: activityPlan.structure.activity_category,
        training_intent: activityPlan.training_intent,
        target_duration_minutes: null,
        target_common_load: null,
        importance: "normal",
      },
    }),
    capturedAt: "2026-08-01T00:00:00.000Z",
  },
  lifecycle: {
    status: "completed" as const,
    completion: {
      state: "linked" as const,
      activityId: "33333333-3333-4333-8333-333333333333",
      linkedAt: "2026-08-01T09:00:00.000Z",
    },
  },
};

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

const allDayManualDisplay = {
  ...completedDisplay,
  id: "manual-1",
  href: "/activities/manual-1",
  title: "Strength notes",
  time: {
    startedAt: null,
    finishedAt: null,
    diaryDate: "2026-08-01",
    diaryTimezone: "America/Denver",
  },
  metrics: [],
};

describe("assembleCalendarProjectionRange", () => {
  it("preserves completed metric availability instead of zero-normalizing observations", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "UTC",
      events: [],
      plannedSessions: [],
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
        plannedSessions: false,
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
      events: [],
      plannedSessions: [{ session: plannedSession, linkedActivityDisplay: completedDisplay }],
      completedActivities: [],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        plannedSessions: false,
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
      plannedActual: {
        planned: { durationSeconds: expect.any(Number), distanceMeters: null },
        actual: { state: "observed", durationSeconds: 1800, distanceMeters: null },
      },
    });
  });

  it("does not duplicate a linked completion when the range also contains its placeholder", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "UTC",
      events: [],
      plannedSessions: [{ session: plannedSession, linkedActivityDisplay: completedDisplay }],
      completedActivities: [
        {
          id: plannedSession.lifecycle.completion.activityId,
          name: "Superseded manual placeholder",
          scheduled_date: "2026-08-01",
          started_at: null,
          display: completedDisplay,
        },
      ],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        plannedSessions: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]?.kind).toBe("planned_activity");
  });

  it("keeps a linked all-day manual completion free of invented instants and metrics", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "America/Denver",
      events: [],
      plannedSessions: [{ session: plannedSession, linkedActivityDisplay: allDayManualDisplay }],
      completedActivities: [],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        plannedSessions: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items[0]).toMatchObject({
      status: "completed",
      metrics: [],
      activity: { time: allDayManualDisplay.time },
      plannedActual: { actual: { state: "unknown", durationSeconds: null, distanceMeters: null } },
    });
  });

  it("projects an unlinked all-day manual diary entry on its civil date", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "America/Denver",
      events: [],
      plannedSessions: [],
      completedActivities: [
        {
          id: "manual-1",
          name: "Strength notes",
          scheduled_date: "2026-08-01",
          started_at: null,
          display: allDayManualDisplay,
        },
      ],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        plannedSessions: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items[0]).toMatchObject({
      kind: "completed_activity",
      calendarDate: "2026-08-01",
      timing: { startsAt: null, endsAt: null, allDay: true, timezone: "America/Denver" },
      metrics: [],
    });
  });

  it("keeps missing linked observations unknown instead of substituting a plan estimate", () => {
    const projection = assembleCalendarProjectionRange({
      viewerId: "profile-1",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
      timezone: "UTC",
      events: [],
      plannedSessions: [{ session: plannedSession, linkedActivityDisplay: null }],
      completedActivities: [],
      goals: [],
      groupEvents: [],
      truncation: {
        events: false,
        plannedSessions: false,
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
      plannedSessions: [],
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
        plannedSessions: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    });

    expect(projection.items[0]?.groupEvent?.viewerRsvpStatus).toBe("going");
  });
});
