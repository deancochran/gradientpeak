import React, { act } from "react";
import {
  createButtonComponent,
  createHost,
  type HostProps,
  type PressableHostProps,
} from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();
let localSearchParams: { q?: string; scope?: string } = {};
type ResourceCardProps = {
  onPress?: () => void;
  variant?: string;
};
const activityPlanCardMock = jest.fn(
  ({ plan, onPress, variant }: ResourceCardProps & { plan: { id: string; name: string } }) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `activity-plan-${plan.id}`, variant },
      React.createElement("Text", null, plan.name),
    ),
);
const trainingPlanCardMock = jest.fn(
  ({ plan, onPress, variant }: ResourceCardProps & { plan: { id: string; name: string } }) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `training-plan-${plan.id}`, variant },
      React.createElement("Text", null, plan.name),
    ),
);
const routeCardMock = jest.fn(
  ({ route, onPress, variant }: ResourceCardProps & { route: { id: string; name: string } }) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `route-${route.id}`, variant },
      React.createElement("Text", null, route.name),
    ),
);
const activityPlansUseInfiniteQueryMock = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: { pages: [{ items: activityPlans, nextCursor: undefined }] },
  isLoading: false,
  isRefetching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
}));
const trainingPlansUseInfiniteQueryMock = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: {
    pages: [
      { items: trainingPlans, total: trainingPlans.length, hasMore: false, nextCursor: undefined },
    ],
  },
  isLoading: false,
  isRefetching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
}));
const routesListUseInfiniteQueryMock = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: { pages: [{ items: routes, nextCursor: undefined }] },
  isLoading: false,
  isRefetching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
}));
const usersUseInfiniteQueryMock = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: { pages: [{ users, total: users.length, hasMore: false, nextCursor: undefined }] },
  isLoading: false,
  isRefetching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
}));
const groupsUseInfiniteQueryMock = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: { pages: [{ items: groups, total: groups.length, hasMore: false, nextCursor: undefined }] },
  isLoading: false,
  isRefetching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
}));

const activityPlans = [
  {
    id: "ap-1",
    name: "Threshold Run",
    activity_category: "run",
    created_at: "2026-04-01T10:00:00.000Z",
  },
];

const trainingPlans = [
  {
    id: "tp-1",
    name: "10K Builder",
    description: "Build toward a faster 10K.",
    durationWeeks: { recommended: 8 },
    activity_category: ["run"],
    experienceLevel: ["beginner"],
    sessions_per_week_target: 4,
    created_at: "2026-04-03T10:00:00.000Z",
    updated_at: "2026-04-03T10:00:00.000Z",
  },
];

const routes = [
  {
    id: "route-1",
    name: "River Loop",
    activity_category: "outdoor_run",
    total_distance: 10200,
    total_ascent: 180,
    description: "Flat opening miles with a steady climb home.",
    created_at: "2026-04-02T10:00:00.000Z",
  },
];

const users = [
  {
    id: "user-1",
    username: "alpinefox",
    avatar_url: null,
    is_public: true,
    created_at: "2026-04-04T10:00:00.000Z",
    updated_at: "2026-04-04T10:00:00.000Z",
  },
];

const groups = [
  {
    id: "group-1",
    name: "Morning Climbers",
    description: "Early starts and steady ascents.",
    slug: "morning-climbers",
    created_at: "2026-04-05T10:00:00.000Z",
    updated_at: "2026-04-05T10:00:00.000Z",
  },
];

jest.useFakeTimers();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: PressableHostProps) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: ({
    children,
    footerComponent,
    ...props
  }: HostProps & {
    footerComponent?: (props: { animatedFooterPosition: { value: number } }) => React.ReactNode;
  }) =>
    React.createElement(
      "BottomSheet",
      props,
      children,
      footerComponent?.({ animatedFooterPosition: { value: 0 } }),
    ),
  BottomSheetBackdrop: (props: HostProps) => React.createElement("BottomSheetBackdrop", props),
  BottomSheetFooter: createHost("BottomSheetFooter"),
  BottomSheetScrollView: ({ children, ...props }: HostProps) =>
    React.createElement("BottomSheetScrollView", props, children),
  BottomSheetView: ({ children, ...props }: HostProps) =>
    React.createElement("BottomSheetView", props, children),
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => localSearchParams,
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("expo-router/react-navigation", () => ({
  __esModule: true,
  ...jest.requireActual("expo-router/react-navigation"),
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: ({ title }: { title: string }) => React.createElement("Text", null, `Header:${title}`),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: activityPlanCardMock,
}));

jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: routeCardMock,
}));

jest.mock("@/components/shared/TrainingPlanCard", () => ({
  __esModule: true,
  TrainingPlanCard: trainingPlanCardMock,
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));

jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: ({
    title,
    description,
    actionLabel,
    onAction,
  }: {
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
  }) =>
    React.createElement(
      "View",
      null,
      React.createElement("Text", null, title),
      React.createElement("Text", null, description),
      actionLabel
        ? React.createElement(
            "Pressable",
            { onPress: onAction },
            React.createElement("Text", null, actionLabel),
          )
        : null,
    ),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({
    value,
    onChangeText,
    placeholder,
    testId,
    ...props
  }: Record<string, unknown> & {
    value?: string;
    onChangeText?: (value: string) => void;
    placeholder?: string;
    testId?: string;
  }) =>
    React.createElement("TextInput", {
      value,
      onChangeText,
      placeholder,
      testID: testId,
      ...props,
    }),
}));

jest.mock("@repo/ui/components/slider", () => ({
  __esModule: true,
  Slider: createHost("Slider"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronRight: createHost("ChevronRight"),
  Search: createHost("Search"),
  SlidersHorizontal: createHost("SlidersHorizontal"),
  X: createHost("X"),
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: {
    PLAN: {
      TRAINING_PLAN: {
        DETAIL: (id: string) => `/training-plan-detail?id=${id}`,
      },
    },
  },
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      profiles: { get: { invalidate: jest.fn(async () => undefined) } },
    }),
    activityPlans: {
      list: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          activityPlansUseInfiniteQueryMock(input, options),
      },
    },
    profiles: {
      get: {
        useQuery: () => ({ data: { id: "profile-1" }, isLoading: false }),
      },
    },
    trainingPlans: {
      listTemplates: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          trainingPlansUseInfiniteQueryMock(input, options),
      },
    },
    routes: {
      list: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          routesListUseInfiniteQueryMock(input, options),
      },
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: jest.fn() }),
      },
      searchUsers: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          usersUseInfiniteQueryMock(input, options),
      },
    },
    groups: {
      listDiscoverable: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          groupsUseInfiniteQueryMock(input, options),
      },
    },
  },
}));

const DiscoverScreen = require("../discover").default;
const CommunityScreen = require("../groups").default;

describe("discover screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localSearchParams = {};
  });

  afterEach(async () => {
    await act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("defaults to activity plans with one selected record type", async () => {
    await renderNative(<DiscoverScreen />);

    expect(screen.getByText("Header:Discover")).toBeTruthy();
    expect(screen.getByText("Find your next adventure")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search activity plans")).toBeTruthy();
    expect(screen.getByTestId("discover-scope-row")).toBeTruthy();
    expect(screen.getByTestId("discover-scope-activityPlans")).toBeTruthy();
    expect(screen.getByTestId("discover-feed-item-activityPlans-ap-1")).toBeTruthy();
    expect(screen.queryByTestId("discover-feed-item-users-user-1")).toBeNull();
    expect(screen.queryByTestId("discover-feed-item-trainingPlans-tp-1")).toBeNull();
    expect(screen.queryByTestId("discover-feed-item-routes-route-1")).toBeNull();
  });

  it("keeps Community on its own groups-and-athletes search surface", async () => {
    await renderNative(<CommunityScreen />);

    expect(screen.getByText("Header:Community")).toBeTruthy();
    expect(screen.getByText("Find your training circle")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search groups")).toBeTruthy();
    expect(screen.getByTestId("discover-scope-groups")).toBeTruthy();
    expect(screen.getByTestId("discover-scope-users")).toBeTruthy();
    expect(screen.queryByTestId("discover-scope-activityPlans")).toBeNull();
  });

  it("uses visually rich cards for activity plans, training plans, and routes", async () => {
    await renderNative(<DiscoverScreen />);

    expect(screen.getByTestId("activity-plan-ap-1").props.variant).toBeUndefined();

    await fireEvent.press(screen.getByTestId("discover-scope-trainingPlans"));
    await waitFor(() => {
      expect(screen.getByTestId("training-plan-tp-1").props.variant).toBeUndefined();
    });

    await fireEvent.press(screen.getByTestId("discover-scope-routes"));
    await waitFor(() => {
      expect(screen.getByTestId("route-route-1").props.variant).toBeUndefined();
    });
  });

  it("fetches all scopes in parallel while rendering the selected scope", async () => {
    await renderNative(<DiscoverScreen />);

    await fireEvent.press(screen.getByTestId("discover-scope-routes"));

    await waitFor(() => {
      expect(routesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          search: undefined,
          activityCategories: undefined,
          min_distance_m: undefined,
          max_distance_m: undefined,
          min_ascent_m: undefined,
          max_ascent_m: undefined,
          sort_by: "newest",
          limit: 25,
        },
        expect.objectContaining({ enabled: true, getNextPageParam: expect.any(Function) }),
      );
      expect(activityPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(trainingPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(usersUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(groupsUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(screen.getByTestId("discover-feed-item-routes-route-1")).toBeTruthy();
      expect(screen.queryByTestId("discover-feed-item-users-user-1")).toBeNull();
    });
  });

  it("searches canonical plans with the same debounced query", async () => {
    await renderNative(<DiscoverScreen />);

    await act(async () => {
      await fireEvent.changeText(screen.getByPlaceholderText("Search activity plans"), "river");
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(activityPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          ownerScope: "all",
          search: "river",
          activityCategories: undefined,
          limit: 25,
        },
        expect.objectContaining({ enabled: true, getNextPageParam: expect.any(Function) }),
      );
      expect(trainingPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "river" }),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(routesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "river" }),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(usersUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: "river" }),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(groupsUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "river" }),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
    });
  });

  it("keeps the shared search selectors, accessibility, sanitization, and clear debounce", async () => {
    await renderNative(<DiscoverScreen />);

    const searchInput = screen.getByTestId("discover-search-input");
    expect(screen.getByLabelText("Search activity plans")).toBe(searchInput);
    expect(screen.getByTestId("discover-filter-button")).toBeTruthy();

    await act(async () => {
      await fireEvent.changeText(searchInput, `  ${"r".repeat(100)}`);
    });
    expect(searchInput.props.value).toHaveLength(80);
    expect(screen.getByTestId("discover-search-clear")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("discover-search-clear"));
    expect(screen.getByTestId("discover-search-input").props.value).toBe("");
    expect(activityPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined }),
      expect.anything(),
    );
  });

  it("keeps only activity-plan sort and filters inside the bottom sheet by default", async () => {
    await renderNative(<DiscoverScreen />);

    await fireEvent.press(screen.getByTestId("discover-filter-button"));
    await fireEvent.changeText(
      screen.getByTestId("discover-filter-activityPlans-common-load-min"),
      "50",
    );
    expect(screen.queryByTestId("discover-filter-routes-activity_category-run")).toBeNull();
    expect(screen.queryByTestId("discover-filter-trainingPlans-activity_category-run")).toBeNull();
    await fireEvent.press(screen.getByTestId("discover-filter-sort-field-created-at"));
    await fireEvent.press(screen.getByTestId("discover-filter-sort-direction-asc"));
    await fireEvent.press(
      screen.getByTestId("discover-filter-activityPlans-activity_category-run"),
    );
    await fireEvent.press(
      screen.getByTestId("discover-filter-activityPlans-activity_category-bike"),
    );
    await fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(screen.getByTestId("discover-filter-button-dot")).toBeTruthy();
      expect(activityPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          ownerScope: "all",
          search: undefined,
          activityCategories: ["run", "bike"],
          limit: 25,
        },
        expect.objectContaining({ enabled: true, getNextPageParam: expect.any(Function) }),
      );
    });
  });

  it("passes route range filters and sort to the routes query", async () => {
    await renderNative(<DiscoverScreen />);

    await fireEvent.press(screen.getByTestId("discover-scope-routes"));
    await fireEvent.press(screen.getByTestId("discover-filter-button"));
    await fireEvent.press(screen.getByTestId("discover-filter-sort-field-distance"));
    await fireEvent.press(screen.getByTestId("discover-filter-sort-direction-desc"));
    await fireEvent.changeText(screen.getByTestId("discover-filter-routes-distance-min"), "10");
    await fireEvent.changeText(screen.getByTestId("discover-filter-routes-ascent-max"), "500");
    await fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(routesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          search: undefined,
          activityCategories: undefined,
          min_distance_m: 10000,
          max_distance_m: undefined,
          min_ascent_m: undefined,
          max_ascent_m: 500,
          sort_by: "distance_desc",
          limit: 25,
        },
        expect.objectContaining({ enabled: true, getNextPageParam: expect.any(Function) }),
      );
    });
  });

  it("blocks invalid filter ranges from being applied", async () => {
    await renderNative(<DiscoverScreen />);

    await fireEvent.press(screen.getByTestId("discover-filter-button"));
    await fireEvent.changeText(
      screen.getByTestId("discover-filter-activityPlans-duration-min"),
      "60",
    );
    await fireEvent.changeText(
      screen.getByTestId("discover-filter-activityPlans-duration-max"),
      "30",
    );

    expect(screen.getByText("Duration: min cannot be greater than max.")).toBeTruthy();
  });

  it("passes training plan numeric filters and sort to the training plan query", async () => {
    await renderNative(<DiscoverScreen />);

    await fireEvent.press(screen.getByTestId("discover-scope-trainingPlans"));
    await fireEvent.press(screen.getByTestId("discover-filter-button"));
    await fireEvent.press(screen.getByTestId("discover-filter-sort-field-sessions"));
    await fireEvent.press(screen.getByTestId("discover-filter-sort-direction-desc"));
    await fireEvent.changeText(screen.getByTestId("discover-filter-trainingPlans-weeks-min"), "8");
    await fireEvent.changeText(
      screen.getByTestId("discover-filter-trainingPlans-sessions-max"),
      "5",
    );
    await fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(trainingPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          search: undefined,
          activity_category: undefined,
          experience_level: undefined,
          min_weeks: 8,
          max_weeks: undefined,
          min_sessions_per_week: undefined,
          max_sessions_per_week: 5,
          sort_by: "sessions_desc",
          limit: 25,
        },
        expect.objectContaining({ enabled: true, getNextPageParam: expect.any(Function) }),
      );
    });
  });

  it("rejects a Community-only scope from the Discover route", async () => {
    localSearchParams = { scope: "users" };
    await renderNative(<DiscoverScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("discover-feed-item-activityPlans-ap-1")).toBeTruthy();
      expect(screen.queryByTestId("discover-feed-item-users-user-1")).toBeNull();
      expect(screen.getByText("Header:Discover")).toBeTruthy();
      expect(screen.getByText("Find your next adventure")).toBeTruthy();
    });
  });

  it("rejects a Discover-only scope from the Community route", async () => {
    localSearchParams = { scope: "routes" };
    await renderNative(<CommunityScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("discover-feed-item-groups-group-1")).toBeTruthy();
      expect(screen.queryByTestId("discover-feed-item-routes-route-1")).toBeNull();
      expect(screen.getByText("Header:Community")).toBeTruthy();
    });
  });
});
