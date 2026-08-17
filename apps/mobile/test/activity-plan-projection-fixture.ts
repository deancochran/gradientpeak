import {
  type ActivityPlanDetail,
  type ActivityPlanSummary,
  activityPlanDetailSchema,
  activityPlanStructureSchema,
  activityPlanSummarySchema,
  type ScheduledActivityPlanSummary,
  scheduledActivityPlanSummarySchema,
} from "@repo/core";

export function createActivityPlanStructure(
  activityCategory: "run" | "bike" | "swim" | "strength" | "other" = "run",
) {
  return activityPlanStructureSchema.parse({
    version: 3 as const,
    activity_category: activityCategory,
    segments: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        role: "activity" as const,
        name: "Activity",
        intervals: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            name: "Work",
            repetitions: 1,
            steps: [
              {
                id: "00000000-0000-4000-8000-000000000003",
                name: "Work",
                duration: { type: "time" as const, seconds: 300 },
                targets: [{ type: "RPE" as const, intensity: 5 }],
              },
            ],
          },
        ],
      },
    ],
  });
}

export function createScheduledActivityPlanSummary(
  overrides: Omit<Partial<ScheduledActivityPlanSummary>, "structure" | "schedule"> & {
    structure?: unknown;
    schedule?: Partial<ScheduledActivityPlanSummary["schedule"]>;
  } = {},
): ScheduledActivityPlanSummary {
  const summary = createActivityPlanSummary();
  const { schedule, ...summaryOverrides } = overrides;
  return scheduledActivityPlanSummarySchema.parse({
    ...summary,
    contractVersion: "scheduled-activity-plan-summary-v1",
    schedule: {
      eventId: "event-1",
      calendarDate: "2026-05-01",
      startsAt: null,
      endsAt: null,
      allDay: true,
      status: "scheduled",
      trainingPlanId: null,
      ...schedule,
    },
    ...summaryOverrides,
  });
}

export function createActivityPlanSummary(
  overrides: Omit<Partial<ActivityPlanSummary>, "structure"> & { structure?: unknown } = {},
): ActivityPlanSummary {
  return activityPlanSummarySchema.parse({
    contractVersion: "activity-plan-summary-v1",
    id: "plan-1",
    href: "/activity-plans/plan-1",
    name: "Test plan",
    description: null,
    createdAt: "2026-05-01T09:00:00.000Z",
    updatedAt: "2026-05-01T09:00:00.000Z",
    owner: null,
    activityCategory: "run",
    activityPlanRevision: 3,
    structure: createActivityPlanStructure(),
    prescriptionQuantification: null,
    metrics: [],
    visibility: "private",
    isSystemTemplate: false,
    engagement: { likes: 0, viewerHasLiked: false },
    capabilities: {
      canLike: true,
      canEdit: true,
      canDelete: true,
      canDuplicate: true,
      canSchedule: true,
      canRecord: true,
    },
    ...overrides,
  });
}

export function createActivityPlanDetail(
  overrides: Omit<Partial<ActivityPlanDetail>, "structure"> & { structure?: unknown } = {},
): ActivityPlanDetail {
  const summary = createActivityPlanSummary();
  return activityPlanDetailSchema.parse({
    ...summary,
    contractVersion: "activity-plan-detail-v1",
    notes: null,
    structureHash: "test-structure-hash",
    gpsRecordingEnabled: true,
    ...overrides,
  });
}
