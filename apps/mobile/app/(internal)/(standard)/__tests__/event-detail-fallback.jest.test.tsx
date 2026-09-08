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
var getActivityColorMock = jest.fn((_activityCategory: string) => ({ name: "Outdoor Run" }));

type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
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
  useLocalSearchParams: () => ({ id: "event-1" }),
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
        useQuery: () => ({
          data: projectedEventData(),
          error: eventQueryState.error,
          isLoading: eventQueryState.isLoading,
          refetch: jest.fn(),
        }),
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
    activityPlans: {
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

  it("renders planned activity content directly instead of the fallback note", async () => {
    const rendered = await renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Advanced event detail")).toBeNull();
    expect(getHostByType(rendered, "ActivityPlanCard").props.plan).toEqual(
      expect.objectContaining({ id: "plan-1", name: "Tempo Builder" }),
    );
    expect(getHostByType(rendered, "ActivityPlanCard").props.onPress).toEqual(expect.any(Function));
    expect(screen.getByText("Monday, March 23, 2026")).toBeTruthy();
    expect(screen.getByTestId("event-detail-title").props.children).toBe("Tempo Builder");
    expect(screen.getByText(format(new Date(eventDetailData.starts_at), "h:mm a"))).toBeTruthy();
    expect(screen.queryByText("Event details")).toBeNull();
    expect(screen.queryByText("Linked activity plan")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-open-activity-plan")).toBeNull();
    expect(screen.getByTestId("event-detail-options-trigger")).toBeTruthy();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
    expect(getActivityColorMock).toHaveBeenCalledWith("run");
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

  it("provides the existing event actions through the shared overflow contract", async () => {
    const rendered = await renderNative(<EventDetailScreen />);

    const menu = getHostByType(rendered, "DetailOverflowMenu");
    expect(menu.props.testID).toBe("event-detail-options-trigger");
    expect(menu.props.actions).toEqual([
      expect.objectContaining({ label: "Edit Event", testID: "event-detail-options-edit" }),
      expect.objectContaining({
        label: "Change Activity Plan",
        testID: "event-detail-options-activity-plan",
      }),
      expect.objectContaining({
        label: "Remove Activity Plan",
        testID: "event-detail-options-remove-activity-plan",
      }),
      expect.objectContaining({
        label: "Delete Event",
        testID: "event-detail-options-delete",
        variant: "destructive",
      }),
    ]);
  });

  it("goes straight to delete confirmation for recurring planned events", async () => {
    eventDetailData.recurrence_rule = "FREQ=WEEKLY;UNTIL=20260530T235959Z";

    await renderNative(<EventDetailScreen />);

    expect(screen.getAllByText("Recurring").length).toBeGreaterThan(0);
    expect(screen.getByText("Every week until May 30, 2026")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("event-detail-options-delete"));

    expect(screen.getByTestId("event-detail-delete-confirm-modal")).toBeTruthy();

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
