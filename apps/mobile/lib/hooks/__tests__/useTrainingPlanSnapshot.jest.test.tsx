import { act, renderHook } from "@testing-library/react-native";

const refetchPlan = jest.fn(async () => ({}));
const refetchStatus = jest.fn(async () => ({}));
const refetchInsightTimeline = jest.fn(async () => ({}));
const refetchActualCurve = jest.fn(async () => ({}));
const refetchIdealCurve = jest.fn(async () => ({}));
const refetchWeeklySummary = jest.fn(async () => ({}));

const snapshotMocks = {
  refetchPlan,
  refetchStatus,
  refetchInsightTimeline,
  refetchActualCurve,
  refetchIdealCurve,
  refetchWeeklySummary,
  getPlanQuery: jest.fn(() => ({
    data: {
      id: "plan-123",
      name: "Plan 123",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchPlan,
  })) as jest.Mock,
  getStatusQuery: jest.fn(() => ({
    data: { ctl: 44 },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchStatus,
  })) as jest.Mock,
  getInsightTimelineQuery: jest.fn(() => ({
    data: { timeline: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchInsightTimeline,
  })) as jest.Mock,
  getActualCurveQuery: jest.fn(() => ({
    data: { dataPoints: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchActualCurve,
  })) as jest.Mock,
  getIdealCurveQuery: jest.fn(() => ({
    data: { dataPoints: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchIdealCurve,
  })) as jest.Mock,
  getWeeklySummaryQuery: jest.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchWeeklySummary,
  })) as jest.Mock,
};

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      get: { useQuery: (...args: any[]) => snapshotMocks.getPlanQuery(...args) },
      getCurrentStatus: {
        useQuery: (...args: any[]) => snapshotMocks.getStatusQuery(...args),
      },
      getInsightTimeline: {
        useQuery: (...args: any[]) => snapshotMocks.getInsightTimelineQuery(...args),
      },
      getActualCurve: {
        useQuery: (...args: any[]) => snapshotMocks.getActualCurveQuery(...args),
      },
      getIdealCurve: {
        useQuery: (...args: any[]) => snapshotMocks.getIdealCurveQuery(...args),
      },
      getWeeklySummary: {
        useQuery: (...args: any[]) => snapshotMocks.getWeeklySummaryQuery(...args),
      },
    },
  },
}));

jest.mock("../useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({ goals: [], goalsCount: 0, profileId: null, refetch: jest.fn() }),
}));

jest.mock("../useProfileSettings", () => ({
  __esModule: true,
  useProfileSettings: () => ({
    settings: {
      availability_config: { days: [] },
      behavior_controls_v1: { aggressiveness: 0.5, recovery_priority: 0.5, variability: 0.5 },
      constraints: { hard_rest_days: [] },
      locks: { volume_by_day: false, intensity_distribution: false },
      post_goal_recovery_days: 5,
      microcycle_pattern: { hard_days: [], medium_days: [], easy_days: [] },
      progression_preferences: { weekly_progression_cap: 0.08 },
      diagnostics: { include_readiness_codes: true },
    },
    settingsRecord: null,
    refetch: jest.fn(),
  }),
}));

import { useTrainingPlanSnapshot } from "../useTrainingPlanSnapshot";

describe("useTrainingPlanSnapshot", () => {
  beforeEach(() => {
    Object.values(snapshotMocks).forEach((value) => {
      if (typeof value === "function" && "mockClear" in value) {
        (value as jest.Mock).mockClear();
      }
    });
  });

  it("can disable status and weekly-summary queries for lighter route entry", async () => {
    const { result } = renderHook(() =>
      useTrainingPlanSnapshot({
        planId: "plan-123",
        includeStatus: false,
        includeWeeklySummaries: false,
      }),
    );

    expect(snapshotMocks.getPlanQuery).toHaveBeenCalledWith(
      { id: "plan-123" },
      expect.not.objectContaining({
        staleTime: expect.anything(),
        refetchOnMount: expect.anything(),
      }),
    );

    expect(snapshotMocks.getStatusQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    );

    expect(snapshotMocks.getWeeklySummaryQuery).toHaveBeenCalledWith(
      expect.objectContaining({ training_plan_id: "plan-123" }),
      expect.objectContaining({ enabled: false }),
    );

    await act(async () => {
      await result.current.refetch();
    });
    expect(snapshotMocks.refetchPlan).toHaveBeenCalledTimes(1);
    expect(snapshotMocks.refetchStatus).toHaveBeenCalledTimes(0);
    expect(snapshotMocks.refetchInsightTimeline).toHaveBeenCalledTimes(0);

    await act(async () => {
      await result.current.refetchAll();
    });
    expect(snapshotMocks.refetchPlan).toHaveBeenCalledTimes(2);
    expect(snapshotMocks.refetchStatus).toHaveBeenCalledTimes(0);
    expect(snapshotMocks.refetchInsightTimeline).toHaveBeenCalledTimes(1);
    expect(snapshotMocks.refetchActualCurve).toHaveBeenCalledTimes(1);
    expect(snapshotMocks.refetchIdealCurve).toHaveBeenCalledTimes(1);
    expect(snapshotMocks.refetchWeeklySummary).toHaveBeenCalledTimes(0);
  });

  it("requests insight timeline with the active plan id and explicit window inputs", () => {
    renderHook(() =>
      useTrainingPlanSnapshot({
        planId: "plan-123",
        includeWeeklySummaries: false,
        insightWindow: {
          start_date: "2026-03-14",
          end_date: "2027-03-13",
        },
        timezone: "America/New_York",
      }),
    );

    expect(snapshotMocks.getInsightTimelineQuery).toHaveBeenCalledWith(
      {
        training_plan_id: "plan-123",
        start_date: "2026-03-14",
        end_date: "2027-03-13",
        timezone: "America/New_York",
      },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("requests insight timeline without a training plan id when no active plan exists", async () => {
    snapshotMocks.getPlanQuery.mockImplementationOnce(() => ({
      data: null as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: snapshotMocks.refetchPlan,
    }));
    snapshotMocks.getInsightTimelineQuery.mockClear();
    snapshotMocks.refetchInsightTimeline.mockClear();

    const { result } = renderHook(() => useTrainingPlanSnapshot({}));

    expect(snapshotMocks.getInsightTimelineQuery).toHaveBeenCalledWith(
      expect.not.objectContaining({ training_plan_id: expect.anything() }),
      expect.objectContaining({ enabled: true }),
    );

    await act(async () => {
      await result.current.refetchAll();
    });

    expect(snapshotMocks.refetchInsightTimeline).toHaveBeenCalledTimes(1);
  });
});
