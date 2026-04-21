import {
  getConversationDisplayName,
  getConversationInitials,
  getConversationPreviewText,
} from "@repo/core";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import { Stack } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { formatRelativeTime } from "@/lib/utils";

// Type for conversation with message data (returned from getConversations query)
interface ConversationSummary {
  id: string;
  created_at: string;
  is_group: boolean;
  group_name: string | null;
  last_message_at: string | null;
  peer_profile: {
    avatar_url: string | null;
    full_name: string | null;
    id: string | undefined;
    username: string | null;
  } | null;
  last_message: {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    read_at?: string | null;
  } | null;
  unread_count: number;
}

function ConversationItem({
  conversation,
  onPress,
}: {
  conversation: ConversationSummary;
  onPress: () => void;
}) {
  const name = getConversationDisplayName(conversation);
  const unreadCount = conversation.unread_count || 0;
  const isUnread = unreadCount > 0;
  const subtitle = conversation.is_group
    ? conversation.group_name
      ? "Group conversation"
      : "Group"
    : conversation.peer_profile?.username
      ? `@${conversation.peer_profile.username}`
      : null;

  return (
    <Pressable
      onPress={onPress}
      testID={`messages-conversation-${conversation.id}`}
      className="rounded-3xl border border-border bg-card p-4 active:bg-accent"
    >
      <View className="flex-row items-center gap-3">
        <Avatar alt={name} className="h-11 w-11">
          {conversation.peer_profile?.avatar_url ? (
            <AvatarImage source={{ uri: conversation.peer_profile.avatar_url }} />
          ) : null}
          <AvatarFallback>
            <Text>{getConversationInitials(conversation)}</Text>
          </AvatarFallback>
        </Avatar>

        <View className="flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1 gap-0.5">
              <Text
                className={cn(
                  "text-base text-foreground",
                  isUnread ? "font-semibold" : "font-medium",
                )}
                numberOfLines={1}
              >
                {name}
              </Text>
              {subtitle ? (
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Text className="text-xs text-muted-foreground">
              {conversation.last_message_at ? formatRelativeTime(conversation.last_message_at) : ""}
            </Text>
          </View>

          <View className="flex-row items-center justify-between gap-2">
            <Text
              className={cn(
                "mr-2 flex-1 text-sm",
                isUnread ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              numberOfLines={1}
            >
              {getConversationPreviewText(conversation)}
            </Text>
            {isUnread ? (
              <Badge
                variant="default"
                className="h-5 min-w-[20px] items-center justify-center px-1.5"
              >
                <Text className="text-[10px] text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </Badge>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const navigateTo = useAppNavigate();
  const { data: conversations = [], isLoading } = api.messaging.getConversations.useQuery();
  const unreadCount = conversations.reduce(
    (count, conversation) => count + (conversation.unread_count || 0),
    0,
  );

  return (
    <View className="flex-1 bg-background" testID="messages-screen">
      <Stack.Screen
        options={{
          title: "Messages",
          headerRight: () => (
            <Pressable
              onPress={() => navigateTo("/messages/new" as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="messages-new-trigger"
            >
              <Text className="text-sm font-medium text-primary">New Message</Text>
            </Pressable>
          ),
        }}
      />
      {isLoading ? (
        <View className="flex-1 items-center justify-center" testID="messages-loading-state">
          <ActivityIndicator size="large" className="text-muted-foreground" />
        </View>
      ) : (
        <FlatList
          testID="messages-conversation-list"
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 p-4 pb-6"
          ListHeaderComponent={
            conversations.length > 0 ? (
              <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <Text className="text-sm text-muted-foreground">
                  {conversations.length}{" "}
                  {conversations.length === 1 ? "conversation" : "conversations"}
                  {unreadCount > 0 ? `, ${unreadCount} unread` : ""}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => navigateTo(`/messages/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View
              className="flex-1 items-center justify-center py-12"
              testID="messages-empty-state"
            >
              <Text className="text-base font-medium text-foreground">No conversations yet</Text>
              <Text className="mt-2 text-center text-sm text-muted-foreground">
                Your conversations will appear here once you start messaging.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
