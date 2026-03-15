import { ROUTES } from "@/lib/constants/routes";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import PlanScreenWithErrorBoundary from "../plan";

const {
  pushMock,
  refetchActivePlanMock,
  refetchSnapshotMock,
  recentEventsUpdatedAtRef,
  upcomingEventsUpdatedAtRef,
  activePlanQueryOptionsRef,
  eventQueryOptionsRef,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refetchActivePlanMock: vi.fn(async () => undefined),
  refetchSnapshotMock: vi.fn(async () => undefined),
  recentEventsUpdatedAtRef: { current: 1 },
  upcomingEventsUpdatedAtRef: { current: 1 },
  activePlanQueryOptionsRef: { current: null as any },
  eventQueryOptionsRef: { current: [] as any[] },
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock }),
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
    profileId: "profile-1",
    goals: [
      {
        id: "goal-1",
        title: "Race A",
        priority: 8,
        target_date: "2026-08-01",
        milestone_event_id: "event-1",
        profile_id: "profile-1",
        activity_category: "run",
        objective: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1400,
        },
      },
      {
        id: "goal-2",
        title: "Race B",
        priority: 6,
        target_date: "2026-09-01",
        milestone_event_id: "event-2",
        profile_id: "profile-1",
        activity_category: "run",
        objective: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10000,
          target_time_s: 3200,
        },
      },
    ],
    goalsCount: 2,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/hooks/useProfileSettings", () => ({
  useProfileSettings: () => ({
    settings: {
      availability: { weekly_windows: [], hard_rest_days: [] },
      dose_limits: {
        min_sessions_per_week: 2,
        max_sessions_per_week: 6,
      },
      training_style: {
        progression_pace: 0.5,
        week_pattern_preference: 0.5,
        key_session_density_preference: 0.5,
      },
      recovery_preferences: {
        recovery_priority: 0.5,
        post_goal_recovery_days: 5,
        double_day_tolerance: 0.25,
        long_session_fatigue_tolerance: 0.5,
      },
      adaptation_preferences: {
        recency_adaptation_preference: 0.5,
        plan_churn_tolerance: 0.4,
      },
      goal_strategy_preferences: {
        target_surplus_preference: 0.25,
        priority_tradeoff_preference: 0.5,
      },
    },
    settingsRecord: null,
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
      goal_assessments: [
        {
          goal_id: "goal-1",
          target_scores: [
            {
              effective_target: {
                surplus_applied: true,
                applied_surplus_pct: 0.02,
              },
            },
          ],
        },
        {
          goal_id: "goal-2",
          target_scores: [],
        },
      ],
    },
    insightTimeline: {
      plan_feasibility: {
        state: "stretch",
        reasons: ["timeline_pressure"],
      },
      goal_feasibility: [
        {
          goal_id: "goal-1",
          goal_name: "Race A",
          state: "stretch",
          reasons: ["capacity_pressure"],
        },
        {
          goal_id: "goal-2",
          goal_name: "Race B",
          state: "feasible",
          reasons: [],
        },
      ],
      projection: {
        diagnostics: {
          fallback_mode: "conservative_baseline",
          confidence: {
            overall: 0.62,
            adherence: 0.62,
            capability: 0.55,
            evidence_state: "medium",
          },
        },
      },
      load_guidance: {
        mode: "goal_driven",
        goal_count: 2,
        dated_goal_count: 2,
        interpretation:
          "Recommended load is anchored to your dated goals and current plan context.",
      },
      readiness_summary: {
        score: 68,
        interpretation:
          "Projection confidence is improving with better adherence.",
      },
      timeline: [
        {
          date: "2026-04-01",
          ideal_tss: 42,
          scheduled_tss: 38,
          actual_tss: 0,
        },
      ],
    },
    refetchAll: refetchSnapshotMock,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      profileSettings: { getForProfile: { invalidate: vi.fn() } },
      goals: { list: { invalidate: vi.fn() } },
    }),
    trainingPlans: {
      getActivePlan: {
        useQuery: (_input: any, options: any) => {
          activePlanQueryOptionsRef.current = options;
          return {
            data: {
              id: "active-1",
              next_event_at: "2026-04-05T00:00:00.000Z",
              training_plan: { name: "Current Plan" },
            },
            refetch: refetchActivePlanMock,
          };
        },
      },
      list: {
        useQuery: () => ({
          data: [{ id: "active-1", name: "Current Plan" }],
        }),
      },
    },
    events: {
      list: {
        useQuery: (input: any, options: any) => {
          eventQueryOptionsRef.current.push(options);
          return {
            data:
              input?.date_from && input?.date_to
                ? {
                    items: [
                      {
                        id: "event-1",
                        training_plan_id: "active-1",
                        starts_at: "2026-04-05T00:00:00.000Z",
                      },
                    ],
                  }
                : { items: [] },
            dataUpdatedAt:
              input?.date_from === "2026-02-15"
                ? recentEventsUpdatedAtRef.current
                : upcomingEventsUpdatedAtRef.current,
            refetch: vi.fn(async () => undefined),
          };
        },
      },
      create: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
    },
    profileSettings: {
      upsert: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
    },
    goals: {
      create: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
      delete: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
    },
  },
}));

describe("plan dashboard navigation", () => {
  it("uses schedule-aware freshness for plan dashboard queries", () => {
    activePlanQueryOptionsRef.current = null;
    eventQueryOptionsRef.current = [];

    act(() => {
      TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    expect(activePlanQueryOptionsRef.current).toEqual(
      expect.objectContaining({ staleTime: 0, refetchOnMount: "always" }),
    );
    expect(eventQueryOptionsRef.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ staleTime: 0, refetchOnMount: "always" }),
      ]),
    );
  });

  it("refreshes the projection snapshot when planned events change", () => {
    refetchActivePlanMock.mockClear();
    refetchSnapshotMock.mockClear();

    act(() => {
      TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    expect(refetchActivePlanMock).toHaveBeenCalled();
    expect(refetchSnapshotMock).toHaveBeenCalled();
  });

  it("renders dashboard sections", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const cardTitles = renderer.root
      .findAll((node: any) => node.type === "CardTitle")
      .map((node: any) => node.props.children);

    expect(cardTitles).toContain("Forecasted Projection");
    expect(cardTitles).toContain("Goals");
    expect(cardTitles).toContain("Current Plan");
    expect(
      renderer.root.findAll((node: any) => node.type === "PlanVsActualChart"),
    ).toHaveLength(1);
    const projectionChart = renderer.root.findAll(
      (node: any) => node.type === "PlanVsActualChart",
    )[0];
    expect(projectionChart.props.goalMarkers).toEqual([
      expect.objectContaining({ id: "goal-1", targetDate: "2026-08-01" }),
      expect.objectContaining({ id: "goal-2", targetDate: "2026-09-01" }),
    ]);
    expect(
      renderer.root
        .findAll((node: any) => node.type === "Text")
        .map((node) => {
          const value = node.props.children;
          if (Array.isArray(value)) {
            return value.join("");
          }
          return typeof value === "string" ? value : "";
        }),
    ).toContain("150%");
    expect(
      renderer.root
        .findAll((node: any) => node.type === "Text")
        .map((node) => {
          const value = node.props.children;
          if (Array.isArray(value)) {
            return value.join("");
          }
          return typeof value === "string" ? value : "";
        }),
    ).toContain("This week's load");
  });

  it("opens calendar from dashboard action", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const buttons = renderer.root.findAll(
      (node: any) => node.type === "Button",
    );
    const calendarButton = buttons.find((node: any) => {
      const textNode = node.findAll((child: any) => child.type === "Text")[0];
      return textNode?.props?.children === "Open Calendar";
    });
    expect(calendarButton).toBeDefined();

    act(() => {
      calendarButton!.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.CALENDAR);
  });

  it("opens training plans list from management action", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const buttons = renderer.root.findAll(
      (node: any) => node.type === "Button",
    );
    const manageButton = buttons.find((node: any) => {
      const textNode = node.findAll((child: any) => child.type === "Text")[0];
      return textNode?.props?.children === "Manage Plans";
    });
    expect(manageButton).toBeDefined();

    act(() => {
      manageButton!.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.LIST);
  });

  it("navigates to goal detail when a goal card is pressed", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const goalCard = renderer.root.findAll((node: any) => {
      if (
        node.type !== "TouchableOpacity" ||
        typeof node.props.onPress !== "function"
      ) {
        return false;
      }

      const texts = node
        .findAll((child: any) => child.type === "Text")
        .map((child: any) => child.props.children);

      return texts.includes("Race A");
    })[0];

    expect(goalCard).toBeDefined();

    act(() => {
      goalCard.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.GOAL_DETAIL("goal-1"));
  });

  it("opens training preferences from projection settings icon", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const settingsButton = renderer.root.findByProps({
      testID: "projection-settings-button",
    });

    act(() => {
      settingsButton.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PREFERENCES);
  });

  it("does not render active-plan navigation action", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const buttonLabels = renderer.root
      .findAll((node: any) => node.type === "Button")
      .map((node: any) => {
        const textNode = node.findAll((child: any) => child.type === "Text")[0];
        return textNode?.props?.children;
      });

    expect(buttonLabels).not.toContain("Open Detailed Projection");
  });
});
