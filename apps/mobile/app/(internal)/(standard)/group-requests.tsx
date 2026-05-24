import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import {
  GroupEmptyState,
  GroupInvitationRow,
  GroupJoinRequestRow,
  GroupListSkeleton,
  GroupMembersOnlyLockedState,
} from "@/components/groups";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { useGroupDetailViewModel, useGroupInviteActions } from "@/lib/groups";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type InviteProfile = { id: string; username: string | null; avatar_url: string | null };
type GroupRequestsTab = "invitations" | "requesters";

const GROUP_REQUESTS_TABS: Array<{ key: GroupRequestsTab; label: string }> = [
  { key: "invitations", label: "Invitations" },
  { key: "requesters", label: "Requesters" },
];

function RequestsTabMenu({
  activeTab,
  canInvite,
  canManageJoinRequests,
  onTabChange,
}: {
  activeTab: GroupRequestsTab;
  canInvite: boolean;
  canManageJoinRequests: boolean;
  onTabChange: (tab: GroupRequestsTab) => void;
}) {
  const tabs = GROUP_REQUESTS_TABS.filter((tab) =>
    tab.key === "invitations" ? canInvite : canManageJoinRequests,
  );

  if (tabs.length <= 1) return null;

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-2xl border border-border bg-muted/40 p-1"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            className={
              isActive
                ? "flex-1 rounded-xl bg-background px-3 py-2 shadow-sm"
                : "flex-1 rounded-xl px-3 py-2"
            }
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            testID={`group-requests-tab-${tab.key}`}
          >
            <Text
              className={
                isActive
                  ? "text-center text-sm font-semibold text-foreground"
                  : "text-center text-sm font-semibold text-muted-foreground"
              }
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileInviteRow({
  isSelected,
  onPress,
  profile,
}: {
  isSelected: boolean;
  onPress: () => void;
  profile: InviteProfile;
}) {
  const navigateTo = useAppNavigate();
  const displayName = profile.username?.trim() || "Athlete";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={
        isSelected
          ? "rounded-2xl border border-primary bg-primary/10 p-3"
          : "rounded-2xl border border-border bg-card p-3"
      }
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          className="flex-row min-w-0 flex-1 items-center gap-3"
          onPress={(event) => {
            event.stopPropagation();
            navigateTo(`/user/${profile.id}` as any);
          }}
          testID={`group-invite-profile-link-${profile.id}`}
        >
          <Avatar alt={displayName} className="h-10 w-10">
            {profile.avatar_url ? <AvatarImage source={{ uri: profile.avatar_url }} /> : null}
            <AvatarFallback>
              <Text className="text-sm font-semibold text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </AvatarFallback>
          </Avatar>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {displayName}
            </Text>
            {isSelected ? <Text className="text-xs text-primary">Selected</Text> : null}
          </View>
        </Pressable>
        <View
          className={
            isSelected ? "rounded-full bg-primary px-2 py-1" : "rounded-full bg-muted px-2 py-1"
          }
        >
          <Text
            className={
              isSelected
                ? "text-[11px] font-semibold text-primary-foreground"
                : "text-[11px] font-semibold text-muted-foreground"
            }
          >
            {isSelected ? "Selected" : "Select"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function GroupRequestsScreen() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = singleParam(params.groupId) ?? null;
  const detailVm = useGroupDetailViewModel({ groupId, includeAdminQueues: true });
  const inviteActions = useGroupInviteActions();
  const [activeTab, setActiveTab] = useState<GroupRequestsTab>("invitations");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [profileSearch, setProfileSearch] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<InviteProfile[]>([]);
  const debouncedProfileSearch = useDebouncedValue(profileSearch.trim(), 300);
  const canInvite = Boolean(detailVm.viewer?.canInvite);
  const canManageJoinRequests = Boolean(detailVm.viewer?.canManageJoinRequests);
  const visibleTab: GroupRequestsTab =
    activeTab === "requesters" && canManageJoinRequests
      ? "requesters"
      : canInvite
        ? "invitations"
        : "requesters";
  const profileSearchQuery = api.social.searchUsers.useQuery(
    {
      query: debouncedProfileSearch || undefined,
      limit: 20,
      sort_by: debouncedProfileSearch ? "username_asc" : "newest",
    },
    { enabled: canInvite && inviteModalOpen },
  );
  const isSendingInvites = inviteActions.inviteProfilesMutation.isPending;

  const sendInvites = async () => {
    if (!detailVm.groupId) return;
    if (selectedProfiles.length === 0) {
      Alert.alert("Choose athletes", "Select one or more athletes to invite.");
      return;
    }

    try {
      await inviteActions.inviteProfiles({
        groupId: detailVm.groupId,
        profileIds: selectedProfiles.map((profile) => profile.id),
      });
      setSelectedProfiles([]);
      setProfileSearch("");
      setInviteModalOpen(false);
    } catch (error) {
      Alert.alert(
        "Unable to send invites",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const reviewRequest = async (requestId: string, decision: "approve" | "decline") => {
    try {
      await inviteActions.reviewJoinRequest({ requestId, decision });
    } catch (error) {
      Alert.alert(
        "Unable to review request",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const revokeInvite = async (invitationId: string) => {
    try {
      await inviteActions.revokeInvite(invitationId);
    } catch (error) {
      Alert.alert(
        "Unable to revoke invite",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  if (detailVm.isLoading) return <GroupListSkeleton count={4} />;

  if (!canInvite && !canManageJoinRequests) {
    return (
      <View className="flex-1 bg-background p-4">
        <GroupMembersOnlyLockedState />
      </View>
    );
  }

  const inviteModal =
    inviteModalOpen && canInvite ? (
      <AppFormModal
        dismissDisabled={isSendingInvites}
        footerContent={
          <View className="flex-row gap-3">
            <Button
              className="flex-1"
              disabled={isSendingInvites}
              onPress={() => setInviteModalOpen(false)}
              variant="outline"
            >
              <Text className="text-sm font-semibold text-foreground">Cancel</Text>
            </Button>
            <Button
              className="flex-1"
              disabled={isSendingInvites || selectedProfiles.length === 0}
              onPress={sendInvites}
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                {isSendingInvites
                  ? "Sending..."
                  : selectedProfiles.length > 1
                    ? `Send ${selectedProfiles.length} invites`
                    : "Send invite"}
              </Text>
            </Button>
          </View>
        }
        onClose={() => setInviteModalOpen(false)}
        title="Invite"
      >
        <View className="gap-3">
          <Input
            autoCapitalize="none"
            onChangeText={setProfileSearch}
            placeholder="Search by username"
            value={profileSearch}
          />
          {selectedProfiles.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {selectedProfiles.map((profile) => (
                <Button
                  key={profile.id}
                  onPress={() =>
                    setSelectedProfiles((current) =>
                      current.filter((item) => item.id !== profile.id),
                    )
                  }
                  size="sm"
                  variant="secondary"
                >
                  <Text className="text-xs font-semibold text-secondary-foreground">
                    {profile.username ?? "Athlete"} ×
                  </Text>
                </Button>
              ))}
            </View>
          ) : null}
          <View className="gap-2">
            {profileSearchQuery.isLoading ? (
              <Text className="text-xs text-muted-foreground">Searching athletes...</Text>
            ) : (profileSearchQuery.data?.users ?? []).length > 0 ? (
              profileSearchQuery.data?.users.map((profile) => {
                const isSelected = selectedProfiles.some((item) => item.id === profile.id);
                return (
                  <ProfileInviteRow
                    isSelected={isSelected}
                    key={profile.id}
                    onPress={() =>
                      setSelectedProfiles((current) =>
                        isSelected
                          ? current.filter((item) => item.id !== profile.id)
                          : [
                              ...current,
                              {
                                id: profile.id,
                                username: profile.username,
                                avatar_url: profile.avatar_url,
                              },
                            ],
                      )
                    }
                    profile={{
                      id: profile.id,
                      username: profile.username,
                      avatar_url: profile.avatar_url,
                    }}
                  />
                );
              })
            ) : (
              <Text className="text-xs text-muted-foreground">No athletes found.</Text>
            )}
          </View>
        </View>
      </AppFormModal>
    ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: canInvite
            ? () => (
                <Button
                  onPress={() => setInviteModalOpen(true)}
                  size="sm"
                  testID="group-requests-header-invite"
                >
                  <Text className="text-xs font-semibold text-primary-foreground">Invite</Text>
                </Button>
              )
            : undefined,
          title: "Manage",
        }}
      />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-8">
        <Text className="text-2xl font-semibold text-foreground">
          {detailVm.group?.name ?? "Members"}
        </Text>

        <RequestsTabMenu
          activeTab={visibleTab}
          canInvite={canInvite}
          canManageJoinRequests={canManageJoinRequests}
          onTabChange={setActiveTab}
        />

        {visibleTab === "requesters" && canManageJoinRequests ? (
          <View className="gap-3">
            {detailVm.joinRequests.length === 0 ? (
              <GroupEmptyState title="No pending requests" />
            ) : (
              detailVm.joinRequests.map((request) => (
                <GroupJoinRequestRow
                  joinRequest={request}
                  key={request.id}
                  onApprove={(item) => reviewRequest(item.id, "approve")}
                  onDecline={(item) => reviewRequest(item.id, "decline")}
                />
              ))
            )}
          </View>
        ) : null}

        {visibleTab === "invitations" && canInvite ? (
          <View className="gap-3">
            {detailVm.invitations.length === 0 ? (
              <GroupEmptyState title="No pending invites" />
            ) : (
              detailVm.invitations.map((invitation) => (
                <GroupInvitationRow
                  invitation={invitation}
                  key={invitation.id}
                  onRevoke={(item) => revokeInvite(item.id)}
                />
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
      {inviteModal}
    </>
  );
}
