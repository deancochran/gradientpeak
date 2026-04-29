import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  MessagesHeaderButton,
  NotificationsHeaderButton,
  SearchHeaderButton,
} from "./HeaderButtons";

interface AppHeaderProps {
  showGreeting?: boolean;
  title?: string;
}

export function AppHeader({ showGreeting = true, title }: AppHeaderProps) {
  const { profile } = useAuth();

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

  return (
    <View className="flex-row items-center justify-between px-5 py-4 bg-background border-b border-border">
      <View className="flex-1 mr-3">
        <Text className="text-2xl font-bold text-foreground">{getDisplayText()}</Text>
      </View>
      <View className="flex-row items-center">
        <SearchHeaderButton />
        <MessagesHeaderButton />
        <NotificationsHeaderButton />
      </View>
    </View>
  );
}
