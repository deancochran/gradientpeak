import { act, waitFor } from "@testing-library/react-native";
import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { renderNative, screen } from "../../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

var mockAlert = jest.fn();
var mockApplyTemplateMutate = jest.fn();
var mockDuplicateMutate = jest.fn();
var mockRouterReplace = jest.fn();
var mockRouterPush = jest.fn();
var mockLocalSearchParams: Record<string, string | undefined> = {};
var mockSnapshotState = {
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
      contributors: [{ detail: "Adherence contributor detail from timeline summary." }],
    },
    readiness_summary: {
      interpretation: "Readiness interpretation from timeline summary.",
      contributors: [{ detail: "Readiness contributor detail from timeline summary." }],
    },
  } as any,
};

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({
    replace: mockRouterReplace,
    push: mockRouterPush,
  }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));

jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  __esModule: true,
  useTrainingPlanSnapshot: () => ({
    plan: mockSnapshotState.plan,
    status: null,
    insightTimeline: mockSnapshotState.insightTimeline,
    actualCurveData: null,
    idealCurveData: null,
    isLoadingSharedDependencies: mockSnapshotState.isLoadingSharedDependencies,
    hasSharedDependencyError: mockSnapshotState.hasSharedDependencyError,
    refetch: jest.fn(),
    refetchAll: jest.fn(),
  }),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ profile: { id: "test-profile-id" } }),
}));

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({
      client: {
        trainingPlans: {
          autoAddPeriodization: { mutate: jest.fn() },
        },
      },
      trainingPlans: {
        invalidate: jest.fn(),
      },
      events: {
        invalidate: jest.fn(),
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
            mockDuplicateMutate(input);
            options?.onSuccess?.({ id: "duplicated-training-plan-1" });
          },
          isPending: false,
        }),
      },
      applyTemplate: {
        useMutation: () => ({
          mutateAsync: jest.fn(),
          mutate: mockApplyTemplateMutate,
          isPending: false,
        }),
      },
      delete: {},
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
      getComments: {
        useQuery: () => ({ data: { comments: [] } }),
      },
      addComment: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: { items: [] },
          isLoading: false,
          refetch: jest.fn(),
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

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: jest.fn(async () => undefined),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  Alert: { alert: mockAlert },
  NativeModules: { BlobModule: {} },
  Platform: { OS: "ios", Version: "17", select: (values: Record<string, unknown>) => values.ios },
  TurboModuleRegistry: {
    get: jest.fn(() => ({ installTurboModule: jest.fn() })),
    getEnforcing: jest.fn(() => ({ installTurboModule: jest.fn() })),
  },
}));

jest.mock("@/components/training-plan/UpcomingActivitiesCard", () => ({
  __esModule: true,
  UpcomingActivitiesCard: createHost("UpcomingActivitiesCard"),
}));
jest.mock("@/components/training-plan/TrainingPlanKpiRow", () => ({
  __esModule: true,
  TrainingPlanKpiRow: createHost("TrainingPlanKpiRow"),
}));
jest.mock("@/components/training-plan/TrainingPlanSummaryHeader", () => ({
  __esModule: true,
  TrainingPlanSummaryHeader: createHost("TrainingPlanSummaryHeader"),
}));
jest.mock("@/components/ActivityPlan/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));
jest.mock("@/components/training-plan/WeeklyProgressCard", () => ({
  __esModule: true,
  WeeklyProgressCard: createHost("WeeklyProgressCard"),
}));
jest.mock("@/components/charts/PlanVsActualChart", () => ({
  __esModule: true,
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));
jest.mock("@/components/plan/PlanAdherenceMiniChart", () => ({
  __esModule: true,
  PlanAdherenceMiniChart: createHost("PlanAdherenceMiniChart"),
}));
jest.mock("@/components/plan/PlanCapabilityMiniChart", () => ({
  __esModule: true,
  PlanCapabilityMiniChart: createHost("PlanCapabilityMiniChart"),
}));
jest.mock("@/components/shared/DetailChartModal", () => ({
  __esModule: true,
  DetailChartModal: ({ children, visible, onClose, title, defaultDateRange = "30d" }: any) => {
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
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));
jest.mock("@repo/ui/components/dialog", () => ({
  __esModule: true,
  Dialog: createHost("Dialog"),
  DialogClose: createHost("DialogClose"),
  DialogContent: createHost("DialogContent"),
  DialogDescription: createHost("DialogDescription"),
  DialogFooter: createHost("DialogFooter"),
  DialogHeader: createHost("DialogHeader"),
  DialogTitle: createHost("DialogTitle"),
  DialogTrigger: createHost("DialogTrigger"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));
jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: createHost("DateField"),
  DateField: createHost("DateField"),
}));
jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: createHost("Input"),
}));
jest.mock("@repo/ui/components/radio-group", () => ({
  __esModule: true,
  RadioGroup: createHost("RadioGroup"),
  RadioGroupItem: createHost("RadioGroupItem"),
}));
jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: createHost("Switch"),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => {
  const Icon = createHost("LucideIcon");
  return {
    __esModule: true,
    Activity: Icon,
    Calendar: Icon,
    ChevronRight: Icon,
    Copy: Icon,
    Eye: Icon,
    EyeOff: Icon,
    Heart: Icon,
    Trash2: Icon,
    TrendingUp: Icon,
  };
});

const TrainingPlanOverview = require("../training-plan-detail").default;
const nativeAlertMock = require("react-native").Alert.alert as jest.Mock;

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

const getAllByTypeOrEmpty = (type: string) => {
  try {
    return (screen as any).UNSAFE_getAllByType(type);
  } catch {
    return [];
  }
};

const hasTextContaining = (text: string) =>
  getAllByTypeOrEmpty("Text").some((node: any) => getNodeText(node.props?.children).includes(text));

const findTouchableByText = (text: string) =>
  getAllByTypeOrEmpty("TouchableOpacity").find((node: any) => {
    if (typeof node.props?.onPress !== "function") {
      return false;
    }

    return node.findAll((child: any) => getNodeText(child.props?.children) === text).length > 0;
  });

const findButtonByText = (text: string) =>
  getAllByTypeOrEmpty("Button").find((node: any) => {
    if (typeof node.props?.onPress !== "function") {
      return false;
    }

    return getNodeText(node.props?.children) === text;
  });

const getDateFields = () => getAllByTypeOrEmpty("DateField");

const resetTestState = () => {
  mockRouterReplace.mockReset();
  mockRouterPush.mockReset();
  mockAlert.mockReset();
  nativeAlertMock.mockReset();
  mockApplyTemplateMutate.mockReset();
  mockDuplicateMutate.mockReset();
  mockSnapshotState.plan = null;
  mockSnapshotState.isLoadingSharedDependencies = false;
  mockSnapshotState.hasSharedDependencyError = false;
  mockSnapshotState.insightTimeline = {
    timeline: Array.from({ length: 40 }, (_, index) => ({
      adherence_score: 80,
      boundary_state: "safe",
      actual_tss: index + 100,
      scheduled_tss: index + 110,
    })),
    projection: { at_goal_date: {} },
    adherence_summary: {
      interpretation: "Adherence interpretation from timeline summary.",
      contributors: [{ detail: "Adherence contributor detail from timeline summary." }],
    },
    readiness_summary: {
      interpretation: "Readiness interpretation from timeline summary.",
      contributors: [{ detail: "Readiness contributor detail from timeline summary." }],
    },
  } as any;
  Object.keys(mockLocalSearchParams).forEach((key) => {
    delete mockLocalSearchParams[key];
  });
};

describe("TrainingPlanOverview deep-link routing", () => {
  beforeEach(() => {
    resetTestState();
  });

  it("redirects to create when no selected plan id exists", () => {
    renderNative(<TrainingPlanOverview />);

    expect(mockRouterReplace).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  });

  it("keeps deep-link context when selected plan id is provided", () => {
    mockLocalSearchParams.id = "plan-library-selection-1";

    renderNative(<TrainingPlanOverview />);

    expect(mockRouterReplace).not.toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
    expect(hasTextContaining("No Training Plan")).toBe(true);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("renders focused banner and routes manage intent", () => {
    mockSnapshotState.plan = {
      id: "plan-1",
      name: "Plan One",
      profile_id: "test-profile-id",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-1";
    mockLocalSearchParams.nextStep = "settings";

    renderNative(<TrainingPlanOverview />);

    expect(hasTextContaining("Manage Plan")).toBe(true);

    act(() => {
      findTouchableByText("Manage Plan").props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: "plan-1", initialTab: "plan" },
    });
  });

  it("routes edit-structure intent CTA to structure section", () => {
    mockSnapshotState.plan = {
      id: "plan-2",
      name: "Plan Two",
      profile_id: "test-profile-id",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-2";
    mockLocalSearchParams.nextStep = "edit-structure";

    renderNative(<TrainingPlanOverview />);

    expect(hasTextContaining("Edit Plan Structure")).toBe(true);

    act(() => {
      findTouchableByText("Structure").props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: "plan-2", initialTab: "plan" },
    });
  });

  it("shows schedule-first plan actions for owned plans", () => {
    mockSnapshotState.plan = {
      id: "plan-owned-1",
      name: "Owned Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-owned-1";

    renderNative(<TrainingPlanOverview />);

    expect(hasTextContaining("Schedule Sessions")).toBe(true);
    expect(hasTextContaining("Edit Plan")).toBe(true);
    expect(hasTextContaining("Apply Template")).toBe(false);
    expect(hasTextContaining("Edit Structure")).toBe(false);
  });

  it("shows the new plan snapshot and overview copy for owned plans", () => {
    mockSnapshotState.plan = {
      id: "plan-owned-snapshot-1",
      name: "Owned Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      durationWeeks: { recommended: 8 },
      sessions_per_week_target: 4,
      sport: ["run"],
      experienceLevel: ["beginner"],
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-owned-snapshot-1";

    renderNative(<TrainingPlanOverview />);

    expect(hasTextContaining("Plan snapshot")).toBe(true);
    expect(hasTextContaining("8 weeks")).toBe(true);
    expect(hasTextContaining("4 sessions/week")).toBe(true);
    expect(hasTextContaining("Open Calendar")).toBe(true);
    expect(hasTextContaining("Linked activity plan structures")).toBe(true);
  });

  it("shows one clear schedule anchor mode instead of start plus target dates", () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-1",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-owned-anchor-1";

    renderNative(<TrainingPlanOverview />);

    expect(hasTextContaining("How should this schedule line up?")).toBe(true);
    expect(hasTextContaining("Start On")).toBe(true);
    expect(hasTextContaining("Finish By")).toBe(true);
    expect(getDateFields()).toHaveLength(1);
    expect(hasTextContaining("Target Date (Optional)")).toBe(false);
    expect(hasTextContaining("Start Date")).toBe(false);
  });

  it("sends only the selected finish-by anchor to scheduling", () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-2",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-owned-anchor-2";

    renderNative(<TrainingPlanOverview />);

    act(() => {
      findTouchableByText("Finish By").props.onPress();
    });

    act(() => {
      getDateFields()[0].props.onChange("2026-04-30");
    });

    act(() => {
      findButtonByText("Schedule Sessions").props.onPress();
    });

    expect(mockApplyTemplateMutate).toHaveBeenCalledWith({
      template_type: "training_plan",
      template_id: "plan-owned-anchor-2",
      start_date: undefined,
      target_date: "2026-04-30",
    });
  });

  it("requires a finish date when finish-by mode is selected", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-3",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-owned-anchor-3";

    renderNative(<TrainingPlanOverview />);

    await act(async () => {
      findTouchableByText("Finish By").props.onPress();
    });

    await act(async () => {
      findButtonByText("Schedule Sessions").props.onPress();
    });

    await waitFor(() => {
      expect(nativeAlertMock).toHaveBeenCalledWith(
        "Choose a finish date",
        "Pick the date you want this plan to finish, or switch back to Start On.",
      );
    });
    expect(mockApplyTemplateMutate).not.toHaveBeenCalled();
  });

  it("routes review-activity intent CTA to activity detail", () => {
    mockSnapshotState.plan = {
      id: "plan-3",
      name: "Plan Three",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-3";
    mockLocalSearchParams.nextStep = "review-activity";
    mockLocalSearchParams.activityId = "activity-99";

    renderNative(<TrainingPlanOverview />);

    expect(hasTextContaining("Review Planned Activity")).toBe(true);

    act(() => {
      findTouchableByText("Open Activity").props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith(ROUTES.PLAN.ACTIVITY_DETAIL("activity-99"));
  });

  it("does not show focus banner for unknown nextStep", () => {
    mockSnapshotState.plan = {
      id: "plan-4",
      name: "Plan Four",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-4";
    mockLocalSearchParams.nextStep = "totally-unsupported-intent";

    renderNative(<TrainingPlanOverview />);

    expect(hasTextContaining("Manage Plan")).toBe(false);
    expect(hasTextContaining("Refine Plan")).toBe(false);
    expect(hasTextContaining("Edit Plan Structure")).toBe(false);
    expect(hasTextContaining("Review Planned Activity")).toBe(false);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("duplicates a shared training plan and routes to the new owned copy", async () => {
    mockSnapshotState.plan = {
      id: "plan-shared-1",
      name: "Shared Plan",
      profile_id: "someone-else",
      template_visibility: "public",
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    } as any;
    mockLocalSearchParams.id = "plan-shared-1";

    renderNative(<TrainingPlanOverview />);

    await act(async () => {
      findButtonByText("Make Editable Copy").props.onPress();
    });

    expect(mockDuplicateMutate).toHaveBeenCalledWith({
      id: "plan-shared-1",
      newName: "Shared Plan (Copy)",
    });
    await waitFor(() => {
      expect(nativeAlertMock).toHaveBeenCalledWith(
        "Duplicated",
        "Training plan added to your plans.",
        expect.any(Array),
      );
    });

    const duplicateAlertButtons = nativeAlertMock.mock.calls.at(-1)?.[2] as
      | Array<{ onPress?: () => void }>
      | undefined;
    duplicateAlertButtons?.[0]?.onPress?.();

    expect(mockRouterReplace).toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.DETAIL("duplicated-training-plan-1"),
    );
  });
});
