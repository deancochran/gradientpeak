import React, { act } from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();
const createDMMutateMock = jest.fn();
const createConversationMutateMock = jest.fn();
const searchUsersUseInfiniteQueryMock = jest.fn();

type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};
type FlatListMockProps = Record<string, unknown> & {
  data: unknown[];
  renderItem: (info: { item: unknown }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
};
type PressableMockProps = React.PropsWithChildren<
  { onPress?: () => void } & Record<string, unknown>
>;

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: StackScreenProps) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ...props
  }: FlatListMockProps) =>
    React.createElement(
      "FlatList",
      props,
      ListHeaderComponent,
      data.length > 0 ? data.map((item) => renderItem({ item })) : ListEmptyComponent,
    ),
  Pressable: ({ children, onPress, ...props }: PressableMockProps) =>
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
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    social: {
      searchUsers: {
        useInfiniteQuery: (input: unknown, options: unknown) =>
          searchUsersUseInfiniteQueryMock(input, options),
      },
    },
    messaging: {
      getOrCreateDM: {
        useMutation: () => ({
          mutateAsync: async (input: unknown) => {
            createDMMutateMock(input);
            return { id: "conversation-1" };
          },
          isPending: false,
        }),
      },
      createConversation: {
        useMutation: ({ onSuccess }: { onSuccess?: (data: { id: string }) => void }) => ({
          mutate: (input: unknown) => {
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
    searchUsersUseInfiniteQueryMock.mockReset();
    searchUsersUseInfiniteQueryMock.mockReturnValue({
      data: {
        pages: [
          {
            users: [
              { id: "user-1", username: "coach", avatar_url: null, is_public: true },
              { id: "user-2", username: "teammate", avatar_url: null, is_public: true },
            ],
            total: 2,
            hasMore: false,
            nextCursor: undefined,
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("debounces rapid recipient typing, clears immediately, and returns to empty suggestions", async () => {
    jest.useFakeTimers();
    searchUsersUseInfiniteQueryMock.mockImplementation((input: { query?: string }) => ({
      data: {
        pages: [
          {
            users:
              input.query === undefined
                ? [{ id: "user-1", username: "coach", avatar_url: null, is_public: true }]
                : [],
            nextCursor: undefined,
          },
        ],
      },
      isLoading: false,
      isFetching: input.query === "coach",
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
    }));
    const view = renderNative(<NewMessageScreen />);

    expect(searchUsersUseInfiniteQueryMock).toHaveBeenLastCalledWith(
      { query: undefined, limit: 20 },
      expect.objectContaining({ getNextPageParam: expect.any(Function) }),
    );
    expect(screen.getByTestId("messages-new-user-user-1")).toBeTruthy();

    const searchInput = screen.getByLabelText("Search recipients");
    fireEvent.changeText(searchInput, "c");
    fireEvent.changeText(searchInput, "co");
    fireEvent.changeText(searchInput, "  coach  ");
    expect(screen.getByTestId("messages-new-search-input").props.value).toBe("  coach  ");
    expect(
      searchUsersUseInfiniteQueryMock.mock.calls.filter(([input]) => input.query === "coach"),
    ).toHaveLength(0);

    await act(() => jest.advanceTimersByTime(300));
    expect(searchUsersUseInfiniteQueryMock).toHaveBeenLastCalledWith(
      { query: "coach", limit: 20 },
      expect.objectContaining({ getNextPageParam: expect.any(Function) }),
    );
    expect(
      searchUsersUseInfiniteQueryMock.mock.calls.filter(([input]) => input.query === "coach"),
    ).toHaveLength(1);
    expect(screen.getByTestId("messages-new-search-input").props.accessibilityState).toEqual({
      busy: true,
      disabled: false,
    });

    fireEvent.press(screen.getByTestId("messages-new-search-clear"));
    expect(screen.getByTestId("messages-new-search-input").props.value).toBe("");
    await act(() => jest.advanceTimersByTime(300));
    expect(searchUsersUseInfiniteQueryMock).toHaveBeenLastCalledWith(
      { query: undefined, limit: 20 },
      expect.objectContaining({ getNextPageParam: expect.any(Function) }),
    );
    expect(screen.getByTestId("messages-new-user-user-1")).toBeTruthy();

    view.unmount();
  });

  it("creates or opens a DM when starting a single-recipient conversation", async () => {
    renderNative(<NewMessageScreen />);

    fireEvent.press(screen.getByTestId("messages-new-user-user-1"));
    fireEvent.press(screen.getByTestId("messages-new-next-trigger"));

    expect(createDMMutateMock).toHaveBeenCalledWith({ target_user_id: "user-1" });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/messages/conversation-1");
    });
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
