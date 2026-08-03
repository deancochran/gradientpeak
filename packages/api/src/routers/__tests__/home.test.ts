import {
  type ActivityObservationQuantification,
  type ActivityPrescriptionQuantification,
  activityObservationQuantificationSchema,
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  defaultAthletePreferenceProfile,
} from "@repo/core";
import { type CommonLoadResult, calculateAvailableCommonLoad } from "@repo/core/load";
import { schema } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const homeMocks = vi.hoisted(() => ({
  buildDailyTssByDateSeries: vi.fn(),
  buildDynamicStressSeries: vi.fn(),
  summarizeSegmentCommonLoad: vi.fn((summaries, activityIds) => ({
    status: "complete",
    load: summaries.reduce(
      (total: number, summary: { activity_id: string; common_load?: { load?: number | null } }) =>
        activityIds.has(summary.activity_id) && summary.common_load?.load !== null
          ? total + (summary.common_load?.load ?? 0)
          : total,
      0,
    ),
  })),
  summarizeSegmentQuantification: vi.fn(),
  buildWorkloadEnvelopes: vi.fn(),
  calculateAge: vi.fn(),
  calculateRollingTrainingQuality: vi.fn(),
  createActivityAnalysisStore: vi.fn(),
  createEventReadRepository: vi.fn(),
  getActivityPlansDerivedMetrics: vi.fn(),
  getLoadBalanceStatus: vi.fn(),
  getEffectivePlanLoad: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
  replayTrainingLoadByDate: vi.fn(),
  readCurrentProfileCommonLoadHistory: vi.fn(),
}));

vi.mock("@repo/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/core")>();
  return {
    ...actual,
    calculateRollingTrainingQuality: homeMocks.calculateRollingTrainingQuality,
    getLoadBalanceStatus: homeMocks.getLoadBalanceStatus,
  };
});

vi.mock("@repo/core/profile/date-of-birth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/core/profile/date-of-birth")>();
  return { ...actual, calculateAge: homeMocks.calculateAge };
});

vi.mock("@repo/core/load", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/core/load")>();
  return {
    ...actual,
    buildDailyTssByDateSeries: homeMocks.buildDailyTssByDateSeries,
    replayTrainingLoadByDate: homeMocks.replayTrainingLoadByDate,
  };
});

vi.mock("../../application/activities/read-current-profile-common-load-history", () => ({
  readCurrentProfileCommonLoadHistory: homeMocks.readCurrentProfileCommonLoadHistory,
}));

vi.mock("../../application/training-plan", () => ({
  getEffectivePlanLoad: homeMocks.getEffectivePlanLoad,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: homeMocks.createActivityAnalysisStore,
  createEventReadRepository: homeMocks.createEventReadRepository,
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildDynamicStressSeries: homeMocks.buildDynamicStressSeries,
  summarizeSegmentCommonLoad: homeMocks.summarizeSegmentCommonLoad,
  summarizeSegmentQuantification: homeMocks.summarizeSegmentQuantification,
  loadActivitySegmentsByActivityId: homeMocks.loadActivitySegmentsByActivityId,
}));

vi.mock("../../lib/features", () => ({
  featureFlags: {
    personalizationAgeConstants: true,
    personalizationGenderAdjustment: true,
    personalizationTrainingQuality: true,
    personalizationRampLearning: false,
  },
}));

vi.mock("../../utils/activity-plan-derived-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/activity-plan-derived-metrics")>();

  return {
    ...actual,
    getActivityPlansDerivedMetrics: homeMocks.getActivityPlansDerivedMetrics,
  };
});

vi.mock("../../utils/workload", () => ({
  buildWorkloadEnvelopes: homeMocks.buildWorkloadEnvelopes,
}));

import { listPlannedActivitiesInRange } from "../../application/home/plannedActivities";
import { homeRouter } from "../home";

type TableName = "activities" | "events" | "profiles" | "profileTrainingSettings";

type DbPlan = {
  execute?: Array<Array<Record<string, unknown>>>;
  select?: Partial<Record<TableName, Array<unknown[]>>>;
};

function getTableName(table: unknown): TableName {
  if (table === schema.profiles) return "profiles";
  if (table === schema.events) return "events";
  if (table === schema.activities) return "activities";
  if (table === schema.profileTrainingSettings) return "profileTrainingSettings";
  throw new Error(`Unhandled table: ${String(table)}`);
}

function createDbMock(plan: DbPlan = {}) {
  const whereCalls: Array<{ table: TableName; where: unknown }> = [];
  const selectQueues = {
    profiles: [...(plan.select?.profiles ?? [])],
    events: [...(plan.select?.events ?? [])],
    activities: [...(plan.select?.activities ?? [])],
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
  return {
    id,
    name,
    structure_hash: `v1:sha256:${"0".repeat(64)}`,
    gps_recording_enabled: true,
    structure: {
      version: 3 as const,
      segments: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name,
          role: "activity" as const,
          activity_category,
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
    },
  };
}

function buildCanonicalTrainingPlanStructure() {
  return {
    version: 1 as const,
    sessions: [
      {
        offset_days: 0,
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
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

function completeCommonLoad(load: number, contributingDurationSeconds: number) {
  return {
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
    status: "complete" as const,
    load,
    intensity: Math.sqrt(load / (100 * (contributingDurationSeconds / 3600))),
    contributingDurationSeconds,
    knownDurationSeconds: contributingDurationSeconds,
    contributingActivityCount: 1,
    partialActivityCount: 0,
    unavailableActivityCount: 0,
    unknownDurationActivityCount: 0,
    totalActivityCount: 1,
    activityCountCoverage: 1,
    knownDurationCoverage: 1,
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
}): ActivityObservationQuantification;
function testQuantification(input: {
  activityCategory?: "bike" | "run";
  distanceMeters?: number;
  durationSeconds: number;
  id: string;
  kind: "prescription";
  load: CommonLoadResult;
}): ActivityPrescriptionQuantification;
function testQuantification(input: {
  activityCategory?: "bike" | "run";
  distanceMeters?: number;
  durationSeconds: number;
  id: string;
  kind: "observation" | "prescription";
  load: CommonLoadResult;
}) {
  const evidenceRole = input.kind === "observation" ? "measured" : "prescribed";
  const segmentId = `${input.id}-segment`;
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
      evidenceType: input.kind === "observation" ? "segment_facts" : "plan_revision",
      sourceIds: input.kind === "observation" ? [input.id, segmentId] : [input.id],
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
          source: "unknown",
          artifactIdentity: null,
          providerIdentity: null,
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
    homeMocks.summarizeSegmentQuantification.mockImplementation(
      (
        summaries: Array<{
          activity_id: string;
          observationQuantification: ReturnType<typeof createObservationQuantificationBundle>;
        }>,
        activityIds: Set<string>,
      ) =>
        createObservationQuantificationBundle({
          members: summaries
            .filter((summary) => activityIds.has(summary.activity_id))
            .flatMap((summary) => summary.observationQuantification.members),
        }),
    );
    homeMocks.readCurrentProfileCommonLoadHistory.mockResolvedValue({
      computedAt: "2026-04-03T12:00:00.000Z",
      planningTimezone: "UTC",
      currentPlanningDate: "2026-04-03",
      result: {
        status: "unavailable",
        policyVersion: "common_load_history_v1",
        reason: "insufficient_history",
        context: { requiredDays: 84, receivedDays: 0 },
      },
    });
    homeMocks.getEffectivePlanLoad.mockResolvedValue({
      status: "unavailable",
      reason: "planning_timezone_missing",
      model: "gradientpeak_relative_load",
      version: "1",
      sourceCounts: { activities: 0, events: 0 },
    });
    homeMocks.loadActivitySegmentsByActivityId.mockImplementation(
      async (_db: unknown, activityIds: string[]) =>
        new Map(
          activityIds.map((activityId) => [
            activityId,
            [
              {
                id: `${activityId}-segment`,
                role: "activity",
                activity_category: "bike",
                ordinal: 0,
                summary: {
                  version: 1,
                  timing: { timingCoverage: "unavailable" },
                  normalizedPowerWatts: 247.5,
                },
              },
            ],
          ]),
        ),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("getDashboard returns active plan, weekly summary, schedule, and telemetry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    homeMocks.calculateAge.mockReturnValue(36);
    homeMocks.calculateRollingTrainingQuality.mockReturnValue(0.84);
    homeMocks.getLoadBalanceStatus.mockReturnValue("negative_balance");
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    const yesterdayQuantification = testQuantification({
      id: "activity-yesterday-segment",
      kind: "observation",
      load: availableCommonLoad(30, 1800),
      durationSeconds: 1800,
      distanceMeters: 10_000,
    });
    const todayQuantifications = [
      testQuantification({
        id: "activity-today-segment-1",
        kind: "observation",
        load: availableCommonLoad(20, 1800),
        durationSeconds: 1800,
        distanceMeters: 5000,
      }),
      testQuantification({
        id: "activity-today-segment-2",
        kind: "observation",
        load: availableCommonLoad(30, 1800),
        durationSeconds: 1800,
        distanceMeters: 10_000,
      }),
    ];
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([
        [
          "activity-today",
          {
            tss: 50,
            intensity_factor: 0.9,
            common_load: completeCommonLoad(50, 3600),
            observationQuantification: createObservationQuantificationBundle({
              members: todayQuantifications,
            }),
          },
        ],
        [
          "activity-yesterday",
          {
            tss: 30,
            intensity_factor: 0.82,
            common_load: yesterdayQuantification.commonLoad,
            observationQuantification: createObservationQuantificationBundle({
              members: [yesterdayQuantification],
            }),
          },
        ],
      ]),
      byDate: new Map([
        ["2026-04-02", 30],
        ["2026-04-03", 50],
      ]),
      segmentSummaries: [
        {
          activity_id: "activity-yesterday",
          tss: 30,
          common_load: yesterdayQuantification.commonLoad,
          observationQuantification: createObservationQuantificationBundle({
            members: [yesterdayQuantification],
          }),
        },
        {
          activity_id: "activity-today",
          tss: 20,
          common_load: todayQuantifications[0]?.commonLoad,
          observationQuantification: createObservationQuantificationBundle({
            members: todayQuantifications[0] ? [todayQuantifications[0]] : [],
          }),
        },
        {
          activity_id: "activity-today",
          tss: 30,
          common_load: todayQuantifications[1]?.commonLoad,
          observationQuantification: createObservationQuantificationBundle({
            members: todayQuantifications[1] ? [todayQuantifications[1]] : [],
          }),
        },
      ],
      complete: true,
      seriesIdentity: {
        activity_category: "bike",
        method: "power_threshold",
        source: "activity_analysis",
        version: "1",
      },
    });
    homeMocks.getActivityPlansDerivedMetrics.mockImplementation(async (plans: Array<any>) =>
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
            {
              id: "planned-tomorrow",
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-04",
              activity_plan: buildActivityPlan("plan-2", "Recovery Run", "run"),
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
            {
              id: "planned-tomorrow",
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-04",
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

    expect(homeMocks.buildDynamicStressSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        activities: expect.arrayContaining([
          expect.objectContaining({ id: "activity-yesterday" }),
          expect.objectContaining({ id: "activity-today" }),
        ]),
      }),
    );

    expect(homeMocks.getEffectivePlanLoad).toHaveBeenCalledWith(
      expect.objectContaining({ request: { startDate: "2026-04-03", endDate: "2026-05-15" } }),
    );

    expect(result.activePlan).toEqual({
      id: "plan-1",
      name: "Build Block",
    });
    expect(result).not.toHaveProperty("currentStatus");
    expect(result.consistency).toEqual({ streak: 2, weeklyCount: 2 });
    expect(result.weeklySummary).toMatchObject({
      actual: { distance: 25, duration: 5400, load: 80, loadComplete: true, count: 2 },
      planned: { distance: 32, duration: 6000, load: 150, loadComplete: true, count: 2 },
      adherence: 53,
      commonLoad: {
        actual: {
          status: "complete",
          load: 80,
          totalActivityCount: 3,
          contributingActivityCount: 3,
          activityCountCoverage: 1,
        },
        planned: { status: "complete", load: 150 },
      },
      observationQuantification: { summary: { kind: "aggregate" } },
      prescriptionQuantification: { summary: { kind: "aggregate" } },
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
        intensity: expect.any(Number),
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
        intensity: expect.any(Number),
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
        intensity: expect.any(Number),
      }),
    );
    expect(result.schedule[0]).not.toHaveProperty("activityCategory");
    expect(result.schedule[0]).not.toHaveProperty("activityCategories");
    expect(result.schedule[0]).not.toHaveProperty("activityKind");
    expect(result.projectedLoad).toEqual([]);
    expect(homeMocks.replayTrainingLoadByDate).not.toHaveBeenCalled();
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
    expect(homeMocks.getActivityPlansDerivedMetrics).toHaveBeenCalledOnce();
  });

  it("includes activities completed after presentation midnight on the profile's current day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T18:00:00.000Z"));
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map(),
      segmentSummaries: [],
      complete: false,
      seriesIdentity: null,
    });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());

    const { caller, db } = createCaller({
      select: {
        profiles: [[{ dob: null, gender: null, planning_timezone: "America/Los_Angeles" }]],
        events: [[], [], []],
        activities: [[]],
      },
    });

    await caller.getDashboard({ days: 1 });

    const activityQuery = new PgDialect().sqlToQuery(
      db.whereCalls.find((call: { table: TableName }) => call.table === "activities")?.where as any,
    );
    expect(
      activityQuery.params.some(
        (param) =>
          (param instanceof Date ? param.getTime() : Date.parse(String(param))) ===
          new Date("2026-04-04T06:59:59.999Z").getTime(),
      ),
    ).toBe(true);
  });

  it("uses profile-local date keys for an east-of-UTC dashboard day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T15:30:00.000Z"));
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    const localQuantification = testQuantification({
      id: "activity-local-today-segment",
      kind: "observation",
      load: availableCommonLoad(50, 3600),
      durationSeconds: 3600,
      distanceMeters: 15_000,
    });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([
        [
          "activity-local-today",
          {
            tss: 50,
            common_load: localQuantification.commonLoad,
            observationQuantification: createObservationQuantificationBundle({
              members: [localQuantification],
            }),
          },
        ],
      ]),
      segmentSummaries: [
        {
          activity_id: "activity-local-today",
          tss: 50,
          common_load: localQuantification.commonLoad,
          observationQuantification: createObservationQuantificationBundle({
            members: [localQuantification],
          }),
        },
      ],
      complete: true,
      seriesIdentity: { activity_category: "bike", method: "power_threshold" },
    });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());
    homeMocks.getActivityPlansDerivedMetrics.mockImplementation(async (plans: Array<any>) => plans);

    const { caller } = createCaller({
      select: {
        profiles: [[{ dob: null, gender: null, planning_timezone: "Asia/Tokyo" }]],
        events: [
          [],
          [
            {
              id: "planned-local-today",
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              starts_at: new Date("2026-04-03T15:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-04",
              activity_plan: buildActivityPlan("plan-1", "Tokyo Ride", "bike"),
            },
          ],
        ],
        activities: [
          [
            {
              id: "activity-local-today",
              profile_id: "11111111-1111-4111-8111-111111111111",
              started_at: new Date("2026-04-03T15:15:00.000Z"),
              finished_at: new Date("2026-04-03T16:15:00.000Z"),
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
      },
    });

    const result = await caller.getDashboard({ days: 1 });

    expect(result.consistency).toEqual({ streak: 1, weeklyCount: 1 });
    expect(result.schedule).toEqual([
      expect.objectContaining({ id: "planned-local-today", date: "2026-04-04", isToday: true }),
    ]);
    expect(result.todaysActivity).toEqual(
      expect.objectContaining({ id: "planned-local-today", isCompleted: true }),
    );
  });

  it("getDashboard rejects invalid raw SQL plan rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    homeMocks.calculateAge.mockReturnValue(36);
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map(),
      byDate: new Map(),
    });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue(unavailableWorkload());
    homeMocks.getActivityPlansDerivedMetrics.mockResolvedValue([]);

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
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map(),
      segmentSummaries: [],
      complete: false,
      seriesIdentity: null,
    });
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

    homeMocks.calculateAge.mockReturnValue(36);
    homeMocks.calculateRollingTrainingQuality.mockReturnValue(0.84);
    homeMocks.getLoadBalanceStatus.mockReturnValue("near_balance");
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([["activity-today", { tss: 50, intensity_factor: 0.9 }]]),
      byDate: new Map([["2026-04-03", 50]]),
    });
    homeMocks.getActivityPlansDerivedMetrics.mockImplementation(async (plans: Array<any>) =>
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
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map(),
      segmentSummaries: [],
      complete: false,
      seriesIdentity: null,
    });
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
