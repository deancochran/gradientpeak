import React from "react";
import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const joinGroupMock = jest.fn();
const createGroupMock = jest.fn();
const updateGroupMock = jest.fn();

const group = {
  id: "group-1",
  name: "Morning Climbers",
  slug: "morning-climbers",
  description: "Early starts and steady ascents.",
  avatar_url: null,
  cover_url: null,
  access_level: "public",
  join_policy: "open",
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  Platform: { OS: "ios" },
  Pressable: createPressableHost(),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
  Image: createHost("Image"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ groupId: "group-1" }),
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
}));

jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createPressableHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@/components/groups", () => ({
  __esModule: true,
  GroupAccessLevelBadge: createHost("GroupAccessLevelBadge"),
  GroupEventEmptyState: createHost("GroupEventEmptyState"),
  GroupEventListSkeleton: createHost("GroupEventListSkeleton"),
  GroupJoinPolicyBadge: createHost("GroupJoinPolicyBadge"),
  GroupListSkeleton: createHost("GroupListSkeleton"),
  GroupMembersOnlyLockedState: createHost("GroupMembersOnlyLockedState"),
  GroupRelationshipBadge: createHost("GroupRelationshipBadge"),
  GroupEventCard: createHost("GroupEventCard"),
  GroupForm: React.forwardRef(function MockGroupForm(
    props: { onSubmit: (values: typeof group) => void },
    ref: React.ForwardedRef<{ submit: () => void }>,
  ) {
    React.useImperativeHandle(ref, () => ({ submit: () => props.onSubmit({ ...group }) }));
    return React.createElement(
      "Button",
      { onPress: () => props.onSubmit({ ...group }), testID: "group-form-submit" },
      "Submit group",
    );
  }),
  GroupPrimaryActionBar: ({ onJoin }: { onJoin?: () => void }) =>
    onJoin
      ? React.createElement("Button", { onPress: onJoin, testID: "group-join" }, "Join group")
      : null,
}));

jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: createHost("DetailOverflowMenu"),
  DetailScaffold: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string | null | undefined) => url ?? null,
}));

jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupActions: () => ({
    createGroup: createGroupMock,
    updateGroup: updateGroupMock,
    joinGroup: joinGroupMock,
    createMutation: { isPending: false },
    updateMutation: { isPending: false },
    joinMutation: { isPending: false },
    leaveMutation: { isPending: false },
    requestToJoinMutation: { isPending: false },
    deleteMutation: { isPending: false },
  }),
  useGroupDetailViewModel: () => ({
    group,
    groupId: group.id,
    isError: false,
    isLoading: false,
    members: [],
    membersQuery: { hasNextPage: false },
    viewer: {
      canEditGroup: true,
      canJoin: true,
      canViewGroupEvents: false,
      canViewMembers: false,
      relationshipState: "none",
    },
  }),
  useGroupEventListViewModel: () => ({ events: [], isLoading: false }),
}));

const GroupDetailScreen = require("../group-detail").default;
const GroupCreateScreen = require("../group-create").default;
const GroupEditScreen = require("../group-edit").default;

describe("P2 group mobile boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createGroupMock.mockResolvedValue({ group });
    updateGroupMock.mockResolvedValue({ group });
  });

  it("groups.browse-and-join joins a discoverable group from its real detail screen", async () => {
    renderNative(<GroupDetailScreen />);
    fireEvent.press(screen.getByTestId("group-join"));
    await waitFor(() => expect(joinGroupMock).toHaveBeenCalledWith("group-1"));
  });

  it("groups.create submits the group form and opens the created group", async () => {
    renderNative(<GroupCreateScreen />);
    fireEvent.press(screen.getByTestId("group-form-submit"));
    await waitFor(() => {
      expect(createGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Morning Climbers" }),
      );
      expect(replaceMock).toHaveBeenCalledWith({
        pathname: "/group-detail",
        params: { groupId: "group-1" },
      });
    });
  });

  it("groups.edit saves the loaded group and returns to its detail screen", async () => {
    renderNative(<GroupEditScreen />);
    fireEvent.press(screen.getByTestId("group-form-submit"));
    await waitFor(() => {
      expect(updateGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: "group-1", name: "Morning Climbers" }),
      );
      expect(replaceMock).toHaveBeenCalledWith({
        pathname: "/group-detail",
        params: { groupId: "group-1" },
      });
    });
  });
});
