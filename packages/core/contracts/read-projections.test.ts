import { describe, expect, it } from "vitest";

import {
  ACTIVITY_CARD_EFFORT_PROFILE_MAX_ELAPSED_SECONDS,
  ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES,
  activityCardEffortProfileSchema,
  activityDisplayModelSchema,
  activityPlanDetailSchema,
  activityPlanMetricListSchema,
  activityPlanSummarySchema,
  calendarProjectionRangeSchema,
  compareCalendarProjectionItems,
  scheduledActivityPlanSummarySchema,
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

  it("requires an explicit number or explicit unavailable null for every metric", () => {
    expect(
      semanticMetricSchema.safeParse({
        key: "common_load",
        label: "Load",
        status: "available",
        value: null,
        unit: "score",
        reason: null,
      }).success,
    ).toBe(false);
    expect(
      semanticMetricSchema.safeParse({
        key: "normalized_intensity",
        label: "Intensity",
        status: "unavailable",
        unit: "ratio",
        reason: "quantification_unavailable",
      }).success,
    ).toBe(false);
    expect(
      semanticMetricSchema.parse({
        key: "normalized_intensity",
        label: "Intensity",
        status: "unavailable",
        value: null,
        unit: "ratio",
        reason: "quantification_unavailable",
      }),
    ).toMatchObject({ status: "unavailable", value: null });
  });

  const objectiveIntensityMetric = {
    key: "objective_intensity",
    label: "Intensity",
    status: "available",
    value: 0.7,
    unit: "ratio",
    reason: null,
    provenance: "estimated",
  } as const;

  const activityPlanMetrics = [
    {
      key: "distance",
      label: "Distance",
      status: "available",
      value: 10_000,
      unit: "meters",
      reason: null,
      provenance: "authored",
    },
    {
      key: "elapsed_duration",
      label: "Duration",
      status: "available",
      value: 3_600,
      unit: "seconds",
      reason: null,
      provenance: "authored",
    },
    {
      key: "common_load",
      label: "Load",
      status: "available",
      value: 48,
      unit: "score",
      reason: null,
      provenance: "estimated",
    },
    objectiveIntensityMetric,
  ] as const;

  it("accepts only available or unavailable objective-intensity ratios", () => {
    expect(semanticMetricSchema.parse(objectiveIntensityMetric)).toEqual(objectiveIntensityMetric);
    expect(
      semanticMetricSchema.safeParse({
        ...objectiveIntensityMetric,
        status: "partial",
        reason: "incomplete_objective_coverage",
      }).success,
    ).toBe(false);
    expect(
      semanticMetricSchema.safeParse({ ...objectiveIntensityMetric, unit: "watts" }).success,
    ).toBe(false);
    expect(
      semanticMetricSchema.parse({
        ...objectiveIntensityMetric,
        status: "unavailable",
        value: null,
        reason: "calibration_required",
        provenance: null,
      }),
    ).toMatchObject({ status: "unavailable", value: null, unit: "ratio" });
    expect(
      semanticMetricSchema.safeParse({
        key: "objective_intensity",
        label: "Intensity",
        status: "unavailable",
        value: null,
        unit: "ratio",
        reason: "calibration_required",
      }).success,
    ).toBe(false);
  });

  it("keeps unrelated semantic metrics unchanged and rejects retired projection metadata", () => {
    expect(
      semanticMetricSchema.parse({
        key: "average_power",
        label: "Average power",
        status: "available",
        value: 200,
        unit: "watts",
        reason: null,
      }),
    ).toMatchObject({ value: 200, unit: "watts" });
    expect(
      semanticMetricSchema.safeParse({
        key: "average_power",
        label: "Average power",
        status: "available",
        value: 200,
        magnitude: { kind: "point", value: 200 },
        unit: "watts",
        reason: null,
      }).success,
    ).toBe(false);
  });

  it("rejects contradictory duplicate metric keys", () => {
    const load = {
      key: "common_load",
      label: "Load",
      status: "available",
      value: 50,
      unit: "score",
      reason: null,
    } as const;
    expect(
      activityDisplayModelSchema.safeParse({
        ...activityDisplay,
        metrics: [load, { ...load, value: 75 }],
      }).success,
    ).toBe(false);
  });

  it("requires exactly the four canonical activity-plan metric keys once each", () => {
    expect(activityPlanMetricListSchema.safeParse(activityPlanMetrics).success).toBe(true);
    expect(activityPlanMetricListSchema.safeParse(activityPlanMetrics.slice(0, 3)).success).toBe(
      false,
    );
    expect(
      activityPlanMetricListSchema.safeParse([
        activityPlanMetrics[0],
        activityPlanMetrics[1],
        activityPlanMetrics[2],
        activityPlanMetrics[2],
      ]).success,
    ).toBe(false);
    expect(
      activityPlanMetricListSchema.safeParse([
        activityPlanMetrics[0],
        activityPlanMetrics[1],
        activityPlanMetrics[2],
        {
          key: "normalized_intensity",
          label: "Normalized intensity",
          status: "available",
          value: 0.7,
          unit: "ratio",
          reason: null,
        },
      ]).success,
    ).toBe(false);
  });

  it("rejects partial headline values from summary, detail, and scheduled plan contracts", () => {
    const summary = {
      contractVersion: "activity-plan-summary-v1" as const,
      id: "plan-partial",
      href: "/activity-plans/plan-partial",
      name: "Partial plan",
      description: null,
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
      owner: null,
      activityCategory: "run" as const,
      activityPlanRevision: 1,
      structure: {
        version: 3 as const,
        activity_category: "run" as const,
        segments: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            role: "activity" as const,
            name: "Run",
            intervals: [
              {
                id: "00000000-0000-4000-8000-000000000102",
                name: "Main",
                repetitions: 1,
                steps: [
                  {
                    id: "00000000-0000-4000-8000-000000000103",
                    name: "Work",
                    duration: { type: "time" as const, seconds: 600 },
                    targets: [{ type: "RPE" as const, intensity: 5 }],
                  },
                ],
              },
            ],
          },
        ],
      },
      metrics: activityPlanMetrics,
      visibility: "public" as const,
      isSystemTemplate: false,
      engagement: { likes: 0, viewerHasLiked: false },
      capabilities: {
        canLike: true,
        canEdit: false,
        canDelete: false,
        canDuplicate: false,
        canSchedule: true,
        canRecord: false,
      },
    };

    for (const partialKey of [
      "distance",
      "elapsed_duration",
      "common_load",
      "objective_intensity",
    ] as const) {
      const partialMetrics = activityPlanMetrics.map((metric) =>
        metric.key === partialKey
          ? {
              ...metric,
              status: "partial" as const,
              reason: "incomplete_members",
            }
          : metric,
      );
      const partialSummary = { ...summary, metrics: partialMetrics };

      expect(activityPlanMetricListSchema.safeParse(partialMetrics).success).toBe(false);
      expect(activityPlanSummarySchema.safeParse(partialSummary).success).toBe(false);
      expect(
        activityPlanDetailSchema.safeParse({
          ...partialSummary,
          contractVersion: "activity-plan-detail-v1",
        }).success,
      ).toBe(false);
      expect(
        scheduledActivityPlanSummarySchema.safeParse({
          ...partialSummary,
          contractVersion: "scheduled-activity-plan-summary-v1",
          schedule: {
            eventId: "event-partial",
            calendarDate: "2026-08-20",
            startsAt: null,
            endsAt: null,
            allDay: true,
            status: "scheduled",
            trainingPlanId: null,
          },
        }).success,
      ).toBe(false);
    }
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

  it("accepts an absent or strictly ordered threshold-free activity-card effort profile", () => {
    expect(activityDisplay.effortProfile).toBeUndefined();
    expect(activityDisplayModelSchema.parse({ ...activityDisplay, effortProfile: null })).toEqual(
      expect.objectContaining({ effortProfile: null }),
    );
    expect(
      activityCardEffortProfileSchema.parse({
        basis: "activity_wide_signal_ordinal",
        samples: [
          { elapsedSeconds: 0, effortLevel: "lowest" },
          { elapsedSeconds: 60, effortLevel: "higher" },
          {
            elapsedSeconds: ACTIVITY_CARD_EFFORT_PROFILE_MAX_ELAPSED_SECONDS,
            effortLevel: "highest",
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        samples: expect.arrayContaining([
          expect.objectContaining({ elapsedSeconds: 0 }),
          expect.objectContaining({ elapsedSeconds: 60 }),
        ]),
      }),
    );
  });

  it("rejects invalid order, numeric effort fields, and oversized activity-card profiles", () => {
    expect(
      activityCardEffortProfileSchema.safeParse({
        basis: "activity_wide_signal_ordinal",
        samples: [
          { elapsedSeconds: 60, effortLevel: "lower" },
          { elapsedSeconds: 60, effortLevel: "higher" },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityCardEffortProfileSchema.safeParse({
        basis: "activity_wide_signal_ordinal",
        samples: [
          { elapsedSeconds: 0, effortLevel: "lower", relativeIntensity: 0.4 },
          { elapsedSeconds: 60, effortLevel: "higher" },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityCardEffortProfileSchema.safeParse({
        basis: "activity_wide_signal_ordinal",
        samples: [
          { elapsedSeconds: 0, effortLevel: "lower" },
          {
            elapsedSeconds: ACTIVITY_CARD_EFFORT_PROFILE_MAX_ELAPSED_SECONDS + 1,
            effortLevel: "higher",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityCardEffortProfileSchema.safeParse({
        basis: "activity_wide_signal_ordinal",
        samples: [
          { elapsedSeconds: 0, effortLevel: "zone_2" },
          { elapsedSeconds: 60, effortLevel: "higher" },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityCardEffortProfileSchema.safeParse({
        basis: "activity_wide_signal_ordinal",
        samples: Array.from(
          { length: ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES + 1 },
          (_, index) => ({
            elapsedSeconds: index,
            effortLevel: "steady",
          }),
        ),
      }).success,
    ).toBe(false);
  });

  it("requires full authored plan structure while keeping personalized quantification owner-only", () => {
    const structure = {
      version: 3 as const,
      activity_category: "run" as const,
      segments: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          role: "activity" as const,
          name: "Run",
          intervals: [
            {
              id: "00000000-0000-4000-8000-000000000002",
              name: "Tempo",
              repetitions: 1,
              steps: [
                {
                  id: "00000000-0000-4000-8000-000000000003",
                  name: "Work",
                  duration: { type: "time" as const, seconds: 600 },
                  targets: [{ type: "RPE" as const, intensity: 7 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const publicProjection = {
      contractVersion: "activity-plan-summary-v1" as const,
      id: "plan-1",
      href: "/activity-plans/plan-1",
      name: "Tempo run",
      description: null,
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
      owner: null,
      activityCategory: "run" as const,
      activityPlanRevision: 1,
      structure,
      metrics: activityPlanMetrics,
      visibility: "public" as const,
      isSystemTemplate: false,
      engagement: { likes: 0, viewerHasLiked: false },
      capabilities: {
        canLike: true,
        canEdit: false,
        canDelete: false,
        canDuplicate: false,
        canSchedule: true,
        canRecord: false,
      },
    };

    expect(activityPlanSummarySchema.parse(publicProjection).structure).toEqual(structure);
    expect(
      activityPlanSummarySchema.safeParse({
        ...publicProjection,
        metrics: activityPlanMetrics.map((metric) =>
          metric.key === "common_load" ? { ...metric, provenance: "personalized" } : metric,
        ),
      }).success,
    ).toBe(false);
    expect(
      activityPlanSummarySchema.safeParse({
        ...publicProjection,
        prescriptionQuantification: { privateThresholdContext: 300 },
      }).success,
    ).toBe(false);
    expect(
      activityPlanSummarySchema.safeParse({
        ...publicProjection,
        prescribedIntensity: objectiveIntensityMetric,
      }).success,
    ).toBe(false);
    expect(
      activityPlanSummarySchema.safeParse({ ...publicProjection, structure: undefined }).success,
    ).toBe(false);
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
