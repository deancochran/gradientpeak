import { renderHook } from "@testing-library/react-native";

const queryResult = {
  data: { items: [] },
  dataUpdatedAt: 0,
  isLoading: false,
  refetch: jest.fn(async () => undefined),
};

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
    events: { list: { useQuery: () => queryResult } },
    groups: {
      events: { myUpcomingGroupEvents: { useQuery: () => queryResult } },
    },
    activityPlans: { getManyByIds: { useQuery: () => queryResult } },
    activities: {
      listPaginated: {
        useInfiniteQuery: () => ({
          ...queryResult,
          data: { pages: [{ items: [] }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
        }),
      },
    },
  },
}));

jest.mock("@/lib/auth/auth-headers", () => ({ hasSessionAuthCredentials: () => true }));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ profile: null, user: null }) }));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { ready: boolean; session: object }) => unknown) =>
    selector({ ready: true, session: {} }),
}));
jest.mock("@/lib/hooks/useProfileGoals", () => ({
  useProfileGoals: () => ({ goals: [], dataUpdatedAt: 0, refetch: jest.fn() }),
}));
jest.mock("@/lib/hooks/useProfileSettings", () => ({
  useProfileSettings: () => ({ settings: {}, isLoading: false }),
}));
jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  useTrainingPlanSnapshot: jest.fn(),
}));
jest.mock("../usePlanDashboardViewModel", () => ({
  usePlanDashboardViewModel: jest.fn(),
}));
jest.mock("@/lib/training-plan-form/projectionPreview", () => ({
  buildTrainingPreferencesLoadTimeline: jest.fn(),
  buildTrainingPreferencesProjectionPreview: () => ({
    previewIdealCurve: [],
    projectionChart: { dataPoints: [] },
  }),
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
  buildScheduledFitnessTrend: () => [],
  getWeekStartDateKey: (date: string) => date,
}));
jest.mock("@/lib/training-path/trainingTimelineAdapters", () => ({
  buildDailyTrainingAdjustmentPointsFromTimelineWindow: () => [],
}));
jest.mock("@repo/core/training-timeline", () => ({
  buildTrainingTimelineWindowFromLoadTimeline: () => ({ days: [] }),
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

describe("usePlanTrainingPathData", () => {
  beforeEach(() => {
    mockUseTrainingPlanSnapshot.mockClear();
    mockUsePlanDashboardViewModel.mockClear();
    mockBuildTrainingPreferencesLoadTimeline.mockClear();
    mockUseTrainingPlanSnapshot.mockReturnValue(snapshot);
    mockUsePlanDashboardViewModel.mockImplementation(
      ({ snapshot: dashboardSnapshot }: { snapshot: typeof snapshot }) => ({
        fitnessHistory: dashboardSnapshot.actualCurveData.dataPoints,
        goalMarkers: [],
        idealFitnessCurve: dashboardSnapshot.idealCurveData.dataPoints,
      }),
    );
    mockBuildTrainingPreferencesLoadTimeline.mockReturnValue([
      { date: "2026-04-01", actualLoad: 50, plannedLoad: 60 },
    ]);
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
});
