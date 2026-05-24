import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import { Users } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import type { DisplayGroupViewerState, GroupListItem } from "@/lib/groups";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";
import { GroupAccessLevelBadge, GroupJoinPolicyBadge, GroupRelationshipBadge } from "./GroupBadges";

type GroupCardProps = {
  group: GroupListItem;
  onPress?: (group: GroupListItem) => void;
  testID?: string;
  viewer?: DisplayGroupViewerState | null;
};

function GroupAvatar({
  group,
  size = "default",
}: {
  group: GroupListItem;
  size?: "default" | "sm";
}) {
  const displayName = group.name?.trim() || "Group";
  const avatarUrl = group.avatar_url ? getReachableSupabaseStorageUrl(group.avatar_url) : null;

  return (
    <Avatar alt={displayName} className={size === "sm" ? "h-10 w-10" : "h-12 w-12"}>
      {avatarUrl ? <AvatarImage source={{ uri: avatarUrl }} /> : null}
      <AvatarFallback>
        <Text
          className={
            size === "sm"
              ? "text-sm font-semibold text-muted-foreground"
              : "text-base font-semibold text-muted-foreground"
          }
        >
          {displayName.charAt(0).toUpperCase() || "G"}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}

export function GroupCard({ group, onPress, testID, viewer }: GroupCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!onPress}
      onPress={() => onPress?.(group)}
      testID={testID}
    >
      <View className="gap-3 rounded-2xl border border-border bg-card p-4">
        <View className="flex-row items-start gap-3">
          <GroupAvatar group={group} />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-lg font-semibold text-foreground" numberOfLines={2}>
              {group.name}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              @{group.slug}
            </Text>
          </View>
          {viewer ? <GroupRelationshipBadge relationshipState={viewer.relationshipState} /> : null}
        </View>

        {group.description ? (
          <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={3}>
            {group.description}
          </Text>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          <GroupAccessLevelBadge accessLevel={group.access_level} />
          <GroupJoinPolicyBadge joinPolicy={group.join_policy} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function GroupCompactCard({ group, onPress, testID, viewer }: GroupCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!onPress}
      onPress={() => onPress?.(group)}
      testID={testID}
    >
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
        <GroupAvatar group={group} size="sm" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {group.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Users size={12} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {group.description?.trim() || formatCompactPolicy(group.join_policy)}
            </Text>
          </View>
        </View>
        {viewer ? <GroupRelationshipBadge relationshipState={viewer.relationshipState} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function formatCompactPolicy(joinPolicy: GroupListItem["join_policy"]) {
  if (joinPolicy === "open") return "Open to join";
  return "Invite only";
}
