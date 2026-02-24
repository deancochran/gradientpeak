import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import PlanScreenWithErrorBoundary from "../plan";

const { pushMock, localSearchParamsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  localSearchParamsMock: {} as Record<string, string | string[] | undefined>,
}));

const trainingPlanState = vi.hoisted(() => ({
  plan: {
    id: "plan-1",
    name: "Plan Alpha",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    structure: {},
  } as any,
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("react-native-calendars", () => ({
  Calendar: createHost("Calendar"),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: vi.fn(),
}));

vi.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock }),
  useLocalSearchParams: () => localSearchParamsMock,
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@/components/plan/GhostCard", () => ({
  GhostCard: createHost("GhostCard"),
}));

vi.mock("@/components/ScheduleActivityModal", () => ({
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

vi.mock("@/components/shared", () => ({
  AppHeader: createHost("AppHeader"),
  PlanCalendarSkeleton: createHost("PlanCalendarSkeleton"),
}));

vi.mock("@/components/shared/ActivityPlanCard", () => ({
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

vi.mock("@/components/home/FitnessProgressCard", () => ({
  FitnessProgressCard: createHost("FitnessProgressCard"),
}));

vi.mock("@/components/shared/DetailChartModal", () => ({
  DetailChartModal: ({ children }: any) =>
    React.createElement(
      "DetailChartModal",
      {},
      typeof children === "function" ? children("30d") : children,
    ),
}));

vi.mock("@/components/charts/PlanVsActualChart", () => ({
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

vi.mock("@/components/charts/TrainingLoadChart", () => ({
  TrainingLoadChart: createHost("TrainingLoadChart"),
}));

vi.mock("@/components/plan/PlanAdherenceMiniChart", () => ({
  PlanAdherenceMiniChart: createHost("PlanAdherenceMiniChart"),
}));

vi.mock("@/components/plan/PlanCapabilityMiniChart", () => ({
  PlanCapabilityMiniChart: createHost("PlanCapabilityMiniChart"),
}));

vi.mock("@/components/plan/PlanStatusSummaryCard", () => ({
  PlanStatusSummaryCard: createHost("PlanStatusSummaryCard"),
}));

vi.mock("@/components/training-plan/QuickAdjustSheet", () => ({
  QuickAdjustSheet: (props: any) =>
    React.createElement("QuickAdjustSheet", props),
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@/lib/stores/activitySelectionStore", () => ({
  activitySelectionStore: { setSelection: vi.fn() },
}));

vi.mock("@/lib/utils/plan/dateGrouping", () => ({
  isActivityCompleted: () => false,
}));

vi.mock("@/lib/hooks/useSmartSuggestions", () => ({
  useSmartSuggestions: () => null,
}));

vi.mock("lucide-react-native", () => {
  const Icon = createHost("LucideIcon");
  return {
    CalendarDays: Icon,
    Pencil: Icon,
    Play: Icon,
    Settings: Icon,
  };
});

vi.mock("@/lib/trpc", () => {
  const queryResult = (data: any, extras: Record<string, any> = {}) => ({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extras,
  });

  return {
    trpc: {
      trainingPlans: {
        get: {
          useQuery: () => queryResult(trainingPlanState.plan),
        },
        getCurrentStatus: {
          useQuery: () =>
            queryResult({
              ctl: 42,
              weekProgress: {
                totalPlannedActivities: 4,
                completedActivities: 2,
              },
            }),
        },
        getInsightTimeline: {
          useQuery: () =>
            queryResult({
              timeline: [],
              projection: { at_goal_date: { confidence: null } },
              capability: null,
            }),
        },
        getWeeklySummary: {
          useQuery: () => queryResult([]),
        },
        getActualCurve: {
          useQuery: () => queryResult({ dataPoints: [] }),
        },
        getIdealCurve: {
          useQuery: () => queryResult({ dataPoints: [] }),
        },
      },
      plannedActivities: {
        list: {
          useQuery: () => queryResult({ items: [] }),
        },
      },
      activities: {
        list: {
          useQuery: () => queryResult([]),
        },
      },
    },
  };
});

const getNodeText = (children: any): string => {
  if (typeof children === "string") {
    return children;
  }

  if (typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map((child) => getNodeText(child)).join("");
  }

  if (children?.props?.children !== undefined) {
    return getNodeText(children.props.children);
  }

  return "";
};

const findTouchableByText = (
  renderer: TestRenderer.ReactTestRenderer,
  text: string,
) =>
  renderer.root.find((node: any) => {
    if (
      node.type !== "TouchableOpacity" ||
      typeof node.props.onPress !== "function"
    ) {
      return false;
    }

    return (
      node.findAll((child: any) => getNodeText(child.props?.children) === text)
        .length > 0
    );
  });

const hasTextContaining = (
  renderer: TestRenderer.ReactTestRenderer,
  text: string,
) =>
  renderer.root.findAll((node: any) => {
    if (node.type !== "Text") {
      return false;
    }

    return getNodeText(node.props?.children).includes(text);
  }).length > 0;

describe("Plan tab CTA routing", () => {
  it("opens quick adjust sheet and routes full-plan intent", () => {
    pushMock.mockReset();
    trainingPlanState.plan = {
      id: "plan-1",
      name: "Plan Alpha",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    };
    Object.keys(localSearchParamsMock).forEach((key) => {
      delete localSearchParamsMock[key];
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const quickAdjustButton = findTouchableByText(renderer, "Quick Adjust");
    act(() => {
      quickAdjustButton.props.onPress();
    });

    const quickAdjustSheet = renderer.root.find(
      (node: any) => node.type === "QuickAdjustSheet",
    );
    expect(quickAdjustSheet.props.visible).toBe(true);

    const openFullPlanButton = findTouchableByText(renderer, "Open Full Plan");
    act(() => {
      openFullPlanButton.props.onPress();
    });
    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.INDEX);

    expect(hasTextContaining(renderer, "Manage Plan")).toBe(false);
    expect(hasTextContaining(renderer, "Edit Structure")).toBe(false);

    expect(hasTextContaining(renderer, "Progress")).toBe(true);
    expect(hasTextContaining(renderer, "50%")).toBe(true);
    expect(hasTextContaining(renderer, "42 CTL")).toBe(true);
  });

  it("routes create/select intent from no-plan state to library training plans", () => {
    pushMock.mockReset();
    trainingPlanState.plan = null;
    Object.keys(localSearchParamsMock).forEach((key) => {
      delete localSearchParamsMock[key];
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const viewPlansButton = findTouchableByText(renderer, "Tap to view plans");
    act(() => {
      viewPlansButton.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(
      ROUTES.LIBRARY_WITH_RESOURCE("training_plans"),
    );
  });
});
