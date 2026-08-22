import React from "react";

import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
const markReadMock = jest.fn();

type Notification = {
  created_at: string;
  description: string;
  id: string;
  is_unread: boolean;
  title: string;
  type: string;
};

const notification: Notification = {
  created_at: "2026-01-01T00:00:00.000Z",
  description: "Coach sent you a message",
  id: "notification-1",
  is_unread: true,
  title: "New message",
  type: "new_message",
};

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
  useRouter: () => ({ navigate: navigateMock }),
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
jest.mock("@repo/core", () => ({
  __esModule: true,
  getNotificationViewModel: (item: Notification) => ({
    ...item,
    actorId: undefined,
    isUnread: item.is_unread,
    requiresFollowRequestAction: false,
  }),
  getUnreadNotificationIds: (items: Notification[]) =>
    items.filter((item) => item.is_unread).map((item) => item.id),
  normalizeNotificationListItem: (item: Notification) => item,
}));
jest.mock("@repo/api/react", () => ({
  __esModule: true,
  invalidateNotificationQueries: jest.fn(async () => undefined),
  invalidateRelationshipQueries: jest.fn(async () => undefined),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    data,
    renderItem,
    ListHeaderComponent,
  }: {
    data: Notification[];
    renderItem: (item: Notification) => React.ReactNode;
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
      notifications: { getRecent: { cancel: jest.fn(), getData: jest.fn(), setData: jest.fn() } },
    }),
    notifications: {
      getRecent: {
        useQuery: () => ({
          data: [notification],
          error: null,
          isError: false,
          isLoading: false,
          isRefetching: false,
          refetch: jest.fn(),
        }),
      },
      markRead: { useMutation: () => ({ mutate: markReadMock }) },
    },
    social: {
      acceptFollowRequest: { useMutation: () => ({ mutate: jest.fn() }) },
      rejectFollowRequest: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

const NotificationsScreen = require("../../(standard)/notifications").default;

describe("P2 notifications mobile capability boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("notifications.browse renders a notification from the real screen", () => {
    renderNative(<NotificationsScreen />);

    expect(screen.getByTestId("notification-item-notification-1")).toBeTruthy();
    expect(screen.getByText("New message")).toBeTruthy();
  });

  it("notifications.mark-read marks an unread message notification and opens its destination", () => {
    renderNative(<NotificationsScreen />);

    fireEvent.press(screen.getByTestId("notification-item-notification-1"));

    expect(markReadMock).toHaveBeenCalledWith({ notification_ids: ["notification-1"] });
    expect(navigateMock).toHaveBeenCalledWith("/messages");
  });

  it("notifications.mark-read supports the real Read All header action", () => {
    renderNative(<NotificationsScreen />);

    fireEvent.press(screen.getByTestId("notifications-read-all-trigger"));

    expect(markReadMock).toHaveBeenCalledWith({ notification_ids: ["notification-1"] });
  });
});
