import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, View } from "react-native";

function ConversationItem({
  conversation,
  onPress,
}: {
  conversation: any;
  onPress: () => void;
}) {
  // Mock logic for display - needs refinement based on actual data structure
  const lastMessage = conversation.messages?.[0];
  const name = conversation.group_name || "Conversation";
  const isUnread = false;

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
            {new Date(conversation.last_message_at).toLocaleDateString()}
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
              <Text className="text-xs text-primary-foreground">1</Text>
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
            <Text className="text-muted-foreground">No conversations yet</Text>
          </View>
        }
      />
    </View>
  );
}
