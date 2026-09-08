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
  const { contractVersion: _contractVersion, schedule, ...summaryOverrides } = overrides;
  const summary = createActivityPlanSummary(summaryOverrides);
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
  });
}

export function createActivityPlanSummary(
  overrides: Omit<Partial<ActivityPlanSummary>, "structure"> & { structure?: unknown } = {},
): ActivityPlanSummary {
  const {
    capabilities: capabilityOverrides,
    metrics: metricOverrides,
    prescriptionQuantification,
    structure: structureOverride,
    ...publicOverrides
  } = overrides;
  const structure = structureOverride ?? createActivityPlanStructure();
  const hasAuthoringAccess = capabilityOverrides?.canEdit ?? true;
  const capabilities = {
    canLike: true,
    canEdit: hasAuthoringAccess,
    canDelete: hasAuthoringAccess,
    canDuplicate: true,
    canSchedule: true,
    canRecord: hasAuthoringAccess,
    ...capabilityOverrides,
  };
  const defaultMetrics: ActivityPlanSummary["metrics"] = [
    {
      key: "distance",
      label: "Distance",
      status: "unavailable",
      value: null,
      unit: "meters",
      reason: "not_prescribed",
      provenance: null,
    },
    {
      key: "elapsed_duration",
      label: "Duration",
      status: "unavailable",
      value: null,
      unit: "seconds",
      reason: "not_prescribed",
      provenance: null,
    },
    {
      key: "common_load",
      label: "Load",
      status: "unavailable",
      value: null,
      unit: "score",
      reason: "no_load_data",
      provenance: null,
    },
    {
      key: "objective_intensity",
      label: "Intensity",
      status: "unavailable",
      value: null,
      unit: "ratio",
      reason: "no_objective_targets",
      provenance: null,
    },
  ];
  const metricOverridesByKey = new Map(
    metricOverrides?.map((metric) => [metric.key, metric] as const) ?? [],
  );
  const metrics = [
    ...defaultMetrics.map((metric) => metricOverridesByKey.get(metric.key) ?? metric),
    ...(metricOverrides?.filter(
      (metric) => !defaultMetrics.some((defaultMetric) => defaultMetric.key === metric.key),
    ) ?? []),
  ];
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
    structure,
    ...(hasAuthoringAccess
      ? {
          prescriptionQuantification: prescriptionQuantification ?? null,
        }
      : {}),
    metrics,
    visibility: "private",
    isSystemTemplate: false,
    engagement: { likes: 0, viewerHasLiked: false },
    capabilities,
    ...publicOverrides,
  });
}

export function createActivityPlanDetail(
  overrides: Omit<Partial<ActivityPlanDetail>, "structure"> & { structure?: unknown } = {},
): ActivityPlanDetail {
  const {
    contractVersion: _contractVersion,
    gpsRecordingEnabled,
    notes,
    structureHash,
    ...summaryOverrides
  } = overrides;
  const summary = createActivityPlanSummary(summaryOverrides);
  return activityPlanDetailSchema.parse({
    ...summary,
    contractVersion: "activity-plan-detail-v1",
    ...(summary.capabilities.canEdit
      ? {
          notes: notes ?? null,
          structureHash: structureHash ?? "test-structure-hash",
          gpsRecordingEnabled: gpsRecordingEnabled ?? true,
        }
      : {}),
  });
}
