import type { NotificationListItem } from "@repo/core";
import React from "react";

import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const notification: NotificationListItem = {
  actor_id: "profile-1",
  created_at: "2026-01-01T00:00:00.000Z",
  id: "notification-1",
  entity_id: "conversation-1",
  type: "new_message",
  read_at: null,
  user_id: "user-1",
};
const followRequest: NotificationListItem = {
  ...notification,
  actor_id: "follower-1",
  id: "notification-follow-request",
  type: "follow_request",
};
const cancelMock = jest.fn(async () => undefined);
const getDataMock = jest.fn(() => [followRequest]);
const setDataMock = jest.fn();
const invalidateRecentMock = jest.fn(async () => undefined);
const invalidateUnreadCountMock = jest.fn(async () => undefined);
const invalidateProfileMock = jest.fn(async () => undefined);
const invalidateFollowersMock = jest.fn(async () => undefined);
const invalidateFollowingMock = jest.fn(async () => undefined);

type FollowMutationOptions = {
  onMutate: (variables: {
    follower_id: string;
  }) => Promise<{ previousNotifications: NotificationListItem[] }>;
  onSettled: (data: undefined, error: null, variables: { follower_id: string }) => Promise<void>;
};

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
  useRouter: () => ({ navigate: jest.fn() }),
}));
jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createPressableHost(),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/badge", () => ({ __esModule: true, Badge: createHost("Badge") }));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createPressableHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/lib/cn", () => ({
  __esModule: true,
  cn: (...values: string[]) => values.join(" "),
}));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Bell: createHost("Bell"),
  Mail: createHost("Mail"),
  UserPlus: createHost("UserPlus"),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    data,
    renderItem,
    ListHeaderComponent,
  }: {
    data: NotificationListItem[];
    renderItem: (item: NotificationListItem) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
  }) =>
    React.createElement(
      "View",
      { testID: "notifications-list" },
      ListHeaderComponent,
      data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem(item))),
    ),
}));
jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  EmptyState: createHost("EmptyState"),
  ErrorState: createHost("ErrorState"),
  LoadingState: createHost("LoadingState"),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      notifications: {
        getRecent: {
          cancel: cancelMock,
          getData: getDataMock,
          invalidate: invalidateRecentMock,
          setData: setDataMock,
        },
        getUnreadCount: { invalidate: invalidateUnreadCountMock },
      },
      profiles: { getPublicById: { invalidate: invalidateProfileMock } },
      social: {
        getFollowers: { invalidate: invalidateFollowersMock },
        getFollowing: { invalidate: invalidateFollowingMock },
      },
    }),
    notifications: {
      getRecent: {
        useQuery: () => ({
          data: [notification, followRequest],
          error: null,
          isError: false,
          isLoading: false,
          isRefetching: false,
          refetch: jest.fn(),
        }),
      },
      markRead: { useMutation: () => ({ mutate: jest.fn() }) },
    },
    social: {
      acceptFollowRequest: {
        useMutation: (options: FollowMutationOptions) => ({
          mutate: async (variables: { follower_id: string }) => {
            await options.onMutate(variables);
            await options.onSettled(undefined, null, variables);
          },
        }),
      },
      rejectFollowRequest: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

const NotificationsScreen = require("../../(standard)/notifications").default;

describe("P2 notifications mobile capability boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDataMock.mockReturnValue([followRequest]);
  });

  it("notifications.browse renders a notification from the real screen", async () => {
    await renderNative(<NotificationsScreen />);

    expect(screen.getByTestId("notification-item-notification-1")).toBeTruthy();
    expect(screen.getByText("New Message")).toBeTruthy();
  });

  it("notifications.follow_request runs optimistic removal and refresh callbacks", async () => {
    await renderNative(<NotificationsScreen />);

    await fireEvent.press(screen.getByTestId("notification-accept-notification-follow-request"), {
      stopPropagation: jest.fn(),
    });

    await waitFor(() => expect(invalidateRecentMock).toHaveBeenCalled());

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(setDataMock).toHaveBeenCalledWith({ limit: 20 }, expect.any(Function));
    const update = setDataMock.mock.calls[0][1] as (
      items: NotificationListItem[],
    ) => NotificationListItem[];
    expect(update([followRequest, notification])).toEqual([notification]);
    expect(invalidateUnreadCountMock).toHaveBeenCalledTimes(1);
    expect(invalidateProfileMock).toHaveBeenCalledWith({ id: "follower-1" });
    expect(invalidateFollowersMock).toHaveBeenCalledWith({ user_id: "follower-1" });
    expect(invalidateFollowingMock).toHaveBeenCalledWith({ user_id: "follower-1" });
  });
});
