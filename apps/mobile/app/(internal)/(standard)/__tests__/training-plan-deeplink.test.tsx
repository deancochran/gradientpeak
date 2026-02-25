import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import TrainingPlanOverview from "../training-plan";

const { replaceMock, pushMock, localSearchParamsMock, snapshotState } =
  vi.hoisted(() => ({
    replaceMock: vi.fn(),
    pushMock: vi.fn(),
    localSearchParamsMock: {} as Record<string, string | undefined>,
    snapshotState: {
      plan: null as any,
      isLoadingSharedDependencies: false,
      hasSharedDependencyError: false,
      insightTimeline: {
        timeline: Array.from({ length: 40 }, (_, index) => ({
          adherence_score: 80,
          boundary_state: "safe",
          actual_tss: index + 100,
          scheduled_tss: index + 110,
        })),
        projection: { at_goal_date: {} },
        adherence_summary: {
          interpretation: "Adherence interpretation from timeline summary.",
          contributors: [
            { detail: "Adherence contributor detail from timeline summary." },
          ],
        },
        readiness_summary: {
          interpretation: "Readiness interpretation from timeline summary.",
          contributors: [
            { detail: "Readiness contributor detail from timeline summary." },
          ],
        },
      } as any,
    },
  }));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("expo-router", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
  }),
  useLocalSearchParams: () => localSearchParamsMock,
}));

vi.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  useTrainingPlanSnapshot: () => ({
    plan: snapshotState.plan,
    status: null,
    insightTimeline: snapshotState.insightTimeline,
    actualCurveData: null,
    idealCurveData: null,
    isLoadingSharedDependencies: snapshotState.isLoadingSharedDependencies,
    hasSharedDependencyError: snapshotState.hasSharedDependencyError,
    refetch: vi.fn(),
    refetchAll: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: {
        trainingPlans: {
          autoAddPeriodization: { mutate: vi.fn() },
        },
      },
      trainingPlans: {
        invalidate: vi.fn(),
      },
    }),
    trainingPlans: {
      delete: {},
    },
  },
}));

vi.mock("@/lib/hooks/useReliableMutation", () => ({
  useReliableMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: vi.fn() },
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("@/components/training-plan/UpcomingActivitiesCard", () => ({
  UpcomingActivitiesCard: createHost("UpcomingActivitiesCard"),
}));
vi.mock("@/components/training-plan/TrainingPlanKpiRow", () => ({
  TrainingPlanKpiRow: createHost("TrainingPlanKpiRow"),
}));
vi.mock("@/components/training-plan/TrainingPlanSummaryHeader", () => ({
  TrainingPlanSummaryHeader: createHost("TrainingPlanSummaryHeader"),
}));
vi.mock("@/components/training-plan/WeeklyProgressCard", () => ({
  WeeklyProgressCard: createHost("WeeklyProgressCard"),
}));
vi.mock("@/components/charts/PlanVsActualChart", () => ({
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));
vi.mock("@/components/plan/PlanAdherenceMiniChart", () => ({
  PlanAdherenceMiniChart: createHost("PlanAdherenceMiniChart"),
}));
vi.mock("@/components/plan/PlanCapabilityMiniChart", () => ({
  PlanCapabilityMiniChart: createHost("PlanCapabilityMiniChart"),
}));
vi.mock("@/components/shared/DetailChartModal", () => ({
  DetailChartModal: ({
    children,
    visible,
    onClose,
    title,
    defaultDateRange = "30d",
  }: any) => {
    const [range, setRange] = React.useState(defaultDateRange);

    if (!visible) {
      return React.createElement("DetailChartModal", { visible: false, title });
    }

    return React.createElement(
      "DetailChartModal",
      { visible: true, title },
      React.createElement(
        "TouchableOpacity",
        { onPress: () => setRange("7d") },
        React.createElement("Text", {}, "Set 7D"),
      ),
      React.createElement(
        "TouchableOpacity",
        { onPress: () => setRange("30d") },
        React.createElement("Text", {}, "Set 30D"),
      ),
      React.createElement(
        "TouchableOpacity",
        { onPress: onClose },
        React.createElement("Text", {}, "Close Modal"),
      ),
      typeof children === "function" ? children(range) : children,
    );
  },
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

vi.mock("lucide-react-native", () => {
  const Icon = createHost("LucideIcon");
  return {
    Activity: Icon,
    Calendar: Icon,
    ChevronRight: Icon,
    CircleCheck: Icon,
    Gauge: Icon,
    Pause: Icon,
    Trash2: Icon,
    TrendingUp: Icon,
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

const findInsightCardTouchable = (
  renderer: TestRenderer.ReactTestRenderer,
  chartType: string,
) =>
  renderer.root.find((node: any) => {
    if (
      node.type !== "TouchableOpacity" ||
      typeof node.props.onPress !== "function"
    ) {
      return false;
    }

    return node.findAll((child: any) => child.type === chartType).length > 0;
  });

const getModalTimelineLength = (renderer: TestRenderer.ReactTestRenderer) => {
  const timelineCharts = renderer.root.findAll(
    (node: any) =>
      node.type === "PlanVsActualChart" && Array.isArray(node.props.timeline),
  );

  if (timelineCharts.length === 0) {
    return 0;
  }

  return timelineCharts[timelineCharts.length - 1]!.props.timeline.length;
};

describe("TrainingPlanOverview deep-link routing", () => {
  const resetTestState = () => {
    replaceMock.mockReset();
    pushMock.mockReset();
    snapshotState.plan = null;
    snapshotState.isLoadingSharedDependencies = false;
    snapshotState.hasSharedDependencyError = false;
    snapshotState.insightTimeline = {
      timeline: Array.from({ length: 40 }, (_, index) => ({
        adherence_score: 80,
        boundary_state: "safe",
        actual_tss: index + 100,
        scheduled_tss: index + 110,
      })),
      projection: { at_goal_date: {} },
      adherence_summary: {
        interpretation: "Adherence interpretation from timeline summary.",
        contributors: [
          { detail: "Adherence contributor detail from timeline summary." },
        ],
      },
      readiness_summary: {
        interpretation: "Readiness interpretation from timeline summary.",
        contributors: [
          { detail: "Readiness contributor detail from timeline summary." },
        ],
      },
    } as any;
    Object.keys(localSearchParamsMock).forEach((key) => {
      delete localSearchParamsMock[key];
    });
  };

  it("redirects to create when no selected plan id exists", () => {
    resetTestState();

    act(() => {
      TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(replaceMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  });

  it("keeps deep-link context when selected plan id is provided", () => {
    resetTestState();
    localSearchParamsMock.id = "plan-library-selection-1";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(replaceMock).not.toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.CREATE,
    );
    expect(hasTextContaining(renderer, "No Training Plan")).toBe(true);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders focused banner and routes manage intent", () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-1",
      name: "Plan One",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-1";
    localSearchParamsMock.nextStep = "settings";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(hasTextContaining(renderer, "Manage Plan")).toBe(true);

    const settingsButton = findTouchableByText(renderer, "Manage Plan");
    act(() => {
      settingsButton.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: "plan-1", initialTab: "plan" },
    });
  });

  it("routes edit-structure intent CTA to structure section", () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-2",
      name: "Plan Two",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-2";
    localSearchParamsMock.nextStep = "edit-structure";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(hasTextContaining(renderer, "Edit Plan Structure")).toBe(true);

    const editButton = findTouchableByText(renderer, "Structure");
    act(() => {
      editButton.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: "plan-2", initialTab: "goals" },
    });
  });

  it("routes review-activity intent CTA to activity detail", () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-3",
      name: "Plan Three",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-3";
    localSearchParamsMock.nextStep = "review-activity";
    localSearchParamsMock.activityId = "activity-99";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(hasTextContaining(renderer, "Review Planned Activity")).toBe(true);

    const activityButton = findTouchableByText(renderer, "Open Activity");
    act(() => {
      activityButton.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(
      ROUTES.PLAN.ACTIVITY_DETAIL("activity-99"),
    );
  });

  it("does not show focus banner for unknown nextStep", () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-4",
      name: "Plan Four",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-4";
    localSearchParamsMock.nextStep = "totally-unsupported-intent";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(hasTextContaining(renderer, "Manage Plan")).toBe(false);
    expect(hasTextContaining(renderer, "Refine Plan")).toBe(false);
    expect(hasTextContaining(renderer, "Edit Plan Structure")).toBe(false);
    expect(hasTextContaining(renderer, "Review Planned Activity")).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders insight gallery cards", () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-gallery-1",
      name: "Gallery Plan",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-gallery-1";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(
      renderer.root.findAll(
        (node: any) => node.type === "PlanAdherenceMiniChart",
      ).length,
    ).toBe(1);
    expect(
      renderer.root.findAll(
        (node: any) => node.type === "PlanCapabilityMiniChart",
      ).length,
    ).toBe(1);
  });

  it("opens adherence modal and supports range toggle", () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-gallery-2",
      name: "Gallery Plan",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-gallery-2";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    const adherenceCard = findInsightCardTouchable(
      renderer,
      "PlanAdherenceMiniChart",
    );
    act(() => {
      adherenceCard.props.onPress();
    });

    expect(hasTextContaining(renderer, "Adherence")).toBe(true);
    expect(
      hasTextContaining(
        renderer,
        "Adherence interpretation from timeline summary.",
      ),
    ).toBe(true);
    expect(getModalTimelineLength(renderer)).toBe(30);

    const set7dButton = findTouchableByText(renderer, "Set 7D");
    act(() => {
      set7dButton.props.onPress();
    });

    expect(getModalTimelineLength(renderer)).toBe(7);
  });

  it("opens readiness modal and closes it", () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-gallery-3",
      name: "Gallery Plan",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-gallery-3";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    const readinessCard = findInsightCardTouchable(
      renderer,
      "PlanCapabilityMiniChart",
    );
    act(() => {
      readinessCard.props.onPress();
    });

    expect(hasTextContaining(renderer, "Readiness")).toBe(true);
    expect(
      hasTextContaining(
        renderer,
        "Readiness interpretation from timeline summary.",
      ),
    ).toBe(true);

    const closeButton = findTouchableByText(renderer, "Close Modal");
    act(() => {
      closeButton.props.onPress();
    });

    expect(hasTextContaining(renderer, "Close Modal")).toBe(false);
  });
});
