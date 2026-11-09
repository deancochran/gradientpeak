import { act, waitFor } from "@testing-library/react-native";
import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

type AlertButton = { onPress?: () => void };
type NativeAlert = (title: string, message?: string, buttons?: AlertButton[]) => void;

var mockAlert = jest.fn<void, Parameters<NativeAlert>>();
var mockApplyTemplateMutate = jest.fn();
var mockDuplicateMutate = jest.fn();
var mockRemoveAppliedScheduleMutate = jest.fn();
var mockTemplateError: Error | null = null;
var mockRefetchTemplate = jest.fn();
var mockLinkedPlans: ReturnType<typeof createActivityPlanSummary>[] = [];
var removalMutationOptions: {
  onError: (error: { message: string; data?: { code: string } }) => void;
};
var mockPreviewRemoveAppliedSchedule = jest.fn(async () => ({
  status: "available" as const,
  applicationId: "33333333-3333-4333-8333-333333333333",
  applicationRevision: 1,
  affected: [{ id: "44444444-4444-4444-8444-444444444444", sessionRevision: 1 }],
  protected: [],
  cutoffDate: "2026-09-14",
  previewFingerprint: `v1:sha256:${"d".repeat(64)}`,
}));
type TrainingPlanFixture = {
  id: string;
  name: string;
  created_at: string;
  structure_hash: string;
  structure: Record<string, unknown>;
  profile_id?: string;
  is_active?: boolean;
  content_visibility?: string;
  is_system_template?: boolean;
  durationWeeks?: { recommended: number };
  sessions_per_week_target?: number;
  activity_category?: string[];
  experienceLevel?: string[];
};
type AppliedScheduleFixture = {
  application_id?: string;
  training_plan_id: string;
  schedule_batch_id?: string;
  starts_at?: string;
};
type ApplyTemplateResult = {
  status: "applied";
  created: number;
};
type InsightTimelineFixture = {
  timeline: Array<{
    adherence_score: number;
    boundary_state: string;
    completed_common_load: number;
    scheduled_common_load: number;
  }>;
  projection: { at_goal_date: Record<string, unknown> };
  adherence_summary: { interpretation: string; contributors: Array<{ detail: string }> };
  readiness_summary: { interpretation: string; contributors: Array<{ detail: string }> };
};
type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};

var mockAppliedScheduleData: AppliedScheduleFixture | null = null;
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
      completed_common_load: index + 100,
      scheduled_common_load: index + 110,
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

jest.mock("expo-crypto", () => ({
  randomUUID: () => "33333333-3333-4333-8333-333333333333",
}));

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
      client: {},
      profiles: {
        get: { fetch: jest.fn(async () => ({ id: "test-profile-id" })) },
      },
      athleteIntelligence: {
        getReadModel: {
          fetch: jest.fn(async () => ({
            publishedRevision: 3,
          })),
        },
      },
      trainingPlans: {
        listAppliedSchedules: { invalidate: jest.fn() },
        preview: {
          fetch: jest.fn(async () => ({
            basePublishedRevision: 3,
            previewFingerprint: "fixture-duplicate-preview",
            status: "available",
          })),
        },
        previewApplication: {
          fetch: jest.fn(async () => ({
            applicable: true,
            basePublishedRevision: 3,
            planHash: "fixture-hash",
            planRevision: 1,
            previewFingerprint: "fixture-preview",
            replacement: null,
            sessions: [],
            status: "available",
            unresolved: [],
          })),
        },
        previewRemoveAppliedSchedule: { fetch: mockPreviewRemoveAppliedSchedule },
        invalidate: jest.fn(),
      },
      events: {
        invalidate: jest.fn(),
      },
    }),
    trainingPlans: {
      commit: {
        useMutation: () => ({
          mutateAsync: async (input: unknown) => {
            mockDuplicateMutate(input);
            return { status: "saved" as const, planId: "duplicated-training-plan-1" };
          },
          isPending: false,
        }),
      },
      getTemplate: {
        useQuery: () => ({
          data: null,
          isLoading: false,
          error: mockTemplateError,
          refetch: mockRefetchTemplate,
        }),
      },
      listAppliedSchedules: {
        useQuery: () => ({
          data: {
            items: mockAppliedScheduleData
              ? [
                  {
                    ...mockAppliedScheduleData,
                    application_revision: 1,
                    eligible_future_count: 1,
                    protected_count: 0,
                    source_revision: 1,
                    start_date: "2026-09-01",
                    next_planning_date: "2026-09-15",
                  },
                ]
              : [],
          },
        }),
      },
      removeAppliedSchedule: {
        useMutation: (options: typeof removalMutationOptions) => {
          removalMutationOptions = options;
          return {
            mutate: mockRemoveAppliedScheduleMutate,
            isPending: false,
          };
        },
      },
      applyApplication: {
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
    athleteIntelligence: {
      getReadModel: {
        useQuery: () => ({
          data: {
            publishedRevision: 1,
          },
          refetch: jest.fn(),
        }),
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
          data: { items: mockLinkedPlans },
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

jest.mock("@/components/training-plan/TrainingPlanKpiRow", () => ({
  __esModule: true,
  TrainingPlanKpiRow: createHost("TrainingPlanKpiRow"),
}));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));
jest.mock("@/components/training-plan/TrainingPlanSummaryHeader", () => ({
  __esModule: true,
  TrainingPlanSummaryHeader: createHost("TrainingPlanSummaryHeader"),
}));
jest.mock("@/components/activity-plan/activity/TimelineChart", () => ({
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
jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: ({
    actions,
    testID,
  }: {
    actions: Array<{ label: string; onPress: () => void; testID: string }>;
    testID: string;
  }) =>
    React.createElement(
      "DetailOverflowMenu",
      { testID },
      actions.map((action) =>
        React.createElement(
          "DropdownMenuItem",
          { ...action, key: action.testID },
          React.createElement("Text", null, action.label),
        ),
      ),
    ),
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
let renderedPlan: Awaited<ReturnType<typeof renderNative>> | undefined;

const renderPlan = async () => {
  renderedPlan = await renderNative(<TrainingPlanOverview />);
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
  return renderedPlan.container.queryAll((node) => node.type === type);
};

const hasTextContaining = (text: string) =>
  getAllByTypeOrEmpty("Text").some((node) => getNodeText(node.props.children).includes(text));

const findTouchableByText = (text: string) => {
  const node = getAllByTypeOrEmpty("TouchableOpacity").find((candidate) => {
    if (typeof candidate.props.onPress !== "function") {
      return false;
    }

    return candidate.queryAll((child) => getNodeText(child.props.children) === text).length > 0;
  });
  if (!node) throw new Error(`Unable to find touchable with text: ${text}`);
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
  mockTemplateError = null;
  mockLinkedPlans = [];
  mockRefetchTemplate.mockReset();
  mockPreviewRemoveAppliedSchedule.mockClear();
  mockAppliedScheduleData = null;
  mockApplyTemplateResult = null;
  mockSnapshotState.plan = null;
  mockSnapshotState.isLoadingSharedDependencies = false;
  mockSnapshotState.hasSharedDependencyError = false;
  mockSnapshotState.insightTimeline = {
    timeline: Array.from({ length: 40 }, (_, index) => ({
      adherence_score: 80,
      boundary_state: "safe",
      completed_common_load: index + 100,
      scheduled_common_load: index + 110,
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

  it("opens linked activity read detail and the canonical editor without committing definitions", async () => {
    const activityId = "11111111-1111-4111-8111-111111111111";
    mockLinkedPlans = [createActivityPlanSummary({ id: activityId, name: "Linked ride" })];
    mockSnapshotState.plan = {
      id: "plan-read",
      name: "Read plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "hash",
      structure: {
        version: 1,
        activity_category: ["bike"],
        plan_preferences: {
          weekly_session_count: null,
          target_weekly_duration_minutes: null,
          maximum_session_duration_minutes: null,
          preferred_weekdays: [],
          rest_days: [],
          progression_style: null,
          recovery_priority: null,
        },
        sessions: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            offset_days: 0,
            activity_plan_id: activityId,
            demand: {
              activity_category: "bike",
              training_intent: "aerobic_base",
              target_duration_minutes: 60,
              target_common_load: null,
              importance: "normal",
            },
          },
        ],
      },
    };
    mockLocalSearchParams.id = "plan-read";
    await renderPlan();
    const card = getAllByTypeOrEmpty("ActivityPlanCard")[0];
    expect(card).toBeDefined();
    await act(() => card?.props.onPress());
    expect(mockRouterPush).toHaveBeenCalledWith(ROUTES.PLAN.PLAN_DETAIL(activityId));
    await act(() => findNodeByTestId("training-plan-options-edit").props.onPress());
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: "plan-read", initialTab: "plan" },
    });
    expect(screen.queryByText("Change")).toBeNull();
    expect(screen.queryByText("Remove")).toBeNull();
    expect(screen.queryByTestId("training-plan-change-visibility-button")).toBeNull();
    expect(screen.queryByTestId("training-plan-activity-picker-modal")).toBeNull();
    expect(mockDuplicateMutate).not.toHaveBeenCalled();
  });

  it("shows template transport failure as a retryable error rather than a missing plan", async () => {
    mockLocalSearchParams.id = "00000000-0000-0000-0000-000000000001";
    mockTemplateError = new Error("Offline");
    await renderPlan();
    expect(screen.getByText("Training plan unavailable")).toBeTruthy();
    expect(screen.queryByText("No Training Plan")).toBeNull();
    const retry = getAllByTypeOrEmpty("Button").find(
      (node) => getNodeText(node.props.children) === "Try again",
    );
    if (!retry) throw new Error("Missing template retry action");
    await act(() => retry.props.onPress());
    expect(mockRefetchTemplate).toHaveBeenCalledTimes(1);
  });

  it("redirects to create when no selected plan id exists", async () => {
    await renderPlan();

    expect(mockRouterReplace).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  });

  it("keeps deep-link context when selected plan id is provided", async () => {
    mockLocalSearchParams.id = "plan-library-selection-1";

    await renderPlan();

    expect(mockRouterReplace).not.toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
    expect(hasTextContaining("No Training Plan")).toBe(true);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("renders focused banner and routes manage intent", async () => {
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

    await renderPlan();

    expect(hasTextContaining("Manage Plan")).toBe(true);

    await act(() => {
      findTouchableByText("Edit plan").props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: "plan-1", initialTab: "plan" },
    });
  });

  it("routes edit-structure intent CTA to structure section", async () => {
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

    await renderPlan();

    expect(hasTextContaining("Edit Plan Structure")).toBe(true);

    await act(() => {
      findTouchableByText("Edit plan").props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: "plan-2", initialTab: "plan" },
    });
  });

  it("shows schedule-first plan actions for owned plans", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-1",
      name: "Owned Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-1";

    await renderPlan();

    expect(hasTextContaining("Schedule")).toBe(true);
    expect(hasTextContaining("Edit Plan")).toBe(true);
    expect(hasTextContaining("Apply Template")).toBe(false);
    expect(hasTextContaining("Edit Structure")).toBe(false);
  });

  it("shows the new plan snapshot and overview copy for owned plans", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-snapshot-1",
      name: "Owned Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {
        version: 1,
        plan_preferences: {
          weekly_session_count: 2,
          target_weekly_duration_minutes: 120,
          maximum_session_duration_minutes: 90,
          preferred_weekdays: [1, 4],
          rest_days: [0, 2, 3, 5, 6],
          progression_style: "balanced",
          recovery_priority: "balanced",
        },
        activity_category: ["run"],
        durationWeeks: { recommended: 8 },
        experienceLevel: ["beginner"],
        sessions: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            offset_days: 0,
            activity_plan_id: "11111111-1111-4111-8111-111111111111",
            demand: {
              activity_category: "run",
              training_intent: "aerobic_base",
              target_duration_minutes: 60,
              target_common_load: 40,
              importance: "normal",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            offset_days: 49,
            activity_plan_id: "11111111-1111-4111-8111-111111111111",
            demand: {
              activity_category: "run",
              training_intent: "aerobic_base",
              target_duration_minutes: 60,
              target_common_load: 40,
              importance: "normal",
            },
          },
        ],
      },
    };
    mockLocalSearchParams.id = "plan-owned-snapshot-1";

    await renderPlan();

    expect(hasTextContaining("Plan schedule")).toBe(true);
    expect(screen.getByTestId("training-plan-planned-preview-plan-owned-snapshot-1")).toBeTruthy();
    expect(hasTextContaining("2 scheduled sessions")).toBe(true);
    expect(hasTextContaining("8 weeks")).toBe(true);
    expect(hasTextContaining("Open Calendar")).toBe(false);
    expect(hasTextContaining("Route-backed activities")).toBe(false);
  });

  it("shows one clear schedule anchor mode instead of start plus target dates", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-1",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-1";

    await renderPlan();

    await act(() => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    expect(hasTextContaining("How should this schedule line up?")).toBe(true);
    expect(hasTextContaining("Start On")).toBe(true);
    expect(hasTextContaining("Finish By")).toBe(true);
    expect(getDateFields()).toHaveLength(1);
    expect(hasTextContaining("Target Date (Optional)")).toBe(false);
    expect(hasTextContaining("Start Date")).toBe(false);
  });

  it("sends only the selected finish-by anchor to scheduling", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-2",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-2";

    await renderPlan();

    await act(() => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(() => {
      findTouchableByText("Finish By").props.onPress();
    });

    const [finishDateField] = getDateFields();
    if (!finishDateField) throw new Error("Expected the finish-date field");
    await act(() => {
      finishDateField.props.onChange("2026-04-30");
    });

    await act(() => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    await act(() => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    expect(mockApplyTemplateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        trainingPlanId: "plan-owned-anchor-2",
        startDate: undefined,
        targetDate: "2026-04-30",
      }),
    );
  });

  it("requires a finish date when finish-by mode is selected", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-3",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-3";

    await renderPlan();

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

  it("applies alongside other scheduled programs without a replacement prompt", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-4",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-4";

    await renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
    });

    expect(mockApplyTemplateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationMode: "full",
        trainingPlanId: "plan-owned-anchor-4",
        startDate: undefined,
        targetDate: undefined,
      }),
    );
    expect(hasTextContaining("Replace Scheduled Plan")).toBe(false);
  });

  it("shows scheduling success actions after apply-template succeeds", async () => {
    mockSnapshotState.plan = {
      id: "plan-owned-anchor-6",
      name: "Anchor Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-owned-anchor-6";
    mockApplyTemplateResult = {
      status: "applied",
      created: 3,
    };

    await renderPlan();

    await act(async () => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });

    await act(async () => {
      findButtonByTestId("training-plan-schedule-confirm").props.onPress();
      await Promise.resolve();
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

    await act(() => {
      successButtons?.[0]?.onPress?.();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith(
      ROUTES.PLAN.TRAINING_PLAN.DETAIL("plan-owned-anchor-6"),
    );
  });

  it("shows a remove scheduled sessions action for a scheduled program", async () => {
    mockSnapshotState.plan = {
      id: "active-plan-1",
      name: "Active Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "active-plan-1";
    mockAppliedScheduleData = {
      application_id: "33333333-3333-4333-8333-333333333333",
      training_plan_id: "active-plan-1",
      schedule_batch_id: "33333333-3333-4333-8333-333333333333",
    };

    await renderPlan();

    await act(() => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });
    await act(() => {
      findNodeByTestId(
        "training-plan-application-33333333-3333-4333-8333-333333333333",
      ).props.onPress();
    });
    await act(() => {
      findButtonByTestId("training-plan-schedule-cancel").props.onPress();
    });

    expect(hasTextContaining("future sessions on your calendar")).toBe(true);
    expect(hasTextContaining("Remove Scheduled Sessions")).toBe(true);
  });

  it("removes only the viewed program's scheduled sessions after confirmation", async () => {
    mockSnapshotState.plan = {
      id: "active-plan-2",
      name: "Active Plan",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "active-plan-2";
    mockAppliedScheduleData = {
      application_id: "33333333-3333-4333-8333-333333333333",
      training_plan_id: "active-plan-2",
      schedule_batch_id: "33333333-3333-4333-8333-333333333333",
    };

    await renderPlan();

    await act(() => {
      findNodeByTestId("training-plan-options-schedule").props.onPress();
    });
    await act(() => {
      findNodeByTestId(
        "training-plan-application-33333333-3333-4333-8333-333333333333",
      ).props.onPress();
    });
    await act(() => {
      findButtonByTestId("training-plan-schedule-cancel").props.onPress();
    });

    await act(async () => {
      findNodeByTestId("training-plan-options-remove-scheduled").props.onPress();
      await Promise.resolve();
    });

    expect(hasTextContaining("This removes 1 future scheduled session after 2026-09-14")).toBe(
      true,
    );

    await act(async () => {
      findButtonByTestId("training-plan-remove-scheduled-confirm").props.onPress();
    });

    expect(mockRemoveAppliedScheduleMutate).toHaveBeenCalledWith({
      applicationId: "33333333-3333-4333-8333-333333333333",
      operationId: "33333333-3333-4333-8333-333333333333",
      previewFingerprint: `v1:sha256:${"d".repeat(64)}`,
    });
    const frozen = mockRemoveAppliedScheduleMutate.mock.calls[0]?.[0];
    await act(async () => removalMutationOptions.onError({ message: "Response lost" }));
    mockSnapshotState.plan.structure_hash = "new-source-hash";
    await renderedPlan?.rerender(<TrainingPlanOverview />);
    await act(async () =>
      findButtonByTestId("training-plan-remove-scheduled-confirm").props.onPress(),
    );
    expect(mockRemoveAppliedScheduleMutate.mock.calls[1]?.[0]).toEqual(frozen);
  });

  it("discards a late removal preview after the route changes and guards double review", async () => {
    mockSnapshotState.plan = {
      id: "plan-a",
      name: "Plan A",
      profile_id: "test-profile-id",
      content_visibility: "private",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "hash-a",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-a";
    mockAppliedScheduleData = {
      application_id: "33333333-3333-4333-8333-333333333333",
      training_plan_id: "plan-a",
    };
    await renderPlan();
    await act(() => findNodeByTestId("training-plan-options-schedule").props.onPress());
    await act(() =>
      findNodeByTestId(
        "training-plan-application-33333333-3333-4333-8333-333333333333",
      ).props.onPress(),
    );
    await act(() => findButtonByTestId("training-plan-schedule-cancel").props.onPress());
    const result = await mockPreviewRemoveAppliedSchedule();
    mockPreviewRemoveAppliedSchedule.mockClear();
    let resolve!: (value: typeof result) => void;
    mockPreviewRemoveAppliedSchedule.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(() => {
      const review = findNodeByTestId("training-plan-options-remove-scheduled").props.onPress;
      review();
      review();
    });
    expect(mockPreviewRemoveAppliedSchedule).toHaveBeenCalledTimes(1);
    mockLocalSearchParams.id = "plan-b";
    mockSnapshotState.plan = { ...mockSnapshotState.plan, id: "plan-b", name: "Plan B" };
    await renderedPlan?.rerender(<TrainingPlanOverview />);
    await act(async () => resolve(result));
    expect(
      getAllByTypeOrEmpty("Button").some(
        (node) => node.props.testID === "training-plan-remove-scheduled-confirm",
      ),
    ).toBe(false);
    expect(mockRemoveAppliedScheduleMutate).not.toHaveBeenCalled();
  });

  it("routes review-activity intent CTA to activity detail", async () => {
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

    await renderPlan();

    expect(hasTextContaining("Review Planned Activity")).toBe(true);

    await act(() => {
      findTouchableByText("Open Activity").props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith(ROUTES.PLAN.ACTIVITY_DETAIL("activity-99"));
  });

  it("does not show focus banner for unknown nextStep", async () => {
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

    await renderPlan();

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
      content_visibility: "public",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {
        id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        plan_preferences: {
          weekly_session_count: 1,
          target_weekly_duration_minutes: 60,
          maximum_session_duration_minutes: 90,
          preferred_weekdays: [1],
          rest_days: [0, 2, 3, 4, 5, 6],
          progression_style: "balanced",
          recovery_priority: "balanced",
        },
        activity_category: ["run"],
        durationWeeks: { recommended: 8 },
        experienceLevel: ["beginner"],
        sessions: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            offset_days: 0,
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
            demand: {
              activity_category: "run",
              training_intent: "aerobic_base",
              target_duration_minutes: 60,
              target_common_load: 40,
              importance: "normal",
            },
          },
        ],
      },
    };
    mockLocalSearchParams.id = "plan-shared-1";

    await renderPlan();

    await act(async () => {
      await findNodeByTestId("training-plan-options-duplicate").props.onPress();
    });

    expect(hasTextContaining("Duplicate")).toBe(true);

    expect(mockDuplicateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "duplicate",
        basePublishedRevision: 3,
        draft: expect.objectContaining({
          sourcePlanId: "plan-shared-1",
          name: "Shared Plan (Copy)",
        }),
      }),
    );
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

  it("does not offer scheduling when the API would reject a shared non-system plan", async () => {
    mockSnapshotState.plan = {
      id: "plan-shared-accessibility",
      name: "Shared Plan",
      profile_id: "someone-else",
      content_visibility: "public",
      created_at: "2026-01-01T00:00:00.000Z",
      structure_hash: "fixture-structure-hash",
      structure: {},
    };
    mockLocalSearchParams.id = "plan-shared-accessibility";

    await renderPlan();

    expect(findNodeByTestId("training-plan-options-duplicate").props).toMatchObject({
      label: "Duplicate training plan",
    });
    expect(() => findNodeByTestId("training-plan-options-schedule")).toThrow();
  });
});
