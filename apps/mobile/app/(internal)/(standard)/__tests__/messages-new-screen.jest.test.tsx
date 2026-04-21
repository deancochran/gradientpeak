import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const createDMMutateMock = jest.fn();
const createConversationMutateMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: createHost("StackScreen"),
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
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
}));
jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({ value, onChangeText, ...props }: any) =>
    React.createElement("TextInput", { value, onChangeText, ...props }),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    social: {
      searchUsers: {
        useQuery: () => ({
          data: {
            users: [
              { id: "user-1", username: "coach", avatar_url: null, is_public: true },
              { id: "user-2", username: "teammate", avatar_url: null, is_public: true },
            ],
          },
          isLoading: false,
        }),
      },
    },
    messaging: {
      getOrCreateDM: {
        useMutation: () => ({
          mutateAsync: async (input: any) => {
            createDMMutateMock(input);
            return { id: "conversation-1" };
          },
          isPending: false,
        }),
      },
      createConversation: {
        useMutation: ({ onSuccess }: any) => ({
          mutate: (input: any) => {
            createConversationMutateMock(input);
            onSuccess?.({ id: "conversation-2" });
          },
          isPending: false,
        }),
      },
    },
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

const NewMessageScreen = require("../messages/new").default;

describe("new message screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
    createDMMutateMock.mockReset();
    createConversationMutateMock.mockReset();
  });

  it("creates or opens a DM when starting a single-recipient conversation", () => {
    renderNative(<NewMessageScreen />);

    fireEvent.press(screen.getByTestId("messages-new-user-user-1"));
    fireEvent.press(screen.getByTestId("messages-new-next-trigger"));

    expect(createDMMutateMock).toHaveBeenCalledWith({ target_user_id: "user-1" });
    expect(pushMock).toHaveBeenCalledWith("/messages/conversation-1");
  });

  it("creates a group conversation when multiple recipients are selected", () => {
    renderNative(<NewMessageScreen />);

    fireEvent.press(screen.getByTestId("messages-new-user-user-1"));
    fireEvent.press(screen.getByTestId("messages-new-user-user-2"));
    fireEvent.changeText(screen.getByTestId("messages-new-group-name-input"), "Ride Group");
    fireEvent.press(screen.getByTestId("messages-new-next-trigger"));

    expect(createConversationMutateMock).toHaveBeenCalledWith({
      participant_ids: ["user-1", "user-2"],
      group_name: "Ride Group",
    });
    expect(pushMock).toHaveBeenCalledWith("/messages/conversation-2");
  });
});
