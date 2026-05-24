import React from "react";

import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: any) =>
      React.createElement(
        "StackScreen",
        { options },
        typeof options?.headerRight === "function" ? options.headerRight() : null,
      ),
  },
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ...props }: any) =>
    React.createElement(
      "FlatList",
      props,
      ListHeaderComponent,
      data.length > 0 ? data.map((item: any) => renderItem({ item })) : ListEmptyComponent,
    ),
  Pressable: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  getConversationDisplayName: () => "Coach",
  getConversationInitials: () => "C",
  getConversationPreviewText: () => "Latest message",
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
}));
jest.mock("@repo/ui/components/badge", () => ({
  __esModule: true,
  Badge: mockCreateHost("Badge"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@repo/ui/lib/cn", () => ({
  __esModule: true,
  cn: (...values: string[]) => values.filter(Boolean).join(" "),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    messaging: {
      getConversations: {
        useQuery: () => ({
          data: [
            {
              id: "conversation-1",
              created_at: "2026-01-01T00:00:00.000Z",
              is_group: false,
              group_name: null,
              last_message_at: "2026-01-02T00:00:00.000Z",
              peer_profile: null,
              last_message: null,
              unread_count: 1,
            },
          ],
          isLoading: false,
        }),
      },
    },
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/utils", () => ({ __esModule: true, formatRelativeTime: () => "1d" }));

const MessagesScreen = require("../messages/index").default;

describe("messages screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("opens the new message flow from the header action", () => {
    renderNative(<MessagesScreen />);

    fireEvent.press(screen.getByTestId("messages-new-trigger"));

    expect(pushMock).toHaveBeenCalledWith("/messages/new");
  });
});
