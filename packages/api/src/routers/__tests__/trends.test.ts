import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  calculateAge: vi.fn(),
  calculateRollingTrainingQuality: vi.fn(),
  getFormStatus: vi.fn(),
  getTrainingIntensityZone: vi.fn(),
}));

const loadMocks = vi.hoisted(() => ({
  buildDailyTssByDateSeries: vi.fn(),
  replayTrainingLoadByDate: vi.fn(),
}));

const analysisMocks = vi.hoisted(() => ({
  createActivityAnalysisStore: vi.fn(() => ({ kind: "activity-analysis-store" })),
  buildActivityDerivedSummaryMap: vi.fn(),
  buildDynamicStressSeries: vi.fn(),
}));

const workloadMocks = vi.hoisted(() => ({
  buildWorkloadEnvelopes: vi.fn(),
}));

const featureFlagMocks = vi.hoisted(() => ({
  featureFlags: {
    personalizationAgeConstants: false,
    personalizationGenderAdjustment: false,
    personalizationTrainingQuality: false,
    personalizationRampLearning: false,
  },
}));

vi.mock("@repo/core", async () => {
  const actual = await vi.importActual<typeof import("@repo/core")>("@repo/core");

  return {
    ...actual,
    calculateAge: coreMocks.calculateAge,
    calculateRollingTrainingQuality: coreMocks.calculateRollingTrainingQuality,
    getFormStatus: coreMocks.getFormStatus,
    getTrainingIntensityZone: coreMocks.getTrainingIntensityZone,
  };
});

vi.mock("@repo/core/load", () => ({
  buildDailyTssByDateSeries: loadMocks.buildDailyTssByDateSeries,
  replayTrainingLoadByDate: loadMocks.replayTrainingLoadByDate,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: analysisMocks.createActivityAnalysisStore,
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: analysisMocks.buildActivityDerivedSummaryMap,
  buildDynamicStressSeries: analysisMocks.buildDynamicStressSeries,
}));

vi.mock("../../lib/features", () => featureFlagMocks);

vi.mock("../../utils/workload", () => ({
  buildWorkloadEnvelopes: workloadMocks.buildWorkloadEnvelopes,
}));

import { trendsRouter } from "../trends";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

type ActivityOverrides = Partial<{
  id: string;
  profile_id: string;
  name: string;
  type: "bike" | "run" | "swim";
  started_at: Date;
  distance_meters: number | null;
  moving_seconds: number | null;
  duration_seconds: number | null;
  avg_speed_mps: number | null;
  avg_power: number | null;
  avg_heart_rate: number | null;
}>;

function createActivityRow(overrides: ActivityOverrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: null,
    profile_id: overrides.profile_id ?? OWNER_ID,
    name: overrides.name ?? "Morning Ride",
    description: null,
    type: overrides.type ?? "bike",
    started_at: overrides.started_at ?? new Date("2026-04-01T07:00:00.000Z"),
    completed_at: overrides.started_at ?? new Date("2026-04-01T08:00:00.000Z"),
    duration_seconds: "duration_seconds" in overrides ? overrides.duration_seconds! : 3600,
    moving_seconds: "moving_seconds" in overrides ? overrides.moving_seconds! : 3600,
    distance_meters: "distance_meters" in overrides ? overrides.distance_meters! : 10000,
    elevation_gain_meters: null,
    avg_speed_mps: "avg_speed_mps" in overrides ? overrides.avg_speed_mps! : 6.5,
    max_speed_mps: null,
    avg_heart_rate: "avg_heart_rate" in overrides ? overrides.avg_heart_rate! : 145,
    max_heart_rate: null,
    avg_power: "avg_power" in overrides ? overrides.avg_power! : 220,
    max_power: null,
    normalized_power: null,
    training_stress_score: null,
    intensity_factor: null,
    avg_cadence: null,
    max_cadence: null,
    calories: null,
    raw_data: null,
    route_points: null,
    source: "manual",
    external_id: null,
    strava_id: null,
    fit_file_url: null,
    route_id: null,
    perceived_effort: null,
    planned_activity_id: null,
    weather_conditions: null,
    equipment_used: null,
  };
}

function createSelectBuilder(result: unknown, callLog: string[]) {
  const builder: any = {
    from: vi.fn(() => {
      callLog.push("from");
      return builder;
    }),
    where: vi.fn(() => {
      callLog.push("where");
      return builder;
    }),
    orderBy: vi.fn(() => {
      callLog.push("orderBy");
      return builder;
    }),
    limit: vi.fn(() => {
      callLog.push("limit");
      return builder;
    }),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };

  return builder;
}

function createDbMock(selectResults: unknown[]) {
  const callLog: string[] = [];
  let selectIndex = 0;

  return {
    db: {
      select: vi.fn(() => {
        callLog.push(`select:${selectIndex}`);
        const result = selectResults[selectIndex++] ?? [];
        return createSelectBuilder(result, callLog);
      }),
    },
    callLog,
  };
}

function createCaller(selectResults: unknown[]) {
  const { db, callLog } = createDbMock(selectResults);

  const caller = trendsRouter.createCaller({
    db: db as any,
    session: { user: { id: OWNER_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

beforeEach(() => {
  vi.clearAllMocks();

  featureFlagMocks.featureFlags.personalizationAgeConstants = false;
  featureFlagMocks.featureFlags.personalizationGenderAdjustment = false;
  featureFlagMocks.featureFlags.personalizationTrainingQuality = false;
  featureFlagMocks.featureFlags.personalizationRampLearning = false;

  coreMocks.calculateAge.mockReturnValue(36);
  coreMocks.calculateRollingTrainingQuality.mockReturnValue(0.82);
  coreMocks.getFormStatus.mockReturnValue("productive");
  coreMocks.getTrainingIntensityZone.mockImplementation((intensityFactor: number) =>
    intensityFactor < 0.7 ? "endurance" : "threshold",
  );

  loadMocks.buildDailyTssByDateSeries.mockReturnValue("daily-tss-series");
  loadMocks.replayTrainingLoadByDate.mockReturnValue([]);
  workloadMocks.buildWorkloadEnvelopes.mockReturnValue({
    acwr: { current: 1.1, source: "tss" },
    monotony: { current: 1.4, source: "tss" },
  });

  analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(new Map());
  analysisMocks.buildDynamicStressSeries.mockResolvedValue({
    byActivityId: new Map(),
    byDate: new Map(),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trendsRouter", () => {
  it("groups volume trends by week and calculates totals", async () => {
    const { caller } = createCaller([
      [
        createActivityRow({
          started_at: new Date("2026-03-31T07:00:00.000Z"),
          distance_meters: 10000,
          moving_seconds: 3600,
        }),
        createActivityRow({
          started_at: new Date("2026-04-02T07:00:00.000Z"),
          distance_meters: 5000,
          moving_seconds: null,
          duration_seconds: 1800,
        }),
        createActivityRow({
          started_at: new Date("2026-04-08T07:00:00.000Z"),
          distance_meters: 20000,
          moving_seconds: 5400,
        }),
      ],
    ]);

    const result = await caller.getVolumeTrends({
      start_date: "2026-03-30T00:00:00.000Z",
      end_date: "2026-04-10T23:59:59.000Z",
      groupBy: "week",
    });

    expect(result).toEqual({
      dataPoints: [
        {
          date: "2026-03-30",
          totalDistance: 15000,
          totalTime: 5400,
          activityCount: 2,
        },
        {
          date: "2026-04-06",
          totalDistance: 20000,
          totalTime: 5400,
          activityCount: 1,
        },
      ],
      totals: {
        totalDistance: 35000,
        totalTime: 10800,
        totalActivities: 3,
      },
    });
  });

  it("rejects malformed ISO date inputs at the procedure boundary", async () => {
    const { caller, callLog } = createCaller([[]]);

    await expect(
      caller.getVolumeTrends({
        start_date: "2026-03-30",
        end_date: "2026-04-10T23:59:59.000Z",
        groupBy: "week",
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toEqual([]);
  });

  it("rejects reversed date ranges before querying the database", async () => {
    const { caller, callLog } = createCaller([[]]);

    await expect(
      caller.getPerformanceTrends({
        start_date: "2026-04-30T23:59:59.000Z",
        end_date: "2026-04-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toEqual([]);
  });

  it("returns performance trend datapoints for each activity", async () => {
    const activity = createActivityRow({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Tempo Session",
      started_at: new Date("2026-04-05T06:30:00.000Z"),
      distance_meters: 42000,
      moving_seconds: 4500,
      avg_speed_mps: 9.3,
      avg_power: null,
      avg_heart_rate: 158,
    });
    const { caller } = createCaller([[activity]]);

    const result = await caller.getPerformanceTrends({
      start_date: "2026-04-01T00:00:00.000Z",
      end_date: "2026-04-30T23:59:59.000Z",
    });

    expect(result).toEqual({
      dataPoints: [
        {
          date: "2026-04-05T06:30:00.000Z",
          activityId: activity.id,
          activityName: "Tempo Session",
          avgSpeed: 9.3,
          avgPower: null,
          avgHeartRate: 158,
          distance: 42000,
          duration: 4500,
        },
      ],
    });
  });

  it("rejects malformed activity rows returned from the database", async () => {
    const { caller } = createCaller([
      [
        createActivityRow({
          id: "not-a-uuid",
        }),
      ],
    ]);

    await expect(
      caller.getPerformanceTrends({
        start_date: "2026-04-01T00:00:00.000Z",
        end_date: "2026-04-30T23:59:59.000Z",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("returns training load trends with personalization telemetry and workload", async () => {
    featureFlagMocks.featureFlags.personalizationAgeConstants = true;
    featureFlagMocks.featureFlags.personalizationGenderAdjustment = true;
    featureFlagMocks.featureFlags.personalizationTrainingQuality = true;
    featureFlagMocks.featureFlags.personalizationRampLearning = true;

    const firstActivity = createActivityRow({
      id: "33333333-3333-4333-8333-333333333333",
      started_at: new Date("2026-03-29T07:00:00.000Z"),
    });
    const secondActivity = createActivityRow({
      id: "44444444-4444-4444-8444-444444444444",
      started_at: new Date("2026-04-01T07:00:00.000Z"),
    });

    analysisMocks.buildDynamicStressSeries.mockResolvedValue({
      byActivityId: new Map([
        [firstActivity.id, { tss: 50, intensity_factor: 0.76 }],
        [secondActivity.id, { tss: 100, intensity_factor: 0.91 }],
      ]),
      byDate: new Map([
        ["2026-03-29", 50],
        ["2026-04-01", 100],
      ]),
    });
    loadMocks.replayTrainingLoadByDate.mockReturnValue([
      { date: "2026-03-31", ctl: 20.16, atl: 30.14, tsb: -9.98, tss: 0 },
      { date: "2026-04-01", ctl: 21.24, atl: 35.17, tsb: -13.93, tss: 100 },
    ]);

    const { caller, callLog } = createCaller([
      [{ dob: new Date("1990-06-15T00:00:00.000Z"), gender: "female" }],
      [firstActivity, secondActivity],
    ]);

    const result = await caller.getTrainingLoadTrends({
      start_date: "2026-03-31T00:00:00.000Z",
      end_date: "2026-04-01T23:59:59.000Z",
    });

    expect(callLog).toEqual(expect.arrayContaining(["select:0", "limit", "select:1", "orderBy"]));
    expect(loadMocks.buildDailyTssByDateSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        tssByDate: new Map([
          ["2026-03-29", 50],
          ["2026-04-01", 100],
        ]),
      }),
    );
    expect(result).toEqual({
      dataPoints: [
        { date: "2026-03-31", ctl: 20.2, atl: 30.1, tsb: -10, tss: 0 },
        { date: "2026-04-01", ctl: 21.2, atl: 35.2, tsb: -13.9, tss: 100 },
      ],
      currentStatus: {
        ctl: 21.2,
        atl: 35.2,
        tsb: -13.9,
        form: "productive",
      },
      workload: {
        acwr: { current: 1.1, source: "tss" },
        monotony: { current: 1.4, source: "tss" },
      },
      personalizationTelemetry: {
        flags: {
          age_constants: true,
          gender_adjustment: true,
          training_quality: true,
          ramp_learning: true,
        },
        user_age: 36,
        user_gender: "female",
        training_quality: 0.82,
      },
    });
  });

  it("aggregates weekly zone distribution percentages from derived stress data", async () => {
    const firstActivity = createActivityRow({
      id: "55555555-5555-4555-8555-555555555555",
      started_at: new Date("2026-04-07T07:00:00.000Z"),
    });
    const secondActivity = createActivityRow({
      id: "66666666-6666-4666-8666-666666666666",
      started_at: new Date("2026-04-09T07:00:00.000Z"),
    });

    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [firstActivity.id, { intensity_factor: 0.6, tss: 40 }],
        [secondActivity.id, { intensity_factor: 0.82, tss: 60 }],
      ]),
    );

    const { caller } = createCaller([[firstActivity, secondActivity]]);

    const result = await caller.getZoneDistributionTrends({
      start_date: "2026-04-07T00:00:00.000Z",
      end_date: "2026-04-13T23:59:59.000Z",
      metric: "power",
    });

    expect(result).toEqual({
      weeklyData: [
        {
          weekStart: "2026-04-06",
          totalTSS: 100,
          zones: {
            recovery: 0,
            endurance: 40,
            tempo: 0,
            threshold: 60,
            vo2max: 0,
            anaerobic: 0,
            neuromuscular: 0,
          },
        },
      ],
    });
  });

  it("computes activity-day streaks and weekly average consistency", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    const { caller } = createCaller([
      [
        createActivityRow({ started_at: new Date("2026-03-29T07:00:00.000Z") }),
        createActivityRow({ started_at: new Date("2026-03-30T07:00:00.000Z") }),
        createActivityRow({ started_at: new Date("2026-03-31T07:00:00.000Z") }),
        createActivityRow({ started_at: new Date("2026-04-02T07:00:00.000Z") }),
        createActivityRow({ started_at: new Date("2026-04-03T07:00:00.000Z") }),
        createActivityRow({ started_at: new Date("2026-04-03T18:00:00.000Z") }),
      ],
    ]);

    const result = await caller.getConsistencyMetrics({
      start_date: "2026-03-28T00:00:00.000Z",
      end_date: "2026-04-03T23:59:59.000Z",
    });

    expect(result).toEqual({
      activityDays: ["2026-03-29", "2026-03-30", "2026-03-31", "2026-04-02", "2026-04-03"],
      weeklyAvg: 5.3,
      currentStreak: 2,
      longestStreak: 3,
      totalActivities: 6,
      totalDays: 8,
    });
  });

  it("returns ranked peak performances for derived TSS values", async () => {
    const firstActivity = createActivityRow({
      id: "77777777-7777-4777-8777-777777777777",
      name: "Endurance Ride",
      started_at: new Date("2026-04-01T07:00:00.000Z"),
    });
    const secondActivity = createActivityRow({
      id: "88888888-8888-4888-8888-888888888888",
      name: "VO2 Session",
      started_at: new Date("2026-04-02T07:00:00.000Z"),
    });
    const thirdActivity = createActivityRow({
      id: "99999999-9999-4999-8999-999999999999",
      name: "Recovery Ride",
      started_at: new Date("2026-04-03T07:00:00.000Z"),
    });

    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [firstActivity.id, { tss: 85 }],
        [secondActivity.id, { tss: 121 }],
        [thirdActivity.id, { tss: null }],
      ]),
    );

    const { caller, callLog } = createCaller([[firstActivity, secondActivity, thirdActivity]]);

    const result = await caller.getPeakPerformances({
      metric: "tss",
      limit: 2,
    });

    expect(callLog).toEqual(expect.arrayContaining(["select:0", "orderBy", "limit"]));
    expect(result).toEqual({
      performances: [
        {
          activityId: secondActivity.id,
          activityName: "VO2 Session",
          date: "2026-04-02T07:00:00.000Z",
          value: 121,
          unit: "TSS",
          category: "bike",
          rank: 1,
        },
        {
          activityId: firstActivity.id,
          activityName: "Endurance Ride",
          date: "2026-04-01T07:00:00.000Z",
          value: 85,
          unit: "TSS",
          category: "bike",
          rank: 2,
        },
      ],
    });
  });
});
