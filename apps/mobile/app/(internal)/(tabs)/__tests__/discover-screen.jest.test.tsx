import React, { act } from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();
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

const activityPlans = [
  {
    id: "ap-1",
    name: "Threshold Run",
    created_at: "2026-04-01T10:00:00.000Z",
  },
];

const trainingPlans = [
  {
    id: "tp-1",
    name: "10K Builder",
    description: "Build toward a faster 10K.",
    durationWeeks: { recommended: 8 },
    sport: ["run"],
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

jest.useFakeTimers();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => React.createElement("BottomSheet", props, children),
  BottomSheetBackdrop: (props: any) => React.createElement("BottomSheetBackdrop", props),
  BottomSheetScrollView: ({ children, ...props }: any) =>
    React.createElement("BottomSheetScrollView", props, children),
  BottomSheetView: ({ children, ...props }: any) =>
    React.createElement("BottomSheetView", props, children),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: ({ title }: any) => React.createElement("Text", null, `Header:${title}`),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: ({ activityPlan, onPress }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `activity-plan-${activityPlan.id}` },
      React.createElement("Text", null, activityPlan.name),
    ),
}));

jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: ({ route, onPress }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `route-${route.id}` },
      React.createElement("Text", null, route.name),
    ),
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
  EmptyStateCard: ({ title, description, actionLabel, onAction }: any) =>
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
  Input: ({ value, onChangeText, placeholder, ...props }: any) =>
    React.createElement("TextInput", { value, onChangeText, placeholder, ...props }),
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
    activityPlans: {
      list: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          activityPlansUseInfiniteQueryMock(input, options),
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
  },
}));

const DiscoverScreen = require("../discover").default;

describe("discover screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("defaults to activity plans with one selected record type", () => {
    renderNative(<DiscoverScreen />);

    expect(screen.getByText("Header:Discover")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search activity plans")).toBeTruthy();
    expect(screen.getByTestId("discover-scope-row")).toBeTruthy();
    expect(screen.getByTestId("discover-scope-activityPlans")).toBeTruthy();
    expect(screen.getByTestId("discover-feed-item-activityPlans-ap-1")).toBeTruthy();
    expect(screen.queryByTestId("discover-feed-item-users-user-1")).toBeNull();
    expect(screen.queryByTestId("discover-feed-item-trainingPlans-tp-1")).toBeNull();
    expect(screen.queryByTestId("discover-feed-item-routes-route-1")).toBeNull();
  });

  it("limits queries to the selected scope", async () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-scope-routes"));

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
      expect(screen.getByTestId("discover-feed-item-routes-route-1")).toBeTruthy();
      expect(screen.queryByTestId("discover-feed-item-users-user-1")).toBeNull();
    });
  });

  it("searches across the mixed list with the same debounced query", async () => {
    renderNative(<DiscoverScreen />);

    act(() => {
      fireEvent.changeText(screen.getByPlaceholderText("Search activity plans"), "river");
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(activityPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          includeSystemTemplates: true,
          includeOwnOnly: false,
          includeEstimation: true,
          ownerScope: "all",
          search: "river",
          activityCategories: undefined,
          limit: 25,
        },
        expect.objectContaining({ enabled: true, getNextPageParam: expect.any(Function) }),
      );
      expect(trainingPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(routesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
      expect(usersUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, getNextPageParam: expect.any(Function) }),
      );
    });
  });

  it("keeps only activity-plan sort and filters inside the bottom sheet by default", async () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-filter-button"));
    fireEvent.changeText(screen.getByTestId("discover-filter-activityPlans-tss-min"), "50");
    expect(screen.queryByTestId("discover-filter-routes-category-run")).toBeNull();
    expect(screen.queryByTestId("discover-filter-trainingPlans-sport-run")).toBeNull();
    fireEvent.press(screen.getByTestId("discover-filter-sort-field-created-at"));
    fireEvent.press(screen.getByTestId("discover-filter-sort-direction-asc"));
    fireEvent.press(screen.getByTestId("discover-filter-activityPlans-category-run"));
    fireEvent.press(screen.getByTestId("discover-filter-activityPlans-category-bike"));
    fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(screen.getByTestId("discover-filter-button-dot")).toBeTruthy();
      expect(activityPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          includeSystemTemplates: true,
          includeOwnOnly: false,
          includeEstimation: true,
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
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-scope-routes"));
    fireEvent.press(screen.getByTestId("discover-filter-button"));
    fireEvent.press(screen.getByTestId("discover-filter-sort-field-distance"));
    fireEvent.press(screen.getByTestId("discover-filter-sort-direction-desc"));
    fireEvent.changeText(screen.getByTestId("discover-filter-routes-distance-min"), "10");
    fireEvent.changeText(screen.getByTestId("discover-filter-routes-ascent-max"), "500");
    fireEvent.press(screen.getByTestId("discover-filter-routes-category-run"));
    fireEvent.press(screen.getByTestId("discover-filter-routes-category-bike"));
    fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(routesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          search: undefined,
          activityCategories: ["run", "bike"],
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

  it("blocks invalid filter ranges from being applied", () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-filter-button"));
    fireEvent.changeText(screen.getByTestId("discover-filter-activityPlans-duration-min"), "60");
    fireEvent.changeText(screen.getByTestId("discover-filter-activityPlans-duration-max"), "30");

    expect(screen.getByText("Duration: min cannot be greater than max.")).toBeTruthy();
  });

  it("passes training plan numeric filters and sort to the training plan query", async () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-scope-trainingPlans"));
    fireEvent.press(screen.getByTestId("discover-filter-button"));
    fireEvent.press(screen.getByTestId("discover-filter-sort-field-sessions"));
    fireEvent.press(screen.getByTestId("discover-filter-sort-direction-desc"));
    fireEvent.changeText(screen.getByTestId("discover-filter-trainingPlans-weeks-min"), "8");
    fireEvent.changeText(screen.getByTestId("discover-filter-trainingPlans-sessions-max"), "5");
    fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(trainingPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          search: undefined,
          sport: undefined,
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

  it("shows only profile results when the profiles scope is selected", async () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-scope-users"));

    await waitFor(() => {
      expect(screen.getByTestId("discover-feed-item-users-user-1")).toBeTruthy();
      expect(screen.queryByTestId("discover-feed-item-routes-route-1")).toBeNull();
      expect(screen.queryByTestId("discover-feed-item-trainingPlans-tp-1")).toBeNull();
      expect(screen.queryByTestId("discover-feed-item-activityPlans-ap-1")).toBeNull();
    });
  });
});
