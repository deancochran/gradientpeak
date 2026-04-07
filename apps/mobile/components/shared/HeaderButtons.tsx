import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { Bell, MessageSquare } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";

export function MessagesHeaderButton() {
  const router = useRouter();
  const { data: unreadCount = 0 } = api.messaging.getUnreadCount.useQuery();

  return (
    <TouchableOpacity
      onPress={() => router.push("/messages")}
      testID="messages-header-button"
      className="w-10 h-10 items-center justify-center mr-2"
    >
      <Icon as={MessageSquare} size={24} className="text-foreground" />
      {unreadCount > 0 && (
        <View className="absolute top-1 right-1 bg-destructive w-4 h-4 rounded-full items-center justify-center">
          <Text className="text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function NotificationsHeaderButton() {
  const router = useRouter();
  const { data: unreadCount = 0 } = api.notifications.getUnreadCount.useQuery();

  return (
    <TouchableOpacity
      onPress={() => router.push("/notifications")}
      testID="notifications-header-button"
      className="w-10 h-10 items-center justify-center mr-2"
    >
      <Icon as={Bell} size={24} className="text-foreground" />
      {unreadCount > 0 && (
        <View className="absolute top-1 right-1 bg-destructive w-4 h-4 rounded-full items-center justify-center">
          <Text className="text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
