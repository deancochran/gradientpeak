import { format } from "date-fns";
import React from "react";
import type { TestInstance as ReactTestInstance } from "test-renderer";
import { ROUTES } from "@/lib/constants/routes";
import { createActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

type ActivityPlanFixture = {
  id: string;
  name: string;
  description: string;
  activity_category: "run" | "bike" | "swim" | "strength" | "other";
  estimated_duration: number;
};
type EventQueryError = { data: { code: string }; message?: string };
function getHostByType(rendered: Awaited<ReturnType<typeof renderNative>>, type: string) {
  return rendered.container.queryAll((node) => node.type === type)[0] as ReactTestInstance;
}

const eventDetailData: {
  id: string;
  event_type: string;
  title: string;
  scheduled_date: string;
  starts_at: string;
  all_day: boolean;
  notes: string;
  status?: string | null;
  linked_activity_id?: string | null;
  activity_plan: ActivityPlanFixture | null;
  route?: {
    id: string;
    name: string;
    total_ascent: number;
    total_descent: number;
    total_distance: number;
  } | null;
  route_id?: string | null;
  recurrence_rule: string | null;
  series_id: string | null;
  occurrence_key: string | null;
  original_starts_at: string | null;
} = {
  id: "event-1",
  event_type: "planned",
  title: "Tempo Builder",
  scheduled_date: "2026-03-23",
  starts_at: "2026-03-23T09:00:00.000Z",
  all_day: false,
  notes: "Bring gels",
  status: "scheduled",
  linked_activity_id: null,
  activity_plan: {
    id: "plan-1",
    name: "Tempo Builder",
    description: "Progressive tempo with a strong finish.",
    activity_category: "run",
    estimated_duration: 3600,
  },
  recurrence_rule: null as string | null,
  series_id: null as string | null,
  occurrence_key: null as string | null,
  original_starts_at: null as string | null,
};

const eventQueryState = {
  data: eventDetailData as typeof eventDetailData | null,
  error: null as EventQueryError | null,
  isLoading: false,
};

function projectedEventData() {
  if (!eventQueryState.data) return null;
  return {
    ...eventQueryState.data,
    activityPlanSummary: eventQueryState.data.activity_plan
      ? createActivityPlanSummary({
          id: eventQueryState.data.activity_plan.id,
          name: eventQueryState.data.activity_plan.name,
          description: eventQueryState.data.activity_plan.description ?? null,
          activityCategory: eventQueryState.data.activity_plan.activity_category ?? "other",
        })
      : null,
  };
}

const routerNavigateMock = jest.fn();
const routerDismissToMock = jest.fn();
const navigateToMock = jest.fn();
const deleteEventMutateMock = jest.fn();
const completePlannedMock = jest.fn();
const associateRecordedMock = jest.fn();
const changePlanOnlyMock = jest.fn();
const movePlannedMock = jest.fn();
const cancelPlannedMock = jest.fn();
const plannedSessionRefetchMock = jest.fn(async () => undefined);
let plannedSessionMutationOptions: unknown;
let completionCandidates: { canAssociate: boolean; items: unknown[]; nextCursor: null } = {
  canAssociate: true,
  items: [],
  nextCursor: null,
};
const eventQueryCalls: unknown[][] = [];
const plannedQueryCalls: unknown[][] = [];
let routeParams: Record<string, string> = { id: "event-1" };
let plannedSession: unknown = null;
let plannedSessionError: EventQueryError | null = null;
var getActivityColorMock = jest.fn((_activityCategory: string) => ({ name: "Outdoor Run" }));

type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("@repo/api/react", () => ({
  __esModule: true,
  usePlannedSessionMutations: (options: unknown) => {
    plannedSessionMutationOptions = options;
    return {
      cancel: { isPending: false, mutateAsync: cancelPlannedMock },
      changePlanOnly: { isPending: false, mutateAsync: changePlanOnlyMock },
      move: { isPending: false, mutateAsync: movePlannedMock },
    };
  },
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
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
  useLocalSearchParams: () => routeParams,
  useNavigation: () => ({ dispatch: jest.fn() }),
  useRouter: () => ({
    back: jest.fn(),
    dismissTo: routerDismissToMock,
    navigate: routerNavigateMock,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/components/ScheduleActivityModal", () => ({
  __esModule: true,
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: createHost("RouteCard"),
}));
jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppConfirmModal: ({
    primaryAction,
    testID,
  }: {
    primaryAction: { onPress: () => void; testID: string };
    testID?: string;
  }) =>
    React.createElement(
      "AppConfirmModal",
      { testID },
      React.createElement("Button", primaryAction),
    ),
  AppFormModal: ({
    children,
    primaryAction,
    testID,
  }: React.PropsWithChildren<{ primaryAction?: React.ReactNode; testID?: string }>) =>
    React.createElement("AppFormModal", { testID }, children, primaryAction),
}));

jest.mock("@/components/shared/resource-picker", () => ({
  __esModule: true,
  ResourcePickerModal: createHost("ResourcePickerModal"),
}));
jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: ({
    actions,
    testID,
  }: {
    actions: Array<{
      disabled?: boolean;
      label: string;
      onPress: () => void;
      testID: string;
      variant?: "default" | "destructive";
    }>;
    testID: string;
  }) =>
    React.createElement(
      "DetailOverflowMenu",
      { actions, testID },
      actions.map((action) =>
        React.createElement("DetailOverflowMenuAction", { ...action, key: action.testID }),
      ),
    ),
}));

jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ testId, testID, ...props }: Record<string, unknown> & { testId?: string }) =>
    React.createElement("Button", { ...props, testID: testId ?? testID }),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/input", () => ({ __esModule: true, Input: createHost("Input") }));
jest.mock("@repo/ui/components/switch", () => ({ __esModule: true, Switch: createHost("Switch") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: createHost("DateTimePicker"),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/core"),
  formatDurationSec: jest.fn(() => "60 min"),
  isActivityCompleted: () => false,
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: jest.fn() },
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: jest.fn(async () => undefined),
  refreshScheduleWithCallbacks: jest.fn(async () => undefined),
}));

jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityBgClass: () => "bg-primary",
  getActivityColor: (activityCategory: string) => getActivityColorMock(activityCategory),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: "ArrowUpRight",
  Calendar: "Calendar",
  CheckCircle2: "CheckCircle2",
  Ellipsis: "Ellipsis",
  Play: "Play",
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      events: { invalidate: jest.fn() },
    }),
    events: {
      getById: {
        useQuery: (...args: unknown[]) => {
          eventQueryCalls.push(args);
          return {
            data: projectedEventData(),
            error: eventQueryState.error,
            isLoading: eventQueryState.isLoading,
            refetch: jest.fn(),
          };
        },
      },
      create: {
        useMutation: () => ({
          isPending: false,
          mutate: jest.fn(),
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutate: jest.fn(),
        }),
      },
      delete: {
        useMutation: () => ({
          isPending: false,
          mutate: deleteEventMutateMock,
        }),
      },
    },
    plannedSessions: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      getById: {
        useQuery: (...args: unknown[]) => {
          plannedQueryCalls.push(args);
          return {
            data: plannedSession,
            isLoading: false,
            error: plannedSessionError,
            refetch: plannedSessionRefetchMock,
          };
        },
      },
      completionCandidates: {
        useInfiniteQuery: () => ({
          data: { pages: [completionCandidates] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
      linkCompletion: { useMutation: () => ({ mutateAsync: associateRecordedMock }) },
      skip: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      recordingLaunch: { useMutation: () => ({ mutateAsync: jest.fn() }) },
    },
    profiles: { get: { useQuery: () => ({ data: { planning_timezone: "UTC" } }) } },
    activities: {
      createManualDiaryEntry: { useMutation: () => ({ mutateAsync: completePlannedMock }) },
    },
    activityPlans: {
      getById: {
        useQuery: () => ({
          data: { detail: { activityCategory: "run" } },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        }),
      },
      list: {
        useQuery: () => ({
          data: { items: [] },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        }),
      },
    },
    trainingPlans: {
      get: {
        useQuery: () => ({ data: null }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
      loadFull: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
    },
    social: {
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
  },
}));

describe("event detail fallback screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeParams = { id: "event-1" };
    plannedSession = null;
    plannedSessionError = null;
    plannedSessionMutationOptions = undefined;
    movePlannedMock.mockReset();
    cancelPlannedMock.mockReset();
    plannedSessionRefetchMock.mockClear();
    completionCandidates = { canAssociate: true, items: [], nextCursor: null };
    eventQueryCalls.length = 0;
    plannedQueryCalls.length = 0;
    eventQueryState.data = eventDetailData;
    eventQueryState.error = null;
    eventQueryState.isLoading = false;
    eventDetailData.recurrence_rule = null;
    eventDetailData.series_id = null;
    eventDetailData.occurrence_key = null;
    eventDetailData.original_starts_at = null;
    eventDetailData.event_type = "planned";
    eventDetailData.status = "scheduled";
    eventDetailData.linked_activity_id = null;
    eventDetailData.route = null;
    eventDetailData.route_id = null;
    eventDetailData.activity_plan = {
      id: "plan-1",
      name: "Tempo Builder",
      description: "Progressive tempo with a strong finish.",
      activity_category: "run",
      estimated_duration: 3600,
    };
  });

  it("isolates planned-session reads and completes without invented actual values", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 1,
      planningDate: "2000-01-01",
      lifecycle: { status: "scheduled" },
      source: { kind: "direct", operationId: "a".repeat(32) },
      prescription: {
        resolutionManifest: {
          activity_plan_id: "00000000-0000-4000-8000-000000000003",
          resolved_structure: { activity_category: "run" },
        },
      },
    };
    completePlannedMock.mockRejectedValueOnce(new Error("Request status is unknown"));
    await renderNative(<EventDetailScreen />);
    expect(eventQueryCalls[0]?.[1]).toMatchObject({ enabled: false });
    expect(plannedQueryCalls[0]?.[1]).toMatchObject({ enabled: true });
    await fireEvent.press(screen.getByTestId("planned-session-actual-details-toggle"));
    const duration = screen.getByLabelText("Actual duration (minutes, optional)");
    await fireEvent(duration, "changeText", "30");
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    try {
      await fireEvent.press(screen.getByTestId("planned-session-complete-full"));
      await waitFor(() => expect(completePlannedMock).toHaveBeenCalledTimes(1));
    } finally {
      if (cryptoDescriptor) {
        Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "crypto");
      }
    }
    const payload = completePlannedMock.mock.calls[0]?.[0];
    expect(payload.observation).toMatchObject({
      activityCategory: "run",
      diaryDate: "2000-01-01",
      name: "Completed activity",
      operationId: "00000000-0000-4000-8000-000000000000",
    });
    expect(payload.observation).toMatchObject({
      elapsedMs: 1_800_000,
      distanceMeters: null,
      notes: null,
    });
    expect(duration.props.value).toBe("30");
    expect(screen.getByTestId("planned-session-retry")).toBeTruthy();
  });

  it("offers a retry rather than a not-found state when a planned-session read fails transiently", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSessionError = { data: { code: "INTERNAL_SERVER_ERROR" }, message: "Temporary outage" };

    await renderNative(<EventDetailScreen />);

    expect(screen.getByText("Planned session unavailable")).toBeTruthy();
    expect(
      screen.getByText(
        "The planned session could not be loaded. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Planned session not found")).toBeNull();
    await fireEvent.press(screen.getByText("Retry"));
    expect(plannedSessionRefetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders planned-session not found only after a confirmed NOT_FOUND response", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSessionError = { data: { code: "NOT_FOUND" }, message: "Not found" };

    await renderNative(<EventDetailScreen />);

    expect(screen.getByText("Planned session not found")).toBeTruthy();
    expect(screen.queryByText("Planned session unavailable")).toBeNull();
  });

  it("creates a private edit copy for a reference-only scheduled session", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 4,
      planningDate: "2099-01-01",
      lifecycle: { status: "scheduled" },
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      prescription: null,
    };
    changePlanOnlyMock.mockResolvedValueOnce({
      outcome: "updated",
      session: { activityPlanId: "00000000-0000-4000-8000-000000000004" },
    });

    await renderNative(<EventDetailScreen />);
    expect(screen.getByTestId("planned-session-edit-this-only")).toBeTruthy();
    expect(screen.getByTestId("planned-session-edit-all")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("planned-session-edit-this-only"));

    await waitFor(() =>
      expect(changePlanOnlyMock).toHaveBeenCalledWith({
        expectedRevision: 4,
        profileId: "00000000-0000-4000-8000-000000000002",
        sessionId: "00000000-0000-4000-8000-000000000001",
      }),
    );
    expect(navigateToMock).toHaveBeenCalledWith(
      "/create-activity-plan?planId=00000000-0000-4000-8000-000000000004",
    );
    expect(plannedSessionMutationOptions).toMatchObject({ onConflict: expect.any(Function) });
  });

  it("does not navigate when preparing the private edit copy fails", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 4,
      planningDate: "2099-01-01",
      lifecycle: { status: "scheduled" },
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      prescription: null,
    };
    changePlanOnlyMock.mockRejectedValueOnce(new Error("Session was changed elsewhere"));

    await renderNative(<EventDetailScreen />);
    await fireEvent.press(screen.getByTestId("planned-session-edit-this-only"));

    expect(await screen.findByText("Session was changed elsewhere")).toBeTruthy();
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it("moves a scheduled planned session with its revision and retries the identical request", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 7,
      planningDate: "2099-05-14",
      lifecycle: { status: "scheduled" },
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      prescription: null,
    };
    movePlannedMock.mockRejectedValueOnce(new Error("Move status is unknown"));

    await renderNative(<EventDetailScreen />);
    await fireEvent.press(screen.getByTestId("planned-session-reschedule"));
    expect(screen.getByTestId("planned-session-reschedule-date")).toBeTruthy();
    expect(screen.getByTestId("planned-session-reschedule-date-input")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("planned-session-reschedule-submit"));

    const expectedInput = {
      expectedRevision: 7,
      planningDate: "2099-05-14",
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionId: "00000000-0000-4000-8000-000000000001",
    };
    await waitFor(() => expect(movePlannedMock).toHaveBeenCalledWith(expectedInput));
    expect(screen.getByText("Move status is unknown")).toBeTruthy();

    movePlannedMock.mockResolvedValueOnce({ outcome: "updated" });
    await fireEvent.press(screen.getByTestId("planned-session-retry-reschedule"));
    await waitFor(() => expect(movePlannedMock).toHaveBeenCalledTimes(2));
    expect(movePlannedMock.mock.calls[1]?.[0]).toEqual(expectedInput);
  });

  it("keeps conflict recovery guidance after the actual move mutation rejects", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 7,
      planningDate: "2099-05-14",
      lifecycle: { status: "scheduled" },
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      prescription: null,
    };
    movePlannedMock.mockImplementationOnce(async () => {
      const options = plannedSessionMutationOptions as { onConflict: () => Promise<unknown> };
      plannedSession = {
        ...(plannedSession as Record<string, unknown>),
        planningDate: "2099-05-15",
        sessionRevision: 8,
      };
      await options.onConflict();
      throw { data: { code: "CONFLICT" }, message: "Session changed elsewhere" };
    });

    await renderNative(<EventDetailScreen />);
    await fireEvent.press(screen.getByTestId("planned-session-reschedule"));
    await fireEvent.press(screen.getByTestId("planned-session-reschedule-submit"));
    await waitFor(() => expect(movePlannedMock).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      expect(plannedSessionRefetchMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("planned-session-reschedule-date")).toBeNull();
      expect(
        screen.getByText("This session changed. Review the updated schedule before trying again."),
      ).toBeTruthy();
    });

    movePlannedMock.mockResolvedValueOnce({ outcome: "updated" });
    await fireEvent.press(screen.getByTestId("planned-session-reschedule"));
    await fireEvent.press(screen.getByTestId("planned-session-reschedule-submit"));
    await waitFor(() => expect(movePlannedMock).toHaveBeenCalledTimes(2));
    expect(movePlannedMock.mock.calls[1]?.[0]).toEqual({
      expectedRevision: 8,
      planningDate: "2099-05-15",
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("confirms cancellation for scheduled sessions", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 8,
      planningDate: "2099-05-14",
      lifecycle: { status: "scheduled" },
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      prescription: null,
    };
    cancelPlannedMock.mockResolvedValueOnce({ outcome: "updated" });

    await renderNative(<EventDetailScreen />);
    await fireEvent.press(screen.getByTestId("planned-session-cancel"));
    expect(screen.getByTestId("planned-session-confirm-cancel")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("planned-session-confirm-cancel"));
    await waitFor(() =>
      expect(cancelPlannedMock).toHaveBeenCalledWith({
        expectedRevision: 8,
        profileId: "00000000-0000-4000-8000-000000000002",
        reason: "user_requested",
        sessionId: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("does not render move or cancel actions for a cancelled session", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 9,
      planningDate: "2099-05-14",
      lifecycle: { status: "cancelled" },
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      prescription: null,
    };
    await renderNative(<EventDetailScreen />);
    expect(screen.getByText("cancelled")).toBeTruthy();
    expect(screen.queryByTestId("planned-session-reschedule")).toBeNull();
    expect(screen.queryByTestId("planned-session-cancel")).toBeNull();
  });

  it("retains an invalid actual draft and does not submit a planned completion", async () => {
    routeParams = {
      id: "00000000-0000-4000-8000-000000000001",
      resourceType: "planned_session",
    };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 1,
      planningDate: "2000-01-01",
      lifecycle: { status: "scheduled" },
      source: { kind: "direct", operationId: "a".repeat(32) },
      prescription: {
        resolutionManifest: {
          activity_plan_id: "00000000-0000-4000-8000-000000000003",
          resolved_structure: { activity_category: "run" },
        },
      },
    };
    await renderNative(<EventDetailScreen />);

    await fireEvent.press(screen.getByTestId("planned-session-actual-details-toggle"));
    const duration = screen.getByLabelText("Actual duration (minutes, optional)");
    await fireEvent(duration, "changeText", "invalid");
    await fireEvent.press(screen.getByTestId("planned-session-complete-full"));

    await waitFor(() =>
      expect(
        screen.getByText("Correct the actual details before completing this session."),
      ).toBeTruthy(),
    );
    expect(duration.props.value).toBe("invalid");
    expect(completePlannedMock).not.toHaveBeenCalled();
  });

  it("does not expose planned completion controls before the planning date", async () => {
    routeParams = { id: "00000000-0000-4000-8000-000000000001", resourceType: "planned_session" };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 1,
      planningDate: "2999-01-01",
      lifecycle: { status: "scheduled" },
      source: { kind: "direct", operationId: "a".repeat(32) },
      prescription: {
        resolutionManifest: {
          activity_plan_id: "00000000-0000-4000-8000-000000000003",
          resolved_structure: { activity_category: "run" },
        },
      },
    };
    await renderNative(<EventDetailScreen />);
    expect(screen.queryByTestId("planned-session-complete-full")).toBeNull();
  });

  it("does not associate until the user explicitly chooses a recorded activity", async () => {
    routeParams = { id: "00000000-0000-4000-8000-000000000001", resourceType: "planned_session" };
    plannedSession = {
      id: routeParams.id,
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 2,
      planningDate: "2000-01-01",
      lifecycle: {
        status: "completed",
        completion: { state: "linked", activityId: "00000000-0000-4000-8000-000000000004" },
      },
      source: { kind: "direct", operationId: "a".repeat(32) },
      prescription: {
        resolutionManifest: {
          activity_plan_id: "00000000-0000-4000-8000-000000000003",
          resolved_structure: { activity_category: "run" },
        },
      },
    };
    completionCandidates = {
      canAssociate: true,
      items: [
        {
          id: "00000000-0000-4000-8000-000000000005",
          name: "Imported run",
          activityCategory: "run",
          startedAt: "2026-08-10T08:00:00.000Z",
          elapsedMs: 1800000,
        },
      ],
      nextCursor: null,
    };
    await renderNative(<EventDetailScreen />);
    await fireEvent.press(screen.getByTestId("planned-session-associate-recorded"));
    expect(associateRecordedMock).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByTestId("planned-session-candidate-00000000-0000-4000-8000-000000000005"),
    );
    await fireEvent.press(screen.getByTestId("planned-session-confirm-association"));
    await waitFor(() => expect(associateRecordedMock).toHaveBeenCalledTimes(1));
    expect(associateRecordedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: "00000000-0000-4000-8000-000000000005",
        expectedRevision: 2,
        profileId: "00000000-0000-4000-8000-000000000002",
        sessionId: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("renders an executable event without an event-owned activity-plan attachment", async () => {
    await renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Advanced event detail")).toBeNull();
    expect(screen.getByText("Monday, March 23, 2026")).toBeTruthy();
    expect(screen.getByTestId("event-detail-title").props.children).toBe("Tempo Builder");
    expect(screen.getByText(format(new Date(eventDetailData.starts_at), "h:mm a"))).toBeTruthy();
    expect(screen.queryByText("Event details")).toBeNull();
    expect(screen.queryByText("Linked activity plan")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-open-activity-plan")).toBeNull();
    expect(screen.getByTestId("event-detail-options-trigger")).toBeTruthy();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
    expect(getActivityColorMock).not.toHaveBeenCalled();
  });

  it("does not present a cancelled linked event as completed", async () => {
    eventDetailData.status = "cancelled";
    eventDetailData.linked_activity_id = "activity-cancelled";

    await renderNative(<EventDetailScreen />);

    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByText("Activity Completed")).toBeNull();
  });

  it("hides cached event details when profile access is denied", async () => {
    eventQueryState.error = { data: { code: "FORBIDDEN" }, message: "Forbidden" };

    await renderNative(<EventDetailScreen />);

    expect(screen.getByText("Event unavailable")).toBeTruthy();
    expect(screen.getByText("You do not have permission to view this event.")).toBeTruthy();
    expect(screen.queryByText("Tempo Builder")).toBeNull();
    expect(screen.queryByText("Bring gels")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-trigger")).toBeNull();
    expect(screen.queryByText("Comments (0)")).toBeNull();
  });

  it("renders and opens the event-owned route separately from the activity plan", async () => {
    eventDetailData.route_id = "route-1";
    eventDetailData.route = {
      id: "route-1",
      name: "River Loop",
      total_ascent: 240,
      total_descent: 230,
      total_distance: 12500,
    };
    const rendered = await renderNative(<EventDetailScreen />);

    const routeCard = getHostByType(rendered, "RouteCard");
    expect(routeCard.props.route).toEqual(
      expect.objectContaining({
        id: "route-1",
        total_ascent: 240,
        total_descent: 230,
        total_distance: 12500,
      }),
    );
    expect(routeCard.props.onPress).toEqual(expect.any(Function));

    await fireEvent.press(routeCard);
    expect(navigateToMock).toHaveBeenCalledWith(ROUTES.ROUTES.DETAIL("route-1"));
  });

  it("routes the overflow edit action to the dedicated update screen", async () => {
    await renderNative(<EventDetailScreen />);

    await fireEvent.press(screen.getByTestId("event-detail-options-edit"));

    expect(routerNavigateMock).toHaveBeenCalledWith(ROUTES.PLAN.EVENT_UPDATE("event-1"));
  });

  it("provides generic event actions through the shared overflow contract", async () => {
    const rendered = await renderNative(<EventDetailScreen />);

    const menu = getHostByType(rendered, "DetailOverflowMenu");
    expect(menu.props.testID).toBe("event-detail-options-trigger");
    expect(menu.props.actions).toEqual([
      expect.objectContaining({ label: "Edit Event", testID: "event-detail-options-edit" }),
      expect.objectContaining({
        label: "Delete Event",
        testID: "event-detail-options-delete",
        variant: "destructive",
      }),
    ]);
  });

  it("requires a delete scope for recurring executable events", async () => {
    eventDetailData.recurrence_rule = "FREQ=WEEKLY;UNTIL=20260530T235959Z";

    await renderNative(<EventDetailScreen />);

    expect(screen.getAllByText("Recurring").length).toBeGreaterThan(0);
    expect(screen.getByText("Every week until May 30, 2026")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("event-detail-options-delete"));

    expect(screen.getByTestId("event-detail-delete-scope-modal")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("event-detail-delete-scope-single"));
    await fireEvent.press(screen.getByTestId("event-detail-delete-confirm"));

    expect(deleteEventMutateMock).toHaveBeenCalledWith({ id: "event-1", scope: "single" });
  });

  it("requires an explicit delete scope for recurring custom events", async () => {
    eventDetailData.event_type = "custom";
    eventDetailData.activity_plan = null;
    eventDetailData.recurrence_rule = "FREQ=WEEKLY;UNTIL=20260530T235959Z";

    await renderNative(<EventDetailScreen />);

    await fireEvent.press(screen.getByTestId("event-detail-options-delete"));

    expect(screen.getByTestId("event-detail-delete-scope-modal")).toBeTruthy();
    expect(deleteEventMutateMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("event-detail-delete-scope-series"));
    await fireEvent.press(screen.getByTestId("event-detail-delete-confirm"));

    expect(deleteEventMutateMock).toHaveBeenCalledWith({ id: "event-1", scope: "series" });
  });

  it("treats series-backed occurrence overrides as recurring even without a rule on the row", async () => {
    eventDetailData.series_id = "series-1";
    eventDetailData.occurrence_key = "2026-03-23";
    eventDetailData.original_starts_at = "2026-03-23T09:00:00.000Z";

    await renderNative(<EventDetailScreen />);

    expect(screen.getAllByText("Recurring").length).toBeGreaterThan(0);
    expect(screen.getByText("Repeats")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("event-detail-options-delete"));
    await fireEvent.press(screen.getByTestId("event-detail-delete-scope-single"));
    await fireEvent.press(screen.getByTestId("event-detail-delete-confirm"));

    expect(deleteEventMutateMock).toHaveBeenCalledWith({ id: "event-1", scope: "single" });
  });

  it("redirects inaccessible event details without rendering private event content", async () => {
    eventQueryState.data = null;
    eventQueryState.error = { data: { code: "NOT_FOUND" }, message: "Event not found" };

    await renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Tempo Builder")).toBeNull();
    expect(screen.queryByText("Bring gels")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-trigger")).toBeNull();

    await waitFor(() => {
      expect(routerDismissToMock).toHaveBeenCalledWith(ROUTES.PLAN.CALENDAR);
    });
  });
});
