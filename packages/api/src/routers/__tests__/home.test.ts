import { defaultAthletePreferenceProfile } from "@repo/core";
import { schema } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const homeMocks = vi.hoisted(() => ({
  buildDailyTssByDateSeries: vi.fn(),
  buildDynamicStressSeries: vi.fn(),
  summarizeSegmentTss: vi.fn((summaries, activityIds) => ({
    tss: summaries.reduce(
      (total: number, summary: { activity_id: string; tss: number | null }) =>
        activityIds.has(summary.activity_id) && summary.tss !== null ? total + summary.tss : total,
      0,
    ),
    complete: true,
  })),
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
    calculateAge: homeMocks.calculateAge,
    calculateRollingTrainingQuality: homeMocks.calculateRollingTrainingQuality,
    getLoadBalanceStatus: homeMocks.getLoadBalanceStatus,
  };
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
  summarizeSegmentTss: homeMocks.summarizeSegmentTss,
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

function buildActivityPlan(id: string, name: string, category: "bike" | "run") {
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
          category,
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

describe("homeRouter", () => {
  beforeEach(() => {
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
                category: "bike",
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
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([
        [
          "activity-today",
          { tss: 50, intensity_factor: 0.9, common_load: completeCommonLoad(50, 3600) },
        ],
        [
          "activity-yesterday",
          { tss: 30, intensity_factor: 0.82, common_load: completeCommonLoad(30, 1800) },
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
          common_load: completeCommonLoad(30, 1800),
        },
        { activity_id: "activity-today", tss: 20, common_load: completeCommonLoad(20, 1800) },
        { activity_id: "activity-today", tss: 30, common_load: completeCommonLoad(30, 1800) },
      ],
      complete: true,
      seriesIdentity: {
        sport: "bike",
        method: "power_threshold",
        source: "activity_analysis",
        version: "1",
      },
    });
    homeMocks.getActivityPlansDerivedMetrics.mockImplementation(async (plans: Array<any>) =>
      plans.map((plan) => ({
        ...plan,
        estimated_distance: plan.id === "plan-1" ? 20000 : 12000,
        estimated_duration: plan.id === "plan-1" ? 3600 : 2400,
        estimated_tss: plan.id === "plan-1" ? 90 : 60,
      })),
    );
    homeMocks.buildWorkloadEnvelopes.mockReturnValue({
      acwr: { current: 1.1, previous: 0.9 },
      monotony: { current: 1.4 },
      strain: { current: 280 },
    });

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
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-03",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
            {
              id: "planned-tomorrow",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-04",
              activity_plan: buildActivityPlan("plan-2", "Recovery Run", "run"),
            },
          ],
          [
            {
              id: "planned-today",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-03",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
            {
              id: "planned-tomorrow",
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
              normalized_graded_speed_mps: 6.4,
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
              normalized_graded_speed_mps: 6.6,
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
            structure: {
              periodization: { currentPhase: "build" },
              periodization_template: {
                starting_ctl: 40,
                target_ctl: 60,
                target_date: "2026-04-20",
              },
              goals: [
                {
                  targets: [{ target_type: "power" }],
                },
              ],
            },
          },
        ],
      ],
    });

    const result = await caller.getDashboard({ days: 2 });

    expect(homeMocks.buildDynamicStressSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        activities: expect.arrayContaining([
          expect.objectContaining({ id: "activity-yesterday", normalized_power: 248 }),
          expect.objectContaining({ id: "activity-today", normalized_power: 248 }),
        ]),
      }),
    );

    expect(homeMocks.getEffectivePlanLoad).toHaveBeenCalledWith(
      expect.objectContaining({ request: { startDate: "2026-04-03", endDate: "2026-05-15" } }),
    );

    expect(result.activePlan).toEqual({
      id: "plan-1",
      name: "Build Block",
      phase: "build",
      targetType: "power",
    });
    expect(result.currentStatus).toBeNull();
    expect(result.consistency).toEqual({ streak: 2, weeklyCount: 2 });
    expect(result.weeklySummary).toMatchObject({
      actual: { distance: 25, duration: 5400, tss: 80, tssComplete: true, count: 2 },
      planned: { distance: 32, duration: 6000, tss: 150, count: 2 },
      adherence: 53,
      commonLoad: {
        actual: {
          status: "complete",
          load: 80,
          totalActivityCount: 2,
          contributingActivityCount: 2,
          activityCountCoverage: 1,
        },
        planned: { status: "unavailable", reason: "no_load_data" },
      },
    });
    expect(result.schedule).toEqual([
      expect.objectContaining({
        id: "planned-today",
        date: "2026-04-03",
        isToday: true,
        isCompleted: true,
        activityName: "Threshold Ride",
        activityType: "bike",
        activityKind: "single",
        activityCategories: ["bike"],
        estimatedDuration: 3600,
        estimatedDistance: 20000,
        load: null,
        intensity: null,
      }),
      expect.objectContaining({
        id: "planned-tomorrow",
        date: "2026-04-04",
        isToday: false,
        isCompleted: false,
        activityName: "Recovery Run",
        activityType: "run",
        activityKind: "single",
        activityCategories: ["run"],
        estimatedDuration: 2400,
        estimatedDistance: 12000,
        load: null,
        intensity: null,
      }),
    ]);
    expect(result.todaysActivity).toEqual(
      expect.objectContaining({
        id: "planned-today",
        date: "2026-04-03",
        isToday: true,
        isCompleted: true,
        activityName: "Threshold Ride",
        activityType: "bike",
        activityKind: "single",
        activityCategories: ["bike"],
        estimatedDuration: 3600,
        estimatedDistance: 20000,
        load: null,
        intensity: null,
      }),
    );
    expect(result.projectedLoad).toEqual([]);
    expect(homeMocks.replayTrainingLoadByDate).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("projectedFitness");
    expect(JSON.stringify(result)).not.toMatch(/productive|fatigued|overreach/i);
    expect(result.goalMetrics).toEqual({
      targetCTL: 60,
      targetDate: "2026-04-20",
      description: expect.stringContaining("Target 60 CTL by"),
    });
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
    homeMocks.buildWorkloadEnvelopes.mockReturnValue({ acwr: {}, monotony: {} });

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
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([
        ["activity-local-today", { tss: 50, common_load: completeCommonLoad(50, 3600) }],
      ]),
      segmentSummaries: [
        {
          activity_id: "activity-local-today",
          tss: 50,
          common_load: completeCommonLoad(50, 3600),
        },
      ],
      complete: true,
      seriesIdentity: { sport: "bike", method: "power_threshold" },
    });
    homeMocks.buildWorkloadEnvelopes.mockReturnValue({ acwr: {}, monotony: {} });
    homeMocks.getActivityPlansDerivedMetrics.mockImplementation(async (plans: Array<any>) => plans);

    const { caller } = createCaller({
      select: {
        profiles: [[{ dob: null, gender: null, planning_timezone: "Asia/Tokyo" }]],
        events: [
          [],
          [
            {
              id: "planned-local-today",
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
              normalized_graded_speed_mps: 6.6,
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
    homeMocks.buildWorkloadEnvelopes.mockReturnValue({
      acwr: { current: 1.1 },
      monotony: { current: 1.4 },
    });
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
      plans.map((plan) => ({
        ...plan,
        estimated_distance: 20000,
        estimated_duration: "3600",
        estimated_tss: 90,
      })),
    );
    homeMocks.buildWorkloadEnvelopes.mockReturnValue({
      acwr: { current: 1.1, previous: 0.9 },
      monotony: { current: 1.4 },
    });

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
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-03",
              activity_plan: buildActivityPlan("plan-1", "Threshold Ride", "bike"),
            },
          ],
          [
            {
              id: "planned-today",
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
              normalized_graded_speed_mps: 6.6,
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
            structure: {},
          },
        ],
      ],
    });

    await expect(caller.getDashboard({ days: 2 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
