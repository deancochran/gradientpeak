import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockPreviewQuery = {
  data: undefined,
  error: null,
  isFetching: false,
  isLoading: false,
};

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      previewCreationConfig: { useQuery: () => mockPreviewQuery },
    },
  },
}));

jest.mock("@/lib/hooks/useDebouncedValue", () => ({
  __esModule: true,
  useDebouncedValue: (value: unknown) => value,
}));

jest.mock("./goalCreationHandoff", () => ({
  __esModule: true,
  subscribeToTrainingPlanGoalCreation: () => () => undefined,
}));

let mockQueries: ReturnType<typeof createQueryState>;
const mockUseTrainingPlanCreationQueries = jest.fn(() => mockQueries);

jest.mock("./useTrainingPlanCreationQueries", () => ({
  __esModule: true,
  useTrainingPlanCreationQueries: () => mockUseTrainingPlanCreationQueries(),
}));

function createQueryState() {
  return {
    profileQuery: {
      data: { dob: null, gender: null, preferred_units: "metric" },
    },
    performanceTargetsQuery: {
      data: undefined as ReturnType<typeof createPerformanceTargets> | undefined,
      isError: true,
    },
    profileMetricsQuery: { data: { items: [] as never[] } },
    activityEffortsQuery: { data: [] as never[] },
    currentTrainingStatusQuery: {
      data: { asOf: "2026-06-01T00:00:00.000Z", currentLoadStatus: null },
      isLoading: false,
    },
    profileGoalsQuery: { data: undefined },
    activityPlansQuery: { data: { pages: [] as never[] } },
    editPlanQuery: { data: undefined, isLoading: false, refetch: jest.fn() },
    linkedActivityPlansQuery: { data: undefined, isLoading: false },
    createPlanMutation: { isPending: false, mutateAsync: jest.fn() },
    updatePlanMutation: { isPending: false, mutateAsync: jest.fn() },
  };
}

function createPerformanceTargets(asOf: string, planningThresholdPowerWatts = 250) {
  return buildPerformanceTargetFactsFixture({
    asOf,
    planningThresholdPowerWatts,
  });
}

const { useTrainingPlanCreationService } =
  require("./useTrainingPlanCreationService") as typeof import("./useTrainingPlanCreationService");

describe("useTrainingPlanCreationService performance target hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueries = createQueryState();
  });

  it("replaces the fail-closed fallback when the canonical query recovers", async () => {
    const hook = renderHook(() => useTrainingPlanCreationService());

    await waitFor(() => {
      expect(
        hook.result.current.state.athleteContext.physiology.planningThresholdPowerWatts.value,
      ).toBeNull();
    });

    mockQueries = {
      ...mockQueries,
      performanceTargetsQuery: {
        data: createPerformanceTargets("2026-06-01T00:00:01.000Z"),
        isError: false,
      },
    };
    hook.rerender({});

    await waitFor(() => {
      expect(
        hook.result.current.state.athleteContext.physiology.planningThresholdPowerWatts.value,
      ).toBe(250);
    });
  });

  it("preserves a local context override across ordinary canonical refetches", async () => {
    const firstTargets = createPerformanceTargets("2026-06-01T00:00:01.000Z");
    mockQueries = {
      ...mockQueries,
      performanceTargetsQuery: { data: firstTargets, isError: false },
    };
    const hook = renderHook(() => useTrainingPlanCreationService());

    await waitFor(() => {
      expect(
        hook.result.current.state.athleteContext.physiology.planningThresholdPowerWatts.value,
      ).toBe(250);
    });
    act(() => {
      hook.result.current.actions.overrideAthleteContextField({
        key: "weightKg",
        value: 81,
        unit: "kg",
      });
    });
    expect(hook.result.current.state.athleteContext.body.weightKg.value).toBe(81);

    mockQueries = {
      ...mockQueries,
      performanceTargetsQuery: {
        data: createPerformanceTargets("2026-06-01T00:00:02.000Z"),
        isError: false,
      },
    };
    hook.rerender({});

    expect(hook.result.current.state.athleteContext.body.weightKg.value).toBe(81);
    expect(hook.result.current.state.athleteContext.performanceTargets.asOf).toBe(
      firstTargets.asOf,
    );
  });
});
