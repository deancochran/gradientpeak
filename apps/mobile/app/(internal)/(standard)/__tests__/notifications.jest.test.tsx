import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
const pushMock = jest.fn();
const markReadMutateMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: any) => React.createElement("StackScreen", { options }),
  },
  useRouter: () => ({ navigate: navigateMock, push: pushMock }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: any) =>
    React.createElement(
      "FlatList",
      props,
      data.length > 0 ? data.map((item: any) => renderItem({ item })) : ListEmptyComponent,
    ),
  Pressable: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/badge", () => ({ __esModule: true, Badge: createHost("Badge") }));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/lib/cn", () => ({ __esModule: true, cn: (...values: string[]) => values.filter(Boolean).join(" ") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Bell: createHost("Bell"),
  Mail: createHost("Mail"),
  UserPlus: createHost("UserPlus"),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  getNotificationViewModel: (notification: any) => ({
    actorId: notification.actor_id,
    createdAt: notification.created_at,
    description: notification.description,
    id: notification.id,
    isUnread: notification.is_unread,
    requiresFollowRequestAction: false,
    title: notification.title,
    type: notification.type,
  }),
  getUnreadNotificationIds: (notifications: any[]) =>
    notifications.filter((item) => item.is_unread).map((item) => item.id),
  normalizeNotificationListItem: (notification: any) => notification,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ notifications: { getRecent: { cancel: jest.fn(), getData: jest.fn(), setData: jest.fn() } } }),
    notifications: {
      getRecent: {
        useQuery: () => ({
          data: [
            {
              id: "notification-1",
              type: "new_message",
              title: "New message",
              description: "Coach sent you a message",
              created_at: "2026-01-01T00:00:00.000Z",
              is_unread: true,
            },
          ],
          isLoading: false,
        }),
      },
      markRead: { useMutation: () => ({ mutate: markReadMutateMock }) },
    },
    social: {
      acceptFollowRequest: { useMutation: () => ({ mutate: jest.fn() }) },
      rejectFollowRequest: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

jest.mock("@repo/api/react", () => ({
  __esModule: true,
  invalidateNotificationQueries: jest.fn(async () => undefined),
  invalidateRelationshipQueries: jest.fn(async () => undefined),
}));

const NotificationsScreen = require("../notifications").default;

describe("notifications screen", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    pushMock.mockReset();
    markReadMutateMock.mockReset();
  });

  it("navigates to the messages hub for message notifications", () => {
    renderNative(<NotificationsScreen />);

    fireEvent.press(screen.getByTestId("notification-item-notification-1"));

    expect(markReadMutateMock).toHaveBeenCalledWith({ notification_ids: ["notification-1"] });
    expect(navigateMock).toHaveBeenCalledWith("/messages");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
