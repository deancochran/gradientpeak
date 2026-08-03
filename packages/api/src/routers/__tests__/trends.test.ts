import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

const coreMocks = vi.hoisted(() => ({
  calculateRollingTrainingQuality: vi.fn(),
  getLoadBalanceStatus: vi.fn(),
  getTrainingIntensityZone: vi.fn(),
}));

const loadMocks = vi.hoisted(() => ({
  buildDailyTssByDateSeries: vi.fn(),
  replayTrainingLoadByDate: vi.fn(),
}));

const historyMocks = vi.hoisted(() => ({
  readCurrentProfileCommonLoadHistory: vi.fn(),
}));

const analysisMocks = vi.hoisted(() => ({
  createActivityAnalysisStore: vi.fn(() => ({ kind: "activity-analysis-store" })),
  createDashboardRepository: vi.fn(),
  buildActivityDerivedSummaryMap: vi.fn(),
  buildDynamicStressSeries: vi.fn(),
  activityRows: new Map<string, any>(),
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
    calculateRollingTrainingQuality: coreMocks.calculateRollingTrainingQuality,
    getLoadBalanceStatus: coreMocks.getLoadBalanceStatus,
  };
});

vi.mock("@repo/core/load", async () => {
  const actual = await vi.importActual<typeof import("@repo/core/load")>("@repo/core/load");
  return {
    ...actual,
    buildDailyTssByDateSeries: loadMocks.buildDailyTssByDateSeries,
    getTrainingIntensityZone: coreMocks.getTrainingIntensityZone,
    replayTrainingLoadByDate: loadMocks.replayTrainingLoadByDate,
  };
});

vi.mock(
  "../../application/activities/read-current-profile-common-load-history",
  () => historyMocks,
);

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: analysisMocks.createActivityAnalysisStore,
  createDrizzleTrendsDashboardRepository:
    analysisMocks.createDashboardRepository.mockImplementation(() => ({
      loadDashboardActivities: async () =>
        [...analysisMocks.activityRows.values()].map((row) => {
          const activeSeconds = Math.max(row.duration_seconds ?? 0, row.moving_seconds ?? 0);
          return {
            ...row,
            segments: [
              {
                id: row.id,
                activity_id: row.id,
                ordinal: 0,
                role: "activity",
                activity_category: row.type,
                start_offset_ms: 0,
                end_offset_ms: activeSeconds * 1_000,
                timing_coverage: "complete",
                active_ms: activeSeconds * 1_000,
                moving_ms: row.moving_seconds * 1_000,
                summary: {
                  version: 1,
                  timing: {
                    timingCoverage: "complete",
                    activeMs: activeSeconds * 1_000,
                    movingMs: row.moving_seconds * 1_000,
                  },
                  distanceMeters: row.distance_meters,
                  averageSpeedMetersPerSecond: row.avg_speed_mps ?? undefined,
                  averagePowerWatts: row.avg_power ?? undefined,
                  averageHeartRateBpm: row.avg_heart_rate ?? undefined,
                  normalizedPowerResult: unavailableNormalizedPowerResult,
                },
              },
            ],
          };
        }),
    })),
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: analysisMocks.buildActivityDerivedSummaryMap,
  buildDynamicStressSeries: analysisMocks.buildDynamicStressSeries,
  loadActivitySegmentsByActivityId: vi.fn(
    async (_db, ids: string[]) =>
      new Map(
        ids.map((id) => {
          const row = analysisMocks.activityRows.get(id);
          const activeSeconds = Math.max(row?.duration_seconds ?? 0, row?.moving_seconds ?? 0);
          return [
            id,
            row
              ? [
                  {
                    id,
                    activity_id: id,
                    ordinal: 0,
                    role: "activity",
                    activity_category: row.type,
                    start_offset_ms: 0,
                    end_offset_ms: activeSeconds * 1_000,
                    timing_coverage: "complete",
                    active_ms: activeSeconds * 1_000,
                    moving_ms: row.moving_seconds * 1_000,
                    summary: {
                      version: 1,
                      timing: {
                        timingCoverage: "complete",
                        activeMs: activeSeconds * 1_000,
                        movingMs: row.moving_seconds * 1_000,
                      },
                      distanceMeters: row.distance_meters,
                      averageSpeedMetersPerSecond: row.avg_speed_mps ?? undefined,
                      averagePowerWatts: row.avg_power ?? undefined,
                      averageHeartRateBpm: row.avg_heart_rate ?? undefined,
                      normalizedPowerResult: unavailableNormalizedPowerResult,
                    },
                  },
                ]
              : [],
          ];
        }),
      ),
  ),
}));

vi.mock("../../lib/features", () => featureFlagMocks);

vi.mock("../../utils/workload", () => ({
  buildWorkloadEnvelopes: workloadMocks.buildWorkloadEnvelopes,
}));

import {
  activityObservationQuantificationSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
} from "@repo/core";
import type { CommonLoadResult } from "@repo/core/load";
import { trendsRouter } from "../trends";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

function completeCommonLoad(load: number, intensity: number) {
  return {
    status: "available" as const,
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
    activity_category: "bike" as const,
    method: "power_threshold" as const,
    load,
    intensity,
    contributingDurationSeconds: 3600,
    quality: {
      source: "manual" as const,
      observed_at: "2026-01-01T00:00:00.000Z",
      valid_at: "2026-01-01T00:00:00.000Z",
      confidence: "high" as const,
      stale: false,
      estimate: false,
      calculation_version: "1",
      evidence_fingerprint: "threshold-evidence",
    },
    thresholdEvidence: {
      type: "ftp_watts" as const,
      value: 250,
      unit: "watts" as const,
      source: "manual" as const,
      observedAt: "2026-01-01T00:00:00.000Z",
      validAt: "2026-01-01T00:00:00.000Z",
      freshness: "current" as const,
      calculationVersion: "1",
      sourceFingerprint: "threshold-evidence",
    },
    evidenceFingerprint: `activity-evidence-${load}`,
    computedAsOf: "2026-04-09T08:00:00.000Z",
    estimated: false,
  };
}

function unavailableCommonLoad(activityCategory: "bike" | "run" | "swim") {
  return {
    status: "unavailable" as const,
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
    activity_category: activityCategory,
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-04-09T08:00:00.000Z",
    contributingDurationSeconds: null,
    reason: "activity_data_missing" as const,
  };
}

function observationQuantification(input: {
  activityCategory: "bike" | "run" | "swim";
  commonLoad: CommonLoadResult;
  distanceMeters: number | null;
  durationSeconds: number;
  id: string;
}) {
  const segmentId = `${input.id}-segment`;
  const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({
    activityId: input.id,
  });
  return activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [input.id, segmentId],
      revisionFingerprint: `revision-${input.id}`,
      details: { kind: "trends-router-test", id: input.id },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: input.commonLoad.model,
      version: input.commonLoad.version,
      computedAt: input.commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: input.commonLoad.evidenceFingerprint,
    }),
    activity_category: input.activityCategory,
    duration: {
      elapsed: {
        status: "available",
        evidenceRole: "measured",
        value: input.durationSeconds,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole: "measured",
        value: input.durationSeconds,
        unit: "seconds",
      },
      moving: {
        status: "available",
        evidenceRole: "measured",
        value: input.durationSeconds,
        unit: "seconds",
      },
    },
    distance:
      input.distanceMeters === null
        ? {
            status: "unavailable",
            evidenceRole: "measured",
            value: null,
            unit: "meters",
            reason: "not_observed",
          }
        : {
            status: "available",
            evidenceRole: "measured",
            value: input.distanceMeters,
            unit: "meters",
          },
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
      observedAt: input.commonLoad.computedAsOf,
      computedAt: input.commonLoad.computedAsOf,
      calculationVersion: "trends-router-test-v1",
    },
    commonLoad: input.commonLoad,
  });
}

type DerivedActivityInput = {
  segments: Array<{
    id: string;
    activity_category: "bike" | "run" | "swim";
    start_offset_ms: number;
    end_offset_ms: number;
    summary: { distanceMeters?: number | null };
  }>;
};

function quantifiedDerivedMap(activities: DerivedActivityInput[]) {
  return new Map(
    activities.flatMap((activity) =>
      activity.segments.map((segment) => {
        const commonLoad = unavailableCommonLoad(segment.activity_category);
        const quantification = observationQuantification({
          activityCategory: segment.activity_category,
          commonLoad,
          distanceMeters: segment.summary.distanceMeters ?? null,
          durationSeconds: (segment.end_offset_ms - segment.start_offset_ms) / 1_000,
          id: segment.id,
        });
        return [
          segment.id,
          {
            common_load: commonLoad,
            observationQuantification: createObservationQuantificationBundle({
              members: [quantification],
            }),
          },
        ] as const;
      }),
    ),
  );
}

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
  const row = {
    id: overrides.id ?? crypto.randomUUID(),
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: null,
    profile_id: overrides.profile_id ?? OWNER_ID,
    name: overrides.name ?? "Morning Ride",
    description: null,
    type: overrides.type ?? "bike",
    started_at: overrides.started_at ?? new Date("2026-04-01T07:00:00.000Z"),
    finished_at: overrides.started_at ?? new Date("2026-04-01T08:00:00.000Z"),
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
    activity_file_url: null,
    route_id: null,
    perceived_effort: null,
    planned_activity_id: null,
    weather_conditions: null,
    equipment_used: null,
  };
  Object.assign(row, {
    elapsed_ms: (row.duration_seconds ?? 0) * 1_000,
    active_ms: (row.duration_seconds ?? 0) * 1_000,
    moving_ms: row.moving_seconds === null ? null : row.moving_seconds * 1_000,
    timing_coverage: "complete",
  });
  analysisMocks.activityRows.set(row.id, row);
  return row;
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
  analysisMocks.activityRows.clear();

  featureFlagMocks.featureFlags.personalizationAgeConstants = false;
  featureFlagMocks.featureFlags.personalizationGenderAdjustment = false;
  featureFlagMocks.featureFlags.personalizationTrainingQuality = false;
  featureFlagMocks.featureFlags.personalizationRampLearning = false;

  coreMocks.calculateRollingTrainingQuality.mockReturnValue(0.82);
  coreMocks.getLoadBalanceStatus.mockReturnValue("negative_balance");
  coreMocks.getTrainingIntensityZone.mockImplementation((intensityFactor: number) =>
    intensityFactor < 0.7 ? "endurance" : "threshold",
  );

  loadMocks.buildDailyTssByDateSeries.mockReturnValue("daily-tss-series");
  loadMocks.replayTrainingLoadByDate.mockReturnValue([]);
  workloadMocks.buildWorkloadEnvelopes.mockReturnValue({
    acwr: { current: 1.1, source: "tss" },
    monotony: { current: 1.4, source: "tss" },
  });

  analysisMocks.buildActivityDerivedSummaryMap.mockImplementation(
    async ({ activities }: { activities: DerivedActivityInput[] }) =>
      quantifiedDerivedMap(activities),
  );
  analysisMocks.buildDynamicStressSeries.mockResolvedValue({
    byActivityId: new Map(),
    byDate: new Map(),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trendsRouter", () => {
  it("rejects overlong ranges before repository work", async () => {
    const { caller } = createCaller([]);
    await expect(
      caller.getDashboard({
        start_date: "2025-01-01",
        end_date: "2026-01-01",
        groupBy: "week",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(analysisMocks.createDashboardRepository).not.toHaveBeenCalled();
  });

  it("maps typed repository row limits at the router boundary", async () => {
    analysisMocks.createDashboardRepository.mockReturnValueOnce({
      loadDashboardActivities: vi.fn().mockResolvedValue({ kind: "row_limit_exceeded" }),
    });
    const { caller } = createCaller([]);
    await expect(
      caller.getDashboard({ start_date: "2026-04-01", end_date: "2026-04-01", groupBy: "day" }),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("maps typed repository segment limits at the router boundary", async () => {
    analysisMocks.createDashboardRepository.mockReturnValueOnce({
      loadDashboardActivities: vi.fn().mockResolvedValue({ kind: "segment_limit_exceeded" }),
    });
    const { caller } = createCaller([]);
    await expect(
      caller.getDashboard({ start_date: "2026-04-01", end_date: "2026-04-01", groupBy: "day" }),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

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

    const result = await caller.getDashboard({
      start_date: "2026-03-30T00:00:00.000Z",
      end_date: "2026-04-10T23:59:59.000Z",
      groupBy: "week",
    });

    expect(result.volume).toMatchObject({
      dataPoints: [
        {
          date: "2026-03-30",
          status: "complete",
          totalDistance: 15000,
          totalTime: 5400,
          activityCount: 2,
        },
        {
          date: "2026-04-06",
          status: "complete",
          totalDistance: 20000,
          totalTime: 5400,
          activityCount: 1,
        },
      ],
      totals: {
        status: "complete",
        totalDistance: 35000,
        totalTime: 10800,
        totalActivities: 3,
      },
    });
  });

  it("accepts date-only range inputs and treats end dates as inclusive", async () => {
    const { caller } = createCaller([
      [
        createActivityRow({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          started_at: new Date("2026-04-10T23:30:00.000Z"),
          distance_meters: 12000,
          moving_seconds: 3600,
        }),
      ],
    ]);

    const result = await caller.getDashboard({
      start_date: "2026-04-10",
      end_date: "2026-04-10",
      groupBy: "day",
    });

    expect(result.volume).toMatchObject({
      dataPoints: [
        {
          date: "2026-04-10",
          status: "complete",
          totalDistance: 12000,
          totalTime: 3600,
          activityCount: 1,
        },
      ],
      totals: {
        status: "complete",
        totalDistance: 12000,
        totalTime: 3600,
        totalActivities: 1,
      },
    });
  });

  it("rejects malformed ISO date inputs at the procedure boundary", async () => {
    const { caller, callLog } = createCaller([[]]);

    await expect(
      caller.getDashboard({
        start_date: "2026-02-30",
        end_date: "2026-04-10T23:59:59.000Z",
        groupBy: "week",
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toEqual([]);
  });

  it("rejects reversed date ranges before querying the database", async () => {
    const { caller, callLog } = createCaller([[]]);

    await expect(
      caller.getDashboard({
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

    const result = await caller.getDashboard({
      start_date: "2026-04-01T00:00:00.000Z",
      end_date: "2026-04-30T23:59:59.000Z",
    });

    expect(result.performance).toMatchObject({
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
          observationQuantification: { summary: { kind: "aggregate" } },
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
      caller.getDashboard({
        start_date: "2026-04-01T00:00:00.000Z",
        end_date: "2026-04-30T23:59:59.000Z",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
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

    const firstCommonLoad = completeCommonLoad(40, Math.sqrt(0.4));
    const secondCommonLoad = completeCommonLoad(60, Math.sqrt(0.6));
    const firstQuantification = observationQuantification({
      activityCategory: "bike",
      commonLoad: firstCommonLoad,
      distanceMeters: firstActivity.distance_meters,
      durationSeconds: firstActivity.duration_seconds,
      id: firstActivity.id,
    });
    const secondQuantification = observationQuantification({
      activityCategory: "bike",
      commonLoad: secondCommonLoad,
      distanceMeters: secondActivity.distance_meters,
      durationSeconds: secondActivity.duration_seconds,
      id: secondActivity.id,
    });
    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [
          firstActivity.id,
          {
            common_load: firstCommonLoad,
            observationQuantification: createObservationQuantificationBundle({
              members: [firstQuantification],
            }),
          },
        ],
        [
          secondActivity.id,
          {
            common_load: secondCommonLoad,
            observationQuantification: createObservationQuantificationBundle({
              members: [secondQuantification],
            }),
          },
        ],
      ]),
    );

    const { caller } = createCaller([[firstActivity, secondActivity]]);

    const result = await caller.getDashboard({
      start_date: "2026-04-07T00:00:00.000Z",
      end_date: "2026-04-13T23:59:59.000Z",
      metric: "power",
    });

    expect(result.zones).toMatchObject({
      weeklyData: [
        {
          weekStart: "2026-04-06",
          status: "complete",
          totalCommonLoad: 100,
          coverage: { totalActivities: 2, quantifiedActivities: 2 },
          observationQuantification: { summary: { kind: "aggregate" } },
          zones: {
            recovery: 0,
            endurance: 40,
            tempo: 60,
            threshold: 0,
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

    const result = await caller.getDashboard({
      start_date: "2026-03-28T00:00:00.000Z",
      end_date: "2026-04-03T23:59:59.000Z",
    });

    expect(result.consistency).toEqual({
      activityDays: ["2026-03-29", "2026-03-30", "2026-03-31", "2026-04-02", "2026-04-03"],
      weeklyAvg: 5.3,
      currentStreak: 2,
      longestStreak: 3,
      totalActivities: 6,
      totalDays: 8,
    });
  });

  it("rejects the removed TSS peak-performance metric without an alias", async () => {
    const { caller } = createCaller([]);

    await expect(caller.getPeakPerformances({ metric: "tss" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
