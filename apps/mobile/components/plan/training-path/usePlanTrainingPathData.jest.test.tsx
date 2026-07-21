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
  isFetching: false,
  isLoading: false,
  isPlaceholderData: false,
  refetch: jest.fn(async () => undefined),
};
const paginatedQueryResult = {
  ...queryResult,
  data: { pages: [{ items: [] as Array<Record<string, unknown>> }] },
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isFetchNextPageError: false,
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
let mockProfileLoading = false;
const mockRefreshProfile = jest.fn(async () => undefined);
let mockResolvedWeekWindow = { start: "2026-03-30", end: "2026-04-12" };
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
const mockDailyTssRefetch = jest.fn(async () => undefined);
const mockActivePlanRefetch = jest.fn(async () => undefined);
const mockExpandedActualCurveRefetch = jest.fn(async () => undefined);
const mockExpandedActualCurveUseQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  ...queryResult,
  data: { dataPoints: [] },
  refetch: mockExpandedActualCurveRefetch,
}));
const mockDailyTssUseQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  ...queryResult,
  refetch: mockDailyTssRefetch,
  data: {
    start_date: "2026-03-30",
    end_date: "2026-04-12",
    timezone: mockPlanningTimezone ?? "UTC",
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
      getActivePlan: {
        useQuery: () => ({
          ...queryResult,
          data: { id: "plan-123" },
          refetch: mockActivePlanRefetch,
        }),
      },
      getActualCurve: {
        useQuery: (input: unknown, options: unknown) =>
          mockExpandedActualCurveUseQuery(input, options),
      },
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
  useAuth: () => ({
    profile: { planning_timezone: mockPlanningTimezone },
    profileLoading: mockProfileLoading,
    refreshProfile: mockRefreshProfile,
    user: null,
  }),
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
    resolvedWeekWindow: mockResolvedWeekWindow,
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
          "2025-04-06": {
            startsAfter: "2025-04-06T07:00:00.000Z",
            startsBefore: "2025-04-07T07:00:00.000Z",
          },
          "2025-10-06": {
            startsAfter: "2025-10-06T07:00:00.000Z",
            startsBefore: "2025-10-07T07:00:00.000Z",
          },
          "2024-01-01": {
            startsAfter: "2024-01-01T08:00:00.000Z",
            startsBefore: "2024-01-02T08:00:00.000Z",
          },
          "2023-01-01": {
            startsAfter: "2023-01-01T08:00:00.000Z",
            startsBefore: "2023-01-02T08:00:00.000Z",
          },
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
          "2027-04-06": {
            startsAfter: "2027-04-06T07:00:00.000Z",
            startsBefore: "2027-04-07T07:00:00.000Z",
          },
          "2026-10-05": {
            startsAfter: "2026-10-05T07:00:00.000Z",
            startsBefore: "2026-10-06T07:00:00.000Z",
          },
          "2027-07-03": {
            startsAfter: "2027-07-03T07:00:00.000Z",
            startsBefore: "2027-07-04T07:00:00.000Z",
          },
          "2028-07-01": {
            startsAfter: "2028-07-01T07:00:00.000Z",
            startsBefore: "2028-07-02T07:00:00.000Z",
          },
          "2023-07-03": {
            startsAfter: "2023-07-03T07:00:00.000Z",
            startsBefore: "2023-07-04T07:00:00.000Z",
          },
          "2024-07-01": {
            startsAfter: "2024-07-01T07:00:00.000Z",
            startsBefore: "2024-07-02T07:00:00.000Z",
          },
          "2028-12-31": {
            startsAfter: "2028-12-31T08:00:00.000Z",
            startsBefore: "2029-01-01T08:00:00.000Z",
          },
          "2028-01-01": {
            startsAfter: "2028-01-01T08:00:00.000Z",
            startsBefore: "2028-01-02T08:00:00.000Z",
          },
          "2029-01-01": {
            startsAfter: "2029-01-01T08:00:00.000Z",
            startsBefore: "2029-01-02T08:00:00.000Z",
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
    mockProfileLoading = false;
    mockRefreshProfile.mockClear();
    mockResolvedWeekWindow = { start: "2026-03-30", end: "2026-04-12" };
    mockGetTrainingPathTodayKey.mockClear();
    mockMillisecondsUntilNextTrainingPathDay.mockClear();
    mockDailyTssObservations = [];
    mockDailyTssRefetch.mockClear();
    mockActivePlanRefetch.mockClear();
    mockExpandedActualCurveRefetch.mockClear();
    mockExpandedActualCurveUseQuery.mockClear();
    snapshot.refetchAll.mockClear();
    mockDailyTssUseQuery.mockClear();
    mockEventsListUseQuery.mockReset();
    mockEventsListUseQuery.mockImplementation(() => paginatedQueryResult);
    mockGroupEventsUseQuery.mockReset();
    mockGroupEventsUseQuery.mockImplementation(() => paginatedQueryResult);
    mockCompletedActivitiesUseInfiniteQuery.mockReset();
    mockCompletedActivitiesUseInfiniteQuery.mockImplementation(() => paginatedQueryResult);
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

  it("retains the current dated query pages while an expanded window loads", () => {
    renderHook(() => usePlanTrainingPathData());

    for (const [, options] of mockEventsListUseQuery.mock.calls) {
      expect(options).toEqual(expect.objectContaining({ placeholderData: expect.any(Function) }));
    }
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ placeholderData: expect.any(Function) }),
    );
    expect(mockCompletedActivitiesUseInfiniteQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ placeholderData: expect.any(Function) }),
    );
  });

  it("queries a bounded data chunk inside the complete expanded chart window", () => {
    mockResolvedWeekWindow = { start: "2024-01-01", end: "2028-12-31" };

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(mockEventsListUseQuery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        date_from: "2026-04-06",
        date_to: "2026-10-06T06:59:59.999Z",
      }),
      expect.anything(),
    );
    expect(mockEventsListUseQuery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ date_from: "2025-10-06" }),
      expect.anything(),
    );
    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledWindowStart: "2024-01-01",
        scheduledWindowEnd: "2028-12-31",
      }),
    );
    expect(mockExpandedActualCurveUseQuery).toHaveBeenCalledWith(
      { start_date: "2025-10-06", end_date: "2026-04-06" },
      expect.objectContaining({ enabled: true, placeholderData: expect.any(Function) }),
    );

    act(() => result.current.handleSelectedDateChange("2028-01-01"));

    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2027-07-03",
        date_to: "2028-07-02T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );

    act(() => result.current.handleSelectedDateChange("2024-01-01"));

    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2024-01-01",
        date_to: "2024-07-02T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("merges settled pages with the first page of an expanded range", () => {
    const settledEvents = [
      { id: "event-existing-1", all_day: true, scheduled_date: "2026-04-01" },
      { id: "event-existing-2", all_day: true, scheduled_date: "2026-04-02" },
    ];
    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      data: { pages: [{ items: settledEvents }] },
      isFetching: false,
      isPlaceholderData: false,
    });
    const { rerender } = renderHook(() => usePlanTrainingPathData());

    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      data: {
        pages: [
          {
            items: [{ id: "event-new-edge", all_day: true, scheduled_date: "2026-03-31" }],
          },
        ],
      },
      hasNextPage: true,
      isFetching: false,
      isPlaceholderData: false,
    });
    rerender({});

    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scheduledEvents: expect.arrayContaining([
          expect.objectContaining({ id: "event-existing-1" }),
          expect.objectContaining({ id: "event-existing-2" }),
          expect.objectContaining({ id: "event-new-edge" }),
        ]),
      }),
    );
  });

  it("retains settled pages when an expanded range fails before its first page", () => {
    const settledEvent = {
      id: "event-existing",
      all_day: true,
      scheduled_date: "2026-04-01",
    };
    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      data: { pages: [{ items: [settledEvent] }] },
    });
    const { rerender } = renderHook(() => usePlanTrainingPathData());

    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      data: { pages: [] },
      isError: true,
    });
    rerender({});

    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scheduledEvents: expect.arrayContaining([
          expect.objectContaining({ id: "event-existing" }),
        ]),
      }),
    );
  });

  it("clears retained pages when the planning identity changes", () => {
    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      data: {
        pages: [
          {
            items: [{ id: "event-old-timezone", all_day: true, scheduled_date: "2026-04-01" }],
          },
        ],
      },
    });
    const { rerender } = renderHook(() => usePlanTrainingPathData());

    mockPlanningTimezone = "UTC";
    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      isFetching: true,
      isPlaceholderData: true,
      data: {
        pages: [
          {
            items: [{ id: "event-old-timezone", all_day: true, scheduled_date: "2026-04-01" }],
          },
        ],
      },
    });
    rerender({});

    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scheduledEvents: expect.not.arrayContaining([
          expect.objectContaining({ id: "event-old-timezone" }),
        ]),
      }),
    );
  });

  it("replaces a settled chunk so deleted events do not remain retained", () => {
    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      data: {
        pages: [
          {
            items: [{ id: "event-deleted", all_day: true, scheduled_date: "2026-04-01" }],
          },
        ],
      },
    });
    const { rerender } = renderHook(() => usePlanTrainingPathData());

    mockEventsListUseQuery.mockReturnValue(paginatedQueryResult);
    rerender({});

    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scheduledEvents: expect.not.arrayContaining([
          expect.objectContaining({ id: "event-deleted" }),
        ]),
      }),
    );
  });

  it("returns the data anchor to today when the chart window resets", async () => {
    mockResolvedWeekWindow = { start: "2024-01-01", end: "2028-12-31" };
    const { result } = renderHook(() => usePlanTrainingPathData());

    act(() => result.current.handleSelectedDateChange("2028-01-01"));
    mockEventsListUseQuery.mockClear();

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2026-04-06",
        date_to: "2026-10-06T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("deduplicates events returned by overlapping recent and upcoming queries", () => {
    const sharedEvent = {
      id: "event-today",
      all_day: true,
      scheduled_date: "2026-04-06",
    };
    mockEventsListUseQuery.mockImplementation(() => ({
      ...paginatedQueryResult,
      data: { pages: [{ items: [sharedEvent] }] },
    }));

    renderHook(() => usePlanTrainingPathData());

    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledEvents: [expect.objectContaining({ id: "event-today" })],
      }),
    );
  });

  it("loads a bounded data chunk while retaining a multi-year visual window", () => {
    mockResolvedWeekWindow = { start: "2024-01-01", end: "2028-01-01" };

    renderHook(() => usePlanTrainingPathData());

    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2026-04-06",
        date_to: "2026-10-06T06:59:59.999Z",
      }),
      expect.anything(),
    );
    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2025-10-06",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.anything(),
    );
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAfter: "2025-10-06T07:00:00.000Z",
        startsBefore: "2026-10-06T06:59:59.999Z",
      }),
      expect.anything(),
    );
    expect(mockCompletedActivitiesUseInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2025-10-06T07:00:00.000Z",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.anything(),
    );
    expect(mockDailyTssUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        start_date: "2025-10-06",
        end_date: "2026-04-06",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockBuildTrainingPreferencesLoadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledWindowStart: "2024-01-01",
        scheduledWindowEnd: "2028-01-01",
      }),
    );
  });

  it("keeps wholly future visual intervals valid with a bounded chunk from today", () => {
    mockResolvedWeekWindow = { start: "2028-01-01", end: "2029-01-01" };

    renderHook(() => usePlanTrainingPathData());

    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2026-04-06",
        date_to: "2026-10-06T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2026-04-06",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAfter: "2026-04-06T07:00:00.000Z",
        startsBefore: "2026-10-06T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockCompletedActivitiesUseInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2026-04-06T07:00:00.000Z",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockDailyTssUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        start_date: "2026-04-06",
        end_date: "2026-04-06",
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("keeps wholly historical visual intervals valid with a bounded chunk ending today", () => {
    mockResolvedWeekWindow = { start: "2023-01-01", end: "2024-01-01" };

    renderHook(() => usePlanTrainingPathData());

    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2026-04-06",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2025-10-06",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAfter: "2025-10-06T07:00:00.000Z",
        startsBefore: "2026-04-07T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockCompletedActivitiesUseInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        date_from: "2025-10-06T07:00:00.000Z",
        date_to: "2026-04-07T06:59:59.999Z",
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mockDailyTssUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        start_date: "2025-10-06",
        end_date: "2026-04-06",
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("continues automatic pagination while the API returns another cursor", () => {
    const fetchNextPage = jest.fn();
    const loadedPages = Array.from({ length: 20 }, () => ({ items: [] }));
    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      data: { pages: loadedPages },
      fetchNextPage,
      hasNextPage: true,
    });

    renderHook(() => usePlanTrainingPathData());

    expect(fetchNextPage).toHaveBeenCalled();
    const options = mockEventsListUseQuery.mock.calls[0]?.[1] as {
      getNextPageParam: (lastPage: { nextCursor?: string }) => string | undefined;
    };
    expect(options.getNextPageParam({ nextCursor: "next" })).toBe("next");
  });

  it("does not restart a failed next-page request", () => {
    const fetchNextPage = jest.fn();
    mockEventsListUseQuery.mockReturnValue({
      ...paginatedQueryResult,
      fetchNextPage,
      hasNextPage: true,
      isFetchNextPageError: true,
    });

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.selectedWeekLoading).toBe(false);
  });

  it("keeps selected review disclosure loading while group and completed data are delayed", () => {
    let groupEventsLoading = true;
    let completedActivitiesPaging = false;
    mockGroupEventsUseQuery.mockImplementation(() => ({
      ...paginatedQueryResult,
      isLoading: groupEventsLoading,
    }));
    mockCompletedActivitiesUseInfiniteQuery.mockImplementation(() => ({
      ...paginatedQueryResult,
      isFetchingNextPage: completedActivitiesPaging,
    }));

    const { result, rerender } = renderHook(() => usePlanTrainingPathData());

    expect(result.current.selectedWeekGroupEvents).toEqual([]);
    expect(result.current.selectedWeekCompletedActivities).toEqual([]);
    expect(result.current.selectedWeekLoading).toBe(true);

    groupEventsLoading = false;
    completedActivitiesPaging = true;
    rerender({});
    expect(result.current.selectedWeekLoading).toBe(true);

    completedActivitiesPaging = false;
    rerender({});
    expect(result.current.selectedWeekLoading).toBe(false);
  });

  it("keeps schedule and observation queries disabled for malformed derived windows", () => {
    mockResolvedWeekWindow = { start: "", end: "2026-04-12" };

    renderHook(() => usePlanTrainingPathData());

    expect(mockDailyTssUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        start_date: "1970-01-01",
        end_date: "1970-01-01",
        timezone: "UTC",
      }),
      expect.objectContaining({ enabled: false }),
    );
    expect(mockEventsListUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
    expect(mockCompletedActivitiesUseInfiniteQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("enables valid queries after planning boundaries become available", () => {
    mockPlanningTimezone = null;
    mockResolvedWeekWindow = { start: "", end: "" };
    const { rerender } = renderHook(() => usePlanTrainingPathData());

    expect(mockDailyTssUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ start_date: "1970-01-01", end_date: "1970-01-01" }),
      expect.objectContaining({ enabled: false }),
    );

    mockPlanningTimezone = "America/Los_Angeles";
    mockResolvedWeekWindow = { start: "2026-03-30", end: "2026-04-12" };
    rerender({});

    expect(mockDailyTssUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ start_date: "2026-03-30", end_date: "2026-04-06" }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("does not manually refetch planning queries while planning readiness is unavailable", async () => {
    mockPlanningTimezone = null;
    mockResolvedWeekWindow = { start: "", end: "" };
    const { result } = renderHook(() => usePlanTrainingPathData());

    await act(async () => result.current.handleRefresh());

    expect(mockDailyTssRefetch).not.toHaveBeenCalled();
    expect(mockActivePlanRefetch).not.toHaveBeenCalled();
    expect(snapshot.refetchAll).not.toHaveBeenCalled();
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
      chartLoading: false,
      chartUnavailable: true,
      hasUsableData: false,
      dailyTrainingPathPoints: [],
      trainingPath: { input: expect.objectContaining({ timeline: [], fitnessHistory: [] }) },
    });
    expect(mockDailyTssUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: "UTC",
        start_date: "1970-01-01",
        end_date: "1970-01-01",
      }),
      expect.objectContaining({ enabled: false }),
    );
    expect(mockGroupEventsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAfter: "1970-01-01T00:00:00.000Z",
        startsBefore: "1970-01-01T00:00:00.000Z",
      }),
      expect.objectContaining({ enabled: false }),
    );
    const queryOptions = mockEventsListUseQuery.mock.calls[0]?.[1] as {
      getNextPageParam: (lastPage: unknown) => unknown;
    };
    expect(queryOptions.getNextPageParam(null)).toBeUndefined();
  });

  it("stays loading while the profile timezone is still being resolved", () => {
    mockPlanningTimezone = null;
    mockProfileLoading = true;

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(result.current).toMatchObject({
      planningTimezoneState: "loading",
      chartLoading: true,
      chartUnavailable: false,
      queryFailureCount: 0,
    });
  });

  it("retries the profile that supplies planning timezone boundaries", async () => {
    mockPlanningTimezone = null;
    const { result, rerender } = renderHook(() => usePlanTrainingPathData());

    expect(result.current.chartUnavailable).toBe(true);

    await act(async () => result.current.handleRefresh());
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);

    mockPlanningTimezone = "America/Los_Angeles";
    rerender({});
    expect(result.current.planningTimezoneState).toBe("ready");
    expect(result.current.chartUnavailable).toBe(false);
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
