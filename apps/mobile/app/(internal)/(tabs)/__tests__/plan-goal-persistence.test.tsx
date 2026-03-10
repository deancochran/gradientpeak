import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import PlanScreenWithErrorBoundary from "../plan";

const { createGoalMutateAsync, createMilestoneEventMutateAsync, goalsFixture } =
  vi.hoisted(() => ({
    createGoalMutateAsync: vi.fn().mockResolvedValue({ id: "goal-new" }),
    createMilestoneEventMutateAsync: vi
      .fn()
      .mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }),
    goalsFixture: [] as any[],
  }));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@/components/shared", () => ({
  AppHeader: createHost("AppHeader"),
}));

vi.mock("@/components/goals", () => ({
  GoalEditorModal: createHost("GoalEditorModal"),
}));

vi.mock("@/components/charts/PlanVsActualChart", () => ({
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("lucide-react-native", () => ({
  Settings: createHost("Settings"),
}));

vi.mock("@/lib/hooks/useProfileGoals", () => ({
  useProfileGoals: () => ({
    profileId: "11111111-1111-4111-8111-111111111111",
    goals: goalsFixture,
    goalsCount: goalsFixture.length,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  useTrainingPlanSnapshot: () => ({
    idealCurveData: {
      startCTL: 40,
      targetCTL: 50,
      targetDate: "2026-08-01",
      dataPoints: [
        { date: "2026-04-01", ctl: 45 },
        { date: "2026-08-01", ctl: 55 },
      ],
    },
    insightTimeline: {
      load_guidance: {
        mode: "goal_driven",
        goal_count: 0,
        dated_goal_count: 0,
      },
      timeline: [],
    },
    refetchAll: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      goals: { list: { invalidate: vi.fn() } },
      events: {
        list: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
      },
    }),
    trainingPlans: {
      getActivePlan: {
        useQuery: () => ({
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            training_plan: { name: "Current Plan" },
          },
          refetch: vi.fn(async () => undefined),
        }),
      },
      list: {
        useQuery: () => ({ data: [] }),
      },
    },
    events: {
      list: {
        useQuery: () => ({ data: { items: [] }, refetch: vi.fn() }),
      },
      create: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: createMilestoneEventMutateAsync,
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
    },
    goals: {
      create: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: createGoalMutateAsync,
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
    },
  },
}));

describe("plan goal persistence", () => {
  it("serializes canonical goal payloads when creating a goal", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const modal = renderer.root.findAll(
      (node: any) => node.type === "GoalEditorModal",
    )[0];

    await act(async () => {
      await modal.props.onSubmit({
        title: "Spring 5K",
        targetDate: "2026-06-01",
        importance: 8,
        goalType: "race_performance",
        targetMetric: "target_time_s",
        targetValue: 1500,
        raceDistanceKm: 5,
      });
    });

    expect(createMilestoneEventMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Spring 5K",
        starts_at: "2026-06-01T12:00:00.000Z",
        event_type: "race_target",
      }),
    );
    expect(createGoalMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: "11111111-1111-4111-8111-111111111111",
        milestone_event_id: "22222222-2222-4222-8222-222222222222",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: expect.objectContaining({
          type: "event_performance",
          distance_m: 5000,
          target_time_s: 1500,
        }),
      }),
    );
  });
});
