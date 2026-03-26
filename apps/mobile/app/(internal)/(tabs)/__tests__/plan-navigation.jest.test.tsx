import React from "react";
import { ROUTES } from "@/lib/constants/routes";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const refetchActivePlanMock = jest.fn(async () => undefined);
const refetchSnapshotMock = jest.fn(async () => undefined);
const recentEventsUpdatedAtRef = { current: 1 };
const upcomingEventsUpdatedAtRef = { current: 1 };
const activePlanQueryOptionsRef = { current: null as any };
const eventQueryOptionsRef = { current: [] as any[] };

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

function getTextContent(children: any): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children
      .map((child) => getTextContent(child))
      .join(" ")
      .trim();
  }
  if (children?.props?.children !== undefined) {
    return getTextContent(children.props.children);
  }
  return "";
}

function buttonTestId(label: string): string {
  return `button-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: createHost("AppHeader"),
}));

jest.mock("@/components/goals", () => ({
  __esModule: true,
  GoalEditorModal: createHost("GoalEditorModal"),
}));

jest.mock("@/components/charts/PlanVsActualChart", () => ({
  __esModule: true,
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, onPress, ...props }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: buttonTestId(getTextContent(children)), ...props },
      children,
    ),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: ({ children, ...props }: any) => React.createElement("Text", props, children),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Settings: createHost("Settings"),
}));

jest.mock("@/lib/hooks/useProfileGoals", () => ({
  __esModule: true,
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
    refetch: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/hooks/useProfileSettings", () => ({
  __esModule: true,
  useProfileSettings: () => ({
    settings: {
      availability: { weekly_windows: [], hard_rest_days: [] },
      dose_limits: { min_sessions_per_week: 2, max_sessions_per_week: 6 },
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
    refetch: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  __esModule: true,
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
            { effective_target: { surplus_applied: true, applied_surplus_pct: 0.02 } },
          ],
        },
        { goal_id: "goal-2", target_scores: [] },
      ],
    },
    insightTimeline: {
      plan_feasibility: { state: "stretch", reasons: ["timeline_pressure"] },
      goal_feasibility: [
        {
          goal_id: "goal-1",
          goal_name: "Race A",
          state: "stretch",
          reasons: ["capacity_pressure"],
        },
        { goal_id: "goal-2", goal_name: "Race B", state: "feasible", reasons: [] },
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
        interpretation: "Projection confidence is improving with better adherence.",
      },
      timeline: [{ date: "2026-04-01", ideal_tss: 42, scheduled_tss: 38, actual_tss: 0 }],
    },
    refetchAll: refetchSnapshotMock,
  }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildGoalCreatePayload: jest.fn(),
  buildGoalDraftFromGoal: jest.fn(),
  buildGoalUpdatePayload: jest.fn(),
  buildMilestoneEventCreateInput: jest.fn(),
  buildMilestoneEventUpdatePatch: jest.fn(),
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
}));

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({
      trainingPlans: { invalidate: jest.fn() },
      events: { list: { invalidate: jest.fn() }, invalidate: jest.fn() },
      profileSettings: { getForProfile: { invalidate: jest.fn() } },
      goals: { list: { invalidate: jest.fn() } },
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
      list: { useQuery: () => ({ data: [{ id: "active-1", name: "Current Plan" }] }) },
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
            refetch: jest.fn(async () => undefined),
          };
        },
      },
      create: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
    },
    profileSettings: { upsert: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) } },
    goals: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
  },
}));

const PlanScreenWithErrorBoundary = require("../plan").default;

describe("plan dashboard navigation", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refetchActivePlanMock.mockClear();
    refetchSnapshotMock.mockClear();
    activePlanQueryOptionsRef.current = null;
    eventQueryOptionsRef.current = [];
  });

  it("uses schedule-aware freshness for plan dashboard queries", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(activePlanQueryOptionsRef.current).toEqual(
      expect.objectContaining({ staleTime: 0, refetchOnMount: "always" }),
    );
    expect(eventQueryOptionsRef.current).toEqual(
      expect.arrayContaining([expect.objectContaining({ staleTime: 0, refetchOnMount: "always" })]),
    );
  });

  it("refreshes the projection snapshot when planned events change", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(refetchActivePlanMock).toHaveBeenCalled();
    expect(refetchSnapshotMock).toHaveBeenCalled();
  });

  it("renders dashboard sections", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(screen.getAllByText("Forecasted Projection")[0]).toBeTruthy();
    expect(screen.getByText("Goals")).toBeTruthy();
    expect(screen.getAllByText("Current Plan")[0]).toBeTruthy();
    expect(screen.getAllByText("150%")[0]).toBeTruthy();
    expect(screen.getByText("This week's load")).toBeTruthy();
  });

  it("opens calendar from dashboard action", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId(buttonTestId("Open Calendar")));

    expect(pushMock).toHaveBeenCalledWith(ROUTES.CALENDAR);
  });

  it("opens training plans list from management action", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId(buttonTestId("Manage Plans")));

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.LIST);
  });

  it("navigates to goal detail when a goal card is pressed", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    const goalCard = (screen as any).UNSAFE_getAllByType("TouchableOpacity").find((node: any) => {
      const children = node.findAll((child: any) => child.type === "Text");
      return children.some((child: any) => child.props.children === "Race A");
    });

    expect(goalCard).toBeTruthy();
    fireEvent.press(goalCard!);

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.GOAL_DETAIL("goal-1"));
  });

  it("opens training preferences from projection settings icon", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("projection-settings-button"));

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PREFERENCES);
  });

  it("does not render active-plan navigation action", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(screen.queryByText("Open Detailed Projection")).toBeNull();
  });
});
