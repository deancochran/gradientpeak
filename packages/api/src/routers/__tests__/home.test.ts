import { schema } from "@repo/db";
import { afterEach, describe, expect, it, vi } from "vitest";

const homeMocks = vi.hoisted(() => ({
  addEstimationToPlans: vi.fn(),
  buildDailyTssByDateSeries: vi.fn(),
  buildDynamicStressSeries: vi.fn(),
  buildWorkloadEnvelopes: vi.fn(),
  calculateAge: vi.fn(),
  calculateRollingTrainingQuality: vi.fn(),
  createActivityAnalysisStore: vi.fn(),
  createEventReadRepository: vi.fn(),
  getFormStatus: vi.fn(),
  replayTrainingLoadByDate: vi.fn(),
}));

vi.mock("@repo/core", () => ({
  calculateAge: homeMocks.calculateAge,
  calculateRollingTrainingQuality: homeMocks.calculateRollingTrainingQuality,
  getFormStatus: homeMocks.getFormStatus,
}));

vi.mock("@repo/core/load", () => ({
  buildDailyTssByDateSeries: homeMocks.buildDailyTssByDateSeries,
  replayTrainingLoadByDate: homeMocks.replayTrainingLoadByDate,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: homeMocks.createActivityAnalysisStore,
  createEventReadRepository: homeMocks.createEventReadRepository,
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildDynamicStressSeries: homeMocks.buildDynamicStressSeries,
}));

vi.mock("../../lib/features", () => ({
  featureFlags: {
    personalizationAgeConstants: true,
    personalizationGenderAdjustment: true,
    personalizationTrainingQuality: true,
    personalizationRampLearning: false,
  },
}));

vi.mock("../../utils/estimation-helpers", () => ({
  addEstimationToPlans: homeMocks.addEstimationToPlans,
}));

vi.mock("../../utils/workload", () => ({
  buildWorkloadEnvelopes: homeMocks.buildWorkloadEnvelopes,
}));

import { homeRouter } from "../home";

type TableName = "activities" | "events" | "profiles";

type DbPlan = {
  execute?: Array<Array<Record<string, unknown>>>;
  select?: Partial<Record<TableName, Array<unknown[]>>>;
};

function getTableName(table: unknown): TableName {
  if (table === schema.profiles) return "profiles";
  if (table === schema.events) return "events";
  if (table === schema.activities) return "activities";
  throw new Error(`Unhandled table: ${String(table)}`);
}

function createDbMock(plan: DbPlan = {}) {
  const selectQueues = {
    profiles: [...(plan.select?.profiles ?? [])],
    events: [...(plan.select?.events ?? [])],
    activities: [...(plan.select?.activities ?? [])],
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
        leftJoin: () => builder,
        where: () => builder,
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

  return db;
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

describe("homeRouter", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("getDashboard returns active plan, weekly summary, schedule, and telemetry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    homeMocks.calculateAge.mockReturnValue(36);
    homeMocks.calculateRollingTrainingQuality.mockReturnValue(0.84);
    homeMocks.getFormStatus.mockReturnValue("productive");
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([
        ["activity-today", { tss: 50, intensity_factor: 0.9 }],
        ["activity-yesterday", { tss: 30, intensity_factor: 0.82 }],
      ]),
      byDate: new Map([
        ["2026-04-02", 30],
        ["2026-04-03", 50],
      ]),
    });
    homeMocks.addEstimationToPlans.mockImplementation(async (plans: Array<any>) =>
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
    homeMocks.buildDailyTssByDateSeries.mockImplementation(({ tssByDate }) => tssByDate);
    homeMocks.replayTrainingLoadByDate
      .mockReturnValueOnce([
        { date: "2026-04-02", ctl: 40.4, atl: 46.5, tsb: -6.1, tss: 30 },
        { date: "2026-04-03", ctl: 42.2, atl: 51.1, tsb: -8.9, tss: 50 },
      ])
      .mockReturnValueOnce([
        { date: "2026-04-04", ctl: 43.1, atl: 49.3, tsb: -6.2, tss: 90 },
        { date: "2026-04-05", ctl: 44.6, atl: 48.2, tsb: -3.6, tss: 60 },
      ]);

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
              activity_plan: { id: "plan-1", name: "Threshold Ride", activity_category: "bike" },
            },
            {
              id: "planned-tomorrow",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-04",
              activity_plan: { id: "plan-2", name: "Recovery Run", activity_category: "run" },
            },
          ],
          [
            {
              id: "planned-today",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-03",
              activity_plan: { id: "plan-1", name: "Threshold Ride", activity_category: "bike" },
            },
            {
              id: "planned-tomorrow",
              starts_at: new Date("2026-04-04T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-04",
              activity_plan: { id: "plan-2", name: "Recovery Run", activity_category: "run" },
            },
          ],
        ],
        activities: [
          [
            {
              id: "activity-yesterday",
              type: "ride",
              started_at: new Date("2026-04-02T07:00:00.000Z"),
              finished_at: new Date("2026-04-02T08:00:00.000Z"),
              duration_seconds: 1800,
              moving_seconds: 1700,
              distance_meters: 10000,
              avg_heart_rate: 140,
              max_heart_rate: 165,
              avg_power: 210,
              max_power: 320,
              avg_speed_mps: 6,
              max_speed_mps: 10,
              normalized_power: 225,
              normalized_speed_mps: 6.3,
              normalized_graded_speed_mps: 6.4,
            },
            {
              id: "activity-today",
              type: "ride",
              started_at: new Date("2026-04-03T07:00:00.000Z"),
              finished_at: new Date("2026-04-03T08:00:00.000Z"),
              duration_seconds: 3600,
              moving_seconds: 3500,
              distance_meters: 15000,
              avg_heart_rate: 145,
              max_heart_rate: 170,
              avg_power: 220,
              max_power: 340,
              avg_speed_mps: 6.2,
              max_speed_mps: 10.4,
              normalized_power: 235,
              normalized_speed_mps: 6.5,
              normalized_graded_speed_mps: 6.6,
            },
          ],
        ],
      },
      execute: [
        [{ settings: {} }],
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

    expect(result.activePlan).toEqual({
      id: "plan-1",
      name: "Build Block",
      phase: "build",
      targetType: "power",
    });
    expect(result.currentStatus).toEqual({
      ctl: 42.2,
      atl: 51.1,
      tsb: -8.9,
      form: "productive",
    });
    expect(result.consistency).toEqual({ streak: 2, weeklyCount: 2 });
    expect(result.weeklySummary).toEqual({
      actual: { distance: 25, duration: 5400, tss: 80, count: 2 },
      planned: { distance: 32, duration: 6000, tss: 150, count: 2 },
      adherence: 53,
    });
    expect(result.schedule).toEqual([
      {
        id: "planned-today",
        date: "2026-04-03",
        isToday: true,
        isCompleted: true,
        activityName: "Threshold Ride",
        activityType: "bike",
        estimatedDuration: 3600,
        estimatedDistance: 20000,
        estimatedTSS: 90,
      },
      {
        id: "planned-tomorrow",
        date: "2026-04-04",
        isToday: false,
        isCompleted: false,
        activityName: "Recovery Run",
        activityType: "run",
        estimatedDuration: 2400,
        estimatedDistance: 12000,
        estimatedTSS: 60,
      },
    ]);
    expect(result.todaysActivity).toEqual({
      id: "planned-today",
      date: "2026-04-03",
      isToday: true,
      isCompleted: true,
      activityName: "Threshold Ride",
      activityType: "bike",
      estimatedDuration: 3600,
      estimatedDistance: 20000,
      estimatedTSS: 90,
    });
    expect(result.projectedFitness).toEqual([
      { date: "2026-04-04", ctl: 43.1, atl: 49.3, tsb: -6.2, plannedTss: 90 },
      { date: "2026-04-05", ctl: 44.6, atl: 48.2, tsb: -3.6, plannedTss: 60 },
    ]);
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
    expect(homeMocks.addEstimationToPlans).toHaveBeenCalledTimes(2);
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
    homeMocks.buildDailyTssByDateSeries.mockImplementation(({ tssByDate }) => tssByDate);
    homeMocks.replayTrainingLoadByDate.mockReturnValue([]);
    homeMocks.addEstimationToPlans.mockResolvedValue([]);

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
      execute: [
        [{ settings: {} }],
        [{ id: "plan-1", name: null, description: null, structure: {} }],
      ],
    });

    await expect(caller.getDashboard({ days: 2 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("getDashboard rejects invalid assembled schedule payloads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    homeMocks.calculateAge.mockReturnValue(36);
    homeMocks.calculateRollingTrainingQuality.mockReturnValue(0.84);
    homeMocks.getFormStatus.mockReturnValue("productive");
    homeMocks.createEventReadRepository.mockReturnValue({ kind: "event-read-repo" });
    homeMocks.createActivityAnalysisStore.mockReturnValue({ kind: "analysis-store" });
    homeMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([["activity-today", { tss: 50, intensity_factor: 0.9 }]]),
      byDate: new Map([["2026-04-03", 50]]),
    });
    homeMocks.addEstimationToPlans.mockImplementation(async (plans: Array<any>) =>
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
    homeMocks.buildDailyTssByDateSeries.mockImplementation(({ tssByDate }) => tssByDate);
    homeMocks.replayTrainingLoadByDate
      .mockReturnValueOnce([{ date: "2026-04-03", ctl: 42.2, atl: 51.1, tsb: -8.9, tss: 50 }])
      .mockReturnValueOnce([{ date: "2026-04-04", ctl: 43.1, atl: 49.3, tsb: -6.2, tss: 90 }]);

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
              activity_plan: { id: "plan-1", name: "Threshold Ride", activity_category: "bike" },
            },
          ],
          [
            {
              id: "planned-today",
              starts_at: new Date("2026-04-03T08:00:00.000Z"),
              notes: null,
              scheduled_date: "2026-04-03",
              activity_plan: { id: "plan-1", name: "Threshold Ride", activity_category: "bike" },
            },
          ],
        ],
        activities: [
          [
            {
              id: "activity-today",
              type: "ride",
              started_at: new Date("2026-04-03T07:00:00.000Z"),
              finished_at: new Date("2026-04-03T08:00:00.000Z"),
              duration_seconds: 3600,
              moving_seconds: 3500,
              distance_meters: 15000,
              avg_heart_rate: 145,
              max_heart_rate: 170,
              avg_power: 220,
              max_power: 340,
              avg_speed_mps: 6.2,
              max_speed_mps: 10.4,
              normalized_power: 235,
              normalized_speed_mps: 6.5,
              normalized_graded_speed_mps: 6.6,
            },
          ],
        ],
      },
      execute: [
        [{ settings: {} }],
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
