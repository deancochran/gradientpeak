import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function NewMessageScreen() {
  const navigateTo = useAppNavigate();
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<
    Array<{ id: string; username: string | null; is_public: boolean | null }>
  >([]);
  const trimmedQuery = query.trim();

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    api.social.searchUsers.useInfiniteQuery(
      {
        query: trimmedQuery || undefined,
        limit: 20,
      },
      {
        getNextPageParam: (lastPage: any) => lastPage.nextCursor,
      },
    );
  const getOrCreateDMMutation = api.messaging.getOrCreateDM.useMutation();
  const createConversationMutation = api.messaging.createConversation.useMutation({
    onSuccess: (conversation) => {
      navigateTo(`/messages/${conversation.id}` as any);
    },
  });

  const users = data?.pages.flatMap((page: any) => page.users) ?? [];
  const suggestedUsers = users.filter(
    (user) => !selectedRecipients.some((recipient) => recipient.id === user.id),
  );
  const isSubmitting = getOrCreateDMMutation.isPending || createConversationMutation.isPending;

  const toggleRecipient = (user: {
    id: string;
    username: string | null;
    is_public: boolean | null;
  }) => {
    setSelectedRecipients((current) => {
      const exists = current.some((recipient) => recipient.id === user.id);
      if (exists) {
        return current.filter((recipient) => recipient.id !== user.id);
      }
      return [...current, user];
    });
  };

  const handleStartConversation = async () => {
    if (selectedRecipients.length === 0) {
      return;
    }

    if (selectedRecipients.length === 1) {
      const conversation = await getOrCreateDMMutation.mutateAsync({
        target_user_id: selectedRecipients[0].id,
      });

      navigateTo(`/messages/${conversation.id}` as any);
      return;
    }

    createConversationMutation.mutate({
      participant_ids: selectedRecipients.map((recipient) => recipient.id),
      group_name: groupName.trim() || undefined,
    });
  };

  return (
    <View className="flex-1 bg-background" testID="messages-new-screen">
      <Stack.Screen
        options={{
          title: "New Message",
          headerRight: () => (
            <Pressable
              onPress={() => void handleStartConversation()}
              disabled={selectedRecipients.length === 0 || isSubmitting}
              className="mr-2 rounded-full px-2 py-1"
              testID="messages-new-next-trigger"
            >
              <Text
                className={
                  selectedRecipients.length === 0 || isSubmitting
                    ? "text-sm font-medium text-muted-foreground"
                    : "text-sm font-medium text-primary"
                }
              >
                Next
              </Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-2 px-4 py-2 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="overflow-hidden rounded-3xl border border-border bg-card"
          testID="messages-new-recipient-card"
        >
          <View className="gap-2 px-4 py-3.5">
            <View className="flex-row flex-wrap items-start gap-2">
              <Text className="pt-2 text-sm font-medium text-muted-foreground">To:</Text>
              <View className="min-w-[75%] flex-1 gap-2">
                {selectedRecipients.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5">
                    {selectedRecipients.map((recipient) => (
                      <Pressable
                        key={recipient.id}
                        onPress={() => toggleRecipient(recipient)}
                        className="rounded-full bg-primary/10 px-2.5 py-1"
                        testID={`messages-new-selected-${recipient.id}`}
                      >
                        <Text className="text-xs font-medium text-primary">
                          @{recipient.username ?? "user"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Type a name"
                  className="border-0 bg-transparent px-0 py-0 text-base"
                  testId="messages-new-search-input"
                />
              </View>
            </View>
          </View>

          {trimmedQuery.length > 0 || suggestedUsers.length > 0 ? (
            <View className="border-t border-border" testID="messages-new-suggestions">
              {isLoading ? (
                <View className="items-center justify-center py-8">
                  <ActivityIndicator />
                </View>
              ) : suggestedUsers.length > 0 ? (
                <>
                  {suggestedUsers.map((item, index) => (
                    <Pressable
                      key={item.id}
                      onPress={() => toggleRecipient(item)}
                      disabled={isSubmitting}
                      className={`flex-row items-center gap-3 px-4 py-2.5 ${
                        index < suggestedUsers.length - 1 || hasNextPage
                          ? "border-b border-border"
                          : ""
                      }`}
                      testID={`messages-new-user-${item.id}`}
                    >
                      <Avatar alt={item.username ?? "User"} className="h-10 w-10">
                        <AvatarFallback>
                          <Text>{getInitials(item.username ?? "User")}</Text>
                        </AvatarFallback>
                      </Avatar>
                      <View className="flex-1 gap-1">
                        <Text className="text-sm font-semibold text-foreground">
                          @{item.username}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {item.is_public ? "Public profile" : "Private profile"}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                  {hasNextPage ? (
                    <Pressable
                      onPress={() => void fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="items-center px-4 py-3"
                      testID="messages-new-load-more-users"
                    >
                      <Text className="text-sm font-medium text-primary">
                        {isFetchingNextPage ? "Loading more users..." : "Load more users"}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <View className="items-center justify-center py-8">
                  <Text className="text-sm text-muted-foreground">No users match that search.</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {selectedRecipients.length > 1 ? (
          <View className="rounded-3xl border border-border bg-card p-4">
            <Text className="mb-2 text-sm font-medium text-muted-foreground">Group Name</Text>
            <Input
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Optional group name"
              testId="messages-new-group-name-input"
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
