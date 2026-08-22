import type { NotificationListItem } from "@repo/core";
import React from "react";

import { createHost, createPressableHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const notification: NotificationListItem = {
  actor_id: "profile-1",
  created_at: "2026-01-01T00:00:00.000Z",
  id: "notification-1",
  entity_id: "conversation-1",
  type: "new_message",
  read_at: null,
  user_id: "user-1",
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
      markRead: { useMutation: () => ({ mutate: jest.fn() }) },
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
    expect(screen.getByText("New Message")).toBeTruthy();
  });
});
