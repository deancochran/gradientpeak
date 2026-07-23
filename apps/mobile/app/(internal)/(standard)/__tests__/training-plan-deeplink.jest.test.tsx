import { act, waitFor } from "@testing-library/react-native";
import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

type AlertButton = { onPress?: () => void };
type NativeAlert = (title: string, message?: string, buttons?: AlertButton[]) => void;

var mockAlert = jest.fn<void, Parameters<NativeAlert>>();
var mockApplyTemplateMutate = jest.fn();
var mockDuplicateMutate = jest.fn();
var mockRemoveAppliedScheduleMutate = jest.fn();
var mockUpdatePlanMutate = jest.fn();
type TrainingPlanFixture = {
  id: string;
  name: string;
  created_at: string;
  structure_hash: string;
  structure: Record<string, unknown>;
  profile_id?: string;
  is_active?: boolean;
  template_visibility?: string;
  durationWeeks?: { recommended: number };
  sessions_per_week_target?: number;
  sport?: string[];
  experienceLevel?: string[];
};
type ActivePlanFixture = { id: string; schedule_batch_id?: string };
type ApplyTemplateResult = {
  applied_plan_id: string;
  scheduled_sessions_created: number;
  scheduled_sessions_replaced: number;
};
type InsightTimelineFixture = {
  timeline: Array<{
    adherence_score: number;
    boundary_state: string;
    actual_tss: number;
    scheduled_tss: number;
  }>;
  projection: { at_goal_date: Record<string, unknown> };
  adherence_summary: { interpretation: string; contributors: Array<{ detail: string }> };
  readiness_summary: { interpretation: string; contributors: Array<{ detail: string }> };
};
type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};

var mockActivePlanData: ActivePlanFixture | null = null;
var mockApplyTemplateResult: ApplyTemplateResult | null = null;
var mockRouterReplace = jest.fn();
var mockRouterPush = jest.fn();
var mockLocalSearchParams: Record<string, string | undefined> = {};
var mockSnapshotState: {
  plan: TrainingPlanFixture | null;
  isLoadingSharedDependencies: boolean;
  hasSharedDependencyError: boolean;
  insightTimeline: InsightTimelineFixture;
} = {
  plan: null,
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
  },
};

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
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

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
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
        useQuery: () => ({ data: mockActivePlanData }),
      },
      update: {
        useMutation: () => ({ mutate: mockUpdatePlanMutate, isPending: false }),
      },
      removeAppliedSchedule: {
        useMutation: () => ({
          mutate: mockRemoveAppliedScheduleMutate,
          isPending: false,
        }),
      },
      duplicate: {
        useMutation: (options?: { onSuccess?: (data: { id: string }) => void }) => ({
          mutate: (input: unknown) => {
            mockDuplicateMutate(input);
            options?.onSuccess?.({ id: "duplicated-training-plan-1" });
          },
          isPending: false,
        }),
      },
      applyTemplate: {
        useMutation: (options?: { onSuccess?: (data: ApplyTemplateResult) => void }) => ({
          mutateAsync: jest.fn(),
          mutate: (input: unknown) => {
            mockApplyTemplateMutate(input);
            if (mockApplyTemplateResult) {
              options?.onSuccess?.(mockApplyTemplateResult);
            }
          },
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
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0, hasMore: false, nextCursor: undefined }] },
          refetch: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
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
    routes: {
      get: {
        useQuery: () => ({ data: null }),
      },
      loadFull: {
        useQuery: () => ({ data: null }),
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
  ...jest.requireActual("@repo/ui/test/react-native"),
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
jest.mock("@/components/activity-plan/workout/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));
jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));
jest.mock("@/components/shared/ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanMetricsRow: createHost("ActivityPlanMetricsRow"),
  ActivityPlanSummary: createHost("ActivityPlanSummary"),
}));
jest.mock("@/components/shared/EntityOwnerRow", () => ({
  __esModule: true,
  EntityOwnerRow: createHost("EntityOwnerRow"),
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
  DetailChartModal: ({
    children,
    visible,
    onClose,
    title,
    defaultDateRange = "30d",
  }: {
    children?: React.ReactNode | ((range: string) => React.ReactNode);
    visible: boolean;
    onClose?: () => void;
    title?: string;
    defaultDateRange?: string;
  }) => {
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
jest.mock("@/components/shared/EntityOwnerRow", () => ({
  __esModule: true,
  EntityOwnerRow: createHost("EntityOwnerRow"),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ testId, testID, ...props }: Record<string, unknown> & { testId?: string }) =>
    React.createElement("Button", { ...props, testID: testId ?? testID }),
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
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
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
jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: createHost("Switch"),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
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
const { Alert: nativeAlert }: { Alert: { alert: jest.Mock<void, Parameters<NativeAlert>> } } =
  require("react-native");
const nativeAlertMock = nativeAlert.alert;
let renderedPlan: ReturnType<typeof renderNative> | undefined;

const renderPlan = () => {
  renderedPlan = renderNative(<TrainingPlanOverview />);
  return renderedPlan;
};

const hasChildrenProps = (value: unknown): value is { props: { children?: unknown } } =>
  typeof value === "object" && value !== null && "props" in value;

const getNodeText = (children: unknown): string => {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => getNodeText(child)).join("");
  }
  if (hasChildrenProps(children) && children.props.children !== undefined) {
    return getNodeText(children.props.children);
  }
  return "";
};

const getAllByTypeOrEmpty = (type: string) => {
  if (!renderedPlan) return [];
  return renderedPlan.UNSAFE_root.findAll((node) => node.type === type);
};

const hasTextContaining = (text: string) =>
  getAllByTypeOrEmpty("Text").some((node) => getNodeText(node.props.children).includes(text));

const findTouchableByText = (text: string) => {
  const node = getAllByTypeOrEmpty("TouchableOpacity").find((candidate) => {
    if (typeof candidate.props.onPress !== "function") {
      return false;
    }

    return candidate.findAll((child) => getNodeText(child.props.children) === text).length > 0;
  });
  if (!node) throw new Error(`Unable to find touchable with text: ${text}`);
  return node;
};

const findButtonByText = (text: string) => {
  const node = getAllByTypeOrEmpty("Button").find((candidate) => {
    if (typeof candidate.props.onPress !== "function") {
      return false;
    }

    return getNodeText(candidate.props.children) === text;
  });
  if (!node) throw new Error(`Unable to find button with text: ${text}`);
  return node;
};

const findButtonByTestId = (testID: string) => {
  const node = getAllByTypeOrEmpty("Button").find((candidate) => candidate.props.testID === testID);
  if (!node) throw new Error(`Unable to find button: ${testID}`);
  return node;
};

const findNodeByTestId = (testID: string) => {
  const node = [
    ...getAllByTypeOrEmpty("DropdownMenuItem"),
    ...getAllByTypeOrEmpty("Button"),
    ...getAllByTypeOrEmpty("TouchableOpacity"),
  ].find((candidate) => candidate.props.testID === testID);
  if (!node) throw new Error(`Unable to find node: ${testID}`);
  return node;
};

const getDateFields = () => getAllByTypeOrEmpty("DateField");

const resetTestState = () => {
  mockRouterReplace.mockReset();
  mockRouterPush.mockReset();
  mockAlert.mockReset();
  nativeAlertMock.mockReset();
  mockApplyTemplateMutate.mockReset();
  mockDuplicateMutate.mockReset();
  mockRemoveAppliedScheduleMutate.mockReset();
  mockUpdatePlanMutate.mockReset();
  mockActivePlanData = null;
  mockApplyTemplateResult = null;
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
  };
  Object.keys(mockLocalSearchParams).forEach((key) => {
    delete mockLocalSearchParams[key];
  });
};

describe("TrainingPlanOverview deep-link routing", () => {
  beforeEach(() => {
    resetTestState();
  });

  it("redirects to create when no selected plan id exists", () => {
    renderPlan();

    expect(mockRouterReplace).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  });

  it("keeps deep-link context when selected plan id is provided", () => {
    mockLocalSearchParams.id = "plan-library-selection-1";

    renderPlan();

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
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-1";
    mockLocalSearchParams.nextStep = "settings";

    renderPlan();

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
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-2";
    mockLocalSearchParams.nextStep = "edit-structure";

    renderPlan();

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
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-1";

    renderPlan();

    expect(hasTextContaining("Schedule")).toBe(true);
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
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-snapshot-1";

    renderPlan();

    expect(hasTextContaining("Plan snapshot")).toBe(true);
    expect(screen.getByTestId("training-plan-periodization-preview")).toBeTruthy();
    expect(hasTextContaining("8 weeks")).toBe(true);
    expect(hasTextContaining("4/week")).toBe(true);
    expect(hasTextContaining("Open Calendar")).toBe(false);
    expect(hasTextContaining("Route-backed activities")).toBe(true);
  });

  it("shows one clear schedule anchor mode instead of start plus target dates", () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-1",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-1";

    renderPlan();

    act(() => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

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
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-2";

    renderPlan();

    act(() => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    act(() => {
      findTouchableByText("Finish By").props.onPress();
    });

    const [finishDateField] = getDateFields();
    if (!finishDateField) throw new Error("Expected the finish-date field");
    act(() => {
      finishDateField.props.onChange("2026-04-30");
    });

    act(() => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    expect(mockApplyTemplateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        template_type: "training_plan",
        template_id: "plan-owned-anchor-2",
        start_date: undefined,
        target_date: "2026-04-30",
      }),
    );
  });

  it("requires a finish date when finish-by mode is selected", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-3",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-3";

    renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(async () => {
      findTouchableByText("Finish By").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    await waitFor(() => {
      expect(nativeAlertMock).toHaveBeenCalledWith(
        "Choose a finish date",
        "Pick the date you want this plan to finish, or switch back to Start On.",
      );
    });
    expect(mockApplyTemplateMutate).not.toHaveBeenCalled();
  });

  it("shows the concurrency warning instead of mutating when another active plan exists", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-4",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-4";
    mockActivePlanData = { id: "active-plan-1" };

    renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    expect(findButtonByText("Open Current Plan")).toBeTruthy();
    expect(findButtonByText("Replace Scheduled Plan")).toBeTruthy();
    expect(mockApplyTemplateMutate).not.toHaveBeenCalled();
  });

  it("replaces the scheduled plan when confirmed from the concurrency warning", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-4b",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-4b";
    mockActivePlanData = { id: "active-plan-1" };

    renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-replace-confirm").props.onPress();
    });

    expect(mockApplyTemplateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        template_type: "training_plan",
        template_id: "plan-owned-anchor-4b",
        start_date: undefined,
        target_date: undefined,
        replace_existing: true,
      }),
    );
  });

  it("opens the current active plan from the concurrency warning CTA", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-5",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-5";
    mockActivePlanData = { id: "active-plan-1" };

    renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    await act(async () => {
      findButtonByText("Open Current Plan").props.onPress();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.DETAIL("active-plan-1"),
    );
  });

  it("shows scheduling success actions after apply-template succeeds", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-6",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-6";
    mockApplyTemplateResult = {
      applied_plan_id: "scheduled-plan-1",
      scheduled_sessions_created: 3,
      scheduled_sessions_replaced: 0,
    };

    renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
      await Promise.resolve();
    });

    expect(nativeAlertMock).toHaveBeenCalledWith(
      "Plan scheduled",
      "Scheduled 3 sessions.",
      expect.any(Array),
    );

    const successButtons = nativeAlertMock.mock.calls.at(-1)?.[2];

    act(() => {
      successButtons?.[0]?.onPress?.();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.DETAIL("scheduled-plan-1"),
    );
  });

  it("shows a remove scheduled sessions action when viewing the active plan", () => {
    mockSnapshotState.plan = {
      id: "active-plan-1",
      name: "Active Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "active-plan-1";
    mockActivePlanData = { id: "active-plan-1" };

    renderPlan();

    expect(hasTextContaining("currently scheduled plan")).toBe(true);
    expect(hasTextContaining("Remove Scheduled Sessions")).toBe(true);
  });

  it("removes the active plan's scheduled sessions after confirmation", async () => {
    mockSnapshotState.plan = {
      id: "active-plan-2",
      name: "Active Plan",
      profile_id: "test-profile-id",
      template_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "active-plan-2";
    mockActivePlanData = {
      id: "active-plan-2",
      schedule_batch_id: "33333333-3333-4333-8333-333333333333",
    };

    renderPlan();

    act(() => {
      findNodeByTestId("training-plan-options-remove-scheduled").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-remove-scheduled-confirm").props.onPress();
    });

    expect(mockRemoveAppliedScheduleMutate).toHaveBeenCalledWith({
      schedule_batch_id: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("routes review-activity intent CTA to activity detail", () => {
    mockSnapshotState.plan = {
      id: "plan-3",
      name: "Plan Three",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-3";
    mockLocalSearchParams.nextStep = "review-activity";
    mockLocalSearchParams.activityId = "activity-99";

    renderPlan();

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
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-4";
    mockLocalSearchParams.nextStep = "totally-unsupported-intent";

    renderPlan();

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
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-shared-1";

    renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-duplicate").props.onPress();
    });

    expect(hasTextContaining("Duplicate")).toBe(true);

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

    const duplicateAlertButtons = nativeAlertMock.mock.calls.at(-1)?.[2];
    duplicateAlertButtons?.[0]?.onPress?.();

    expect(mockRouterReplace).toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.DETAIL("duplicated-training-plan-1"),
    );
  });
});
