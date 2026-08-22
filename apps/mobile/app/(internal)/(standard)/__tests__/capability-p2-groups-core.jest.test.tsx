import React from "react";
import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const joinGroupMock = jest.fn();

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
  GroupPrimaryActionBar: jest.requireActual("@/components/groups/GroupActions")
    .GroupPrimaryActionBar,
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
  getGroupPrimaryAction: () => "join",
  useGroupActions: () => ({
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

describe("P2 group mobile boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("groups.browse-and-join joins a discoverable group from its real detail screen", async () => {
    renderNative(<GroupDetailScreen />);
    fireEvent.press(screen.getByText("Join group"));
    await waitFor(() => expect(joinGroupMock).toHaveBeenCalledWith("group-1"));
  });
});
