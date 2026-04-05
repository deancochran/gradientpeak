import { invalidateConversationQueries, invalidateMessagingInboxQueries } from "@repo/api/react";
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
      className={cn("flex w-full mb-4", isMe ? "items-end" : "items-start")}
    >
      <View
        className={cn(
          "max-w-[80%] p-3 px-4 rounded-2xl",
          isMe ? "bg-primary rounded-br-none" : "bg-muted rounded-bl-none",
        )}
      >
        <Text className={cn("text-base", isMe ? "text-primary-foreground" : "text-foreground")}>
          {text}
        </Text>
      </View>
      <View className="flex-row items-center mt-1 mx-1">
        <Text className="text-[10px] text-muted-foreground">{timestamp}</Text>
        {statusText && <Text className="text-[10px] text-muted-foreground ml-1">{statusText}</Text>}
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
      <Stack.Screen options={{ title: "Chat" }} />

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
          contentContainerClassName="p-4"
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <View
          className="flex-row items-center p-2 border-t border-border bg-background"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          <Input
            className="flex-1 mr-2"
            testId="message-input"
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
          />
          <Button
            size="icon"
            onPress={handleSend}
            disabled={!inputText.trim() || sendMessageMutation.isPending}
            testID="message-send-button"
          >
            <Send size={20} className="text-primary-foreground" />
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
