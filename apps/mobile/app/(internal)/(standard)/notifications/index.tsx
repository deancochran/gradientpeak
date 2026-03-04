import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Stack, useRouter } from "expo-router";
import { Bell, Mail, UserPlus } from "lucide-react-native";
import React from "react";
import { FlatList, Pressable, View } from "react-native";

function NotificationItem({
  notification,
  onPress,
}: {
  notification: any;
  onPress: () => void;
}) {
  const isUnread = !notification.read_at;

  let Icon = Bell;
  let title = "Notification";

  if (notification.type === "new_message") {
    Icon = Mail;
    title = "New Message";
  } else if (notification.type === "coaching_invitation") {
    Icon = UserPlus;
    title = "Coaching Invite";
  } else if (notification.type === "new_follower") {
    Icon = UserPlus;
    title = "New Follower";
  }

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "flex-row items-center p-4 border-b border-border bg-background active:bg-accent",
        isUnread && "bg-muted/10",
      )}
    >
      <View className="h-12 w-12 mr-4 rounded-full bg-muted items-center justify-center">
        <Icon size={24} className="text-foreground" />
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row justify-between items-center">
          <Text
            className={cn(
              "text-base text-foreground",
              isUnread ? "font-bold" : "font-medium",
            )}
          >
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {new Date(notification.created_at).toLocaleDateString()}
          </Text>
        </View>

        <View className="flex-row justify-between items-center">
          <Text
            className="text-sm text-muted-foreground flex-1 mr-2"
            numberOfLines={1}
          >
            {notification.type === "coaching_invitation"
              ? "You have a new coaching invitation."
              : "Tap to view details."}
          </Text>
          {isUnread && (
            <Badge variant="default" className="h-2 w-2 rounded-full p-0" />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: notifications = [], isLoading } =
    trpc.notifications.getRecent.useQuery({ limit: 20 });

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.getRecent.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const handlePress = (notification: any) => {
    if (!notification.read_at) {
      markReadMutation.mutate({ notification_ids: [notification.id] });
    }

    if (notification.type === "new_message") {
      router.push("/messages");
    }
  };

  const handleReadAll = () => {
    const unreadIds = notifications
      .filter((n: any) => !n.read_at)
      .map((n: any) => n.id);
    if (unreadIds.length > 0) {
      markReadMutation.mutate({ notification_ids: unreadIds });
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () => (
            <Button variant="ghost" onPress={handleReadAll}>
              <Text className="text-primary">Read All</Text>
            </Button>
          ),
        }}
      />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={() => handlePress(item)}
          />
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center p-8">
            <Text className="text-muted-foreground">No notifications</Text>
          </View>
        }
      />
    </View>
  );
}
