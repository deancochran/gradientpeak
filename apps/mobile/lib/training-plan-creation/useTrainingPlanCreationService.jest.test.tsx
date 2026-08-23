import { simulateTrainingPlan } from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";
import { createDefaultTrainingPlanBuilderState } from "./defaults";

const mockPreviewQuery: {
  data: unknown;
  error: Error | null;
  isFetching: boolean;
  isLoading: boolean;
} = {
  data: undefined,
  error: null,
  isFetching: false,
  isLoading: false,
};

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      trainingPlans: { invalidate: jest.fn() },
    }),
    trainingPlans: {
      preview: { useQuery: () => mockPreviewQuery },
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
      data: { dob: null, gender: null, preferred_units: "metric", planning_timezone: "UTC" },
      isError: false,
      isLoading: false,
    },
    creationContextQuery: {
      data: undefined as ReturnType<typeof creationContext> | undefined,
    },
    profileGoalsQuery: { data: undefined },
    activityPlansQuery: { data: { pages: [] as never[] } },
    editPlanQuery: { data: undefined, isLoading: false, refetch: jest.fn() },
    linkedActivityPlansQuery: {
      data: undefined,
      error: null,
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    },
    publishedStateQuery: {
      data: projectionBaseline(null, 0, 0),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    },
    commitPlanMutation: { isPending: false, mutateAsync: jest.fn() },
  };
}

function creationContext(asOf: string, planningThresholdPowerWatts = 250) {
  const initial = createDefaultTrainingPlanBuilderState().athleteContext;
  const planningContext = {
    ...initial,
    physiology: {
      ...initial.physiology,
      planningThresholdPowerWatts: {
        ...initial.physiology.planningThresholdPowerWatts,
        value: planningThresholdPowerWatts,
        source: "profile" as const,
      },
    },
    performanceTargets: createPerformanceTargets(asOf, planningThresholdPowerWatts),
  };
  return {
    asOf,
    publishedState: { publishedAt: asOf },
    currentBaseline: {
      baseline: null,
      planningContext,
      planningTimezone: "UTC",
    },
  };
}

function createPerformanceTargets(asOf: string, planningThresholdPowerWatts = 250) {
  return buildPerformanceTargetFactsFixture({
    asOf,
    bikeThresholdWatts: planningThresholdPowerWatts,
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
    const hook = await renderHook(() => useTrainingPlanCreationService());

    await waitFor(() => {
      expect(
        hook.result.current.state.athleteContext.physiology.planningThresholdPowerWatts.value,
      ).toBeNull();
    });

    mockQueries = {
      ...mockQueries,
      creationContextQuery: {
        data: creationContext("2026-06-01T00:00:01.000Z"),
      },
    };
    await hook.rerender({});

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
      creationContextQuery: {
        data: {
          ...creationContext("2026-06-01T00:00:01.000Z"),
          currentBaseline: {
            ...creationContext("2026-06-01T00:00:01.000Z").currentBaseline,
            planningContext: {
              ...creationContext("2026-06-01T00:00:01.000Z").currentBaseline.planningContext,
              performanceTargets: firstTargets,
            },
          },
        },
      },
    };
    const hook = await renderHook(() => useTrainingPlanCreationService());

    await waitFor(() => {
      expect(
        hook.result.current.state.athleteContext.physiology.planningThresholdPowerWatts.value,
      ).toBe(250);
    });
    await act(() => {
      hook.result.current.actions.overrideAthleteContextField({
        key: "weightKg",
        value: 81,
        unit: "kg",
      });
    });
    expect(hook.result.current.state.athleteContext.body.weightKg.value).toBe(81);

    mockQueries = {
      ...mockQueries,
      creationContextQuery: {
        data: creationContext("2026-06-01T00:00:02.000Z"),
      },
    };
    await hook.rerender({});

    expect(hook.result.current.state.athleteContext.body.weightKg.value).toBe(81);
    expect(hook.result.current.state.athleteContext.performanceTargets.asOf).toBe(
      "2026-06-01T00:00:02.000Z",
    );
  });
});

describe("useTrainingPlanCreationService authoritative projection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueries = createQueryState();
    mockQueries.creationContextQuery.data = creationContext("2026-06-01T00:00:01.000Z");
    mockQueries.publishedStateQuery.data = projectionBaseline(4, 40, 30);
    mockPreviewQuery.data = canonicalPreview(4, 40, 30);
    mockPreviewQuery.error = null;
  });

  it("uses the authoritative server preview for the canonical draft", async () => {
    const hook = await renderHook(() => useTrainingPlanCreationService());

    await act(() => {
      hook.result.current.actions.updateDetails({ name: "Projected plan" });
      const session = hook.result.current.actions.addSession(1);
      hook.result.current.actions.assignActivityPlan(session.localId, projectedActivityPlan());
    });

    await waitFor(() => {
      expect(hook.result.current.derived.authoritativeProjectionState.status).toBe("available");
    });
    const projection = hook.result.current.derived.authoritativeProjectionState;
    if (projection.status !== "available") throw new Error("Expected available projection");
    expect(projection.simulation.projectedState.recentLoad).not.toBe(30);
    expect(projection.simulation.projectedState.stateRevision).toBe(4);
  });

  it("refuses to commit without a current authoritative preview", async () => {
    mockPreviewQuery.data = undefined;
    const hook = await renderHook(() => useTrainingPlanCreationService());

    await waitFor(() => expect(hook.result.current.derived.savePlan.canSave).toBe(false));
    await act(async () => hook.result.current.derived.savePlan.execute());

    expect(mockQueries.commitPlanMutation.mutateAsync).not.toHaveBeenCalled();
    expect(hook.result.current.derived.projectionConflict).toContain(
      "authoritative preview before saving",
    );
  });

  it("preserves the draft and re-simulates after a typed stale save", async () => {
    mockQueries.commitPlanMutation.mutateAsync.mockResolvedValue({
      status: "stale",
      reason: "state_revision",
      currentPublishedRevision: 5,
      currentPlanRevision: null,
      currentPlanStructureHash: null,
    });
    const onCreated = jest.fn();
    const hook = await renderHook(() => useTrainingPlanCreationService({ onCreated }));

    await act(() => {
      hook.result.current.actions.updateDetails({ name: "Draft retained" });
      const session = hook.result.current.actions.addSession(1);
      hook.result.current.actions.assignActivityPlan(session.localId, projectedActivityPlan());
    });
    await waitFor(() => expect(hook.result.current.derived.savePlan.canSave).toBe(true));
    await act(async () => hook.result.current.derived.savePlan.execute());

    expect(mockQueries.commitPlanMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "create",
        basePublishedRevision: 4,
        draft: expect.objectContaining({ name: "Draft retained" }),
      }),
    );
    expect(mockQueries.commitPlanMutation.mutateAsync.mock.calls[0]?.[0]).not.toHaveProperty(
      "plannedSessions",
    );
    expect(hook.result.current.state.details.name).toBe("Draft retained");
    expect(hook.result.current.state.structure.sessions).toHaveLength(1);
    expect(hook.result.current.derived.projectionConflict).toContain("draft was preserved");
    expect(mockQueries.publishedStateQuery.refetch).toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();

    mockQueries = {
      ...mockQueries,
      publishedStateQuery: {
        ...mockQueries.publishedStateQuery,
        data: projectionBaseline(5, 55, 45),
      },
    };
    mockPreviewQuery.data = canonicalPreview(5, 55, 45);
    await hook.rerender({});
    await waitFor(() => {
      const projection = hook.result.current.derived.authoritativeProjectionState;
      expect(projection.status).toBe("available");
      if (projection.status === "available")
        expect(projection.simulation.baseStateRevision).toBe(5);
    });
    expect(hook.result.current.state.details.name).toBe("Draft retained");
  });
});

function canonicalPreview(revision: number, longTermLoad: number, recentLoad: number) {
  const published = projectionBaseline(revision, longTermLoad, recentLoad);
  const baseline = published.currentBaseline.baseline;
  if (!baseline) throw new Error("Expected a published baseline");
  return {
    status: "available" as const,
    simulation: simulateTrainingPlan({
      baseline,
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "plan:sessions.0",
          scheduledAt: "2026-08-02T00:00:00.000Z",
          activityCategory: "run",
          commonLoad: 80,
        },
      ],
      simulationAt: "2026-08-02T00:00:00.000Z",
      planningTimezone: "UTC",
      goal: null,
    }),
  };
}

function projectionBaseline(revision: number | null, longTermLoad: number, recentLoad: number) {
  const baseline =
    revision === null
      ? null
      : {
          contractVersion: "athlete-state-projection-v1" as const,
          athleteId: "44444444-4444-4444-8444-444444444444",
          stateRevision: revision,
          asOf: "2026-08-01T00:00:00.000Z",
          longTermLoad,
          recentLoad,
          loadBalance: longTermLoad - recentLoad,
          evidenceConfidence: 0.8,
          capabilities: [],
          athleteAgeYears: 35,
        };
  return {
    publishedRevision: revision,
    status: {
      freshness: revision === null ? ("unavailable" as const) : ("fresh" as const),
      rebuildStatus: revision === null ? ("unavailable" as const) : ("fresh" as const),
      importStatus: "complete" as const,
    },
    currentBaseline: { baseline, planningContext: null, planningTimezone: "UTC" },
  };
}

function projectedActivityPlan() {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Tempo run",
    published: true,
    accessible: true,
    prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
      activityCategory: "run",
      durationSeconds: 3_600,
      id: "22222222-2222-4222-8222-222222222222",
      load: 80,
    }),
  };
}
