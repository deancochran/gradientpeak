import React from "react";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

const createEventMutateMock = jest.fn();
const activityPlansListUseQueryMock: jest.Mock = jest.fn(() => ({
  data: { items: [] },
  isLoading: false,
  error: null,
  refetch: jest.fn(),
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

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
  Pressable: createHost("Pressable"),
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
  useLocalSearchParams: () => ({ mode: "create", date: "2026-03-24" }),
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
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

jest.mock("@/components/shared/ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanSummary: createHost("ActivityPlanSummary"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
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

jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: createHost("EntityCommentsSection"),
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
        useQuery: () => ({ data: null, error: null, isLoading: false, refetch: jest.fn() }),
      },
      create: {
        useMutation: () => ({ isPending: false, mutate: createEventMutateMock }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
      delete: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => activityPlansListUseQueryMock(),
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

describe("event detail create mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activityPlansListUseQueryMock.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("prefills the selected date and requires the user to pick a type in the form", () => {
    const rendered = renderNative(<EventDetailScreen />);

    expect((rendered as any).UNSAFE_getByType("StackScreen").props.options.title).toBe(
      "Create Event",
    );
    expect(screen.getByText("Tuesday, Mar 24, 2026")).toBeTruthy();

    fireEvent.press(screen.getByTestId("event-detail-type-custom"));
    fireEvent(screen.getByTestId("event-detail-title-input"), "changeText", "Swim test");
    fireEvent.press(screen.getByTestId("event-detail-save-button"));

    expect(createEventMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "custom",
        title: "Swim test",
        starts_at: expect.stringMatching(/^2026-03-24T/),
      }),
    );
  });

  it("creates a planned event using a searched activity plan", () => {
    activityPlansListUseQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: "plan-1",
            name: "Tempo Run",
            activity_category: "run",
            estimated_duration: 3600,
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderNative(<EventDetailScreen />);

    fireEvent.press(screen.getByTestId("event-detail-type-planned"));
    fireEvent(screen.getByTestId("event-detail-activity-plan-search-input"), "changeText", "tempo");
    fireEvent.press(screen.getByTestId("event-detail-activity-plan-option-plan-1"));
    fireEvent.press(screen.getByTestId("event-detail-save-button"));

    expect(createEventMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "planned",
        activity_plan_id: "plan-1",
        title: "Tempo Run",
        starts_at: expect.stringMatching(/^2026-03-24T/),
      }),
    );
  });
});
