import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";

export type EntityOwner = {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

interface EntityOwnerRowProps {
  compact?: boolean;
  displayNameOverride?: string;
  fallbackClassName?: string;
  fallbackInitials?: string;
  minimal?: boolean;
  onPress?: () => void;
  owner?: EntityOwner | null;
  subtitle?: ReactNode;
  testID?: string;
}

export function EntityOwnerRow({
  compact = false,
  displayNameOverride,
  fallbackClassName,
  fallbackInitials,
  minimal = false,
  onPress,
  owner,
  subtitle,
  testID,
}: EntityOwnerRowProps) {
  const user = useAuthStore((state) => state.user);
  const navigateTo = useAppNavigate();
  const displayName = displayNameOverride?.trim() || owner?.username?.trim() || "Unknown User";
  const canOpenProfile = typeof owner?.id === "string" && owner.id.length > 0;
  const canPress = Boolean(onPress) || canOpenProfile;

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    if (!canOpenProfile) {
      return;
    }

    if (owner.id === user?.id) {
      navigateTo("/profile");
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
      disabled={!canPress}
      className={`flex-row items-center ${compact ? "gap-1.5" : "gap-3"}`}
      testID={testID}
    >
      <Avatar alt={displayName} className={compact ? "h-6 w-6" : minimal ? "h-7 w-7" : "h-10 w-10"}>
        {owner?.avatar_url ? <AvatarImage source={{ uri: owner.avatar_url }} /> : null}
        <AvatarFallback className={fallbackClassName}>
          <Text
            className={
              compact || minimal
                ? "text-xs font-semibold text-muted-foreground"
                : "text-sm font-semibold text-muted-foreground"
            }
          >
            {fallbackInitials || displayName.charAt(0).toUpperCase() || "U"}
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
        {typeof subtitle === "string" ? (
          <Text className="text-xs text-muted-foreground">{subtitle}</Text>
        ) : (
          subtitle
        )}
      </View>
    </Pressable>
  );
}
