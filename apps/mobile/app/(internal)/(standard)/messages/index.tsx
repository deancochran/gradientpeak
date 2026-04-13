import {
  getConversationDisplayName,
  getConversationInitials,
  getConversationPreviewText,
} from "@repo/core";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import { Stack, useRouter } from "expo-router";
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

  return (
    <Pressable
      onPress={onPress}
      testID={`messages-conversation-${conversation.id}`}
      className={cn(
        "flex-row items-center p-4 border-b border-border bg-background active:bg-accent",
        isUnread && "bg-muted/10",
      )}
    >
      <Avatar alt={name} className="h-12 w-12 mr-4">
        <AvatarFallback>
          <Text>{getConversationInitials(conversation)}</Text>
        </AvatarFallback>
      </Avatar>

      <View className="flex-1 gap-1">
        <View className="flex-row justify-between items-center">
          <Text
            className={cn("text-base text-foreground", isUnread ? "font-bold" : "font-medium")}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {conversation.last_message_at ? formatRelativeTime(conversation.last_message_at) : ""}
          </Text>
        </View>

        <View className="flex-row justify-between items-center">
          <Text
            className={cn(
              "text-sm flex-1 mr-2",
              isUnread ? "text-foreground font-semibold" : "text-muted-foreground",
            )}
            numberOfLines={1}
          >
            {getConversationPreviewText(conversation)}
          </Text>
          {isUnread && (
            <Badge variant="default" className="h-6 min-w-[24px] px-1.5 justify-center">
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
  const navigateTo = useAppNavigate();
  const { data: conversations = [], isLoading } = api.messaging.getConversations.useQuery();

  return (
    <View className="flex-1 bg-background" testID="messages-screen">
      <Stack.Screen options={{ title: "Messages" }} />
      {isLoading ? (
        <View className="flex-1 items-center justify-center" testID="messages-loading-state">
          <ActivityIndicator size="large" className="text-muted-foreground" />
        </View>
      ) : (
        <FlatList
          testID="messages-conversation-list"
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => navigateTo(`/messages/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center p-8" testID="messages-empty-state">
              <Text className="text-muted-foreground">No conversations yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
