import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { MessagesHeaderButton, NotificationsHeaderButton } from "./HeaderButtons";

interface AppHeaderProps {
  showGreeting?: boolean;
  title?: string;
}

export function AppHeader({ showGreeting = true, title }: AppHeaderProps) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const navigateTo = useAppNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getDisplayText = () => {
    if (title) return title;
    if (showGreeting) {
      return `${getGreeting()}, ${profile?.username || "Athlete"}`;
    }
    return profile?.username || "Athlete";
  };

  const handleAvatarPress = () => {
    if (!user?.id) return;
    navigateTo({
      pathname: "/user/[userId]",
      params: { userId: user.id },
    } as any);
  };

  const avatarUri = profile?.avatar_url;

  return (
    <View className="flex-row items-center justify-between px-5 py-4 bg-background border-b border-border">
      <View className="flex-1 mr-3">
        <Text className="text-2xl font-bold text-foreground">{getDisplayText()}</Text>
      </View>
      <View className="flex-row items-center">
        <MessagesHeaderButton />
        <NotificationsHeaderButton />
        <TouchableOpacity
          onPress={handleAvatarPress}
          className="w-10 h-10 rounded-full overflow-hidden ml-2"
          activeOpacity={0.7}
          testID="app-header-avatar-button"
        >
          <Avatar alt={profile?.username || "User"} className="w-10 h-10">
            {avatarUri ? <AvatarImage source={{ uri: avatarUri }} key={avatarUri} /> : null}
            <AvatarFallback>
              <Text className="text-base font-semibold">
                {profile?.username?.charAt(0)?.toUpperCase() ||
                  user?.email?.charAt(0)?.toUpperCase() ||
                  "A"}
              </Text>
            </AvatarFallback>
          </Avatar>
        </TouchableOpacity>
      </View>
    </View>
  );
}
