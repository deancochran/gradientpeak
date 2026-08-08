import { act, renderHook } from "@testing-library/react-native";

const refetch = jest.fn(async () => ({}));
const queries = {
  plan: jest.fn((_input?: unknown, _options?: unknown) => ({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Base plan",
      description: null,
      content_visibility: "private",
      created_at: "2026-08-01T00:00:00.000Z",
      structure_hash: `v1:sha256:${"1".repeat(64)}`,
      structure: {
        id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        sessions: [
          {
            offset_days: 0,
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch,
  })),
  profile: jest.fn((_input?: unknown, _options?: unknown) => ({
    data: { id: "profile-1" },
    refetch,
  })),
  published: jest.fn((_input?: unknown, _options?: unknown) => ({
    data: {
      publishedRevision: 7,
      asOf: "2026-08-01T00:00:00.000Z",
      currentBaseline: {
        currentPlanningDate: "2026-08-01",
        baseline: {
          asOf: "2026-08-01T00:00:00.000Z",
          longTermLoad: 42,
          recentLoad: 35,
          loadBalance: 7,
        },
      },
      loadHistory: {
        result: {
          status: "available",
          points: [
            {
              date: "2026-08-01",
              dailyLoad: 10,
              longTermLoad: 42,
              recentLoad: 35,
              loadBalance: 7,
            },
          ],
        },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch,
  })),
  history: jest.fn((_input?: unknown, _options?: unknown) => ({
    data: {
      status: "available",
      points: [
        { date: "2026-08-01", dailyLoad: 10, longTermLoad: 42, recentLoad: 35, loadBalance: 7 },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch,
  })),
  projection: jest.fn((_input?: unknown, _options?: unknown) => ({
    data: {
      status: "available",
      simulation: {
        simulatedAt: "2026-08-02T23:59:59.000Z",
        projectedState: { longTermLoad: 44 },
        transitions: [
          {
            state: {
              asOf: "2026-08-02T23:59:59.000Z",
              longTermLoad: 44,
              recentLoad: 38,
              loadBalance: 6,
            },
          },
        ],
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch,
  })),
};

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    profiles: {
      get: { useQuery: (input: unknown, options: unknown) => queries.profile(input, options) },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: (input: unknown, options: unknown) => queries.published(input, options),
      },
    },
    activities: {
      commonLoadHistory: {
        useQuery: (input: unknown, options: unknown) => queries.history(input, options),
      },
    },
    trainingPlans: {
      get: { useQuery: (input: unknown, options: unknown) => queries.plan(input, options) },
      preview: {
        useQuery: (input: unknown, options: unknown) => queries.projection(input, options),
      },
    },
  },
}));

jest.mock("../useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({ goals: [] }),
}));

jest.mock("../useProfileSettings", () => ({
  __esModule: true,
  useProfileSettings: () => ({ settings: {}, refetch }),
}));

import { useTrainingPlanSnapshot } from "../useTrainingPlanSnapshot";

describe("useTrainingPlanSnapshot", () => {
  beforeEach(() => {
    refetch.mockClear();
    Object.values(queries).forEach((query) => query.mockClear());
  });

  it("adapts canonical history and authoritative projection data", () => {
    const { result } = renderHook(() =>
      useTrainingPlanSnapshot({ planId: "11111111-1111-4111-8111-111111111111" }),
    );

    expect(result.current.actualCurveData?.dataPoints[0]).toMatchObject({
      date: "2026-08-01",
      longTermLoad: 42,
    });
    expect(result.current.idealCurveData).toMatchObject({
      startCTL: 42,
      targetCTL: 44,
      targetDate: "2026-08-02",
    });
    expect(queries.projection).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "create",
        draft: expect.objectContaining({ name: "Base plan", previewStartDate: "2026-08-01" }),
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("refreshes every current snapshot dependency", async () => {
    const { result } = renderHook(() => useTrainingPlanSnapshot());
    await act(async () => result.current.refetchAll());
    expect(refetch).toHaveBeenCalled();
  });
});
