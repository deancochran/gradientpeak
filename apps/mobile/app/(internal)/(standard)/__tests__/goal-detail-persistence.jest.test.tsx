import React from "react";

import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();

type StackScreenProps = {
  options?: { headerRight?: () => React.ReactNode };
  [key: string]: unknown;
};

type GoalDraft = {
  activityCategory?: string;
  importance?: number;
  targetDate?: string;
  title?: string;
};

type GoalReadinessPoint = {
  date: string;
  state_readiness?: number;
};

type GoalReadinessTrajectoryArgs = {
  points: GoalReadinessPoint[];
  currentGoalReadiness?: number | null;
};

type ReadinessViewModelArgs = {
  value: number | null;
};

type HostProps = {
  children?: React.ReactNode;
  [key: string]: unknown;
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: mockCreateHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  ScrollView: mockCreateHost("ScrollView"),
  View: mockCreateHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: StackScreenProps) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => ({ id: "goal-1" }),
  useRouter: () => ({ back: jest.fn(), navigate: navigateMock }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  buildGoalDraftFromGoal: jest.fn(() => ({ title: "Spring 5K" })),
  parseProfileGoalRecord: jest.fn((goal: unknown) => goal),
  buildGoalUpdatePayload: jest.fn(({ draft }: { draft: GoalDraft }) => ({
    target_date: draft.targetDate,
    title: draft.title,
    priority: draft.importance,
    activity_category: draft.activityCategory,
    target_payload: {
      type: "event_performance",
      target_time_s: 1450,
      distance_m: 5000,
    },
  })),
  buildGoalIntelligence: jest.fn(() => ({
    goalId: "goal-1",
    status: "uncertain",
    readinessScore: null,
    projectedOutcome: {
      type: "completion",
      value: null,
      unit: "unknown",
      displayValue: "Projection unavailable",
    },
    targetOutcome: {
      value: 1500,
      unit: "seconds",
      displayValue: "25:00",
    },
    summary:
      "More training data is needed before Spring 5K can produce a reliable performance projection.",
    explanation:
      "Goal intelligence needs completed training, readiness, or forecast inputs before it can estimate a reliable outcome.",
    keyDrivers: [
      {
        metric: "goal_target",
        direction: "neutral",
        label: "Goal time",
        description: "25:00 is the target this projection is measured against.",
        impact: "medium",
      },
    ],
    updatedAt: "2026-05-01T00:00:00.000Z",
  })),
  buildGoalReadinessTrajectory: jest.fn(
    ({ points, currentGoalReadiness }: GoalReadinessTrajectoryArgs) =>
      points.map((point, index) => ({
        date: point.date,
        goal_readiness:
          index === points.length - 1 ? 100 : (currentGoalReadiness ?? point.state_readiness),
        low: 88,
        high: 100,
      })),
  ),
  resolveGoalReadinessTarget: jest.fn(() => 100),
  resolveGoalReadinessViewModel: jest.fn(({ value }: ReadinessViewModelArgs) => ({
    value,
    target: 100,
    band: "building_toward_target",
    label: "Building toward target",
  })),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  getGoalDistanceBadge: jest.fn(() => null),
  getGoalMetricSummary: jest.fn(() => null),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
  getManualBaselineCtlWarning: jest.fn((value: number | null | undefined) =>
    typeof value === "number" && value > 120
      ? "Manual CTL above 120 is very high and can make estimated readiness look flat or inflated without completed activity history."
      : null,
  ),
  getProfileGoalLifecycleStatus: jest.fn(() => ({
    status: "in_progress",
    label: "In progress",
    message: "This goal is active in your planning window.",
    missing: [],
    canGuidePlan: true,
  })),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
  CardTitle: mockCreateHost("CardTitle"),
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: mockCreateHost("DropdownMenu"),
  DropdownMenuContent: mockCreateHost("DropdownMenuContent"),
  DropdownMenuItem: mockCreateHost("DropdownMenuItem"),
  DropdownMenuTrigger: mockCreateHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: mockCreateHost("Svg"),
  Circle: mockCreateHost("Circle"),
}));

jest.mock("@/components/charts/PlanReadinessComparisonChart", () => ({
  __esModule: true,
  PlanReadinessComparisonChart: (props: HostProps) =>
    React.createElement("PlanReadinessComparisonChart", props, props.children),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  __esModule: true,
  useTrainingPlanSnapshot: () => ({
    insightTimeline: {
      projection_dashboard: {
        goal_forecasts: [
          {
            profile_goal_id: "goal-1",
            readiness_score: 72,
          },
        ],
      },
      readiness_forecast: {
        current_readiness: 68,
        confidence_reason_codes: ["missing_recent_history", "projection_fallback_baseline"],
        series: {
          actual: { points: [{ date: "2026-05-15", readiness: 68 }] },
          scheduled: { points: [{ date: "2026-06-01", readiness: 70 }] },
          recommended: { points: [{ date: "2026-06-01", readiness: 74 }] },
        },
      },
    },
    profileSettings: {
      baseline_fitness: {
        is_enabled: true,
        override_ctl: 220,
      },
    },
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      goals: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
      events: { list: { invalidate: jest.fn() } },
    }),
    goals: {
      getById: {
        useQuery: () => ({
          data: {
            id: "goal-1",
            profile_id: "22222222-2222-4222-8222-222222222222",
            target_date: "2026-06-01",
            title: "Spring 5K",
            priority: 8,
            activity_category: "run",
            target_payload: {
              type: "event_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500,
            },
          },
          isLoading: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
    trainingPlans: {
      getActivePlan: { useQuery: () => ({ data: { id: "plan-1" } }) },
    },
  },
}));

const GoalDetailScreen = require("../goal-detail").default;

describe("goal detail persistence", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("routes editing through the dedicated goal edit screen", async () => {
    renderNative(<GoalDetailScreen />);

    fireEvent.press(screen.getByTestId("goal-detail-options-edit"));

    expect(navigateMock).toHaveBeenCalledWith("/goal-edit?id=goal-1");
  });

  it("shows goal progress in the detail header", async () => {
    renderNative(<GoalDetailScreen />);

    expect(screen.getByTestId("goal-readiness-ring")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
  });

  it("labels fallback readiness as estimated", async () => {
    renderNative(<GoalDetailScreen />);

    expect(screen.getByText("Estimated readiness path")).toBeTruthy();
    expect(screen.getByTestId("goal-readiness-estimated-note")).toBeTruthy();
    expect(screen.getByTestId("goal-readiness-baseline-warning")).toBeTruthy();
  });
});
