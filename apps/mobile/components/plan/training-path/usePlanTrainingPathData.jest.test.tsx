import { buildCenteredPlanAnalysisWindow, shiftPlanAnalysisWindow } from "@repo/core";
import { act, renderHook } from "@testing-library/react-native";

const mockProjectionRefetch = jest.fn(async () => undefined);
const mockRefreshProfile = jest.fn(async () => undefined);
const mockCalendarDayInvalidate = jest.fn(async () => undefined);
const mockGoalAssessmentInvalidate = jest.fn(async () => undefined);
const mockGoalProgressInvalidate = jest.fn(async () => undefined);
const mockThresholdOverviewInvalidate = jest.fn(async () => undefined);
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
  contractVersion: "plan-tab-projection-v2" as const,
  asOf: "2026-04-06T12:00:00.000Z",
  planningTimezone: "America/Los_Angeles",
  today: "2026-04-06",
  currentScheduledPlan: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Spring plan",
    scheduleBatchId: "22222222-2222-4222-8222-222222222222",
    nextEventId: "33333333-3333-4333-8333-333333333333",
    nextEventTitle: "Tempo ride",
    nextEventDate: "2026-04-07",
    nextEventAt: "2026-04-07T15:00:00.000Z",
    nextActivityPlanId: null,
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
    scheduled: [{ date: "2026-04-06", longTermLoad: 40, recentLoad: 50, loadBalance: -12 }],
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
      priority: 8,
      targetDate: "2026-04-06",
      activityCategory: "bike",
    },
  ],
  goalMarkersTruncated: false,
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
    useUtils: () => ({
      athleteIntelligence: {
        getGoalAssessment: { invalidate: mockGoalAssessmentInvalidate },
        getGoalProgress: { invalidate: mockGoalProgressInvalidate },
        getThresholdOverview: { invalidate: mockThresholdOverviewInvalidate },
      },
      calendar: { day: { invalidate: mockCalendarDayInvalidate } },
    }),
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

  it("converts a projection into the chart presentation", () => {
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
          formTsb: -10,
        }),
      ]),
    );
    expect(result.goalMarkers).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "A race" })]),
    );
    expect(result.timelineDaysByDate["2026-04-06"]?.scheduledItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Tempo ride" })]),
    );
  });

  it("presents a clear verified-through notice for historical fitness", () => {
    const result = buildPlanTabProjectionPresentation({
      projection: {
        ...projection,
        fitness: {
          ...projection.fitness,
          actual: [{ date: "2026-04-05", longTermLoad: 39, recentLoad: 46, loadBalance: -7 }],
        },
        fitnessHistory: {
          status: "historical",
          verifiedThrough: "2026-04-05",
          maturity: "establishing_baseline",
        },
      } as unknown as PlanTabProjection,
      selectedWeekStart: "2026-04-06",
      weekWindow: { start: "2026-03-30", end: "2026-04-12" },
      todayKey: "2026-04-06",
    });

    expect(result.trainingPath.fitnessHistoryNotice).toBe(
      "Fitness, fatigue, and form are based on verified history through Apr 5, 2026, then assume zero on days where no Load can be established. The baseline is still establishing.",
    );
    expect(result.trainingPath.weeks.some((week) => week.fitness === 39)).toBe(true);
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

    const incompleteSubtotalProjection = buildVariant("unavailable", null);
    incompleteSubtotalProjection.dayLoads["2026-04-06"] = {
      ...incompleteSubtotalProjection.dayLoads["2026-04-06"],
      knownCompletedLoadSubtotal: 20,
    };
    const incompleteSubtotal = present(incompleteSubtotalProjection);
    expect(
      incompleteSubtotal.dailyTrainingPathPoints.find((point) => point.date === "2026-04-06"),
    ).toMatchObject({
      completedLoad: 20,
      completedObservationState: "observed",
      effectiveCompletedLoad: 20,
      effectiveCompletedLoadStatus: "partial",
    });
    expect(
      incompleteSubtotal.trainingPath.weeks.find((week) => week.weekStart === "2026-04-06"),
    ).toMatchObject({
      completedLoad: 20,
      completedLoadStatus: "partial",
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

  it("restores a finite scheduled subtotal without exposing partial status as chart chrome", () => {
    const day = projection.timeline.days[0];
    if (!day) throw new Error("Expected projection day fixture");
    const subtotalProjection = {
      ...projection,
      timeline: {
        ...projection.timeline,
        days: [
          {
            ...day,
            load: {
              ...day.load,
              scheduledLoad: null,
              scheduledLoadStatus: "unavailable",
            },
          },
        ],
      },
      dayLoads: {
        ...projection.dayLoads,
        "2026-04-06": {
          ...projection.dayLoads["2026-04-06"],
          knownScheduledLoadSubtotal: 60,
          scheduledLoad: null,
          scheduledLoadStatus: "unavailable",
        },
      },
    } as unknown as PlanTabProjection;

    const result = buildPlanTabProjectionPresentation({
      projection: subtotalProjection,
      selectedWeekStart: "2026-04-06",
      weekWindow: { start: "2026-03-30", end: "2026-04-12" },
      todayKey: "2026-04-06",
    });

    expect(
      result.dailyTrainingPathPoints.find((point) => point.date === "2026-04-06"),
    ).toMatchObject({ plannedLoad: 60, plannedLoadStatus: "partial" });
    expect(result.trainingPath.weeks.find((week) => week.weekStart === "2026-04-06")).toMatchObject(
      { plannedLoad: 60, plannedLoadStatus: "partial" },
    );
  });

  it("loads the entire Plan tab through one bounded server projection", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(mockProjectionUseQuery).toHaveBeenLastCalledWith(
      { startDate: "2026-03-17", endDate: "2026-04-27" },
      expect.objectContaining({
        enabled: true,
        retry: false,
      }),
    );
    expect(result.current.queryFailureCount).toBe(0);
    expect(result.current.hasUsableData).toBe(true);
  });

  it("adopts the server-authoritative planning day", async () => {
    mockProjectionData = {
      ...projection,
      today: "2026-04-07",
    } as unknown as typeof projection;
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(result.current.selectedDate).toBe("2026-04-07");
    expect(result.current.trainingPath.todayKey).toBe("2026-04-07");
  });

  it("maps server-owned load and fitness without source queries", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(result.current.dailyTrainingPathPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-06",
          actualFatigueAtl: 50,
          completedLoad: 35,
          effectiveLoad: 60,
          fitnessCtl: 40,
          recommendedFatigueAtl: 53,
          recommendedFitnessCtl: 42,
          recommendedFormTsb: -11,
          recommendedLoad: 70,
          recommendedLoadStatus: "complete",
          scheduledFatigueAtl: 50,
          scheduledFitnessCtl: 40,
          scheduledFormTsb: -12,
        }),
      ]),
    );
    expect(result.current.timelineDaysByDate["2026-04-06"]).toMatchObject({
      completedItems: [expect.objectContaining({ title: "Morning ride" })],
      scheduledItems: [expect.objectContaining({ title: "Tempo ride" })],
    });
  });

  it("opens analysis for the selected week rather than an unrelated historical day", async () => {
    mockProjectionData = {
      ...projection,
      fitnessHistory: {
        status: "historical",
        verifiedThrough: "2026-04-05",
        maturity: "establishing_baseline",
      },
    } as unknown as typeof projection;
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(result.current.selectedDate).toBe("2026-04-06");
    expect(result.current.analysisSelectedDate).toBe("2026-04-06");

    await act(() => result.current.handleSelectedDateChange("2026-04-06"));
    expect(result.current.analysisSelectedDate).toBe("2026-04-06");
  });

  it("uses an analysis route anchor as its initial selected date", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData("2026-04-08"));

    expect(result.current.selectedDate).toBe("2026-04-08");
    expect(result.current.analysisSelectedDate).toBe("2026-04-08");
  });

  it("uses one selected date and lets analysis select a week by its start", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    await act(() => result.current.handleSelectedDateChange("2026-04-08"));
    expect(result.current.selectedDate).toBe("2026-04-08");
    expect(result.current.selectedWeekStart).toBe("2026-04-06");

    await act(() => result.current.handleSelectedWeekChange("2026-03-30"));
    expect(result.current.selectedDate).toBe("2026-03-30");
    expect(result.current.selectedWeekStart).toBe("2026-03-30");
  });

  it("keeps one stable projection window while the selected day changes", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    await act(() => result.current.handleSelectedDateChange("2026-08-01"));

    expect(mockProjectionUseQuery).toHaveBeenLastCalledWith(
      { startDate: "2026-03-17", endDate: "2026-04-27" },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("changes and shifts bounded ranges without recentering the selected day", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());
    await act(() => result.current.handleSelectedDateChange("2026-04-08"));

    await act(() => result.current.handleAnalysisRangeChange("6m"));

    const sixMonths = buildCenteredPlanAnalysisWindow({ anchorDate: "2026-04-06", period: "6m" });
    expect(result.current.analysisPeriod).toBe("6m");
    expect(result.current.selectedDate).toBe("2026-04-08");
    expect(mockProjectionUseQuery).toHaveBeenLastCalledWith(
      { startDate: sixMonths.startDate, endDate: sixMonths.endDate },
      expect.objectContaining({ enabled: true, placeholderData: expect.any(Function) }),
    );

    await act(() => result.current.handleAnalysisPeriodShift(-1));
    const previous = shiftPlanAnalysisWindow({
      anchorDate: "2026-04-06",
      direction: -1,
      period: "6m",
    });
    expect(result.current.analysisAnchor).toBe(previous.anchorDate);
    expect(mockProjectionUseQuery).toHaveBeenLastCalledWith(
      { startDate: previous.startDate, endDate: previous.endDate },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("selects the adjacent end of a newly loaded previous window", async () => {
    const { result, rerender } = await renderHook(() => usePlanTrainingPathData());
    const previous = shiftPlanAnalysisWindow({
      anchorDate: "2026-04-06",
      direction: -1,
      period: "6w",
    });

    await act(() => result.current.handleAnalysisPeriodShift(-1));
    expect(result.current.selectedDate).toBe("2026-04-06");

    const sourceDay = projection.timeline.days[0];
    if (!sourceDay) throw new Error("Expected projection day fixture");
    mockProjectionData = {
      ...projection,
      dayLoads: { [previous.endDate]: projection.dayLoads["2026-04-06"] },
      timeline: {
        ...projection.timeline,
        days: [{ ...sourceDay, date: previous.endDate }],
        endDate: previous.endDate,
        startDate: previous.startDate,
        weeks: [],
      },
    } as unknown as typeof projection;
    await rerender({});

    expect(result.current.selectedDate).toBe(previous.endDate);
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

  it("exposes bounded navigation rather than unbounded window extension", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(
      new Set(mockProjectionUseQuery.mock.calls.map(([input]) => JSON.stringify(input))).size,
    ).toBe(1);
    expect(result.current).not.toHaveProperty("extendTrainingPathWindowStart");
    expect(result.current).not.toHaveProperty("extendTrainingPathWindowEnd");
    expect(result.current.handleAnalysisPeriodShift).toEqual(expect.any(Function));
  });

  it("uses UTC as a safe request anchor when a legacy profile has no planning timezone", async () => {
    mockPlanningTimezone = null;

    const { result } = await renderHook(() => usePlanTrainingPathData());

    expect(mockProjectionUseQuery).toHaveBeenCalledWith(
      { startDate: "2026-03-17", endDate: "2026-04-27" },
      expect.objectContaining({ enabled: true }),
    );
    expect(result.current).toMatchObject({
      planningTimezoneState: "ready",
      chartUnavailable: false,
      chartLoading: false,
      queryFailureCount: 0,
    });
  });

  it("refreshes every resource visible in the coordinated Plan workflow", async () => {
    const { result } = await renderHook(() => usePlanTrainingPathData());

    await act(async () => result.current.handleRefresh());

    expect(mockProjectionRefetch).toHaveBeenCalledTimes(1);
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    expect(mockCalendarDayInvalidate).toHaveBeenCalledTimes(1);
    expect(mockGoalAssessmentInvalidate).toHaveBeenCalledTimes(1);
    expect(mockGoalProgressInvalidate).toHaveBeenCalledTimes(1);
    expect(mockThresholdOverviewInvalidate).toHaveBeenCalledTimes(1);
  });

  it("settles the coordinated refresh when one resource fails", async () => {
    mockCalendarDayInvalidate.mockRejectedValueOnce(new Error("calendar unavailable"));
    const { result } = await renderHook(() => usePlanTrainingPathData());

    await expect(act(async () => result.current.handleRefresh())).resolves.toBeUndefined();

    expect(mockProjectionRefetch).toHaveBeenCalledTimes(1);
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    expect(mockGoalAssessmentInvalidate).toHaveBeenCalledTimes(1);
    expect(mockGoalProgressInvalidate).toHaveBeenCalledTimes(1);
    expect(mockThresholdOverviewInvalidate).toHaveBeenCalledTimes(1);
  });
});
