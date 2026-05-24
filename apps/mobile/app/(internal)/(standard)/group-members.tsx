import type { GroupMembershipRole } from "@repo/core/groups";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MoreHorizontal } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import {
  GroupEmptyState,
  GroupListSkeleton,
  GroupMemberRow,
  GroupMembersOnlyLockedState,
} from "@/components/groups";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { type GroupMember, useGroupDetailViewModel, useGroupMemberActions } from "@/lib/groups";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GroupMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = singleParam(params.groupId) ?? null;
  const detailVm = useGroupDetailViewModel({ groupId });
  const memberActions = useGroupMemberActions();
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const isUpdatingMember =
    memberActions.updateRoleMutation.isPending ||
    memberActions.removeMutation.isPending ||
    memberActions.transferOwnershipMutation.isPending;

  const closeMemberOptions = () => {
    if (!isUpdatingMember) {
      setSelectedMember(null);
    }
  };

  const runMemberAction = async (action: () => Promise<unknown>, errorTitle: string) => {
    try {
      await action();
      setSelectedMember(null);
    } catch (error) {
      Alert.alert(errorTitle, error instanceof Error ? error.message : "Please try again.");
    }
  };

  const updateMemberRole = (member: GroupMember, role: Exclude<GroupMembershipRole, "owner">) => {
    if (!detailVm.groupId) return;
    void runMemberAction(
      () =>
        memberActions.updateMemberRole({
          groupId: detailVm.groupId!,
          profileId: member.profile.id,
          role,
        }),
      "Unable to update member role",
    );
  };

  const removeMember = (member: GroupMember) => {
    if (!detailVm.groupId) return;
    Alert.alert(
      "Remove member",
      `Remove ${member.profile.username ?? "this athlete"} from the group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void runMemberAction(
              () =>
                memberActions.removeMember({
                  groupId: detailVm.groupId!,
                  profileId: member.profile.id,
                }),
              "Unable to remove member",
            );
          },
        },
      ],
    );
  };

  const transferOwnership = (member: GroupMember) => {
    if (!detailVm.groupId) return;
    Alert.alert(
      "Transfer ownership",
      `Make ${member.profile.username ?? "this athlete"} the owner of this group? You will become an admin.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: () => {
            void runMemberAction(
              () =>
                memberActions.transferOwnership({
                  groupId: detailVm.groupId!,
                  targetProfileId: member.profile.id,
                  previousOwnerRole: "admin",
                }),
              "Unable to transfer ownership",
            );
          },
        },
      ],
    );
  };

  if (detailVm.isLoading) return <GroupListSkeleton count={5} />;

  if (!detailVm.viewer?.canViewMembers) {
    return (
      <View className="flex-1 bg-background p-4">
        <GroupMembersOnlyLockedState />
      </View>
    );
  }

  const memberOptionsModal = selectedMember ? (
    <AppFormModal
      dismissDisabled={isUpdatingMember}
      onClose={closeMemberOptions}
      title="Member options"
    >
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-base font-semibold text-foreground">
            {selectedMember.profile.username?.trim() || "Athlete"}
          </Text>
          <Text className="text-sm text-muted-foreground">Choose how to manage this member.</Text>
        </View>

        <View className="gap-2">
          {detailVm.viewer?.canPromoteMembers && selectedMember.role === "member" ? (
            <MemberOptionButton
              disabled={isUpdatingMember}
              label="Promote to admin"
              onPress={() => updateMemberRole(selectedMember, "admin")}
            />
          ) : null}
          {detailVm.viewer?.canDemoteAdmins && selectedMember.role === "admin" ? (
            <MemberOptionButton
              disabled={isUpdatingMember}
              label="Demote to member"
              onPress={() => updateMemberRole(selectedMember, "member")}
            />
          ) : null}
          {detailVm.viewer?.canTransferOwnership && selectedMember.role !== "owner" ? (
            <MemberOptionButton
              disabled={isUpdatingMember}
              label="Transfer ownership"
              onPress={() => transferOwnership(selectedMember)}
              variant="destructive"
            />
          ) : null}
          {detailVm.viewer?.canRemoveMembers && selectedMember.role !== "owner" ? (
            <MemberOptionButton
              disabled={isUpdatingMember}
              label="Remove from group"
              onPress={() => removeMember(selectedMember)}
              variant="destructive"
            />
          ) : null}
          <MemberOptionButton
            disabled={isUpdatingMember}
            label="Cancel"
            onPress={closeMemberOptions}
            variant="secondary"
          />
        </View>
      </View>
    </AppFormModal>
  ) : null;

  return (
    <>
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4 pb-8">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-2xl font-semibold text-foreground">Members</Text>
          {detailVm.viewer?.canInvite ? (
            <Button
              onPress={() => router.push({ pathname: "/group-requests", params: { groupId } })}
              size="sm"
            >
              <Text className="text-sm font-semibold text-primary-foreground">Invite</Text>
            </Button>
          ) : null}
        </View>

        {detailVm.members.length === 0 ? (
          <GroupEmptyState
            description="Members will appear here after they join."
            title="No members yet"
          />
        ) : (
          detailVm.members.map((member) => (
            <GroupMemberRow
              key={member.profile.id}
              member={member}
              rightAccessory={
                detailVm.viewer?.canManageMembers ? (
                  <Pressable
                    accessibilityLabel={`Open options for ${member.profile.username ?? "member"}`}
                    accessibilityRole="button"
                    className="h-9 w-9 items-center justify-center rounded-full bg-muted"
                    onPress={(event) => {
                      event.stopPropagation();
                      setSelectedMember(member);
                    }}
                    testID={`group-member-options-${member.profile.id}`}
                  >
                    <MoreHorizontal size={18} className="text-foreground" />
                  </Pressable>
                ) : null
              }
            />
          ))
        )}
      </ScrollView>
      {memberOptionsModal}
    </>
  );
}

function MemberOptionButton({
  disabled,
  label,
  onPress,
  variant = "default",
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  variant?: "default" | "secondary" | "destructive";
}) {
  return (
    <Button disabled={disabled} onPress={onPress} variant={variant}>
      <Text
        className={
          variant === "destructive"
            ? "text-sm font-semibold text-destructive-foreground"
            : variant === "secondary"
              ? "text-sm font-semibold text-secondary-foreground"
              : "text-sm font-semibold text-primary-foreground"
        }
      >
        {label}
      </Text>
    </Button>
  );
}
