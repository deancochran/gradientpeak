import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const navigateTo = jest.fn();
const feedQueryMock = jest.fn();
const routeQueryMock = jest.fn();
let routeParams: { q?: string; scope?: string } = {};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => routeParams,
}));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
jest.mock("@/lib/navigation/useAppNavigate", () => ({ useAppNavigate: () => navigateTo }));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronRight: createHost("ChevronRight"),
  Search: createHost("Search"),
  SlidersHorizontal: createHost("SlidersHorizontal"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading", () => ({
  InlineLoadingStatus: () => null,
}));
jest.mock("@repo/ui/components/search-field", () => ({
  SearchField: ({ value, onValueChange, placeholder, testId, accessibilityLabel }: any) =>
    React.createElement("TextInput", {
      accessibilityLabel,
      onChangeText: onValueChange,
      placeholder,
      testID: testId,
      value,
    }),
}));
jest.mock("@repo/ui/components/empty-state-card", () => ({
  EmptyStateCard: ({ title, actionLabel, onAction }: any) =>
    React.createElement(
      "View",
      null,
      React.createElement("Text", null, title),
      actionLabel
        ? React.createElement(
            "Pressable",
            { onPress: onAction },
            React.createElement("Text", null, actionLabel),
          )
        : null,
    ),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  ActivityPlanCard: ({ onPress, plan }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `activityPlan-${plan.id}` },
      React.createElement("Text", null, plan.name),
    ),
}));
jest.mock("@/components/shared/RouteCard", () => ({
  RouteCard: ({ onPress, route }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `route-${route.id}` },
      React.createElement("Text", null, route.name),
    ),
}));
jest.mock("@/components/shared/TrainingPlanCard", () => ({
  TrainingPlanCard: ({ onPress, plan }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `trainingPlan-${plan.id}` },
      React.createElement("Text", null, plan.name),
    ),
}));
jest.mock("@/components/groups", () => ({
  GroupCard: ({ onPress, group }: any) =>
    React.createElement("Pressable", { onPress, testID: `group-${group.id}` }),
}));
jest.mock("@/components/profile/ProfileCard", () => ({
  ProfileCard: ({ onPress, user }: any) =>
    React.createElement("Pressable", { onPress, testID: `profile-${user.id}` }),
}));
jest.mock("@/components/discover/DiscoverFilterSheet", () => ({ DiscoverFilterSheet: () => null }));

const activityPlan = {
  id: "plan-1",
  name: "Base Builder",
  activity_category: "run",
  created_at: "2026-01-01",
};
const route = {
  id: "route-1",
  name: "River Loop",
  activity_category: "outdoor_run",
  total_distance: 1000,
  total_ascent: 10,
  created_at: "2026-01-01",
};
const queryResult = (items: unknown[], overrides = {}) => ({
  data: { pages: [{ items, nextCursor: undefined }] },
  isLoading: false,
  isFetching: false,
  isRefetching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
  ...overrides,
});

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    feed: { getFeed: { useInfiniteQuery: (input: unknown) => feedQueryMock(input) } },
    routes: { list: { useInfiniteQuery: (input: unknown) => routeQueryMock(input) } },
    activityPlans: { list: { useInfiniteQuery: () => queryResult([activityPlan]) } },
    trainingPlans: { listTemplates: { useInfiniteQuery: () => queryResult([]) } },
    social: { searchUsers: { useInfiniteQuery: () => queryResult([]) } },
    groups: { listDiscoverable: { useInfiniteQuery: () => queryResult([]) } },
  },
}));

jest.mock("@/components/shared/ActivityCard", () => ({
  ActivityCard: ({ activity, onPress }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `activity-${activity.id}` },
      React.createElement("Text", null, activity.name),
    ),
}));
jest.mock("@/components/feed/FeedEmptyState", () => ({
  FeedEmptyState: () => React.createElement("Text", null, "No activity"),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  ResourceList: (props: any) =>
    props.isError
      ? React.createElement(
          "View",
          null,
          React.createElement("Text", null, props.errorTitle),
          React.createElement(
            "Pressable",
            { onPress: props.onRetry, testID: "feed-retry" },
            React.createElement("Text", null, "Try again"),
          ),
        )
      : React.createElement(
          "View",
          null,
          props.ListHeaderComponent,
          props.data.map((item: any) =>
            React.createElement(React.Fragment, { key: item.id }, props.renderItem(item)),
          ),
        ),
}));

const DiscoverScreen = require("../discover").default;
const { FeedList } = require("../../../../components/feed/FeedList");

describe("P2 discovery and feed capabilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeParams = {};
    routeQueryMock.mockReturnValue(queryResult([route]));
    feedQueryMock.mockReturnValue(queryResult([{ id: "activity-1", name: "Morning Run" }]));
  });

  it("discover.search-resources honors a deep-linked scope and search term", async () => {
    routeParams = { scope: "routes", q: " river " };
    renderNative(<DiscoverScreen />);

    expect(screen.getByPlaceholderText("Search routes").props.value).toBe(" river ");
    expect(screen.getByTestId("route-route-1")).toBeTruthy();
    await waitFor(() =>
      expect(routeQueryMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: "river" })),
    );
  });

  it("discover.filter-feed keeps the selected scope while browsing results", () => {
    renderNative(<DiscoverScreen />);
    fireEvent.press(screen.getByTestId("discover-scope-routes"));

    expect(screen.getByTestId("discover-feed-item-routes-route-1")).toBeTruthy();
    expect(screen.queryByTestId("discover-feed-item-activityPlans-plan-1")).toBeNull();
  });

  it("feed.browse opens an activity from the real feed list", () => {
    renderNative(<FeedList />);
    fireEvent.press(screen.getByTestId("activity-activity-1"));

    expect(feedQueryMock).toHaveBeenCalledWith({ limit: 20 });
    expect(navigateTo).toHaveBeenCalledWith("/activity-detail?id=activity-1");
  });

  it("feed.retry-failed-load refetches after the feed error action", async () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    feedQueryMock.mockReturnValue(
      queryResult([], { isLoadingError: true, isError: true, refetch }),
    );
    renderNative(<FeedList />);
    fireEvent.press(screen.getByTestId("feed-retry"));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });
});
