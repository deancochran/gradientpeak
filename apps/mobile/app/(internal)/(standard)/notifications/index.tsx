import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { trpc } from "@/lib/trpc";
import { cn } from "@repo/ui/lib/cn";
import { Stack, useRouter } from "expo-router";
import { Bell, Mail, UserPlus } from "lucide-react-native";
import React from "react";
import { FlatList, Pressable, View } from "react-native";

function NotificationItem({
  notification,
  onPress,
  onAccept,
  onReject,
}: {
  notification: any;
  onPress: () => void;
  onAccept?: (followerId: string) => void;
  onReject?: (followerId: string) => void;
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
  } else if (notification.type === "follow_request") {
    Icon = UserPlus;
    title = "Follow Request";
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
              : notification.type === "new_follower"
                ? "Accepted your follow request."
                : notification.type === "follow_request"
                  ? "Wants to follow you."
                  : "Tap to view details."}
          </Text>
          {isUnread && (
            <Badge variant="default" className="h-2 w-2 rounded-full p-0" />
          )}
        </View>

        {notification.type === "follow_request" && onAccept && onReject && (
          <View className="flex-row gap-2 mt-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onPress={(e) => {
                e.stopPropagation();
                onAccept(notification.actor_id);
              }}
            >
              <Text>Accept</Text>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onPress={(e) => {
                e.stopPropagation();
                onReject(notification.actor_id);
              }}
            >
              <Text>Reject</Text>
            </Button>
          </View>
        )}
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

  const acceptFollowMutation = trpc.social.acceptFollowRequest.useMutation({
    onMutate: async ({ follower_id }) => {
      // Cancel any outgoing refetches
      await utils.notifications.getRecent.cancel();

      // Snapshot the previous value
      const previousNotifications = utils.notifications.getRecent.getData();

      // Optimistically update to remove the follow_request notification
      utils.notifications.getRecent.setData({ limit: 20 }, (old: any[] = []) =>
        old?.filter(
          (n) => !(n.type === "follow_request" && n.actor_id === follower_id),
        ),
      );

      return { previousNotifications };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousNotifications) {
        utils.notifications.getRecent.setData(
          { limit: 20 },
          context.previousNotifications,
        );
      }
    },
    onSettled: () => {
      utils.notifications.getRecent.invalidate();
      utils.notifications.getUnreadCount.invalidate();
      utils.social.getFollowers.invalidate();
      utils.social.getFollowing.invalidate();
    },
  });

  const rejectFollowMutation = trpc.social.rejectFollowRequest.useMutation({
    onMutate: async ({ follower_id }) => {
      // Cancel any outgoing refetches
      await utils.notifications.getRecent.cancel();

      // Snapshot the previous value
      const previousNotifications = utils.notifications.getRecent.getData();

      // Optimistically update to remove the follow_request notification
      utils.notifications.getRecent.setData({ limit: 20 }, (old: any[] = []) =>
        old?.filter(
          (n) => !(n.type === "follow_request" && n.actor_id === follower_id),
        ),
      );

      return { previousNotifications };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousNotifications) {
        utils.notifications.getRecent.setData(
          { limit: 20 },
          context.previousNotifications,
        );
      }
    },
    onSettled: () => {
      utils.notifications.getRecent.invalidate();
      utils.notifications.getUnreadCount.invalidate();
      // Invalidate followers/following lists in case they were viewing
      utils.social.getFollowers.invalidate();
      utils.social.getFollowing.invalidate();
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

  const handleAcceptFollow = (followerId: string) => {
    acceptFollowMutation.mutate({ follower_id: followerId });
  };

  const handleRejectFollow = (followerId: string) => {
    rejectFollowMutation.mutate({ follower_id: followerId });
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
            onAccept={handleAcceptFollow}
            onReject={handleRejectFollow}
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
