import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { Pressable, View } from "react-native";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

type EntityOwner = {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

interface EntityOwnerRowProps {
  owner?: EntityOwner | null;
  subtitle?: string | null;
  testID?: string;
}

export function EntityOwnerRow({ owner, subtitle, testID }: EntityOwnerRowProps) {
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
      className="flex-row items-center gap-3"
      testID={testID}
    >
      <Avatar alt={displayName} className="h-10 w-10">
        {owner?.avatar_url ? <AvatarImage source={{ uri: owner.avatar_url }} /> : null}
        <AvatarFallback>
          <Text className="text-sm font-semibold text-foreground">
            {displayName.charAt(0).toUpperCase() || "U"}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-foreground">{displayName}</Text>
        {subtitle ? <Text className="text-xs text-muted-foreground">{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}
