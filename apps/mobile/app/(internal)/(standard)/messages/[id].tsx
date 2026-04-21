import { invalidateConversationQueries, invalidateMessagingInboxQueries } from "@repo/api/react";
import { getConversationDisplayName } from "@repo/core";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import { Stack, useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function MessageBubble({
  text,
  isMe,
  timestamp,
  isRead,
}: {
  text: string;
  isMe: boolean;
  timestamp: string;
  isRead: boolean;
}) {
  // Show status text for sender's messages
  // Best practice: sender already knows what they sent - no need to show "unread" status
  const statusText = isMe ? (isRead ? "Read" : "Sent") : null;

  return (
    <View
      testID={`message-bubble-${isMe ? "sent" : "received"}`}
      className={cn("mb-3 flex w-full", isMe ? "items-end" : "items-start")}
    >
      <View
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5",
          isMe ? "bg-primary rounded-br-none" : "bg-muted rounded-bl-none",
        )}
      >
        <Text className={cn("text-base", isMe ? "text-primary-foreground" : "text-foreground")}>
          {text}
        </Text>
      </View>
      <View className="mx-1 mt-1 flex-row items-center gap-1">
        <Text className="text-[10px] text-muted-foreground">{timestamp}</Text>
        {statusText ? (
          <Text className="text-[10px] text-muted-foreground">{statusText}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inputText, setInputText] = useState("");
  const insets = useSafeAreaInsets();
  const utils = api.useUtils();
  const { user } = useAuth();

  const { data: messages = [], isLoading } = api.messaging.getMessages.useQuery(
    { conversation_id: id },
    { refetchInterval: 5000 },
  );
  const { data: conversations = [] } = api.messaging.getConversations.useQuery();
  const conversation = conversations.find((entry) => entry.id === id);
  const conversationTitle = conversation ? getConversationDisplayName(conversation as any) : "Chat";
  const conversationSubtitle = conversation
    ? conversation.is_group
      ? conversation.group_name
        ? "Group conversation"
        : "New group"
      : conversation.peer_profile?.username
        ? `@${conversation.peer_profile.username}`
        : "Direct message"
    : null;

  // Mark messages as read when viewing the conversation
  const markAsReadMutation = api.messaging.markAsRead.useMutation({
    onSuccess: async () => invalidateMessagingInboxQueries(utils),
  });

  // Mark as read when messages are loaded
  React.useEffect(() => {
    if (id && messages.length > 0) {
      markAsReadMutation.mutate({ conversation_id: id });
    }
  }, [id]);

  const sendMessageMutation = api.messaging.sendMessage.useMutation({
    onSuccess: async () => {
      setInputText("");
      await invalidateConversationQueries(utils, id);
    },
  });

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessageMutation.mutate({
      conversation_id: id,
      content: inputText,
    });
  };

  return (
    <View className="flex-1 bg-background" testID="message-thread-screen">
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View className="flex-row items-center gap-3">
              <Avatar alt={conversationTitle} className="h-9 w-9">
                {conversation?.peer_profile?.avatar_url ? (
                  <AvatarImage source={{ uri: conversation.peer_profile.avatar_url }} />
                ) : null}
                <AvatarFallback>
                  <Text className="text-xs font-medium">{getInitials(conversationTitle)}</Text>
                </AvatarFallback>
              </Avatar>
              <View className="max-w-[220px]">
                <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                  {conversationTitle}
                </Text>
                {conversationSubtitle ? (
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {conversationSubtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          ),
        }}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center" testID="message-thread-loading-state">
          <ActivityIndicator size="large" className="text-muted-foreground" />
        </View>
      ) : messages.length === 0 ? (
        <View
          className="flex-1 items-center justify-center p-8"
          testID="message-thread-empty-state"
        >
          <Text className="text-muted-foreground text-center">
            No messages yet.{"\n"}Send a message to start the conversation!
          </Text>
        </View>
      ) : (
        <FlatList
          testID="message-thread-list"
          data={[...messages].reverse()}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              text={item.content}
              isMe={item.sender_id === user?.id}
              timestamp={new Date(item.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              isRead={item.sender_id === user?.id}
            />
          )}
          contentContainerClassName="px-4 py-3"
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <View
          className="flex-row items-center gap-2 border-t border-border bg-background px-3 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          <Input
            className="flex-1 rounded-full bg-muted/40"
            testId="message-input"
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
          />
          <Button
            size="icon"
            onPress={handleSend}
            disabled={!inputText.trim() || sendMessageMutation.isPending}
            className="h-10 w-10 rounded-full"
            testID="message-send-button"
          >
            <Send size={20} className="text-primary-foreground" />
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
