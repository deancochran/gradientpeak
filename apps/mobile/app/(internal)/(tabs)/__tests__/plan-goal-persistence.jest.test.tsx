import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
const goalsFixture: any[] = [];

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), navigate: navigateMock }),
}));

jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: (selector: any) =>
    selector({ ready: true, session: { user: { id: "11111111-1111-4111-8111-111111111111" } } }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildGoalCreatePayload: jest.fn(({ draft, profileId }: any) => ({
    profile_id: profileId,
    target_date: draft.targetDate,
    title: draft.title,
    priority: draft.importance,
    activity_category: draft.activityCategory,
    target_payload: {
      type: "event_performance",
      distance_m: 5000,
      target_time_s: 1500,
    },
  })),
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  buildGoalDraftFromGoal: jest.fn(),
  buildGoalUpdatePayload: jest.fn(),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: createHost("AppHeader"),
  CompactInsightCard: ({ children, icon: _icon, title, value, onPress, ...props }: any) =>
    React.createElement("TouchableOpacity", { onPress, ...props }, [
      React.createElement("Text", { key: "title" }, title),
      React.createElement("Text", { key: "value" }, value),
      children,
    ]),
  DetailChartModal: ({ children, visible, ...props }: any) =>
    React.createElement(
      "DetailChartModal",
      { visible, ...props },
      visible ? children("90d") : null,
    ),
}));
jest.mock("@/components/charts/PlanVsActualChart", () => ({
  __esModule: true,
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));
jest.mock("@/components/charts/PlanReadinessComparisonChart", () => ({
  __esModule: true,
  PlanReadinessComparisonChart: createHost("PlanReadinessComparisonChart"),
}));
jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronLeft: createHost("ChevronLeft"),
  ChevronRight: createHost("ChevronRight"),
  Flag: createHost("Flag"),
  Flame: createHost("Flame"),
  Plus: createHost("Plus"),
  Settings: createHost("Settings"),
  Sparkles: createHost("Sparkles"),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  Circle: createHost("Circle"),
  Line: createHost("Line"),
  Path: createHost("Path"),
  Rect: createHost("Rect"),
}));

jest.mock("@/lib/hooks/useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({
    profileId: "11111111-1111-4111-8111-111111111111",
    goals: goalsFixture,
    goalsCount: goalsFixture.length,
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
    },
    insightTimeline: {
      load_guidance: { mode: "goal_driven", goal_count: 0, dated_goal_count: 0 },
      timeline: [],
    },
    refetchAll: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      goals: { list: { invalidate: jest.fn() } },
      events: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
    }),
    trainingPlans: {
      getActivePlan: {
        useQuery: () => ({
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            training_plan: { name: "Current Plan" },
          },
          refetch: jest.fn(async () => undefined),
        }),
      },
      simulateScheduleAdjustment: {
        useQuery: () => ({ data: null, isFetching: false }),
      },
      list: {
        useQuery: () => ({ data: [] }),
        useInfiniteQuery: () => ({ data: { pages: [{ items: [], total: 0 }] } }),
      },
    },
    events: {
      list: { useQuery: () => ({ data: { items: [] }, refetch: jest.fn() }) },
    },
    goals: {
      create: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
    },
  },
}));

const PlanScreenWithErrorBoundary = require("../plan").default;

describe("plan goal persistence", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    goalsFixture.splice(0, goalsFixture.length);
  });

  it("routes goal creation through the dedicated create screen", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("plan-add-goal-button"));

    expect(navigateMock).toHaveBeenCalledWith("/goal-create");
  });
});
