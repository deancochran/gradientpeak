import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "expo-router";
import React from "react";
import { TouchableOpacity, View } from "react-native";

interface AppHeaderProps {
  showGreeting?: boolean;
  title?: string;
}

export function AppHeader({ showGreeting = true, title }: AppHeaderProps) {
  const { user, profile } = useAuth();
  const router = useRouter();

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
    router.push("/settings" as any);
  };

  // Extract timestamp from avatar URL if it exists (added during upload)
  // This ensures React Native's image cache updates when avatar changes
  const avatarUri = profile?.avatar_url;

  return (
    <View className="flex-row items-center justify-between px-5 py-4 bg-background border-b border-border">
      <View className="flex-1 mr-3">
        <Text className="text-2xl font-bold text-foreground">
          {getDisplayText()}
        </Text>
      </View>
      <TouchableOpacity
        onPress={handleAvatarPress}
        className="w-10 h-10 rounded-full overflow-hidden"
        activeOpacity={0.7}
      >
        <Avatar alt={profile?.username || "User"} className="w-10 h-10">
          {avatarUri ? (
            <AvatarImage
              source={{ uri: avatarUri }}
              key={avatarUri} // Key changes when URL changes, forcing re-render
            />
          ) : null}
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
  );
}
