import {
  getNotificationViewModel,
  getUnreadNotificationIds,
  normalizeNotificationListItem,
} from "@repo/core";
import { invalidateNotificationQueries, invalidateRelationshipQueries } from "@repo/trpc/react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import { Stack, useRouter } from "expo-router";
import { Bell, Mail, UserPlus } from "lucide-react-native";
import React from "react";
import { FlatList, Pressable, View } from "react-native";
import { trpc } from "@/lib/trpc";

function NotificationItem({
  notification,
  onPress,
  onAccept,
  onReject,
}: {
  notification: NonNullable<ReturnType<typeof normalizeNotificationListItem>>;
  onPress: () => void;
  onAccept?: (followerId: string) => void;
  onReject?: (followerId: string) => void;
}) {
  const item = getNotificationViewModel(notification);

  let Icon = Bell;
  if (item.type === "new_message") {
    Icon = Mail;
  } else if (item.type === "coaching_invitation") {
    Icon = UserPlus;
  } else if (item.type === "new_follower") {
    Icon = UserPlus;
  } else if (item.type === "follow_request") {
    Icon = UserPlus;
  }

  return (
    <Pressable
      onPress={onPress}
      testID={`notification-item-${notification.id}`}
      className={cn(
        "flex-row items-center p-4 border-b border-border bg-background active:bg-accent",
        item.isUnread && "bg-muted/10",
      )}
    >
      <View className="h-12 w-12 mr-4 rounded-full bg-muted items-center justify-center">
        <Icon size={24} className="text-foreground" />
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row justify-between items-center">
          <Text
            className={cn("text-base text-foreground", item.isUnread ? "font-bold" : "font-medium")}
          >
            {item.title}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
          </Text>
        </View>

        <View className="flex-row justify-between items-center">
          <Text className="text-sm text-muted-foreground flex-1 mr-2" numberOfLines={1}>
            {item.description}
          </Text>
          {item.isUnread && <Badge variant="default" className="h-2 w-2 rounded-full p-0" />}
        </View>

        {item.requiresFollowRequestAction && onAccept && onReject && (
          <View className="flex-row gap-2 mt-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              testID={`notification-accept-${notification.id}`}
              onPress={(e) => {
                e.stopPropagation();
                if (item.actorId) {
                  onAccept(item.actorId);
                }
              }}
            >
              <Text>Accept</Text>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              testID={`notification-reject-${notification.id}`}
              onPress={(e) => {
                e.stopPropagation();
                if (item.actorId) {
                  onReject(item.actorId);
                }
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
  const { data: notifications = [], isLoading } = trpc.notifications.getRecent.useQuery({
    limit: 20,
  });
  const normalizedNotifications = notifications
    .map((notification) => normalizeNotificationListItem(notification))
    .filter(
      (
        notification,
      ): notification is NonNullable<ReturnType<typeof normalizeNotificationListItem>> =>
        notification !== null,
    );

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: async () => invalidateNotificationQueries(utils),
  });

  const acceptFollowMutation = trpc.social.acceptFollowRequest.useMutation({
    onMutate: async ({ follower_id }) => {
      // Cancel any outgoing refetches
      await utils.notifications.getRecent.cancel();

      // Snapshot the previous value
      const previousNotifications = utils.notifications.getRecent.getData();

      // Optimistically update to remove the follow_request notification
      utils.notifications.getRecent.setData({ limit: 20 }, (old: any[] = []) =>
        old?.filter((n) => !(n.type === "follow_request" && n.actor_id === follower_id)),
      );

      return { previousNotifications };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousNotifications) {
        utils.notifications.getRecent.setData({ limit: 20 }, context.previousNotifications);
      }
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        invalidateNotificationQueries(utils),
        invalidateRelationshipQueries(utils, [variables.follower_id]),
      ]);
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
        old?.filter((n) => !(n.type === "follow_request" && n.actor_id === follower_id)),
      );

      return { previousNotifications };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousNotifications) {
        utils.notifications.getRecent.setData({ limit: 20 }, context.previousNotifications);
      }
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        invalidateNotificationQueries(utils),
        invalidateRelationshipQueries(utils, [variables.follower_id]),
      ]);
    },
  });

  const handlePress = (
    notification: NonNullable<ReturnType<typeof normalizeNotificationListItem>>,
  ) => {
    const item = getNotificationViewModel(notification);
    if (item.isUnread) {
      markReadMutation.mutate({ notification_ids: [notification.id] });
    }

    if (item.type === "new_message") {
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
    const unreadIds = getUnreadNotificationIds(normalizedNotifications);
    if (unreadIds.length > 0) {
      markReadMutation.mutate({ notification_ids: unreadIds });
    }
  };

  return (
    <View className="flex-1 bg-background" testID="notifications-screen">
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () => (
            <Button variant="ghost" onPress={handleReadAll} testID="notifications-read-all-button">
              <Text className="text-primary">Read All</Text>
            </Button>
          ),
        }}
      />
      <FlatList
        testID="notifications-list"
        data={normalizedNotifications}
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
          <View
            className="flex-1 items-center justify-center p-8"
            testID="notifications-empty-state"
          >
            <Text className="text-muted-foreground">No notifications</Text>
          </View>
        }
      />
    </View>
  );
}
