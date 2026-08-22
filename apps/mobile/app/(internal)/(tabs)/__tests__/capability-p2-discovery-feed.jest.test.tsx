import React from "react";
import type { ProfileCardProps } from "../../../../components/profile/ProfileCard";
import { createHost, type PressableHostProps } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const navigateTo = jest.fn();
const feedQueryMock = jest.fn();
const routeQueryMock = jest.fn();
const usersQueryMock = jest.fn();
let routeParams: { q?: string; scope?: string } = {};

type SearchFieldProps = {
  accessibilityLabel?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  value: string;
};
type EmptyStateCardProps = { actionLabel?: string; onAction?: () => void; title: string };
type ResourceListProps<TItem> = {
  data: TItem[];
  errorTitle?: string;
  isError?: boolean;
  ListHeaderComponent?: React.ReactNode;
  onRetry?: () => void;
  renderItem: (item: TItem) => React.ReactNode;
};
type CardProps<TItem> = {
  onPress?: () => void;
  plan?: TItem;
  route?: TItem;
  activity?: TItem;
  group?: TItem;
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: PressableHostProps) =>
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
  SearchField: ({
    value,
    onValueChange,
    placeholder,
    testId,
    accessibilityLabel,
  }: SearchFieldProps) =>
    React.createElement("TextInput", {
      accessibilityLabel,
      onChangeText: onValueChange,
      placeholder,
      testID: testId,
      value,
    }),
}));
jest.mock("@repo/ui/components/empty-state-card", () => ({
  EmptyStateCard: ({ title, actionLabel, onAction }: EmptyStateCardProps) =>
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
  ActivityPlanCard: ({ onPress, plan }: CardProps<{ id: string; name: string }>) =>
    plan
      ? React.createElement(
          "Pressable",
          { onPress, testID: `activityPlan-${plan.id}` },
          React.createElement("Text", null, plan.name),
        )
      : null,
}));
jest.mock("@/components/shared/RouteCard", () => ({
  RouteCard: ({ onPress, route }: CardProps<{ id: string; name: string }>) =>
    route
      ? React.createElement(
          "Pressable",
          { onPress, testID: `route-${route.id}` },
          React.createElement("Text", null, route.name),
        )
      : null,
}));
jest.mock("@/components/shared/TrainingPlanCard", () => ({
  TrainingPlanCard: ({ onPress, plan }: CardProps<{ id: string; name: string }>) =>
    plan
      ? React.createElement(
          "Pressable",
          { onPress, testID: `trainingPlan-${plan.id}` },
          React.createElement("Text", null, plan.name),
        )
      : null,
}));
jest.mock("@/components/groups", () => ({
  GroupCard: ({ onPress, group }: CardProps<{ id: string }>) =>
    group ? React.createElement("Pressable", { onPress, testID: `group-${group.id}` }) : null,
}));
jest.mock("@/components/profile/ProfileCard", () => ({
  ProfileCard: ({ onPress, profile, testID }: ProfileCardProps) =>
    React.createElement("Pressable", { onPress, testID: testID ?? `profile-${profile.id}` }),
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
  data: { pages: [{ items, users: items, nextCursor: undefined }] },
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
    social: { searchUsers: { useInfiniteQuery: (input: unknown) => usersQueryMock(input) } },
    groups: { listDiscoverable: { useInfiniteQuery: () => queryResult([]) } },
  },
}));

jest.mock("@/components/shared/ActivityCard", () => ({
  ActivityCard: ({ activity, onPress }: CardProps<{ id: string; name: string }>) =>
    activity
      ? React.createElement(
          "Pressable",
          { onPress, testID: `activity-${activity.id}` },
          React.createElement("Text", null, activity.name),
        )
      : null,
}));
jest.mock("@/components/feed/FeedEmptyState", () => ({
  FeedEmptyState: () => React.createElement("Text", null, "No activity"),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  ResourceList: (props: ResourceListProps<{ id: string; name?: string }>) =>
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
          props.data.map((item) =>
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
    usersQueryMock.mockReturnValue(
      queryResult([{ id: "user-1", full_name: "Alex Runner", username: "alex", is_public: true }]),
    );
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

  it("discover.users navigates to a user and loads the next page", () => {
    const fetchNextPage = jest.fn();
    usersQueryMock.mockReturnValue(
      queryResult([{ id: "user-1", full_name: "Alex Runner", username: "alex", is_public: true }], {
        hasNextPage: true,
        fetchNextPage,
      }),
    );
    renderNative(<DiscoverScreen />);
    fireEvent.press(screen.getByTestId("discover-scope-users"));

    fireEvent.press(screen.getByTestId("discover-user-user-1"));
    expect(navigateTo).toHaveBeenCalledWith({
      pathname: "/(internal)/(standard)/user/[userId]",
      params: { userId: "user-1" },
    });

    fireEvent.scroll(screen.getByTestId("discover-results-list"), {
      nativeEvent: {
        contentOffset: { y: 800 },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 400 },
      },
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
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
