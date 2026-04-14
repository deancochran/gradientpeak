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
const trainingPlansUseQueryMock = jest.fn((_input?: unknown) => ({
  data: trainingPlans,
  isLoading: false,
  isRefetching: false,
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

const activityPlans = [
  {
    id: "ap-1",
    name: "Threshold Run",
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
  },
  {
    id: "route-2",
    name: "Canyon Tempo",
    activity_category: "outdoor_run",
    total_distance: 12400,
    total_ascent: 260,
    description: "A longer route with a steady climb through the canyon.",
  },
];

const users = [
  {
    id: "user-1",
    username: "alpinefox",
    avatar_url: null,
    is_public: true,
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

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  ChevronRight: createHost("ChevronRight"),
  Dumbbell: createHost("Dumbbell"),
  MapPin: createHost("MapPin"),
  Search: createHost("Search"),
  SlidersHorizontal: createHost("SlidersHorizontal"),
  Users: createHost("Users"),
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
        useQuery: (input?: unknown) => trainingPlansUseQueryMock(input),
      },
    },
    routes: {
      list: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          routesListUseInfiniteQueryMock(input, options),
      },
    },
    social: {
      searchUsers: {
        useQuery: jest.fn((input?: any) => ({
          data: { users, total: users.length, hasMore: false },
          isLoading: false,
          isRefetching: false,
          refetch: jest.fn(),
          input,
        })),
      },
    },
  },
}));

const DiscoverScreen = require("../discover").default;

describe("discover screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activityPlansUseInfiniteQueryMock.mockClear();
    trainingPlansUseQueryMock.mockClear();
    routesListUseInfiniteQueryMock.mockClear();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("renders a mixed discover feed by default", () => {
    renderNative(<DiscoverScreen />);

    expect(screen.getByText("Header:Discover")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search plans, routes, and profiles")).toBeTruthy();
    expect(screen.getByTestId("discover-section-activityPlans-0")).toBeTruthy();
    expect(screen.getByTestId("discover-section-trainingPlans-1")).toBeTruthy();
    expect(screen.getByTestId("discover-section-routes-2")).toBeTruthy();
    expect(screen.getByTestId("discover-section-users-3")).toBeTruthy();
    expect(screen.queryByText("Search anything in Discover")).toBeNull();
    expect(screen.queryByText("Change in filters")).toBeNull();
  });

  it("uses type filters to exclude deselected result sections", async () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-filter-button"));
    fireEvent.press(screen.getByTestId("discover-filter-type-activityPlans"));
    fireEvent.press(screen.getByTestId("discover-filter-type-routes"));
    fireEvent.press(screen.getByTestId("discover-filter-type-users"));
    fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(screen.queryByTestId("discover-section-activityPlans-0")).toBeNull();
      expect(screen.getByTestId("discover-section-trainingPlans-0")).toBeTruthy();
      expect(screen.queryByTestId("discover-section-routes-0")).toBeNull();
      expect(screen.queryByTestId("discover-section-users-0")).toBeNull();
    });

    expect(screen.getByTestId("discover-filter-button-dot")).toBeTruthy();
  });

  it("searches across all result types with the same debounced query", async () => {
    renderNative(<DiscoverScreen />);

    act(() => {
      fireEvent.changeText(screen.getByPlaceholderText("Search plans, routes, and profiles"), "river");
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(activityPlansUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          includeSystemTemplates: true,
          includeOwnOnly: false,
          includeEstimation: false,
          ownerScope: "all",
          search: "river",
          limit: 20,
        },
        expect.objectContaining({ getNextPageParam: expect.any(Function) }),
      );
      expect(trainingPlansUseQueryMock).toHaveBeenLastCalledWith({ search: "river" });
      expect(routesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
        {
          search: "river",
          limit: 20,
        },
        expect.objectContaining({ getNextPageParam: expect.any(Function) }),
      );
      expect(screen.getByTestId("discover-section-routes-0")).toBeTruthy();
      expect(screen.getByTestId("discover-section-activityPlans-1")).toBeTruthy();
    });
  });

  it("can show profiles alongside the mixed search feed", () => {
    renderNative(<DiscoverScreen />);

    expect(screen.getByText("alpinefox")).toBeTruthy();
    expect(screen.getByText("Open profile")).toBeTruthy();
  });

  it("shows an empty state when all types are deselected", async () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByTestId("discover-filter-button"));
    fireEvent.press(screen.getByTestId("discover-filter-type-activityPlans"));
    fireEvent.press(screen.getByTestId("discover-filter-type-trainingPlans"));
    fireEvent.press(screen.getByTestId("discover-filter-type-routes"));
    fireEvent.press(screen.getByTestId("discover-filter-type-users"));
    fireEvent.press(screen.getByTestId("discover-filter-apply"));

    await waitFor(() => {
      expect(screen.getByText("No result types selected")).toBeTruthy();
      expect(
        screen.getByText("Choose at least one content type in filters to build your discover feed."),
      ).toBeTruthy();
    });
  });
});
