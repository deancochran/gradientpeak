import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
const followMutateMock = jest.fn();
const refetchMock = jest.fn();
const params = { userId: "target-user" };

let followersQuery = {
  data: {
    pages: [{ total: 1, users: [{ id: "follower-1", username: "Rider", avatar_url: null }] }],
  },
  error: null as { data?: { code?: string } } | null,
  isLoading: false,
  isError: false,
  isFetchingNextPage: false,
  isRefetching: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
};

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
  useLocalSearchParams: () => params,
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Clock: "Clock",
  Ellipsis: "Ellipsis",
  MessageCircle: "MessageCircle",
  UserMinus: "UserMinus",
  UserPlus: "UserPlus",
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/components/profile/ProfileGroupsSection", () => ({
  __esModule: true,
  ProfileGroupsSection: createHost("ProfileGroupsSection"),
}));
jest.mock("@/components/profile/ProfileSummaryCard", () => ({
  __esModule: true,
  ProfileSummaryCard: ({ actions }: { actions?: React.ReactNode }) => actions ?? null,
}));
jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  EmptyState: ({
    title,
    description,
    testID,
  }: {
    title: string;
    description: string;
    testID: string;
  }) =>
    React.createElement(
      "View",
      { testID },
      React.createElement("Text", null, title),
      React.createElement("Text", null, description),
    ),
  ErrorState: ({
    title,
    onAction,
    testID,
  }: {
    title: string;
    onAction: () => void;
    testID: string;
  }) =>
    React.createElement(
      "Pressable",
      { testID, onPress: onAction },
      React.createElement("Text", null, title),
    ),
  LoadingState: createHost("LoadingState"),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    data,
    renderItem,
    emptyComponent,
  }: {
    data: Array<{ id: string }>;
    renderItem: (item: never) => React.ReactNode;
    emptyComponent: React.ReactNode;
  }) =>
    React.createElement(
      "View",
      { testID: "resource-list" },
      data.length
        ? data.map((item) =>
            React.createElement(React.Fragment, { key: item.id }, renderItem(item as never)),
          )
        : emptyComponent,
    ),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateMock,
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    user: { id: "viewer" },
    profile: { id: "viewer", username: "Viewer", is_public: true },
  }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({}),
    profiles: {
      getPublicById: {
        useQuery: () => ({
          data: {
            id: "target-user",
            username: "Private Rider",
            is_public: false,
            follow_status: null,
            followers_count: 2,
            following_count: 1,
          },
          error: null,
          isLoading: false,
        }),
      },
    },
    social: {
      followUser: { useMutation: () => ({ mutate: followMutateMock, isPending: false }) },
      unfollowUser: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      getFollowers: { useInfiniteQuery: () => ({ ...followersQuery, refetch: refetchMock }) },
    },
    messaging: { getOrCreateDM: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) } },
  },
}));

const UserDetailScreen = require("../user/[userId]").default;
const FollowersScreen = require("../followers").default;

describe("P2 social mobile capability boundaries", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    followMutateMock.mockReset();
    refetchMock.mockReset();
    followersQuery = {
      ...followersQuery,
      error: null,
      isError: false,
      data: {
        pages: [{ total: 1, users: [{ id: "follower-1", username: "Rider", avatar_url: null }] }],
      },
    };
  });

  it("social.request-follow sends a follow request from the private profile screen", async () => {
    await renderNative(<UserDetailScreen />);

    await fireEvent.press(screen.getByTestId("user-detail-follow-button"));

    expect(followMutateMock).toHaveBeenCalledWith({ target_user_id: "target-user" });
  });

  it("social.browse-followers opens a follower profile from the current list", async () => {
    await renderNative(<FollowersScreen />);

    await fireEvent.press(screen.getByText("Rider"));

    expect(navigateMock).toHaveBeenCalledWith("/user/follower-1");
  });

  it("social.browse-followers shows an empty state for an empty list", async () => {
    followersQuery.data = { pages: [{ total: 0, users: [] }] };

    await renderNative(<FollowersScreen />);

    expect(screen.getByTestId("followers-empty-state")).toBeTruthy();
    expect(screen.getByText("No followers yet")).toBeTruthy();
  });

  it("social.browse-followers retries an ordinary load failure", async () => {
    followersQuery = {
      ...followersQuery,
      data: undefined as never,
      error: { data: { code: "TIMEOUT" } },
      isError: true,
    };

    await renderNative(<FollowersScreen />);
    await fireEvent.press(screen.getByTestId("followers-error-state"));

    expect(refetchMock).toHaveBeenCalled();
  });
});
