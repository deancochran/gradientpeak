import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { formatDistanceToNow } from "date-fns";
import type React from "react";
import { Pressable, View } from "react-native";
import type {
  GroupInvitation,
  GroupJoinRequest,
  GroupMember,
  MyGroupInvitation,
} from "@/lib/groups";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { GroupMembershipRoleBadge } from "./GroupBadges";

type ProfileLike = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

type GroupMemberRowProps = {
  member: GroupMember;
  onPress?: (member: GroupMember) => void;
  rightAccessory?: React.ReactNode;
};

type GroupInvitationRowProps = {
  invitation: GroupInvitation | MyGroupInvitation;
  onAccept?: (invitation: GroupInvitation | MyGroupInvitation) => void;
  onDecline?: (invitation: GroupInvitation | MyGroupInvitation) => void;
  onRevoke?: (invitation: GroupInvitation | MyGroupInvitation) => void;
};

type GroupJoinRequestRowProps = {
  joinRequest: GroupJoinRequest;
  onApprove?: (joinRequest: GroupJoinRequest) => void;
  onDecline?: (joinRequest: GroupJoinRequest) => void;
};

function ProfileAvatar({ profile }: { profile: ProfileLike }) {
  const displayName = profile.username?.trim() || "Athlete";

  return (
    <Avatar alt={displayName} className="h-10 w-10">
      {profile.avatar_url ? <AvatarImage source={{ uri: profile.avatar_url }} /> : null}
      <AvatarFallback>
        <Text className="text-sm font-semibold text-muted-foreground">
          {displayName.charAt(0).toUpperCase() || "A"}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}

function formatCreatedAt(createdAt?: string | null) {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;

  return formatDistanceToNow(date, { addSuffix: true });
}

export function GroupMemberRow({ member, onPress, rightAccessory }: GroupMemberRowProps) {
  const navigateTo = useAppNavigate();
  const joinedAt = formatCreatedAt(member.created_at);
  const handlePress = () => {
    if (onPress) {
      onPress(member);
      return;
    }

    navigateTo(`/user/${member.profile.id}` as any);
  };

  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
      onPress={handlePress}
      testID={`group-member-profile-link-${member.profile.id}`}
    >
      <ProfileAvatar profile={member.profile} />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
          {member.profile.username?.trim() || "Athlete"}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <GroupMembershipRoleBadge role={member.role} />
          {joinedAt ? (
            <Text className="text-xs text-muted-foreground">Joined {joinedAt}</Text>
          ) : null}
        </View>
      </View>
      {rightAccessory}
    </Pressable>
  );
}

export function GroupInvitationRow({
  invitation,
  onAccept,
  onDecline,
  onRevoke,
}: GroupInvitationRowProps) {
  const navigateTo = useAppNavigate();
  const invitedProfile = "invited_profile" in invitation ? invitation.invited_profile : null;
  const title =
    invitedProfile?.username ??
    ("group" in invitation ? invitation.group.name : "Pending invitation");
  const subtitle = formatCreatedAt(invitation.created_at);
  const openInvitedProfile = invitedProfile
    ? () => navigateTo(`/user/${invitedProfile.id}` as any)
    : undefined;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3">
      <Pressable
        accessibilityRole={openInvitedProfile ? "button" : undefined}
        className="flex-row items-center gap-3"
        disabled={!openInvitedProfile}
        onPress={openInvitedProfile}
        testID={invitedProfile ? `group-invitation-profile-link-${invitedProfile.id}` : undefined}
      >
        {invitedProfile ? <ProfileAvatar profile={invitedProfile} /> : null}
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {subtitle ? `Invited ${subtitle}` : "Pending invitation"}
          </Text>
        </View>
      </Pressable>
      <View className="flex-row flex-wrap gap-2">
        {onAccept ? <RowButton label="Accept" onPress={() => onAccept(invitation)} /> : null}
        {onDecline ? (
          <RowButton label="Decline" onPress={() => onDecline(invitation)} variant="secondary" />
        ) : null}
        {onRevoke ? (
          <RowButton label="Revoke" onPress={() => onRevoke(invitation)} variant="destructive" />
        ) : null}
      </View>
    </View>
  );
}

export function GroupJoinRequestRow({
  joinRequest,
  onApprove,
  onDecline,
}: GroupJoinRequestRowProps) {
  const navigateTo = useAppNavigate();
  const requestedAt = formatCreatedAt(joinRequest.created_at);

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Pressable
        accessibilityRole="button"
        className="min-w-0 flex-1 flex-row items-center gap-3"
        onPress={() => navigateTo(`/user/${joinRequest.profile.id}` as any)}
        testID={`group-join-request-profile-link-${joinRequest.profile.id}`}
      >
        <ProfileAvatar profile={joinRequest.profile} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {joinRequest.profile.username?.trim() || "Athlete"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {requestedAt ? `Requested ${requestedAt}` : "Pending request"}
          </Text>
        </View>
      </Pressable>
      <View className="flex-row gap-2">
        {onApprove ? <RowButton label="Approve" onPress={() => onApprove(joinRequest)} /> : null}
        {onDecline ? (
          <RowButton label="Decline" onPress={() => onDecline(joinRequest)} variant="secondary" />
        ) : null}
      </View>
    </View>
  );
}

function RowButton({
  label,
  onPress,
  variant = "default",
}: {
  label: string;
  onPress: () => void;
  variant?: "default" | "secondary" | "destructive";
}) {
  return (
    <Button onPress={onPress} size="sm" variant={variant}>
      <Text
        className={
          variant === "destructive"
            ? "text-xs font-semibold text-destructive-foreground"
            : variant === "secondary"
              ? "text-xs font-semibold text-secondary-foreground"
              : "text-xs font-semibold text-primary-foreground"
        }
      >
        {label}
      </Text>
    </Button>
  );
}
