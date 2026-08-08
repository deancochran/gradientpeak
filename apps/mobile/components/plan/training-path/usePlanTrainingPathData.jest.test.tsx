import { act, renderHook } from "@testing-library/react-native";

const mockProjectionRefetch = jest.fn(async () => undefined);
const mockRefreshProfile = jest.fn(async () => undefined);
const mockProjectionUseQuery = jest.fn();
let mockPlanningTimezone: string | null = "America/Los_Angeles";
let mockProfileLoading = false;

const load = {
  plannedLoad: 70,
  scheduledLoad: 60,
  tentativeScheduledLoad: 0,
  completedLoad: 35,
  remainingLoad: 25,
  recommendedLoad: 70,
  deltaLoad: -10,
};

const projection = {
  contractVersion: "plan-tab-projection-v1",
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
      completedLoad: 35,
      remainingLoad: 25,
      tentativeLoad: 0,
      hasUnavailableCompletedLoad: false,
      recommendedLoadStatus: "complete",
      recommendedLoad: 70,
    },
  },
  fitness: {
    actual: [{ date: "2026-04-06", longTermLoad: 40, recentLoad: 50, loadBalance: -10 }],
    scheduled: [{ date: "2026-04-06", longTermLoad: 41, recentLoad: 52, loadBalance: -11 }],
    recommended: [{ date: "2026-04-06", longTermLoad: 42, recentLoad: 53, loadBalance: -11 }],
  },
  recommendationPoints: [{ date: "2026-04-06", status: "complete", load: 70 }],
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
  getTrainingPathTodayKey: () => (mockPlanningTimezone ? "2026-04-06" : null),
  millisecondsUntilNextTrainingPathDay: () => 60_000,
}));
jest.mock("./useScrollableTrainingPathWindow", () => ({
  useScrollableTrainingPathWindow: () => ({
    resolvedWeekWindow: { start: "2026-03-30", end: "2026-04-12" },
    extendWindowEnd: jest.fn(),
    extendWindowStart: jest.fn(),
    resetWindow: jest.fn(),
  }),
}));

import { usePlanTrainingPathData } from "./usePlanTrainingPathData";

describe("usePlanTrainingPathData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanningTimezone = "America/Los_Angeles";
    mockProfileLoading = false;
    mockProjectionUseQuery.mockImplementation(() => queryResult());
  });

  it("loads the entire Plan tab through one bounded server projection", () => {
    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(mockProjectionUseQuery).toHaveBeenCalledTimes(1);
    expect(mockProjectionUseQuery).toHaveBeenCalledWith(
      { startDate: "2026-02-21", endDate: "2026-05-20" },
      expect.objectContaining({ enabled: true, placeholderData: expect.any(Function) }),
    );
    expect(result.current.queryFailureCount).toBe(0);
    expect(result.current.hasUsableData).toBe(true);
  });

  it("maps server-owned load, goals, scheduled items, and completions without source queries", () => {
    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(result.current.dailyTrainingPathPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-06",
          completedLoad: 35,
          effectiveLoad: 60,
          effectiveIntensity: 0.8,
          recommendedLoad: 70,
          scheduledFitnessCtl: 41,
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

  it("moves the bounded projection around the selected day", () => {
    const { result } = renderHook(() => usePlanTrainingPathData());

    act(() => result.current.handleSelectedDateChange("2026-08-01"));

    expect(mockProjectionUseQuery).toHaveBeenLastCalledWith(
      { startDate: "2026-06-18", endDate: "2026-09-14" },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("disables the projection and abstains when planning timezone is unavailable", () => {
    mockPlanningTimezone = null;

    const { result } = renderHook(() => usePlanTrainingPathData());

    expect(mockProjectionUseQuery).toHaveBeenCalledWith(
      { startDate: "1970-01-01", endDate: "1970-01-01" },
      expect.objectContaining({ enabled: false }),
    );
    expect(result.current).toMatchObject({
      planningTimezoneState: "unavailable",
      chartUnavailable: true,
      chartLoading: false,
      dailyTrainingPathPoints: [],
    });
  });

  it("refreshes only the projection and profile readiness source", async () => {
    const { result } = renderHook(() => usePlanTrainingPathData());

    await act(async () => result.current.handleRefresh());

    expect(mockProjectionRefetch).toHaveBeenCalledTimes(1);
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  });
});
