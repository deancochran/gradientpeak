import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Text } from "@repo/ui/components/text";
import { trpc } from "@/lib/trpc";
import { cn } from "@repo/ui/lib/cn";
import { formatRelativeTime } from "@/lib/utils";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";

// Type for conversation with message data (returned from getConversations query)
interface ConversationWithMessages {
  id: string;
  created_at: string;
  is_group: boolean;
  group_name: string | null;
  last_message_at: string;
  messages: Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
  }>;
  unread_count: number;
}

function ConversationItem({
  conversation,
  onPress,
}: {
  conversation: ConversationWithMessages;
  onPress: () => void;
}) {
  const lastMessage = conversation.messages?.[0];
  const name = conversation.group_name || "Conversation";
  const unreadCount = conversation.unread_count || 0;
  const isUnread = unreadCount > 0;

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "flex-row items-center p-4 border-b border-border bg-background active:bg-accent",
        isUnread && "bg-muted/10",
      )}
    >
      <Avatar alt={name} className="h-12 w-12 mr-4">
        <AvatarFallback>
          <Text>{name.substring(0, 2).toUpperCase()}</Text>
        </AvatarFallback>
      </Avatar>

      <View className="flex-1 gap-1">
        <View className="flex-row justify-between items-center">
          <Text
            className={cn(
              "text-base text-foreground",
              isUnread ? "font-bold" : "font-medium",
            )}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {conversation.last_message_at
              ? formatRelativeTime(conversation.last_message_at)
              : ""}
          </Text>
        </View>

        <View className="flex-row justify-between items-center">
          <Text
            className={cn(
              "text-sm flex-1 mr-2",
              isUnread
                ? "text-foreground font-semibold"
                : "text-muted-foreground",
            )}
            numberOfLines={1}
          >
            {lastMessage?.content || "No messages"}
          </Text>
          {isUnread && (
            <Badge
              variant="default"
              className="h-6 min-w-[24px] px-1.5 justify-center"
            >
              <Text className="text-xs text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </Badge>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const { data: conversations = [], isLoading } =
    trpc.messaging.getConversations.useQuery();

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Messages" }} />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" className="text-muted-foreground" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => router.push(`/messages/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center p-8">
              <Text className="text-muted-foreground">
                No conversations yet
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
