import { format } from "date-fns";
import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

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
};

const routerNavigateMock = jest.fn();

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

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
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
    events: {
      getById: {
        useQuery: () => ({
          data: eventDetailData,
          error: null,
          isLoading: false,
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
          mutate: jest.fn(),
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
  });

  it("renders planned activity content directly instead of the fallback note", () => {
    const rendered = renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Advanced event detail")).toBeNull();
    expect((rendered as any).UNSAFE_getByType("ActivityPlanCard").props.activityPlan).toEqual(
      expect.objectContaining({
        id: "plan-1",
        name: "Tempo Builder",
      }),
    );
    expect((rendered as any).UNSAFE_getByType("ActivityPlanCard").props.onPress).toEqual(
      expect.any(Function),
    );
    expect(screen.getByText("Monday, March 23, 2026")).toBeTruthy();
    expect(screen.getByText(format(new Date(eventDetailData.starts_at), "h:mm a"))).toBeTruthy();
    expect(screen.queryByText("Schedule details")).toBeNull();
    expect(screen.queryByText("Date")).toBeNull();
    expect(screen.queryByText("Time")).toBeNull();
    expect(screen.getByTestId("event-detail-edit-trigger")).toBeTruthy();
    expect(screen.queryByTestId("event-detail-open-linked-plan")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-trigger")).toBeNull();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
  });

  it("routes the existing edit trigger to the dedicated update screen", () => {
    renderNative(<EventDetailScreen />);

    fireEvent.press(screen.getByTestId("event-detail-edit-trigger"));

    expect(routerNavigateMock).toHaveBeenCalledWith(ROUTES.PLAN.EVENT_UPDATE("event-1"));
  });
});
