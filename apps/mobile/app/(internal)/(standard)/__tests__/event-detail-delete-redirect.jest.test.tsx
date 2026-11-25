import { waitFor } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

var mockRouterNavigate = jest.fn();
var mockRouterDismissTo = jest.fn();
var mockQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: null,
  error: { data: { code: "NOT_FOUND" } },
  isLoading: false,
  refetch: jest.fn(),
}));

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
  usePlannedSessionMutations: () => ({
    changePlanOnly: { isPending: false, mutateAsync: jest.fn() },
  }),
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
  useNavigation: () => ({ dispatch: jest.fn() }),
  useRouter: () => ({
    back: jest.fn(),
    dismissTo: mockRouterDismissTo,
    push: jest.fn(),
    navigate: mockRouterNavigate,
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

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
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

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
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

jest.mock("@repo/core/utils/dates", () => ({
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
}));

jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityBgClass: () => "bg-primary",
  getActivityColor: () => ({ name: "Run" }),
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
      events: {
        list: { invalidate: jest.fn() },
        getToday: { invalidate: jest.fn() },
        getById: { invalidate: jest.fn() },
      },
      trainingPlans: {
        invalidate: jest.fn(),
      },
    }),
    routes: {
      get: {
        useQuery: () => ({ data: null }),
      },
      loadFull: {
        useQuery: () => ({ data: null }),
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
    events: {
      getById: {
        useQuery: (input: unknown, options: unknown) => mockQuery(input, options),
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
    activities: {
      createManualDiaryEntry: {
        useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
      },
    },
    plannedSessions: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      recordingLaunch: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      getById: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
      },
      skip: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      linkCompletion: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      completionCandidates: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [], nextCursor: null }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          isLoading: false,
        }),
      },
    },
    profiles: {
      get: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
      },
    },
    activityPlans: {
      getById: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
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
  },
}));

describe("event detail deleted record redirect", () => {
  beforeEach(() => {
    mockRouterNavigate.mockReset();
    mockRouterDismissTo.mockReset();
    mockQuery.mockClear();
  });

  it("uses schedule-aware query freshness for event detail", async () => {
    await renderNative(<EventDetailScreen />);

    expect(mockQuery).toHaveBeenCalledWith(
      { id: "event-1" },
      expect.objectContaining({
        enabled: true,
      }),
    );
  });

  it("dismisses a deleted event route back to the calendar stack", async () => {
    await renderNative(<EventDetailScreen />);

    await waitFor(() => {
      expect(mockRouterDismissTo).toHaveBeenCalledWith({
        pathname: "/(internal)/(tabs)/plan",
        params: { view: "calendar" },
      });
    });

    expect(mockRouterNavigate).not.toHaveBeenCalled();
    expect(screen.getByText("Closing event...")).toBeTruthy();
    expect(screen.queryByText("Event not found")).toBeNull();
  });
});
