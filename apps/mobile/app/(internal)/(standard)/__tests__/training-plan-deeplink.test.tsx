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
  },
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
    Pause: Icon,
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

describe("TrainingPlanOverview deep-link routing", () => {
  it("redirects to create when no selected plan id exists", () => {
    replaceMock.mockReset();
    pushMock.mockReset();
    snapshotState.plan = null;
    snapshotState.isLoadingSharedDependencies = false;
    snapshotState.hasSharedDependencyError = false;
    Object.keys(localSearchParamsMock).forEach((key) => {
      delete localSearchParamsMock[key];
    });

    act(() => {
      TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(replaceMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  });

  it("keeps deep-link context when selected plan id is provided", () => {
    replaceMock.mockReset();
    pushMock.mockReset();
    snapshotState.plan = null;
    snapshotState.isLoadingSharedDependencies = false;
    snapshotState.hasSharedDependencyError = false;
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
});
