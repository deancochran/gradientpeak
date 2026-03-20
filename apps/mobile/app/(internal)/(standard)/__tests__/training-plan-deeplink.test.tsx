import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/lib/constants/routes";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

const loadTrainingPlanOverview = async () =>
  (await import("../training-plan-detail")).default;

const {
  alertMock,
  applyTemplateMutateMock,
  duplicateMutateMock,
  replaceMock,
  pushMock,
  localSearchParamsMock,
  snapshotState,
} = vi.hoisted(() => ({
  alertMock: vi.fn(),
  applyTemplateMutateMock: vi.fn(),
  duplicateMutateMock: vi.fn(),
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

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "test-profile-id" } }),
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
      events: {
        invalidate: vi.fn(),
      },
    }),
    trainingPlans: {
      getTemplate: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
      getActivePlan: {
        useQuery: () => ({ data: null }),
      },
      update: {
        useMutation: () => ({ isPending: false }),
      },
      duplicate: {
        useMutation: (options: any) => ({
          mutate: (input: any) => {
            duplicateMutateMock(input);
            options?.onSuccess?.({ id: "duplicated-training-plan-1" });
          },
          isPending: false,
        }),
      },
      applyTemplate: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          mutate: applyTemplateMutateMock,
          isPending: false,
        }),
      },
      delete: {},
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getComments: {
        useQuery: () => ({ data: { comments: [] } }),
      },
      addComment: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: { items: [] },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      getManyByIds: {
        useQuery: () => ({
          data: { items: [] },
          isLoading: false,
        }),
      },
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
  Alert: { alert: alertMock },
  NativeModules: { BlobModule: {} },
  TurboModuleRegistry: {
    get: vi.fn(() => ({ installTurboModule: vi.fn() })),
    getEnforcing: vi.fn(() => ({ installTurboModule: vi.fn() })),
  },
  Platform: { OS: "ios", Version: "17" },
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  Pressable: createHost("Pressable"),
  TextInput: createHost("TextInput"),
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
vi.mock("@/components/ActivityPlan/TimelineChart", () => ({
  TimelineChart: createHost("TimelineChart"),
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
vi.mock("@repo/ui/components/button", () => ({
  Button: createHost("Button"),
}));
vi.mock("@repo/ui/components/dialog", () => ({
  Dialog: createHost("Dialog"),
  DialogClose: createHost("DialogClose"),
  DialogContent: createHost("DialogContent"),
  DialogDescription: createHost("DialogDescription"),
  DialogFooter: createHost("DialogFooter"),
  DialogHeader: createHost("DialogHeader"),
  DialogTitle: createHost("DialogTitle"),
  DialogTrigger: createHost("DialogTrigger"),
}));
vi.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));
vi.mock("@/components/training-plan/create/inputs/DateField", () => ({
  DateField: createHost("DateField"),
}));
vi.mock("@repo/ui/components/input", () => ({
  Input: createHost("Input"),
}));
vi.mock("@repo/ui/components/switch", () => ({
  Switch: createHost("Switch"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("lucide-react-native", () => {
  const Icon = createHost("LucideIcon");
  return {
    Activity: Icon,
    Calendar: Icon,
    ChevronRight: Icon,
    CircleCheck: Icon,
    Copy: Icon,
    Gauge: Icon,
    Library: Icon,
    Pause: Icon,
    Trash2: Icon,
    TrendingUp: Icon,
    Heart: Icon,
    Eye: Icon,
    EyeOff: Icon,
    MessageCircle: Icon,
    Send: Icon,
    Link2: Icon,
    Plus: Icon,
    X: Icon,
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

const findButtonByText = (
  renderer: TestRenderer.ReactTestRenderer,
  text: string,
) =>
  renderer.root.find((node: any) => {
    if (node.type !== "Button" || typeof node.props.onPress !== "function") {
      return false;
    }

    return getNodeText(node.props?.children) === text;
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
    alertMock.mockReset();
    applyTemplateMutateMock.mockReset();
    duplicateMutateMock.mockReset();
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
    let TrainingPlanOverview: Awaited<
      ReturnType<typeof loadTrainingPlanOverview>
    >;

    return loadTrainingPlanOverview().then((Component) => {
      TrainingPlanOverview = Component;
      act(() => {
        TestRenderer.create(<TrainingPlanOverview />);
      });

      expect(replaceMock).toHaveBeenCalledWith(
        ROUTES.PLAN.TRAINING_PLAN.CREATE,
      );
    });
  });

  it("keeps deep-link context when selected plan id is provided", async () => {
    resetTestState();
    localSearchParamsMock.id = "plan-library-selection-1";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(replaceMock).not.toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.CREATE,
    );
    expect(hasTextContaining(renderer, "No Training Plan")).toBe(true);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders focused banner and routes manage intent", async () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-1",
      name: "Plan One",
      profile_id: "test-profile-id",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-1";
    localSearchParamsMock.nextStep = "settings";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

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

  it("routes edit-structure intent CTA to structure section", async () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-2",
      name: "Plan Two",
      profile_id: "test-profile-id",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-2";
    localSearchParamsMock.nextStep = "edit-structure";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

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
      params: { id: "plan-2", initialTab: "plan" },
    });
  });

  it("shows schedule-first plan actions for owned plans", async () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-owned-1",
      name: "Owned Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-owned-1";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(hasTextContaining(renderer, "Schedule Sessions")).toBe(true);
    expect(hasTextContaining(renderer, "Edit Plan")).toBe(true);
    expect(hasTextContaining(renderer, "Apply Template")).toBe(false);
    expect(hasTextContaining(renderer, "Edit Structure")).toBe(false);
  });

  it("shows one clear schedule anchor mode instead of start plus target dates", async () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-owned-anchor-1",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-owned-anchor-1";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    expect(
      hasTextContaining(renderer, "How should this schedule line up?"),
    ).toBe(true);
    expect(hasTextContaining(renderer, "Start On")).toBe(true);
    expect(hasTextContaining(renderer, "Finish By")).toBe(true);
    expect(
      renderer.root.findAll((node: any) => node.type === "DateField"),
    ).toHaveLength(1);
    expect(hasTextContaining(renderer, "Target Date (Optional)")).toBe(false);
    expect(hasTextContaining(renderer, "Start Date")).toBe(false);
  });

  it("sends only the selected finish-by anchor to scheduling", async () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-owned-anchor-2",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-owned-anchor-2";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    const finishByButton = findTouchableByText(renderer, "Finish By");
    await act(async () => {
      finishByButton.props.onPress();
    });

    const anchorField = renderer.root.find(
      (node: any) => node.type === "DateField",
    );
    await act(async () => {
      anchorField.props.onChange("2026-04-30");
    });

    const scheduleButton = findButtonByText(renderer, "Schedule Sessions");
    await act(async () => {
      scheduleButton.props.onPress();
    });

    expect(applyTemplateMutateMock).toHaveBeenCalledWith({
      template_type: "training_plan",
      template_id: "plan-owned-anchor-2",
      start_date: undefined,
      target_date: "2026-04-30",
    });
  });

  it("requires a finish date when finish-by mode is selected", async () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-owned-anchor-3",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-owned-anchor-3";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    const finishByButton = findTouchableByText(renderer, "Finish By");
    await act(async () => {
      finishByButton.props.onPress();
    });

    const scheduleButton = findButtonByText(renderer, "Schedule Sessions");
    await act(async () => {
      scheduleButton.props.onPress();
    });

    expect(alertMock).toHaveBeenCalledWith(
      "Choose a finish date",
      "Pick the date you want this plan to finish, or switch back to Start On.",
    );
    expect(applyTemplateMutateMock).not.toHaveBeenCalled();
  });

  it("routes review-activity intent CTA to activity detail", async () => {
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
    const TrainingPlanOverview = await loadTrainingPlanOverview();

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

  it("does not show focus banner for unknown nextStep", async () => {
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
    const TrainingPlanOverview = await loadTrainingPlanOverview();

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

  it("duplicates a shared training plan and routes to the new owned copy", async () => {
    resetTestState();
    snapshotState.plan = {
      id: "plan-shared-1",
      name: "Shared Plan",
      profile_id: "someone-else",
      template_visibility: "public",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    localSearchParamsMock.id = "plan-shared-1";
    const TrainingPlanOverview = await loadTrainingPlanOverview();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanOverview />);
    });

    const duplicateButton = renderer.root.find(
      (node: any) =>
        node.type === "Button" &&
        getNodeText(node.props?.children) === "Make Editable Copy",
    );

    await act(async () => {
      duplicateButton.props.onPress();
    });

    expect(duplicateMutateMock).toHaveBeenCalledWith({
      id: "plan-shared-1",
      newName: "Shared Plan (Copy)",
    });
    expect(alertMock).toHaveBeenCalledWith(
      "Duplicated",
      "Training plan added to your plans.",
      expect.any(Array),
    );
    const duplicateAlertButtons = alertMock.mock.calls.at(-1)?.[2] as
      | Array<{ onPress?: () => void }>
      | undefined;
    duplicateAlertButtons?.[0]?.onPress?.();
    expect(replaceMock).toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.DETAIL("duplicated-training-plan-1"),
    );
  });

  // removed insight tests since they were moved to active plan
});
