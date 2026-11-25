import type { ChatbotClientState } from "@repo/api/chatbot/client";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getChatbotController,
  getChatbotDraft,
  setChatbotDraft,
  subscribeToForeground,
} from "@/lib/chatbot/controller";

const EMPTY: ChatbotClientState = {
  status: "idle",
  messages: [],
  activities: [],
  canSend: true,
  canRecover: false,
  canRetryPending: false,
};

function errorMessage(state: ChatbotClientState) {
  if (state.error?.code === "unavailable")
    return "Assistant service is temporarily unavailable. Please try again later.";
  if (state.error?.code === "update_client") return "Update the app before using Assistant.";
  if (state.error?.code === "persistence")
    return "Unable to save this request safely for recovery. Check device storage and try again.";
  if (state.error?.code === "unauthorized")
    return "Your session has expired. Sign in again to continue.";
  return state.error ? "The assistant could not finish this request." : null;
}

export function ChatScreen({ actorId }: { actorId: string }) {
  const [controller, setController] = useState<Awaited<
    ReturnType<typeof getChatbotController>
  > | null>(null);
  const [draft, setDraft] = useState(() => getChatbotDraft(actorId));
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const followsLatest = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const insets = useSafeAreaInsets();
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt explicitly retries a failed secure-storage load.
  useEffect(() => {
    let alive = true;
    setLoadFailure(null);
    void getChatbotController(actorId).then(
      (next) => alive && setController(next),
      () => alive && setLoadFailure(actorId),
    );
    return () => {
      alive = false;
    };
  }, [actorId, loadAttempt]);
  useEffect(() => {
    setDraft(getChatbotDraft(actorId));
  }, [actorId]);
  // During an account switch, retain neither the previous account's state nor
  // its composer contents while the next controller is loading.
  const activeController = controller?.actorId === actorId ? controller : null;
  const visibleDraft = activeController ? draft : "";
  useFocusEffect(
    useCallback(() => {
      if (!activeController) return;
      const unsubscribe = subscribeToForeground(activeController);
      return () => {
        unsubscribe();
        activeController.stop();
      };
    }, [activeController]),
  );
  const state = useSyncExternalStore(
    activeController ? activeController.subscribe : () => () => {},
    activeController ? activeController.getState : () => EMPTY,
    () => EMPTY,
  );
  const updateDraft = useCallback(
    (value: string) => {
      setDraft(value);
      setChatbotDraft(actorId, value);
    },
    [actorId],
  );
  const send = useCallback(async () => {
    if (!activeController || !visibleDraft.trim() || !state.canSend) return;
    const submitted = visibleDraft;
    void activeController.send(submitted, () => {
      // An accepted request owns the draft; do not erase edits typed while it streams.
      if (getChatbotDraft(actorId) === submitted) updateDraft("");
    });
  }, [activeController, actorId, state.canSend, updateDraft, visibleDraft]);
  const error = errorMessage(state);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={56}
      className="flex-1 bg-background"
    >
      <View className="flex-1" testID="chat-screen">
        {loadFailure === actorId ? (
          <View className="gap-2 p-4">
            <Text accessibilityRole="alert">
              Unable to load secure conversation recovery state.
            </Text>
            <Button
              accessibilityLabel="Retry loading conversation"
              onPress={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              <Text>Retry loading conversation</Text>
            </Button>
          </View>
        ) : null}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4"
          contentContainerClassName="gap-3 py-4"
          accessibilityLabel="Assistant conversation"
          onContentSizeChange={() => {
            if (followsLatest.current) scrollRef.current?.scrollToEnd({ animated: false });
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const nearBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
            followsLatest.current = nearBottom;
            setShowJumpToLatest(!nearBottom);
          }}
          scrollEventThrottle={100}
        >
          {state.messages.length === 0 ? (
            <Text className="text-muted-foreground">
              Ask Assistant about your training, plans, or activities.
            </Text>
          ) : null}
          {state.messages.map((message) => (
            <View
              key={message.id}
              className={
                message.role === "user"
                  ? "self-end rounded-xl bg-primary px-3 py-2"
                  : "rounded-xl bg-muted px-3 py-2"
              }
            >
              <Text
                selectable
                className={message.role === "user" ? "text-primary-foreground" : "text-foreground"}
              >
                {message.text}
              </Text>
            </View>
          ))}
          {state.activities.map((activity) => (
            <Text key={activity.id} className="text-sm text-muted-foreground">
              {activity.label}…
            </Text>
          ))}
          {error ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">
              {error}
            </Text>
          ) : null}
          {state.pending ? (
            <View className="gap-2">
              <Text
                testID="chat-recovery"
                accessibilityLiveRegion="polite"
                className="text-sm text-muted-foreground"
              >
                This request may still be finishing. Check its status before sending another.
              </Text>
              {state.canRecover ? (
                <Button
                  accessibilityLabel="Recover assistant request"
                  onPress={() => void activeController?.recover()}
                >
                  Recover
                </Button>
              ) : state.canRetryPending ? (
                <Button
                  accessibilityLabel="Retry assistant request"
                  variant="outline"
                  onPress={() => void activeController?.retryPending()}
                >
                  Retry request
                </Button>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        {showJumpToLatest ? (
          <Button
            testID="chat-jump-to-latest"
            accessibilityLabel="Jump to latest assistant message"
            variant="outline"
            className="mx-4 mb-2"
            onPress={() => {
              followsLatest.current = true;
              setShowJumpToLatest(false);
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
          >
            Jump to latest
          </Button>
        ) : null}
        <View
          className="border-t border-border p-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <Textarea
            testID="chat-composer"
            accessibilityLabel="Message Assistant"
            value={visibleDraft}
            onChangeText={updateDraft}
            placeholder="Message Assistant"
            multiline
            maxLength={4000}
            className="min-h-12 max-h-32"
          />
          <View className="mt-2 flex-row gap-2">
            <Button
              testID="chat-send"
              accessibilityLabel="Send message"
              disabled={!activeController || !visibleDraft.trim() || !state.canSend}
              onPress={() => void send()}
              className="min-h-12 flex-1"
            >
              Send
            </Button>
            {state.status === "streaming" ? (
              <Button
                testID="chat-stop"
                accessibilityLabel="Stop assistant response"
                variant="outline"
                onPress={() => activeController?.stop()}
                className="min-h-12"
              >
                Stop
              </Button>
            ) : null}
            <Button
              accessibilityLabel="Start new assistant conversation"
              disabled={!activeController || Boolean(state.pending)}
              variant="outline"
              onPress={() => void activeController?.newConversation()}
              className="min-h-12"
            >
              New
            </Button>
          </View>
          <Text testID="chat-status" accessibilityLiveRegion="polite" className="sr-only">
            {state.status === "completed" ? "Assistant response completed" : ""}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
