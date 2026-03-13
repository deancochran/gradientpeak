import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { useTrainingPlanSnapshot } from "../useTrainingPlanSnapshot";

const {
  getPlanQuery,
  getStatusQuery,
  getInsightTimelineQuery,
  getActualCurveQuery,
  getIdealCurveQuery,
  getWeeklySummaryQuery,
  refetchPlan,
  refetchStatus,
  refetchInsightTimeline,
  refetchActualCurve,
  refetchIdealCurve,
  refetchWeeklySummary,
} = vi.hoisted(() => {
  const refetchPlan = vi.fn(async () => ({}));
  const refetchStatus = vi.fn(async () => ({}));
  const refetchInsightTimeline = vi.fn(async () => ({}));
  const refetchActualCurve = vi.fn(async () => ({}));
  const refetchIdealCurve = vi.fn(async () => ({}));
  const refetchWeeklySummary = vi.fn(async () => ({}));

  return {
    getPlanQuery: vi.fn(() => ({
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
    })),
    getStatusQuery: vi.fn(() => ({
      data: { ctl: 44 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchStatus,
    })),
    getInsightTimelineQuery: vi.fn(() => ({
      data: { timeline: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchInsightTimeline,
    })),
    getActualCurveQuery: vi.fn(() => ({
      data: { dataPoints: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchActualCurve,
    })),
    getIdealCurveQuery: vi.fn(() => ({
      data: { dataPoints: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchIdealCurve,
    })),
    getWeeklySummaryQuery: vi.fn(() => ({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchWeeklySummary,
    })),
    refetchPlan,
    refetchStatus,
    refetchInsightTimeline,
    refetchActualCurve,
    refetchIdealCurve,
    refetchWeeklySummary,
  };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    trainingPlans: {
      get: { useQuery: getPlanQuery },
      getCurrentStatus: { useQuery: getStatusQuery },
      getInsightTimeline: { useQuery: getInsightTimelineQuery },
      getActualCurve: { useQuery: getActualCurveQuery },
      getIdealCurve: { useQuery: getIdealCurveQuery },
      getWeeklySummary: { useQuery: getWeeklySummaryQuery },
    },
  },
}));

vi.mock("../useProfileGoals", () => ({
  useProfileGoals: () => ({
    goals: [],
    goalsCount: 0,
    profileId: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../useProfileSettings", () => ({
  useProfileSettings: () => ({
    settings: {
      availability_config: { days: [] },
      behavior_controls_v1: {
        aggressiveness: 0.5,
        recovery_priority: 0.5,
        variability: 0.5,
      },
      constraints: {
        hard_rest_days: [],
      },
      locks: {
        volume_by_day: false,
        intensity_distribution: false,
      },
      post_goal_recovery_days: 5,
      microcycle_pattern: {
        hard_days: [],
        medium_days: [],
        easy_days: [],
      },
      progression_preferences: {
        weekly_progression_cap: 0.08,
      },
      diagnostics: {
        include_readiness_codes: true,
      },
    },
    settingsRecord: null,
    refetch: vi.fn(),
  }),
}));

function HookProbe(props: {
  options: Parameters<typeof useTrainingPlanSnapshot>[0];
  onSnapshot: (snapshot: ReturnType<typeof useTrainingPlanSnapshot>) => void;
}) {
  const snapshot = useTrainingPlanSnapshot(props.options);

  useEffect(() => {
    props.onSnapshot(snapshot);
  }, [props.onSnapshot, snapshot]);

  return null;
}

describe("useTrainingPlanSnapshot", () => {
  it("uses deep-link plan id and exposes shared/all refetch helpers", async () => {
    getPlanQuery.mockClear();
    getStatusQuery.mockClear();
    getInsightTimelineQuery.mockClear();
    getActualCurveQuery.mockClear();
    getIdealCurveQuery.mockClear();
    getWeeklySummaryQuery.mockClear();
    refetchPlan.mockClear();
    refetchStatus.mockClear();
    refetchInsightTimeline.mockClear();
    refetchActualCurve.mockClear();
    refetchIdealCurve.mockClear();
    refetchWeeklySummary.mockClear();

    let latestSnapshot: ReturnType<typeof useTrainingPlanSnapshot> | undefined;

    await act(async () => {
      TestRenderer.create(
        <HookProbe
          options={{
            planId: "plan-123",
            includeWeeklySummaries: false,
          }}
          onSnapshot={(snapshot) => {
            latestSnapshot = snapshot;
          }}
        />,
      );
    });

    expect(getPlanQuery).toHaveBeenCalledWith(
      { id: "plan-123" },
      expect.objectContaining({
        staleTime: 0,
        refetchOnMount: "always",
      }),
    );

    expect(getWeeklySummaryQuery).toHaveBeenCalledWith(
      expect.objectContaining({ training_plan_id: "plan-123" }),
      expect.objectContaining({ enabled: false }),
    );

    expect(latestSnapshot).toBeDefined();

    await act(async () => {
      await latestSnapshot!.refetch();
    });
    expect(refetchPlan).toHaveBeenCalledTimes(1);
    expect(refetchStatus).toHaveBeenCalledTimes(1);
    expect(refetchInsightTimeline).toHaveBeenCalledTimes(0);

    await act(async () => {
      await latestSnapshot!.refetchAll();
    });
    expect(refetchPlan).toHaveBeenCalledTimes(2);
    expect(refetchStatus).toHaveBeenCalledTimes(2);
    expect(refetchInsightTimeline).toHaveBeenCalledTimes(1);
    expect(refetchActualCurve).toHaveBeenCalledTimes(1);
    expect(refetchIdealCurve).toHaveBeenCalledTimes(1);
    expect(refetchWeeklySummary).toHaveBeenCalledTimes(0);
  });

  it("requests insight timeline without a training plan id when no active plan exists", async () => {
    getPlanQuery.mockImplementationOnce(() => ({
      data: null as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchPlan,
    }));
    getInsightTimelineQuery.mockClear();
    refetchInsightTimeline.mockClear();

    let latestSnapshot: ReturnType<typeof useTrainingPlanSnapshot> | undefined;

    await act(async () => {
      TestRenderer.create(
        <HookProbe
          options={{}}
          onSnapshot={(snapshot) => {
            latestSnapshot = snapshot;
          }}
        />,
      );
    });

    expect(getInsightTimelineQuery).toHaveBeenCalledWith(
      expect.not.objectContaining({ training_plan_id: expect.anything() }),
      expect.objectContaining({
        enabled: true,
        staleTime: 0,
        refetchOnMount: "always",
      }),
    );

    await act(async () => {
      await latestSnapshot!.refetchAll();
    });

    expect(refetchInsightTimeline).toHaveBeenCalledTimes(1);
  });
});
