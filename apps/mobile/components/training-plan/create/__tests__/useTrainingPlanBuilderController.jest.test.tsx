import type { ActivityPlanSummary, AthletePerformanceTargetFacts } from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";
import { createActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import { useTrainingPlanBuilderController } from "../useTrainingPlanBuilderController";

const mockBuilder = {
  actions: {
    addProposedStructure: jest.fn(),
    addSession: jest.fn(),
    assignActivityPlan: jest.fn(),
    getSessionById: jest.fn<TrainingPlanBuilderSession | null, [string]>(() => null),
    updateSession: jest.fn(),
    removeSession: jest.fn(),
  },
  activityPlanEstimateById: new Map(),
  activityPlanItems: [] as ActivityPlanSummary[],
  linkedActivityPlansQuery: { data: undefined },
  queries: {
    publishedState: {
      data: undefined as
        | { publishedState: { performanceTargets: AthletePerformanceTargetFacts } }
        | undefined,
    },
  },
  derived: {
    backendPlanningPreview: {
      data: null,
      isEnabled: false,
      isFetching: false,
      isStaleInput: false,
      error: null,
    },
    projection: {
      chart: {
        dailyPoints: [{ date: "2026-01-05" }],
        weeks: [
          {
            weekStart: "2026-01-05",
            weekEnd: "2026-01-11",
            label: "Week 1",
            isSelected: true,
          },
        ],
      },
    },
    savePlan: {
      blockers: [],
      canSave: true,
      execute: jest.fn(),
      isPending: false,
      label: "Create",
    },
    summary: { durationDays: 7, sessionCount: 1 },
  },
  state: {
    scheduling: { startDate: "2026-01-05" },
    selection: { type: "overview" },
    structure: { sessions: [] as TrainingPlanBuilderSession[] },
  },
};

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: string) => value }));
jest.mock("@/components/training-plan/create/useBuilderSheetStack", () => ({
  useBuilderSheetStack: () => ({ closeSheet: jest.fn(), openSheet: jest.fn() }),
}));
jest.mock("@/lib/training-plan-creation/useTrainingPlanCreationService", () => ({
  useTrainingPlanCreationService: () => mockBuilder,
}));

describe("useTrainingPlanBuilderController chart selection", () => {
  it("uses the signed-in athlete facts for picker, session metrics, and immediate schedule load", async () => {
    const plan = createActivityPlanSummary({
      activityCategory: "bike",
      structure: {
        version: 5,
        activity_category: "bike",
        items: [
          {
            type: "step",
            id: "00000000-0000-4000-8000-000000000001",
            duration: { type: "time", seconds: 3600 },
            targets: [{ type: "watts", intensity: 200 }],
          },
        ],
      },
    });
    const originalMetrics = JSON.stringify(plan.metrics);
    mockBuilder.activityPlanItems = [plan];
    mockBuilder.queries.publishedState.data = {
      publishedState: {
        performanceTargets: buildPerformanceTargetFactsFixture({
          asOf: "2026-01-05T00:00:00Z",
          bikeThresholdWatts: 250,
        }),
      },
    };
    const session: TrainingPlanBuilderSession = {
      id: "one",
      localId: "one",
      offsetDays: 0,
      activityPlan: {
        id: plan.id,
        name: plan.name,
        published: true,
        accessible: true,
        prescriptionQuantification: null,
      },
      demand: {
        activity_category: "bike",
        training_intent: "aerobic_base",
        importance: "normal",
        target_common_load: null,
        target_duration_minutes: null,
      },
    };
    mockBuilder.state.structure.sessions = [session];
    const { result, rerender } = await renderHook(() =>
      useTrainingPlanBuilderController({ mode: "create" }),
    );
    const metric = (key: string) =>
      result.current.activityPicker.metricsById.get(plan.id)?.find((value) => value.key === key)
        ?.value;
    const load = metric("common_load");
    expect(load).toBeGreaterThan(0);
    expect(metric("objective_intensity")).toBeGreaterThan(0);
    expect(result.current.creationChart.chartProps.dailyPoints[0]?.plannedLoad).toBe(load);
    expect(
      result.current.creationChart.sessionMetricsById
        .get("one")
        ?.find((value) => value.key === "common_load")?.value,
    ).toBe(load);
    mockBuilder.activityPlanItems = [];
    mockBuilder.queries.publishedState.data = {
      publishedState: {
        performanceTargets: buildPerformanceTargetFactsFixture({
          asOf: "2026-01-05T01:00:00Z",
          bikeThresholdWatts: 500,
        }),
      },
    };
    await rerender({});
    expect(metric("common_load")).toBeLessThan(load as number);
    expect(result.current.creationChart.chartProps.dailyPoints[0]?.plannedLoad).toBe(
      metric("common_load"),
    );
    mockBuilder.state.structure.sessions = [
      session,
      { ...session, id: "two", localId: "two", offsetDays: 7 },
    ];
    await rerender({});
    expect(result.current.creationChart.chartProps.dailyPoints[7]?.plannedLoad).toBe(
      metric("common_load"),
    );
    mockBuilder.state.structure.sessions = [];
    await rerender({});
    expect(result.current.creationChart.chartProps.dailyPoints[0]?.plannedLoad).toBe(0);
    expect(JSON.stringify(plan.metrics)).toBe(originalMetrics);
  });
  it("changes category from the prescription without replacing saved demand or schedule overrides", async () => {
    const existing: TrainingPlanBuilderSession = {
      id: "session-one",
      localId: "session-one",
      offsetDays: 10,
      activityPlan: null,
      demand: {
        activity_category: "bike",
        training_intent: "aerobic_base",
        importance: "key",
        target_duration_minutes: 75,
        target_common_load: 60,
      },
      eventOverrides: { title: "My session", start_time: "08:30" },
    };
    mockBuilder.actions.getSessionById.mockReturnValue(existing);
    const { result } = await renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));
    await act(() => result.current.selection.setSessionId(existing.localId));
    await act(() =>
      result.current.activityPicker.selectPlan(
        createActivityPlanSummary({ activityCategory: "run" }),
      ),
    );
    expect(mockBuilder.actions.updateSession).toHaveBeenCalledWith({
      ...existing,
      demand: { ...existing.demand, activity_category: "run" },
    });
    mockBuilder.actions.getSessionById.mockReturnValue(null);
  });
  it("checks new invalid text synchronously even through a previously captured save callback", async () => {
    const { result } = await renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));
    const save = result.current.actions.handleSave;
    await act(async () => {
      result.current.numericDrafts.setError("athlete:weight", "Correct Weight");
      await save();
    });
    expect(mockBuilder.derived.savePlan.execute).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuilder.activityPlanItems = [];
    mockBuilder.state.structure.sessions = [];
    mockBuilder.queries.publishedState.data = undefined;
  });

  it("keeps an immediately selected in-week date even when daily data is temporarily sparse", async () => {
    const { result } = await renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));

    await act(() => result.current.chartReview.selectDate("2026-01-06"));

    expect(result.current.chartReview.selectedDate).toBe("2026-01-06");
    expect(result.current.chartReview.selectedWeekStart).toBe("2026-01-05");
  });

  it("exposes a finite projection without inactive date-extension controls", async () => {
    const { result } = await renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));

    expect(result.current.chartReview.chart.weeks).toHaveLength(1);
    expect(result.current.chartReview.chart.dailyPoints).toHaveLength(1);
    expect(result.current.chartReview).not.toHaveProperty("extendEnd");
    expect(result.current.chartReview).not.toHaveProperty("extendStart");
  });

  it("does not remove a activity before destructive confirmation", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    const { result } = await renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));

    await act(() => result.current.actions.confirmRemoveSession("session-1"));

    expect(mockBuilder.actions.removeSession).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2];
    expect(buttons?.[0]).toMatchObject({ style: "cancel", text: "Cancel" });
    expect(buttons?.[1]).toMatchObject({ style: "destructive", text: "Remove" });

    await act(() => buttons?.[1]?.onPress?.());

    expect(mockBuilder.actions.removeSession).toHaveBeenCalledWith("session-1");
    alert.mockRestore();
  });

  it("blocks the parent save after a prior valid value becomes an invalid numeric draft", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    const { result } = await renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));

    await act(() =>
      result.current.numericDrafts.setError("session:one:planned-duration", "Invalid"),
    );
    expect(result.current.header.primaryDisabled).toBe(true);
    await act(() => result.current.actions.handleSave());
    expect(mockBuilder.derived.savePlan.execute).not.toHaveBeenCalled();

    await act(() => result.current.numericDrafts.setError("session:one:planned-duration", null));
    expect(result.current.header.primaryDisabled).toBe(false);
    await act(() => result.current.actions.handleSave());
    expect(mockBuilder.derived.savePlan.execute).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it("treats invalid numeric drafts as dirty and only clears the discarded session scope", async () => {
    const onDirtyChange = jest.fn();
    const { result } = await renderHook(() =>
      useTrainingPlanBuilderController({ mode: "create", onDirtyChange }),
    );

    await act(() =>
      result.current.numericDrafts.setError("session:one:planned-duration", "Invalid"),
    );
    await act(() =>
      result.current.numericDrafts.setError("session:two:planned-duration", "Invalid"),
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(result.current.numericDrafts.hasInvalidFor("session:one:")).toBe(true);

    await act(() => result.current.numericDrafts.clearErrors("session:one:"));
    expect(result.current.numericDrafts.hasInvalidFor("session:one:")).toBe(false);
    expect(result.current.numericDrafts.hasInvalidFor("session:two:")).toBe(true);
    expect(result.current.header.primaryDisabled).toBe(true);

    await act(() => result.current.numericDrafts.clearErrors("session:two:"));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
