import React, { act } from "react";

import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const searchUsersUseQueryMock = jest.fn();
const inviteProfilesMock = jest.fn(async () => undefined);

jest.useFakeTimers();

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => ({ groupId: "group-1" }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  Pressable: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));
jest.mock("@repo/ui/components/search-field", () => ({
  __esModule: true,
  SearchField: ({ accessibilityLabel, clearTestId, loading, onValueChange, testId, value }: any) =>
    React.createElement(
      "View",
      null,
      React.createElement("TextInput", {
        accessibilityLabel,
        accessibilityState: { busy: loading },
        onChangeText: onValueChange,
        testID: testId,
        value,
      }),
      value
        ? React.createElement("Pressable", {
            accessibilityLabel: `Clear ${accessibilityLabel}`,
            onPress: () => onValueChange(""),
            testID: clearTestId,
          })
        : null,
    ),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/groups", () => ({
  __esModule: true,
  GroupEmptyState: createHost("GroupEmptyState"),
  GroupInvitationRow: createHost("GroupInvitationRow"),
  GroupJoinRequestRow: createHost("GroupJoinRequestRow"),
  GroupListSkeleton: createHost("GroupListSkeleton"),
  GroupMembersOnlyLockedState: createHost("GroupMembersOnlyLockedState"),
}));
jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: ({ children, footerContent }: any) =>
    React.createElement("View", null, children, footerContent),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    social: {
      searchUsers: {
        useQuery: (input: unknown, options: unknown) => searchUsersUseQueryMock(input, options),
      },
    },
  },
}));
jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupDetailViewModel: () => ({
    groupId: "group-1",
    group: { name: "Climbers" },
    invitations: [],
    isLoading: false,
    joinRequests: [],
    viewer: { canInvite: true, canManageJoinRequests: true },
  }),
  useGroupInviteActions: () => ({
    inviteProfiles: inviteProfilesMock,
    inviteProfilesMutation: { isPending: false },
    reviewJoinRequest: jest.fn(),
    revokeInvite: jest.fn(),
  }),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

const GroupRequestsScreen = require("../group-requests").default;

describe("group requests invite search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchUsersUseQueryMock.mockReturnValue({ data: { users: [] }, isFetching: false });
  });

  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
  });

  it("keeps invite enablement and sort while debouncing an accessible clearable search", () => {
    renderNative(<GroupRequestsScreen />);

    expect(searchUsersUseQueryMock).toHaveBeenLastCalledWith(
      { query: undefined, limit: 20, sort_by: "newest" },
      { enabled: false },
    );

    searchUsersUseQueryMock.mockReturnValue({ data: { users: [] }, isFetching: true });
    fireEvent.press(screen.getByTestId("group-requests-header-invite"));
    const input = screen.getByLabelText("Search athletes to invite");
    expect(screen.getByTestId("group-requests-invite-search-input")).toBe(input);
    expect(input.props.accessibilityState).toEqual({ busy: true });
    expect(searchUsersUseQueryMock).toHaveBeenLastCalledWith(
      { query: undefined, limit: 20, sort_by: "newest" },
      { enabled: true },
    );

    fireEvent.changeText(input, "rider");
    expect(searchUsersUseQueryMock).toHaveBeenLastCalledWith(
      { query: undefined, limit: 20, sort_by: "newest" },
      { enabled: true },
    );

    act(() => jest.advanceTimersByTime(300));
    expect(searchUsersUseQueryMock).toHaveBeenLastCalledWith(
      { query: "rider", limit: 20, sort_by: "username_asc" },
      { enabled: true },
    );

    fireEvent.press(screen.getByTestId("group-requests-invite-search-clear"));
    expect(screen.getByTestId("group-requests-invite-search-input").props.value).toBe("");
  });
});
