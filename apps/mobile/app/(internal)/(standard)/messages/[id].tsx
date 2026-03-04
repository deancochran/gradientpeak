import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Stack, useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function MessageBubble({
  text,
  isMe,
  timestamp,
}: {
  text: string;
  isMe: boolean;
  timestamp: string;
}) {
  return (
    <View
      className={cn("flex w-full mb-4", isMe ? "items-end" : "items-start")}
    >
      <View
        className={cn(
          "max-w-[80%] p-3 px-4 rounded-2xl",
          isMe ? "bg-primary rounded-br-none" : "bg-muted rounded-bl-none",
        )}
      >
        <Text
          className={cn(
            "text-base",
            isMe ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {text}
        </Text>
      </View>
      <Text className="text-[10px] text-muted-foreground mt-1 mx-1">
        {timestamp}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inputText, setInputText] = useState("");
  const insets = useSafeAreaInsets();
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data: messages = [] } = trpc.messaging.getMessages.useQuery(
    { conversation_id: id },
    { refetchInterval: 5000 },
  );

  const sendMessageMutation = trpc.messaging.sendMessage.useMutation({
    onSuccess: () => {
      setInputText("");
      utils.messaging.getMessages.invalidate({ conversation_id: id });
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
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Chat" }} />

      <FlatList
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
          />
        )}
        contentContainerClassName="p-4"
      />

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
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
          />
          <Button
            size="icon"
            onPress={handleSend}
            disabled={!inputText.trim() || sendMessageMutation.isPending}
          >
            <Send size={20} className="text-primary-foreground" />
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
