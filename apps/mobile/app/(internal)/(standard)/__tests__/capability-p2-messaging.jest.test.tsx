import React from "react";

import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const navigateMock = jest.fn();
const createDMMutateMock = jest.fn();
const createConversationMutateMock = jest.fn();

type SearchUser = { id: string; is_public: boolean; username: string };

const users: SearchUser[] = [
  { id: "user-1", is_public: true, username: "coach" },
  { id: "user-2", is_public: true, username: "teammate" },
];

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
  }: {
    data: Array<{ id: string }>;
    renderItem: (info: { item: { id: string } }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
  }) =>
    React.createElement(
      "FlatList",
      null,
      ListHeaderComponent,
      data.map((item) =>
        React.createElement(React.Fragment, { key: item.id }, renderItem({ item })),
      ),
    ),
  Pressable: createPressableHost(),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
}));
jest.mock("@repo/ui/components/badge", () => ({ __esModule: true, Badge: createHost("Badge") }));
jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({
    value,
    onChangeText,
    ...props
  }: { value?: string; onChangeText?: (value: string) => void } & Record<string, unknown>) =>
    React.createElement("TextInput", {
      value,
      onChangeText,
      testID: props.testID ?? props.testId,
      ...props,
    }),
}));
jest.mock("@repo/ui/components/search-field", () => ({
  __esModule: true,
  SearchField: ({
    value,
    onValueChange,
    accessibilityLabel,
    testId,
  }: {
    accessibilityLabel?: string;
    onValueChange: (value: string) => void;
    testId: string;
    value: string;
  }) =>
    React.createElement("TextInput", {
      accessibilityLabel,
      onChangeText: onValueChange,
      testID: testId,
      value,
    }),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/lib/cn", () => ({
  __esModule: true,
  cn: (...values: string[]) => values.join(" "),
}));
jest.mock("@repo/core", () => ({
  __esModule: true,
  getConversationDisplayName: () => "Coach",
  getConversationInitials: () => "C",
  getConversationPreviewText: () => "Let's ride tomorrow",
}));

jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  EmptyState: createHost("EmptyState"),
  LoadingState: createHost("LoadingState"),
}));
jest.mock("@/components/shared/HeaderAction", () => ({
  __esModule: true,
  HeaderTextAction: createPressableHost("HeaderTextAction"),
}));
jest.mock("@/lib/hooks/useDebouncedValue", () => ({
  __esModule: true,
  useDebouncedValue: (value: string) => value,
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateMock,
}));
jest.mock("@/lib/utils", () => ({ __esModule: true, formatRelativeTime: () => "1d" }));
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
      getOrCreateDM: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: async (input: { target_user_id: string }) => {
            createDMMutateMock(input);
            return { id: "conversation-dm" };
          },
        }),
      },
      createConversation: {
        useMutation: ({ onSuccess }: { onSuccess?: (data: { id: string }) => void }) => ({
          isPending: false,
          mutate: (input: { group_name?: string; participant_ids: string[] }) => {
            createConversationMutateMock(input);
            onSuccess?.({ id: "conversation-group" });
          },
        }),
      },
    },
    social: {
      searchUsers: {
        useInfiniteQuery: () => ({
          data: { pages: [{ users, nextCursor: undefined }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetching: false,
          isFetchingNextPage: false,
          isLoading: false,
        }),
      },
    },
  },
}));

const MessagesScreen = require("../messages/index").default;
const NewMessageScreen = require("../messages/new").default;

describe("P2 messaging mobile capability boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("messaging.open-conversation opens a conversation from the real messages screen", () => {
    renderNative(<MessagesScreen />);

    fireEvent.press(screen.getByTestId("messages-conversation-conversation-1"));

    expect(navigateMock).toHaveBeenCalledWith("/messages/conversation-1");
  });

  it("messaging.start-direct-message creates a DM and opens it from the real new-message screen", async () => {
    renderNative(<NewMessageScreen />);

    fireEvent.press(screen.getByTestId("messages-new-user-user-1"));
    fireEvent.press(screen.getByTestId("messages-new-next-trigger"));

    expect(createDMMutateMock).toHaveBeenCalledWith({ target_user_id: "user-1" });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/messages/conversation-dm"));
  });

  it("messaging.create-group-conversation sends selected recipients and the optional name", () => {
    renderNative(<NewMessageScreen />);

    fireEvent.press(screen.getByTestId("messages-new-user-user-1"));
    fireEvent.press(screen.getByTestId("messages-new-user-user-2"));
    fireEvent.changeText(screen.getByTestId("messages-new-group-name-input"), "Weekend crew");
    fireEvent.press(screen.getByTestId("messages-new-next-trigger"));

    expect(createConversationMutateMock).toHaveBeenCalledWith({
      group_name: "Weekend crew",
      participant_ids: ["user-1", "user-2"],
    });
    expect(navigateMock).toHaveBeenCalledWith("/messages/conversation-group");
  });
});
