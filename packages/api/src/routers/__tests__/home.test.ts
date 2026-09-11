import {
  type ActivityObservationQuantification,
  type ActivityPrescriptionQuantification,
  activityObservationQuantificationSchema,
  activityPlanDocumentSchema,
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  createUnavailableAthletePerformanceTargetFacts,
  defaultAthletePreferenceProfile,
  estimateActivityPlanForTrainingContext,
  initializeActivityPlanDocument,
  OPTION_1_FAVORITE_SWIM,
  resolveActivityPlanVariant,
} from "@repo/core";
import { type CommonLoadResult, calculateAvailableCommonLoad } from "@repo/core/load";
import { schema } from "@repo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const homeMocks = vi.hoisted(() => ({
  buildWorkloadEnvelopes: vi.fn(),
  calculateRollingTrainingQuality: vi.fn(),
  createEventReadRepository: vi.fn(),
  estimateActivityPlans: vi.fn(),
  getLoadBalanceStatus: vi.fn(),
  getEffectivePlanLoad: vi.fn(),
  readAthleteReadModel: vi.fn(),
}));

vi.mock("@repo/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/core")>();
  return {
    ...actual,
    calculateRollingTrainingQuality: homeMocks.calculateRollingTrainingQuality,
    getLoadBalanceStatus: homeMocks.getLoadBalanceStatus,
  };
});

vi.mock("../../application/athlete-intelligence/athlete-read-model", () => ({
  readAthleteReadModel: homeMocks.readAthleteReadModel,
}));

vi.mock("../../application/training-plan", () => ({
  getEffectivePlanLoad: homeMocks.getEffectivePlanLoad,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createEventReadRepository: homeMocks.createEventReadRepository,
}));

vi.mock("../../lib/features", () => ({
  featureFlags: {
    personalizationAgeConstants: true,
    personalizationGenderAdjustment: true,
    personalizationTrainingQuality: true,
    personalizationRampLearning: false,
  },
}));

vi.mock("../../application/activity-plans/estimate-activity-plans", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../application/activity-plans/estimate-activity-plans")
    >();

  return {
    ...actual,
    estimateActivityPlans: homeMocks.estimateActivityPlans,
  };
});

vi.mock("../../utils/workload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/workload")>()),
  buildWorkloadEnvelopes: homeMocks.buildWorkloadEnvelopes,
}));

import { listPlannedActivitiesInRange } from "../../application/home/plannedActivities";
import { homeRouter } from "../home";

type TableName =
  | "activities"
  | "activityArtifactLinks"
  | "activitySourceReferences"
  | "events"
  | "profiles"
  | "profileTrainingSettings";

type DbPlan = {
  execute?: Array<Array<Record<string, unknown>>>;
  select?: Partial<Record<TableName, Array<unknown[]>>>;
};

function getTableName(table: unknown): TableName {
  if (table === schema.profiles) return "profiles";
  if (table === schema.events) return "events";
  if (table === schema.activities) return "activities";
  if (table === schema.activityArtifactLinks) return "activityArtifactLinks";
  if (table === schema.activitySourceReferences) return "activitySourceReferences";
  if (table === schema.profileTrainingSettings) return "profileTrainingSettings";
  throw new Error(`Unhandled table: ${String(table)}`);
}

function createDbMock(plan: DbPlan = {}) {
  const whereCalls: Array<{ table: TableName; where: unknown }> = [];
  const selectQueues = {
    profiles: [...(plan.select?.profiles ?? [])],
    events: [...(plan.select?.events ?? [])],
    activities: [...(plan.select?.activities ?? [])],
    activityArtifactLinks: [...(plan.select?.activityArtifactLinks ?? [])],
    activitySourceReferences: [...(plan.select?.activitySourceReferences ?? [])],
    profileTrainingSettings: [...(plan.select?.profileTrainingSettings ?? [])],
  } satisfies Record<TableName, Array<unknown[]>>;
  const executeQueue = [...(plan.execute ?? [])];

  const db = {
    execute: vi.fn(async () => ({ rows: executeQueue.shift() ?? [] })),
    select: vi.fn(() => {
      let tableName: TableName | null = null;

      const builder: any = {
        from: (table: unknown) => {
          tableName = getTableName(table);
          return builder;
        },
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: (where: unknown) => {
          if (tableName) whereCalls.push({ table: tableName, where });
          return builder;
        },
        orderBy: () => builder,
        limit: () => builder,
        then: (onFulfilled: (rows: unknown[]) => unknown) => {
          if (!tableName) {
            throw new Error("Select called without table");
          }

          return Promise.resolve(selectQueues[tableName].shift() ?? []).then(onFulfilled);
        },
      };

      return builder;
    }),
  };

  return { ...db, whereCalls };
}

function createCaller(plan: DbPlan = {}) {
  const db = createDbMock(plan);

  return {
    caller: homeRouter.createCaller({
      db: db as any,
      session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any),
    db,
  };
}

function buildActivityPlan(id: string, name: string, activity_category: "bike" | "run") {
  const structure = {
    version: 3 as const,
    activity_category,
    segments: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        name,
        role: "activity" as const,
        intervals: [
          {
            id: "20000000-0000-4000-8000-000000000001",
            name,
            repetitions: 1,
            steps: [
              {
                id: "30000000-0000-4000-8000-000000000001",
                name,
                duration: { type: "time" as const, seconds: 600 },
                targets: [{ type: "RPE" as const, intensity: 5 }],
              },
            ],
          },
        ],
      },
    ],
  };
  return {
    id,
    name,
    structure_hash: `v1:sha256:${"0".repeat(64)}`,
    gps_recording_enabled: true,
    structure: initializeActivityPlanDocument({
      activityPlanId:
        activity_category === "bike"
          ? "11111111-1111-4111-8111-111111111111"
          : "22222222-2222-4222-8222-222222222222",
      structure,
    }),
  };
}

function buildCanonicalTrainingPlanStructure() {
  return {
    version: 1 as const,
    sessions: [
      {
        offset_days: 0,
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
        activity_plan_variant_id: "11111111-1111-4111-8111-111111111111",
      },
    ],
    goal_blueprints: [
      {
        title: "Peak for event",
        priority: 10,
        activity_category: "bike",
        target_offset_days: 42,
      },
    ],
  };
}

function availableCommonLoad(
  load: number,
  contributingDurationSeconds: number,
  activityCategory: "bike" | "run" = "bike",
) {
  return calculateAvailableCommonLoad({
    activity_category: activityCategory,
    method: "heart_rate_zones",
    intensity: Math.sqrt(load / (100 * (contributingDurationSeconds / 3600))),
    contributingDurationSeconds,
    quality: {
      source: "manual",
      observed_at: "2026-01-01T00:00:00.000Z",
      valid_at: "2026-01-01T00:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "1",
      evidence_fingerprint: "lthr-evidence",
    },
    thresholdEvidence: {
      type: "lthr_bpm",
      value: 170,
      unit: "beats_per_minute",
      source: "manual",
      observedAt: "2026-01-01T00:00:00.000Z",
      validAt: "2026-01-01T00:00:00.000Z",
      freshness: "current",
      calculationVersion: "1",
      sourceFingerprint: "lthr-evidence",
    },
    evidenceFingerprint: `${activityCategory}-${load}-${contributingDurationSeconds}`,
    computedAsOf: "2026-04-03T12:00:00.000Z",
    estimated: false,
  });
}

function testQuantification(input: {
  activityCategory?: "bike" | "run";
  distanceMeters?: number;
  durationSeconds: number;
  id: string;
  kind: "observation";
  load: CommonLoadResult;
  providerExternalId?: string;
}): ActivityObservationQuantification;
function testQuantification(input: {
  activityCategory?: "bike" | "run";
  distanceMeters?: number;
  durationSeconds: number;
  id: string;
  kind: "prescription";
  load: CommonLoadResult;
  providerExternalId?: string;
}): ActivityPrescriptionQuantification;
function testQuantification(input: {
  activityCategory?: "bike" | "run";
  distanceMeters?: number;
  durationSeconds: number;
  id: string;
  kind: "observation" | "prescription";
  load: CommonLoadResult;
  providerExternalId?: string;
}) {
  const evidenceRole = input.kind === "observation" ? "measured" : "prescribed";
  const segmentId = `${input.id}-segment`;
  const providerExternalId = input.providerExternalId ?? `wahoo-${input.id}`;
  const subjectIdentity =
    input.kind === "observation"
      ? createCompletedActivityQuantificationSubjectIdentity({ activityId: input.id })
      : createPlanOccurrenceActivityQuantificationSubjectIdentity({
          occurrenceId: `${input.id}-occurrence`,
          parentSubjectIdentity: createPlanActivityQuantificationSubjectIdentity({
            planId: input.id,
          }),
        });
  const shared = {
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: input.kind === "observation" ? "provider_summary" : "plan_revision",
      sourceIds:
        input.kind === "observation"
          ? [input.id, segmentId, "wahoo", providerExternalId]
          : [input.id],
      revisionFingerprint: `revision-${input.id}`,
      details: { kind: input.kind, id: input.id },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: input.load.model,
      version: input.load.version,
      computedAt: input.load.computedAsOf,
      calibrationEvidenceFingerprint: input.load.evidenceFingerprint,
    }),
    activity_category: input.activityCategory ?? "bike",
    duration: {
      elapsed: {
        status: "available",
        evidenceRole,
        value: input.durationSeconds,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole,
        value: input.durationSeconds,
        unit: "seconds",
      },
      moving: {
        status: "available",
        evidenceRole,
        value: input.durationSeconds,
        unit: "seconds",
      },
    },
    distance: {
      status: "available",
      evidenceRole,
      value: input.distanceMeters ?? 10_000,
      unit: "meters",
    },
    commonLoad: input.load,
  };
  return input.kind === "observation"
    ? activityObservationQuantificationSchema.parse({
        ...shared,
        kind: "observation",
        stage: "final",
        intensity: {
          observed: {
            status: "unavailable",
            evidenceRole: "measured",
            values: [],
            reason: "not_observed",
          },
        },
        completedProvenance: {
          activityId: input.id,
          segmentId,
          source: "provider_summary",
          artifactIdentity: null,
          providerIdentity: {
            provider: "wahoo",
            externalId: providerExternalId,
          },
          segmentRevision: null,
          observedAt: input.load.computedAsOf,
          computedAt: input.load.computedAsOf,
          calculationVersion: "home-router-test-v1",
        },
      })
    : activityPrescriptionQuantificationSchema.parse({
        ...shared,
        kind: "prescription",
        stage: "plan",
        intensity: {
          prescribed: {
            status: "unavailable",
            evidenceRole: "prescribed",
            values: [],
            reason: "not_authored",
          },
        },
      });
}

function unavailableWorkload() {
  return {
    acwr: {
      value: null,
      status: "insufficient_history" as const,
      coverageDays: 0,
      requiredDays: 28,
      source: "none" as const,
      reasonCode: "missing_exact_identity",
    },
    monotony: {
      value: null,
      status: "insufficient_history" as const,
      coverageDays: 0,
      requiredDays: 7,
      source: "none" as const,
      reasonCode: "missing_exact_identity",
    },
  };
}

describe("planned Home activity rows", () => {
  it("parses the selected Event shape, including an unavailable linked plan", async () => {
    const db = createDbMock({
      select: {
        events: [
          [
            {
              id: "planned-with-plan",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              scheduled_date: "2026-04-03",
              notes: null,
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
            {
              id: "planned-unavailable",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              scheduled_date: "2026-04-04",
              notes: null,
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
              activity_plan: null,
            },
          ],
        ],
      },
    });

    await expect(
      listPlannedActivitiesInRange(db as never, {
        profileId: "11111111-1111-4111-8111-111111111111",
        scheduledDateGte: "2026-04-03",
        scheduledDateLt: "2026-04-05",
      }),
    ).resolves.toMatchObject([
      {
        id: "planned-with-plan",
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
        activity_plan: { activity_category: "bike" },
      },
      {
        id: "planned-unavailable",
        activity_plan_id: "22222222-2222-4222-8222-222222222222",
        activity_plan: null,
      },
    ]);
  });
});

describe("homeRouter", () => {
  beforeEach(() => {
    homeMocks.readAthleteReadModel.mockResolvedValue({
      contractVersion: "athlete-read-model-v1",
      profileId: "11111111-1111-4111-8111-111111111111",
      asOf: "2026-04-03T12:00:00.000Z",
      publishedRevision: 1,
      algorithmVersion: "athlete-state-projection-v1",
      currentBaseline: {
        baseline: {
          asOf: "2026-04-03T00:00:00.000Z",
          loadBalance: -4,
          longTermLoad: 40,
          recentLoad: 44,
        },
        currentPlanningDate: "2026-04-03",
        planningTimezone: "UTC",
      },
      activityAnalytics: { status: "unavailable", reason: "row_limit_exceeded" },
      loadHistory: {
        publishedRevision: 1,
        algorithmVersion: "athlete-state-projection-v1",
        result: {
          status: "unavailable",
          policyVersion: "common_load_history_v1",
          reason: "insufficient_history",
          context: { requiredDays: 84, receivedDays: 0 },
        },
      },
    });
    homeMocks.getEffectivePlanLoad.mockResolvedValue({
      status: "unavailable",
      reason: "planning_timezone_missing",
      model: "gradientpeak_relative_load",
      version: "1",
      sourceCounts: { activities: 0, events: 0 },
    });
    homeMocks.getLoadBalanceStatus.mockReturnValue("negative_balance");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("getDashboard returns active plan, weekly summary, schedule, and telemetry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    homeMocks.calculateRollingTrainingQuality.mockReturnValue(0.84);
    homeMocks.getLoadBalanceStatus.mockReturnValue("negative_balance");
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    const yesterdayQuantification = testQuantification({
      id: "activity-yesterday-segment",
      kind: "observation",
      load: availableCommonLoad(30, 1800),
      durationSeconds: 1800,
      distanceMeters: 10_000,
      providerExternalId: "wahoo-yesterday",
    });
    const todayQuantifications = [
      testQuantification({
        id: "activity-today-segment-1",
        kind: "observation",
        load: availableCommonLoad(20, 1800),
        durationSeconds: 1800,
        distanceMeters: 5000,
        providerExternalId: "wahoo-today",
      }),
      testQuantification({
        id: "activity-today-segment-2",
        kind: "observation",
        load: availableCommonLoad(30, 1800),
        durationSeconds: 1800,
        distanceMeters: 10_000,
        providerExternalId: "wahoo-today",
      }),
    ];
    homeMocks.readAthleteReadModel.mockResolvedValue({
      contractVersion: "athlete-read-model-v1",
      profileId: "11111111-1111-4111-8111-111111111111",
      asOf: "2026-04-03T12:00:00.000Z",
      publishedRevision: 1,
      algorithmVersion: "athlete-state-projection-v1",
      currentBaseline: {
        baseline: {
          asOf: "2026-04-03T00:00:00.000Z",
          loadBalance: -4,
          longTermLoad: 40,
          recentLoad: 44,
        },
        currentPlanningDate: "2026-04-03",
        planningTimezone: "UTC",
        planningContext: {
          demographics: { ageYears: { value: 36 }, gender: "female" },
        },
      },
      loadHistory: {
        publishedRevision: 1,
        algorithmVersion: "athlete-state-projection-v1",
        result: {
          status: "unavailable",
          policyVersion: "common_load_history_v1",
          reason: "insufficient_history",
          context: { requiredDays: 84, receivedDays: 0 },
        },
      },
      activityAnalytics: {
        status: "available",
        dashboard: {
          performance: {
            dataPoints: [
              {
                activityId: "activity-yesterday",
                date: "2026-04-02T07:00:00.000Z",
                observationQuantification: createObservationQuantificationBundle({
                  members: [yesterdayQuantification],
                }),
              },
              {
                activityId: "activity-today",
                date: "2026-04-03T07:00:00.000Z",
                observationQuantification: createObservationQuantificationBundle({
                  members: todayQuantifications,
                }),
              },
            ],
          },
        },
      },
    });
    homeMocks.estimateActivityPlans.mockImplementation(async (plans: Array<any>) =>
      plans.map((plan) => {
        const durationSeconds = plan.id === "plan-1" ? 3600 : 2400;
        const distanceMeters = plan.id === "plan-1" ? 20_000 : 12_000;
        const loadValue = plan.id === "plan-1" ? 90 : 60;
        const activityCategory = plan.id === "plan-1" ? "bike" : "run";
        const quantification = testQuantification({
          id: plan.id,
          kind: "prescription",
          load: availableCommonLoad(loadValue, durationSeconds, activityCategory),
          durationSeconds,
          distanceMeters,
          activityCategory,
        });
        return {
          ...plan,
          common_load: quantification.commonLoad,
          prescriptionQuantification: createActivityPlanPrescriptionQuantificationBundle({
            members: [quantification],
          }),
          planProjection: {
            objectiveIntensity: {
              status: "available",
              value: plan.id === "plan-1" ? 0.75 : 0.6,
            },
          },
        };
      }),
    );
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());

    const { caller, db } = createCaller({
      select: {
        profiles: [[{ dob: new Date("1990-06-15T00:00:00.000Z"), gender: "female" }]],
        events: [
          [
            {
              training_plan_id: "plan-1",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
            },
          ],
          [
            {
              id: "planned-today",
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              linked_activity_id: "activity-today",
              notes: null,
              scheduled_date: "2026-04-03",
              status: "completed",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
            {
              id: "planned-tomorrow",
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              linked_activity_id: null,
              notes: null,
              scheduled_date: "2026-04-04",
              status: "scheduled",
              activity_plan: buildActivityPlan("plan-2", "Recovery Run", "run"),
            },
          ],
          [
            {
              id: "planned-today",
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              linked_activity_id: "activity-today",
              notes: null,
              scheduled_date: "2026-04-03",
              status: "completed",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
            {
              id: "planned-tomorrow",
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              linked_activity_id: null,
              notes: null,
              scheduled_date: "2026-04-04",
              status: "scheduled",
              activity_plan: buildActivityPlan("plan-2", "Recovery Run", "run"),
            },
          ],
        ],
        activities: [
          [
            {
              id: "activity-yesterday",
              profile_id: "11111111-1111-4111-8111-111111111111",
              started_at: new Date("2026-04-02T07:00:00.000Z"),
              finished_at: new Date("2026-04-02T08:00:00.000Z"),
              elapsed_ms: 3_600_000,
              active_ms: 1_800_000,
              moving_ms: 1_700_000,
              timing_coverage: "complete",
              distance_meters: 10000,
              avg_heart_rate: 140,
              max_heart_rate: 165,
              avg_power: 210,
              max_power: 320,
              avg_speed_mps: 6,
              max_speed_mps: 10,
              normalized_speed_mps: 6.3,
            },
            {
              id: "activity-today",
              profile_id: "11111111-1111-4111-8111-111111111111",
              started_at: new Date("2026-04-03T07:00:00.000Z"),
              finished_at: new Date("2026-04-03T08:00:00.000Z"),
              elapsed_ms: 3_600_000,
              active_ms: 3_600_000,
              moving_ms: 3_500_000,
              timing_coverage: "complete",
              distance_meters: 15000,
              avg_heart_rate: 145,
              max_heart_rate: 170,
              avg_power: 220,
              max_power: 340,
              avg_speed_mps: 6.2,
              max_speed_mps: 10.4,
              normalized_speed_mps: 6.5,
            },
          ],
        ],
        activitySourceReferences: [
          [
            {
              activityId: "activity-yesterday",
              provider: "wahoo",
              externalId: "wahoo-yesterday",
            },
            {
              activityId: "activity-today",
              provider: "wahoo",
              externalId: "wahoo-today",
            },
          ],
        ],
        profileTrainingSettings: [
          [
            {
              profileId: "11111111-1111-4111-8111-111111111111",
              settings: {
                ...defaultAthletePreferenceProfile,
                baseline_fitness: {
                  is_enabled: true,
                  override_date: "2026-04-02T00:00:00.000Z",
                  override_ctl: 55,
                  override_atl: 60,
                },
              },
              updatedAt: new Date("2026-04-01T00:00:00.000Z"),
            },
          ],
        ],
      },
      execute: [
        [
          {
            id: "plan-1",
            name: "Build Block",
            description: "Spring build",
            structure: buildCanonicalTrainingPlanStructure(),
          },
        ],
      ],
    });

    const result = await caller.getDashboard({ days: 2 });

    expect(homeMocks.readAthleteReadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.objectContaining({
          currentBaseline: { includePlanningContext: true },
          activityAnalytics: expect.objectContaining({ groupBy: "day" }),
        }),
      }),
    );
    expect(db.whereCalls.some((call) => call.table === "activities")).toBe(false);
    expect(homeMocks.buildWorkloadEnvelopes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          started_at: "2026-04-02T07:00:00.000Z",
          sourceIntegrity: "trusted",
        }),
        expect.objectContaining({
          started_at: "2026-04-03T07:00:00.000Z",
          sourceIntegrity: "trusted",
        }),
      ]),
      expect.any(Date),
      expect.any(Date),
      { planningTimezone: "UTC" },
    );

    expect(homeMocks.getEffectivePlanLoad).toHaveBeenCalledWith(
      expect.objectContaining({ request: { startDate: "2026-04-03", endDate: "2026-05-15" } }),
    );

    expect(result.activePlan).toEqual({
      id: "plan-1",
      name: "Build Block",
    });
    expect(result.currentLoadStatus).toBeNull();
    expect(result).not.toHaveProperty("currentStatus");
    expect(result.consistency).toEqual({ streak: 2, weeklyCount: 2 });
    expect(result.weeklySummary).toMatchObject({
      actual: { distance: 25, duration: 5400, load: 80, loadComplete: true, count: 2 },
      planned: { distance: 32, duration: 6000, load: 150, loadComplete: true, count: 2 },
      adherence: 53,
      observationQuantification: { summary: { kind: "aggregate" } },
    });
    expect(result.weeklySummary.actual).not.toHaveProperty("tss");
    expect(result.weeklySummary.actual).not.toHaveProperty("tssComplete");
    expect(result.weeklySummary.planned).not.toHaveProperty("tss");
    expect(result.schedule).toEqual([
      expect.objectContaining({
        id: "planned-today",
        date: "2026-04-03",
        isToday: true,
        isCompleted: true,
        activityName: "Threshold Ride",
        activity_category: "bike",
        estimatedDuration: 3600,
        estimatedDistance: 20000,
        load: expect.any(Number),
        objectiveIntensity: 0.75,
      }),
      expect.objectContaining({
        id: "planned-tomorrow",
        date: "2026-04-04",
        isToday: false,
        isCompleted: false,
        activityName: "Recovery Run",
        activity_category: "run",
        estimatedDuration: 2400,
        estimatedDistance: 12000,
        load: expect.any(Number),
        objectiveIntensity: 0.6,
      }),
    ]);
    expect(result.todaysActivity).toEqual(
      expect.objectContaining({
        id: "planned-today",
        date: "2026-04-03",
        isToday: true,
        isCompleted: true,
        activityName: "Threshold Ride",
        activity_category: "bike",
        estimatedDuration: 3600,
        estimatedDistance: 20000,
        load: expect.any(Number),
        objectiveIntensity: 0.75,
      }),
    );
    expect(result.schedule[0]).not.toHaveProperty("activityCategory");
    expect(result.schedule[0]).not.toHaveProperty("activityCategories");
    expect(result.schedule[0]).not.toHaveProperty("activityKind");
    expect(result.schedule[0]).not.toHaveProperty("intensity");
    expect(result.projectedLoad).toEqual([]);
    expect(result).not.toHaveProperty("projectedFitness");
    expect(result).not.toHaveProperty("idealFitnessCurve");
    expect(result).not.toHaveProperty("goalMetrics");
    expect(JSON.stringify(result)).not.toMatch(/productive|fatigued|overreach/i);
    expect(result.personalizationTelemetry).toEqual({
      flags: {
        age_constants: true,
        gender_adjustment: true,
        training_quality: true,
        ramp_learning: false,
      },
      user_age: 36,
      user_gender: "female",
      training_quality: 0.84,
    });
    expect(homeMocks.estimateActivityPlans).toHaveBeenCalledOnce();
  });

  it("withholds Option 1 mixed-plan lane distance from the compact schedule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());
    homeMocks.estimateActivityPlans.mockImplementation(
      async (plans: Array<{ id: string; structure: unknown } & Record<string, unknown>>) =>
        plans.map((plan) => {
          const document = activityPlanDocumentSchema.parse(plan.structure);
          const resolved = resolveActivityPlanVariant(document);
          const planning = estimateActivityPlanForTrainingContext({
            asOf: "2026-04-03T12:00:00.000Z",
            planId: plan.id,
            performanceTargets: createUnavailableAthletePerformanceTargetFacts(
              "2026-04-03T12:00:00.000Z",
              "11111111-1111-4111-8111-111111111111",
            ),
            structure: resolved.structure,
          });
          if (!planning.planProjection) throw new Error("Expected an activity-plan projection");
          return {
            ...plan,
            prescriptionQuantification: planning.prescriptionQuantification,
            planProjection: planning.planProjection,
          };
        }),
    );

    const optionOnePlan = {
      ...buildActivityPlan("option-1", OPTION_1_FAVORITE_SWIM.name, "bike"),
      structure: initializeActivityPlanDocument({
        activityPlanId: "33333333-3333-4333-8333-333333333333",
        structure: OPTION_1_FAVORITE_SWIM.structure,
      }),
    };
    const { caller } = createCaller({
      select: {
        events: [
          [],
          [
            {
              id: "scheduled-option-1",
              activity_plan_id: optionOnePlan.id,
              starts_at: new Date("2026-04-03T13:00:00.000Z"),
              linked_activity_id: null,
              notes: null,
              scheduled_date: "2026-04-03",
              status: "scheduled",
              activity_plan: optionOnePlan,
            },
          ],
        ],
      },
    });

    const result = await caller.getDashboard({ days: 1 });

    expect(result.schedule).toEqual([
      {
        id: "scheduled-option-1",
        date: "2026-04-03",
        isToday: true,
        isCompleted: false,
        activityName: OPTION_1_FAVORITE_SWIM.name,
        activity_category: "swim",
        estimatedDuration: null,
        estimatedDistance: null,
        load: null,
        objectiveIntensity: null,
      },
    ]);
    expect(result.todaysActivity).toEqual(result.schedule[0]);
  });

  it("requests canonical activity analytics through the current instant without a raw activity read", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T18:00:00.000Z"));
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());

    const { caller, db } = createCaller({
      select: {
        events: [[], [], []],
      },
    });

    await caller.getDashboard({ days: 1 });

    expect(homeMocks.readAthleteReadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.objectContaining({
          activityAnalytics: expect.objectContaining({
            endAt: "2026-04-03T18:00:00.000Z",
          }),
        }),
      }),
    );
    expect(db.whereCalls.some((call) => call.table === "activities")).toBe(false);
  });

  it("does not complete a planned session from an unrelated same-day activity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T15:30:00.000Z"));
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    const localQuantification = testQuantification({
      id: "activity-local-today-segment",
      kind: "observation",
      load: availableCommonLoad(50, 3600),
      durationSeconds: 3600,
      distanceMeters: 15_000,
    });
    homeMocks.readAthleteReadModel.mockResolvedValue({
      contractVersion: "athlete-read-model-v1",
      profileId: "11111111-1111-4111-8111-111111111111",
      asOf: "2026-04-03T15:30:00.000Z",
      publishedRevision: 1,
      algorithmVersion: "athlete-state-projection-v1",
      currentBaseline: {
        currentPlanningDate: "2026-04-04",
        planningTimezone: "Asia/Tokyo",
        planningContext: null,
      },
      loadHistory: null,
      activityAnalytics: {
        status: "available",
        dashboard: {
          performance: {
            dataPoints: [
              {
                activityId: "activity-local-today",
                date: "2026-04-03T15:15:00.000Z",
                observationQuantification: createObservationQuantificationBundle({
                  members: [localQuantification],
                }),
              },
            ],
          },
        },
      },
    });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());
    homeMocks.estimateActivityPlans.mockImplementation(async (plans: Array<any>) => plans);

    const { caller } = createCaller({
      select: {
        events: [
          [],
          [
            {
              id: "planned-local-today",
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              starts_at: new Date("2026-04-03T15:00:00.000Z"),
              linked_activity_id: null,
              notes: null,
              scheduled_date: "2026-04-04",
              status: "scheduled",
              activity_plan: buildActivityPlan("plan-1", "Tokyo Ride", "bike"),
            },
          ],
        ],
      },
    });

    const result = await caller.getDashboard({ days: 1 });

    expect(result.consistency).toEqual({ streak: 1, weeklyCount: 1 });
    expect(result.schedule).toEqual([
      expect.objectContaining({ id: "planned-local-today", date: "2026-04-04", isToday: true }),
    ]);
    expect(result.todaysActivity).toEqual(
      expect.objectContaining({ id: "planned-local-today", isCompleted: false }),
    );
  });

  it("getDashboard rejects invalid raw SQL plan rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());
    homeMocks.estimateActivityPlans.mockResolvedValue([]);

    const { caller } = createCaller({
      select: {
        profiles: [[{ dob: new Date("1990-06-15T00:00:00.000Z"), gender: "female" }]],
        events: [
          [
            {
              training_plan_id: "plan-1",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
            },
          ],
          [],
          [],
        ],
        activities: [[]],
      },
      execute: [[{ id: "plan-1", name: null, description: null, structure: {} }]],
    });

    await expect(caller.getDashboard({ days: 2 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("rejects legacy workload envelope aliases", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue({
      acwr: { current: 1.1, previous: 0.9 },
      monotony: { current: 1.4 },
    });

    const { caller } = createCaller({
      select: {
        profiles: [[{ dob: null, gender: null }]],
        events: [[], [], []],
        activities: [[]],
      },
    });

    await expect(caller.getDashboard()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("getDashboard safely ignores malformed settings before validating assembled schedule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    homeMocks.calculateRollingTrainingQuality.mockReturnValue(0.84);
    homeMocks.getLoadBalanceStatus.mockReturnValue("near_balance");
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.estimateActivityPlans.mockImplementation(async (plans: Array<any>) =>
      plans.map((plan) => {
        const quantification = testQuantification({
          id: plan.id,
          kind: "prescription",
          load: availableCommonLoad(90, 3600),
          durationSeconds: 3600,
          distanceMeters: 20_000,
        });
        return {
          ...plan,
          common_load: quantification.commonLoad,
          prescriptionQuantification: createActivityPlanPrescriptionQuantificationBundle({
            members: [quantification],
          }),
        };
      }),
    );
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());

    const { caller } = createCaller({
      select: {
        profiles: [[{ dob: new Date("1990-06-15T00:00:00.000Z"), gender: "female" }]],
        events: [
          [
            {
              training_plan_id: "plan-1",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
            },
          ],
          [
            {
              id: "planned-today",
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-03",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
          ],
          [
            {
              id: "planned-today",
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-03",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
          ],
        ],
        activities: [
          [
            {
              id: "activity-today",
              profile_id: "11111111-1111-4111-8111-111111111111",
              started_at: new Date("2026-04-03T07:00:00.000Z"),
              finished_at: new Date("2026-04-03T08:00:00.000Z"),
              elapsed_ms: 3_600_000,
              active_ms: 3_600_000,
              moving_ms: 3_500_000,
              timing_coverage: "complete",
              distance_meters: 15000,
              avg_heart_rate: 145,
              max_heart_rate: 170,
              avg_power: 220,
              max_power: 340,
              avg_speed_mps: 6.2,
              max_speed_mps: 10.4,
              normalized_speed_mps: 6.5,
            },
          ],
        ],
        profileTrainingSettings: [
          [
            {
              profileId: "11111111-1111-4111-8111-111111111111",
              settings: { availability: {} },
              updatedAt: new Date("2026-04-01T00:00:00.000Z"),
            },
          ],
        ],
      },
      execute: [
        [
          {
            id: "plan-1",
            name: "Build Block",
            description: "Spring build",
            structure: buildCanonicalTrainingPlanStructure(),
          },
        ],
      ],
    });

    await expect(caller.getDashboard({ days: 2 })).resolves.toMatchObject({
      weeklySummary: {
        planned: { distance: 20, duration: 3600, load: 90, loadComplete: true },
      },
    });
  });

  it("rejects legacy periodization and singular goal fields instead of translating them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());

    const { caller } = createCaller({
      select: {
        profiles: [[{ dob: null, gender: null }]],
        events: [[{ training_plan_id: "plan-1", starts_at: new Date("2026-04-04T08:00:00.000Z") }]],
        activities: [[]],
      },
      execute: [
        [
          {
            id: "plan-1",
            name: "Legacy plan",
            description: null,
            structure: {
              ...buildCanonicalTrainingPlanStructure(),
              periodization: { currentPhase: "build" },
              periodization_template: { target_ctl: 60 },
              goal: { targetCTL: 60, targetDate: "2026-04-20" },
            },
          },
        ],
      ],
    });

    await expect(caller.getDashboard()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
