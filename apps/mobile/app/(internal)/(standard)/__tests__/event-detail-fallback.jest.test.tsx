import { format } from "date-fns";
import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

const eventDetailData = {
  id: "event-1",
  event_type: "planned",
  title: "Tempo Builder",
  scheduled_date: "2026-03-23",
  starts_at: "2026-03-23T09:00:00.000Z",
  all_day: false,
  notes: "Bring gels",
  activity_plan: {
    id: "plan-1",
    name: "Tempo Builder",
    description: "Progressive tempo with a strong finish.",
    activity_category: "outdoor_run",
    estimated_duration: 3600,
    estimated_tss: 72,
  },
  recurrence_rule: null as string | null,
  series_id: null as string | null,
  occurrence_key: null as string | null,
  original_starts_at: null as string | null,
};

const eventQueryState = {
  data: eventDetailData as typeof eventDetailData | null,
  error: null as any,
  isLoading: false,
};

const routerNavigateMock = jest.fn();
const deleteEventMutateMock = jest.fn();

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
    Screen: (props: any) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({
    back: jest.fn(),
    navigate: routerNavigateMock,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/components/ScheduleActivityModal", () => ({
  __esModule: true,
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/components/shared/resource-picker", () => ({
  __esModule: true,
  ResourcePickerModal: createHost("ResourcePickerModal"),
}));

jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
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
  formatDurationSec: jest.fn(() => "60 min"),
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
  getActivityColor: () => ({ name: "Outdoor Run" }),
}));

jest.mock("@/lib/utils/plan/dateGrouping", () => ({
  __esModule: true,
  isActivityCompleted: () => false,
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
          data: eventQueryState.data,
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
      getById: {
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
    eventDetailData.activity_plan = {
      id: "plan-1",
      name: "Tempo Builder",
      description: "Progressive tempo with a strong finish.",
      activity_category: "outdoor_run",
      estimated_duration: 3600,
      estimated_tss: 72,
    };
  });

  it("renders planned activity content directly instead of the fallback note", () => {
    const rendered = renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Advanced event detail")).toBeNull();
    expect((rendered as any).UNSAFE_getByType("ActivityPlanCard").props.activityPlan).toEqual(
      expect.objectContaining({ id: "plan-1", name: "Tempo Builder" }),
    );
    expect((rendered as any).UNSAFE_getByType("ActivityPlanCard").props.onPress).toEqual(
      expect.any(Function),
    );
    expect(screen.getByText("Monday, March 23, 2026")).toBeTruthy();
    expect(screen.getByText(format(new Date(eventDetailData.starts_at), "h:mm a"))).toBeTruthy();
    expect(screen.queryByText("Event details")).toBeNull();
    expect(screen.queryByText("Linked activity plan")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-open-activity-plan")).toBeNull();
    expect(screen.getByTestId("event-detail-options-trigger")).toBeTruthy();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
  });

  it("hides cached event details when profile access is denied", () => {
    eventQueryState.error = { data: { code: "FORBIDDEN" }, message: "Forbidden" };

    renderNative(<EventDetailScreen />);

    expect(screen.getByText("Event unavailable")).toBeTruthy();
    expect(screen.getByText("You do not have permission to view this event.")).toBeTruthy();
    expect(screen.queryByText("Tempo Builder")).toBeNull();
    expect(screen.queryByText("Bring gels")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-trigger")).toBeNull();
    expect(screen.queryByText("Comments (0)")).toBeNull();
  });

  it("routes the overflow edit action to the dedicated update screen", () => {
    renderNative(<EventDetailScreen />);

    fireEvent.press(screen.getByTestId("event-detail-options-edit"));

    expect(routerNavigateMock).toHaveBeenCalledWith(ROUTES.PLAN.EVENT_UPDATE("event-1"));
  });

  it("goes straight to delete confirmation for recurring planned events", () => {
    eventDetailData.recurrence_rule = "FREQ=WEEKLY;UNTIL=20260530T235959Z";

    renderNative(<EventDetailScreen />);

    expect(screen.getAllByText("Recurring").length).toBeGreaterThan(0);
    expect(screen.getByText("Every week until May 30, 2026")).toBeTruthy();

    fireEvent.press(screen.getByTestId("event-detail-options-delete"));

    expect(screen.getByTestId("event-detail-delete-confirm-modal")).toBeTruthy();

    fireEvent.press(screen.getByTestId("event-detail-delete-confirm"));

    expect(deleteEventMutateMock).toHaveBeenCalledWith({ id: "event-1", scope: "single" });
  });

  it("requires an explicit delete scope for recurring custom events", () => {
    eventDetailData.event_type = "custom";
    eventDetailData.activity_plan = null as any;
    eventDetailData.recurrence_rule = "FREQ=WEEKLY;UNTIL=20260530T235959Z";

    renderNative(<EventDetailScreen />);

    fireEvent.press(screen.getByTestId("event-detail-options-delete"));

    expect(screen.getByTestId("event-detail-delete-scope-modal")).toBeTruthy();
    expect(deleteEventMutateMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("event-detail-delete-scope-series"));
    fireEvent.press(screen.getByTestId("event-detail-delete-confirm"));

    expect(deleteEventMutateMock).toHaveBeenCalledWith({ id: "event-1", scope: "series" });
  });

  it("treats series-backed occurrence overrides as recurring even without a rule on the row", () => {
    eventDetailData.series_id = "series-1";
    eventDetailData.occurrence_key = "2026-03-23";
    eventDetailData.original_starts_at = "2026-03-23T09:00:00.000Z";

    renderNative(<EventDetailScreen />);

    expect(screen.getAllByText("Recurring").length).toBeGreaterThan(0);
    expect(screen.getByText("Repeats")).toBeTruthy();

    fireEvent.press(screen.getByTestId("event-detail-options-delete"));
    fireEvent.press(screen.getByTestId("event-detail-delete-confirm"));

    expect(deleteEventMutateMock).toHaveBeenCalledWith({ id: "event-1", scope: "single" });
  });

  it("redirects inaccessible event details without rendering private event content", async () => {
    eventQueryState.data = null;
    eventQueryState.error = { data: { code: "NOT_FOUND" }, message: "Event not found" };

    renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Tempo Builder")).toBeNull();
    expect(screen.queryByText("Bring gels")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-trigger")).toBeNull();

    await waitFor(() => {
      expect(routerNavigateMock).toHaveBeenCalledWith(ROUTES.PLAN.CALENDAR);
    });
  });
});
