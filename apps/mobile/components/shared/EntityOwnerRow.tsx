import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { Pressable, View } from "react-native";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

export type EntityOwner = {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

interface EntityOwnerRowProps {
  compact?: boolean;
  minimal?: boolean;
  owner?: EntityOwner | null;
  subtitle?: string | null;
  testID?: string;
}

export function EntityOwnerRow({
  compact = false,
  minimal = false,
  owner,
  subtitle,
  testID,
}: EntityOwnerRowProps) {
  const navigateTo = useAppNavigate();
  const displayName = owner?.username?.trim() || "Unknown User";
  const canOpenProfile = typeof owner?.id === "string" && owner.id.length > 0;

  const handlePress = () => {
    if (!canOpenProfile) {
      return;
    }

    navigateTo({
      pathname: "/user/[userId]",
      params: { userId: owner.id },
    } as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!canOpenProfile}
      className={`flex-row items-center ${compact ? "gap-1.5" : "gap-3"}`}
      testID={testID}
    >
      {minimal || compact ? (
        <Text
          className={
            compact
              ? "text-xs font-medium text-muted-foreground"
              : "text-xs font-medium text-muted-foreground"
          }
        >
          By
        </Text>
      ) : null}
      <Avatar alt={displayName} className={compact ? "h-6 w-6" : minimal ? "h-7 w-7" : "h-10 w-10"}>
        {owner?.avatar_url ? <AvatarImage source={{ uri: owner.avatar_url }} /> : null}
        <AvatarFallback>
          <Text
            className={
              compact || minimal
                ? "text-xs font-semibold text-foreground"
                : "text-sm font-semibold text-foreground"
            }
          >
            {displayName.charAt(0).toUpperCase() || "U"}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-0.5">
        <Text
          className={
            compact
              ? "text-xs font-medium text-muted-foreground"
              : minimal
                ? "text-xs font-medium text-muted-foreground"
                : "text-sm font-semibold text-foreground"
          }
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {subtitle ? <Text className="text-xs text-muted-foreground">{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}
