import { act, renderHook } from "@testing-library/react-native";

const mockTssIdentity = {
  sport: "bike" as const,
  method: "power_threshold" as const,
  source: "activity_analysis" as const,
  version: "1" as const,
  calibration: { type: "ftp_watts" as const, value: 250 },
};

const queryResult = {
  data: { items: [] },
  dataUpdatedAt: 0,
  isError: false,
  isLoading: false,
  refetch: jest.fn(async () => undefined),
};
const paginatedQueryResult = {
  ...queryResult,
  data: { pages: [{ items: [] }] },
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};
const mockEventsListUseQuery = jest.fn(
  (_input?: unknown, _options?: unknown) => paginatedQueryResult,
);
const mockGroupEventsUseQuery = jest.fn(
  (_input?: unknown, _options?: unknown) => paginatedQueryResult,
);
const mockCompletedActivitiesUseInfiniteQuery = jest.fn(
  (_input?: unknown, _options?: unknown) => paginatedQueryResult,
);
let mockPlanningTimezone: string | null = "America/Los_Angeles";
const mockGetTrainingPathTodayKey = jest.fn<string | null, []>(() =>
  mockPlanningTimezone ? "2026-04-06" : null,
);
const mockMillisecondsUntilNextTrainingPathDay = jest.fn(() => 60_000);

let mockDailyTssObservations: Array<
  | {
      date: string;
      state: "calculated";
      tss_identity: typeof mockTssIdentity;
      unavailable_activity_count: number;
      value: number;
    }
  | {
      date: string;
      state: "unavailable";
      tss_identity: null;
      unavailable_activity_count: number;
      value: null;
    }
> = [];
const mockDailyTssUseQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  ...queryResult,
  data: {
    start_date: "2026-03-30",
    end_date: "2026-04-12",
    observations: mockDailyTssObservations,
  },
}));

const snapshot = {
  actualCurveData: {
    dataPoints: [{ date: "2026-04-01", ctl: 42, atl: 54 }],
  },
  idealCurveData: {
    dataPoints: [{ date: "2026-04-01", ctl: 42 }],
  },
  refetchAll: jest.fn(async () => undefined),
};

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      getActivePlan: { useQuery: () => ({ ...queryResult, data: { id: "plan-123" } }) },
    },
    events: {
      list: {
        useInfiniteQuery: (input: unknown, options: unknown) =>
          mockEventsListUseQuery(input, options),
      },
    },
    groups: {
      events: {
        myUpcomingGroupEvents: {
          useInfiniteQuery: (input: unknown, options: unknown) =>
            mockGroupEventsUseQuery(input, options),
        },
      },
    },
    activityPlans: { getManyByIds: { useQuery: () => queryResult } },
    activities: {
      dailyTssObservations: {
        useQuery: (input: unknown, options: unknown) => mockDailyTssUseQuery(input, options),
      },
      listPaginated: {
        useInfiniteQuery: (input: unknown, options: unknown) =>
          mockCompletedActivitiesUseInfiniteQuery(input, options),
      },
    },
  },
}));

jest.mock("@/lib/auth/auth-headers", () => ({ hasSessionAuthCredentials: () => true }));
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { planning_timezone: mockPlanningTimezone }, user: null }),
}));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { ready: boolean; session: object }) => unknown) =>
    selector({ ready: true, session: {} }),
}));
jest.mock("@/lib/hooks/useProfileGoals", () => ({
  useProfileGoals: () => ({ goals: [], dataUpdatedAt: 0, isError: false, refetch: jest.fn() }),
}));
jest.mock("@/lib/hooks/useProfileSettings", () => ({
  useProfileSettings: () => ({
    settings: {},
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  useTrainingPlanSnapshot: jest.fn(),
}));
jest.mock("../usePlanDashboardViewModel", () => ({
  usePlanDashboardViewModel: jest.fn(),
}));
jest.mock("@/lib/training-plan-form/projectionPreview", () => ({
  buildTrainingPreferencesLoadTimeline: jest.fn(),
  buildTrainingPreferencesProjectionPreview: jest.fn(),
}));
jest.mock("./useScrollableTrainingPathWindow", () => ({
  useScrollableTrainingPathWindow: () => ({
    resolvedWeekWindow: { start: "2026-03-30", end: "2026-04-12" },
    extendWindowEnd: jest.fn(),
    extendWindowStart: jest.fn(),
    resetWindow: jest.fn(),
  }),
}));
jest.mock("./useTrainingPathViewModel", () => ({
  useTrainingPathViewModel: (input: unknown) => ({ selectedWeekSummary: null, input }),
}));
jest.mock("./trainingPathUtils", () => ({
  addDays: (date: string, days: number) => {
    const value = new Date(`${date}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  },
  buildScheduledFitnessTrend: () => [],
  getWeekStartDateKey: (date: string) => date,
}));
jest.mock("./trainingPathPlanningTime", () => ({
  getTrainingPathDateKey: (instant: string) => instant.slice(0, 10),
  getTrainingPathTodayKey: () => mockGetTrainingPathTodayKey(),
  getTrainingPathPlanningDayRange: (dateKey: string) =>
    mockPlanningTimezone
      ? ({
          "2026-03-30": {
            startsAfter: "2026-03-30T07:00:00.000Z",
            startsBefore: "2026-03-31T07:00:00.000Z",
          },
          "2026-04-06": {
            startsAfter: "2026-04-06T07:00:00.000Z",
            startsBefore: "2026-04-07T07:00:00.000Z",
          },
          "2026-04-12": {
            startsAfter: "2026-04-12T07:00:00.000Z",
            startsBefore: "2026-04-13T07:00:00.000Z",
          },
        }[dateKey] ?? null)
      : null,
  millisecondsUntilNextTrainingPathDay: () => mockMillisecondsUntilNextTrainingPathDay(),
}));
jest.mock("@/lib/training-path/trainingTimelineAdapters", () => ({
  ...jest.requireActual("@/lib/training-path/trainingTimelineAdapters"),
}));
jest.mock("@repo/core/training-timeline", () => ({
  buildTrainingTimelineWindowFromLoadTimeline: ({
    endDate,
    startDate,
    timeline,
  }: {
    endDate: string;
    startDate: string;
    timeline: Array<{
      completed_load_tss: number;
      date: string;
      recommended_load_tss: number;
      scheduled_load_tss: number;
      tentative_scheduled_load_tss?: number;
    }>;
  }) => ({
    startDate,
    endDate,
    days: timeline.map((point) => ({
      date: point.date,
      load: {
        completedTss: point.completed_load_tss,
        plannedTss: point.scheduled_load_tss,
        recommendedTss: point.recommended_load_tss,
        remainingTss: point.scheduled_load_tss,
        scheduledTss: point.scheduled_load_tss,
        tentativeScheduledTss: point.tentative_scheduled_load_tss ?? 0,
      },
    })),
  }),
  normalizeDailyTrainingLoadAdjustments: jest.requireActual("@repo/core/training-timeline")
    .normalizeDailyTrainingLoadAdjustments,
}));

import { usePlanTrainingPathData } from "./usePlanTrainingPathData";

const { useTrainingPlanSnapshot: mockUseTrainingPlanSnapshot } = jest.requireMock(
  "@/lib/hooks/useTrainingPlanSnapshot",
);
const { usePlanDashboardViewModel: mockUsePlanDashboardViewModel } = jest.requireMock(
  "../usePlanDashboardViewModel",
);
const { buildTrainingPreferencesLoadTimeline: mockBuildTrainingPreferencesLoadTimeline } =
  jest.requireMock("@/lib/training-plan-form/projectionPreview");
const { buildTrainingPreferencesProjectionPreview: mockBuildTrainingPreferencesProjectionPreview } =
  jest.requireMock("@/lib/training-plan-form/projectionPreview");

describe("usePlanTrainingPathData", () => {
  beforeEach(() => {
    mockPlanningTimezone = "America/Los_Angeles";
    mockGetTrainingPathTodayKey.mockClear();
    mockMillisecondsUntilNextTrainingPathDay.mockClear();
    mockDailyTssObservations = [];
    mockDailyTssUseQuery.mockClear();
    mockEventsListUseQuery.mockClear();
    mockGroupEventsUseQuery.mockClear();
    mockCompletedActivitiesUseInfiniteQuery.mockClear();
    mockUseTrainingPlanSnapshot.mockClear();
    mockUsePlanDashboardViewModel.mockClear();
    mockBuildTrainingPreferencesLoadTimeline.mockClear();
    mockBuildTrainingPreferencesProjectionPreview.mockReset();
    mockUseTrainingPlanSnapshot.mockReturnValue(snapshot);
    mockUsePlanDashboardViewModel.mockImplementation(
      ({ snapshot: dashboardSnapshot }: { snapshot: typeof snapshot }) => ({
        fitnessHistory: dashboardSnapshot.actualCurveData.dataPoints,
        goalMarkers: [{ id: "goal-1", label: "Goal", targetDate: "2026-08-01" }],
        idealFitnessCurve: dashboardSnapshot.idealCurveData.dataPoints,
      }),
    );
    mockBuildTrainingPreferencesLoadTimeline.mockReturnValue([
      {
        date: "2026-04-01",
        completed_load_tss: 0,
        recommended_load_tss: 70,
        scheduled_load_tss: 60,
      },
    ]);
    mockBuildTrainingPreferencesProjectionPreview.mockReturnValue({
      previewIdealCurve: [],
      projectionChart: {
        daily_load_points: [{ date: "2026-04-01", recommended_load_tss: 70 }],
        display_points: [{ date: "2026-04-01" }],
      },
    });
  });

  it("disables insight timelines while retaining actual and ideal curve chart inputs", () => {
    renderHook(() => usePlanTrainingPathData());

    expect(mockUseTrainingPlanSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        curveWindow: "overview",
        includeInsightTimeline: false,
      }),
    );
    expect(mockUsePlanDashboardViewModel).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot }),
    );
    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot }),
    );
  });

  it("queries daily TSS with the persisted planning timezone and maps known completed load", () => {
    mockDailyTssObservations = [
      {
        date: "2026-04-01",
        state: "calculated",
        tss_identity: mockTssIdentity,
        unavailable_activity_count: 0,
        value: 35,
      },
    ];

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(mockDailyTssUseQuery).toHaveBeenCalledWith(
      {
        start_date: "2026-03-30",
        end_date: "2026-04-06",
        timezone: "America/Los_Angeles",
      },
      expect.objectContaining({ enabled: true, placeholderData: expect.any(Function) }),
    );
    expect(result.current.dailyTrainingPathPoints).toEqual([
      expect.objectContaining({ date: "2026-04-01", completedLoadTss: 35 }),
    ]);
  });

  it("uses planning-zone boundaries for the scrollable chart event and activity queries", () => {
    renderHook(() => usePlanTrainingPathData());

    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ date_from: "2026-04-06", date_to: "2026-04-13T06:59:59.999Z" }),
      expect.anything(),
    );
    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ date_from: "2026-03-30", date_to: "2026-04-07T06:59:59.999Z" }),
      expect.anything(),
    );
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAfter: "2026-03-30T07:00:00.000Z",
        startsBefore: "2026-04-13T06:59:59.999Z",
      }),
      expect.anything(),
    );
    expect(mockCompletedActivitiesUseInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2026-03-30T07:00:00.000Z",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.anything(),
    );
  });

  it("maps unavailable and mixed observations to explicit markers", () => {
    mockDailyTssObservations = [
      {
        date: "2026-04-01",
        state: "calculated",
        tss_identity: mockTssIdentity,
        value: 35,
        unavailable_activity_count: 1,
      },
      {
        date: "2026-04-02",
        state: "unavailable",
        tss_identity: null,
        unavailable_activity_count: 1,
        value: null,
      },
    ];

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(result.current.dailyTrainingPathPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-01",
          completedLoadTss: 35,
          hasCompletedActivityWithoutLoad: true,
        }),
        expect.objectContaining({
          date: "2026-04-02",
          completedLoadTss: 0,
          hasCompletedActivityWithoutLoad: true,
        }),
      ]),
    );
  });

  it("includes completed-only dates in the chart timeline", () => {
    mockDailyTssObservations = [
      {
        date: "2026-04-03",
        state: "calculated",
        tss_identity: mockTssIdentity,
        unavailable_activity_count: 0,
        value: 42,
      },
    ];

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(result.current.dailyTrainingPathPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-03",
          completedLoadTss: 42,
          completedObservationState: "observed",
          completedTssIdentity: mockTssIdentity,
          hasTargetLoad: false,
        }),
      ]),
    );
  });

  it("suppresses normalized recommendation values when there is no eligible goal", () => {
    mockUsePlanDashboardViewModel.mockReturnValue({
      fitnessHistory: snapshot.actualCurveData.dataPoints,
      goalMarkers: [],
      idealFitnessCurve: snapshot.idealCurveData.dataPoints,
    });
    mockBuildTrainingPreferencesProjectionPreview.mockReturnValue({
      previewIdealCurve: [],
      projectionChart: null,
    });

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(result.current.dailyTrainingPathPoints[0]).toMatchObject({
      hasTargetLoad: false,
    });
  });

  it("abstains without timezone boundaries or cached training data when planning timezone is unavailable", () => {
    mockPlanningTimezone = null;

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(result.current).toMatchObject({
      planningTimezoneState: "unavailable",
      chartLoading: true,
      hasUsableData: false,
      dailyTrainingPathPoints: [],
      trainingPath: { input: expect.objectContaining({ timeline: [], fitnessHistory: [] }) },
    });
    expect(mockDailyTssUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "", start_date: "", end_date: "" }),
      expect.objectContaining({ enabled: false }),
    );
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ startsAfter: "", startsBefore: "" }),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("re-arms the planning-midnight refresh after each rollover", () => {
    jest.useFakeTimers();
    mockGetTrainingPathTodayKey
      .mockReturnValueOnce("2026-04-06")
      .mockReturnValueOnce("2026-04-07")
      .mockReturnValue("2026-04-08");

    renderHook(() => usePlanTrainingPathData());
    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    expect(mockMillisecondsUntilNextTrainingPathDay).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
});
