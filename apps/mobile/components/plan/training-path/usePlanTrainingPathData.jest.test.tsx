import { act, renderHook } from "@testing-library/react-native";

const mockProjectionRefetch = jest.fn(async () => undefined);
const mockRefreshProfile = jest.fn(async () => undefined);
const mockProjectionUseQuery = jest.fn();
let mockPlanningTimezone: string | null = "America/Los_Angeles";
let mockProfileLoading = false;

const load = {
  plannedLoad: 70,
  plannedLoadStatus: "complete" as const,
  scheduledLoad: 60,
  scheduledLoadStatus: "complete" as const,
  completedLoad: 35,
  completedLoadStatus: "complete" as const,
  remainingLoad: 25,
  remainingLoadStatus: "complete" as const,
  recommendedLoad: 70,
  recommendedLoadStatus: "complete" as const,
  deltaLoad: -10,
};

const projection = {
  contractVersion: "plan-tab-projection-v1" as const,
  asOf: "2026-04-06T12:00:00.000Z",
  planningTimezone: "America/Los_Angeles",
  today: "2026-04-06",
  currentScheduledPlan: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Spring plan",
    scheduleBatchId: "22222222-2222-4222-8222-222222222222",
    nextEventAt: "2026-04-07T15:00:00.000Z",
  },
  timeline: {
    startDate: "2026-03-30",
    endDate: "2026-04-12",
    today: "2026-04-06",
    days: [
      {
        date: "2026-04-06",
        load,
        scheduledItems: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            source: "training_plan",
            date: "2026-04-06",
            title: "Tempo ride",
            activityCategory: "bike",
            plannedLoad: 60,
            plannedLoadStatus: "complete",
            status: "planned",
          },
        ],
        completedItems: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            source: "completed_activity",
            date: "2026-04-06",
            title: "Morning ride",
            activityCategory: "bike",
            completedLoad: 35,
            completedLoadStatus: "complete",
          },
        ],
        annotations: [],
        confidence: null,
      },
    ],
    weeks: [
      {
        weekStart: "2026-04-06",
        weekEnd: "2026-04-12",
        load,
        dayCount: 7,
        trainingDayCount: 1,
      },
    ],
  },
  dayLoads: {
    "2026-04-06": {
      status: "complete",
      commonLoad: 60,
      intensity: 0.8,
      completedLoadStatus: "complete",
      completedLoad: 35,
      scheduledLoadStatus: "complete",
      scheduledLoad: 60,
      remainingLoadStatus: "complete",
      remainingLoad: 25,
      hasUnavailableCompletedLoad: false,
      recommendedLoadStatus: "complete",
      recommendedLoad: 70,
    },
  },
  fitness: {
    actual: [{ date: "2026-04-06", longTermLoad: 40, recentLoad: 50, loadBalance: -10 }],
    scheduled: [{ date: "2026-04-06", longTermLoad: 40, recentLoad: 50, loadBalance: -10 }],
    recommended: [{ date: "2026-04-06", longTermLoad: 42, recentLoad: 53, loadBalance: -11 }],
  },
  recommendationPoints: [{ date: "2026-04-06", status: "complete", load: 70 }],
  ledgerItems: [],
  sourceCoverage: {
    activities: { startDate: "2026-03-30", endDate: "2026-04-12", status: "complete" },
    scheduledItems: { startDate: "2026-03-30", endDate: "2026-04-12", status: "complete" },
  },
  goalMarkers: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      label: "A race",
      targetDate: "2026-04-06",
      activityCategory: "bike",
    },
  ],
  publishedRevision: 9,
  algorithmVersion: "athlete-state-projection-v1",
};

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: projection,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: mockProjectionRefetch,
    ...overrides,
  };
}

let mockProjectionData = projection;

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      getPlanTabProjection: {
        useQuery: (input: unknown, options: unknown) => mockProjectionUseQuery(input, options),
      },
    },
  },
}));
jest.mock("@/lib/auth/auth-headers", () => ({ hasSessionAuthCredentials: () => true }));
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: { planning_timezone: mockPlanningTimezone },
    profileLoading: mockProfileLoading,
    refreshProfile: mockRefreshProfile,
  }),
}));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { ready: boolean; session: object }) => unknown) =>
    selector({ ready: true, session: {} }),
}));
jest.mock("./trainingPathPlanningTime", () => ({
  getTrainingPathTodayKey: (_now: Date, timezone: string | null) =>
    timezone ? "2026-04-06" : null,
  millisecondsUntilNextTrainingPathDay: () => 60_000,
}));

import {
  buildPlanTabProjectionPresentation,
  type PlanTabProjection,
} from "./planTabProjectionPresentation";
import { usePlanTrainingPathData } from "./usePlanTrainingPathData";

describe("usePlanTrainingPathData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanningTimezone = "America/Los_Angeles";
    mockProfileLoading = false;
    mockProjectionData = projection;
    mockProjectionUseQuery.mockImplementation(() => queryResult({ data: mockProjectionData }));
  });

  it("converts a projection into the existing chart and selected-week presentation", () => {
    const result = buildPlanTabProjectionPresentation({
      projection: projection as unknown as PlanTabProjection,
      selectedWeekStart: "2026-04-06",
      weekWindow: { start: "2026-03-30", end: "2026-04-12" },
      todayKey: "2026-04-06",
    });

    expect(result.dailyTrainingPathPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-06",
          completedLoad: 35,
          effectiveLoad: 60,
          fitnessCtl: 40,
        }),
      ]),
    );
    expect(result.selectedWeekGoals).toEqual([
      expect.objectContaining({ label: "A race", status: "Goal due" }),
    ]);
    expect(result.selectedWeekEvents).toEqual([
      expect.objectContaining({ title: "Tempo ride", estimatedLoad: 60 }),
    ]);
  });

  it("derives unavailable and partial completed presentation from completed Load status", () => {
    const buildVariant = (
      completedLoadStatus: "partial" | "unavailable",
      completedLoad: number | null,
    ) => {
      const day = projection.timeline.days[0];
      const completedItem = day?.completedItems[0];
      if (!day || !completedItem) throw new Error("Expected completed projection fixture");
      return {
        ...projection,
        timeline: {
          ...projection.timeline,
          days: [
            {
              ...day,
              load: { ...day.load, completedLoad, completedLoadStatus },
              completedItems: [{ ...completedItem, completedLoad, completedLoadStatus }],
            },
          ],
        },
        dayLoads: {
          ...projection.dayLoads,
          "2026-04-06": {
            ...projection.dayLoads["2026-04-06"],
            completedLoad,
            completedLoadStatus,
            hasUnavailableCompletedLoad: completedLoadStatus === "unavailable",
          },
        },
      } as unknown as PlanTabProjection;
    };
    const present = (variant: PlanTabProjection) =>
      buildPlanTabProjectionPresentation({
        projection: variant,
        selectedWeekStart: "2026-04-06",
        weekWindow: { start: "2026-03-30", end: "2026-04-12" },
        todayKey: "2026-04-06",
      });

    const unavailable = present(buildVariant("unavailable", null));
    expect(
      unavailable.dailyTrainingPathPoints.find((point) => point.date === "2026-04-06"),
    ).toMatchObject({
      completedLoad: null,
      completedObservationState: "unavailable",
      effectiveCompletedLoad: null,
      effectiveCompletedLoadStatus: "unavailable",
    });
    expect(
      unavailable.trainingPath.weeks.find((week) => week.weekStart === "2026-04-06"),
    ).toMatchObject({
      completedLoad: null,
      completedLoadStatus: "unavailable",
    });

    const partial = present(buildVariant("partial", 20));
    expect(
      partial.dailyTrainingPathPoints.find((point) => point.date === "2026-04-06"),
    ).toMatchObject({
      completedLoad: 20,
      completedObservationState: "observed",
      effectiveCompletedLoad: 20,
      effectiveCompletedLoadStatus: "partial",
    });
    expect(
      partial.trainingPath.weeks.find((week) => week.weekStart === "2026-04-06"),
    ).toMatchObject({
      completedLoad: 20,
      completedLoadStatus: "partial",
    });
  });

  it("preserves partial scheduled and remaining Load status from the API", () => {
    const day = projection.timeline.days[0];
    if (!day) throw new Error("Expected projection day fixture");
    const partialProjection = {
      ...projection,
      timeline: {
        ...projection.timeline,
        days: [
          {
            ...day,
            load: {
              ...day.load,
              scheduledLoad: 60,
              scheduledLoadStatus: "partial",
              remainingLoad: 25,
              remainingLoadStatus: "partial",
            },
          },
        ],
      },
      dayLoads: {
        ...projection.dayLoads,
        "2026-04-06": {
          ...projection.dayLoads["2026-04-06"],
          scheduledLoad: 60,
          scheduledLoadStatus: "partial",
          remainingLoad: 25,
          remainingLoadStatus: "partial",
        },
      },
    } as unknown as PlanTabProjection;

    const result = buildPlanTabProjectionPresentation({
      projection: partialProjection,
      selectedWeekStart: "2026-04-06",
      weekWindow: { start: "2026-03-30", end: "2026-04-12" },
      todayKey: "2026-04-06",
    });

    expect(
      result.dailyTrainingPathPoints.find((point) => point.date === "2026-04-06"),
    ).toMatchObject({
      plannedLoad: 60,
      plannedLoadStatus: "partial",
      effectiveRemainingLoad: 25,
      effectiveRemainingLoadStatus: "partial",
    });
  });

  it("loads the entire Plan tab through one bounded server projection", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(mockProjectionUseQuery).toHaveBeenLastCalledWith(
      { startDate: "2026-02-23", endDate: "2026-05-17" },
      expect.objectContaining({
        enabled: true,
        retry: false,
      }),
    );
    expect(result.current.queryFailureCount).toBe(0);
    expect(result.current.hasUsableData).toBe(true);
  });

  it("maps server-owned load, goals, scheduled items, and completions without source queries", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(result.current.dailyTrainingPathPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-06",
          completedLoad: 35,
          effectiveLoad: 60,
          fitnessCtl: 40,
          scheduledFitnessCtl: 40,
        }),
      ]),
    );
    expect(result.current.selectedWeekGoals).toEqual([
      expect.objectContaining({ label: "A race", targetDate: "2026-04-06" }),
    ]);
    expect(result.current.selectedWeekEvents).toEqual([
      expect.objectContaining({ title: "Tempo ride", estimatedLoad: 60 }),
    ]);
    expect(result.current.selectedWeekCompletedActivities).toEqual([
      expect.objectContaining({ title: "Morning ride", load: 35 }),
    ]);
  });

  it("keeps one stable projection window while the selected day changes", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    await act(() => result.current.handleSelectedDateChange("2026-08-01"));

    expect(mockProjectionUseQuery).toHaveBeenLastCalledWith(
      { startDate: "2026-02-23", endDate: "2026-05-17" },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("reconciles selection when the authoritative range shifts", async () => {
    const { result, rerender } = await renderHook(() => usePlanTrainingPathData());
    await act(() => result.current.handleSelectedDateChange("2026-03-30"));

    mockProjectionData = {
      ...projection,
      timeline: {
        ...projection.timeline,
        startDate: "2026-04-06",
        endDate: "2026-04-12",
      },
    } as unknown as typeof projection;
    await rerender({});
    expect(result.current.selectedDate).toBe("2026-04-06");
    expect(result.current.trainingPath.selectedWeekSummary?.weekStart).toBe("2026-04-06");

    await act(() => result.current.handleSelectedDateChange("2026-04-12"));
    const shiftedDay = projection.timeline.days[0];
    if (!shiftedDay) throw new Error("Expected projection day fixture");
    mockProjectionData = {
      ...projection,
      timeline: {
        ...projection.timeline,
        startDate: "2026-05-04",
        endDate: "2026-05-10",
        days: [{ ...shiftedDay, date: "2026-05-04" }],
      },
      dayLoads: {
        "2026-05-04": projection.dayLoads["2026-04-06"],
      },
    } as unknown as typeof projection;
    await rerender({});

    expect(result.current.selectedDate).toBe("2026-05-04");
    expect(result.current.trainingPath.selectedWeekSummary?.weekStart).toBe("2026-05-04");
  });

  it("uses one normal query and exposes no gesture-driven fetch actions", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(
      new Set(mockProjectionUseQuery.mock.calls.map(([input]) => JSON.stringify(input))).size,
    ).toBe(1);
    expect(result.current).not.toHaveProperty("extendTrainingPathWindowStart");
    expect(result.current).not.toHaveProperty("extendTrainingPathWindowEnd");
  });

  it("uses UTC as a safe request anchor when a legacy profile has no planning timezone", async () => {
    mockPlanningTimezone = null;

    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(mockProjectionUseQuery).toHaveBeenCalledWith(
      { startDate: "2026-02-23", endDate: "2026-05-17" },
      expect.objectContaining({ enabled: true }),
    );
    expect(result.current).toMatchObject({
      planningTimezoneState: "ready",
      chartUnavailable: false,
      chartLoading: false,
      queryFailureCount: 0,
    });
  });

  it("refreshes only the projection and profile readiness source", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    await act(async () => result.current.handleRefresh());

    expect(mockProjectionRefetch).toHaveBeenCalledTimes(1);
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  });
});
