import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Loader2 } from "lucide-react-native";
import React from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function FollowersScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const targetUserId = typeof userId === "string" ? userId : "";

  const limit = 20;

  const {
    data: followersData,
    isLoading,
    isFetching,
    hasNextPage,
    fetchNextPage,
  } = api.social.getFollowers.useInfiniteQuery(
    { user_id: targetUserId, limit },
    { enabled: !!targetUserId, getNextPageParam: (lastPage: any) => lastPage.nextCursor },
  );

  const users = followersData?.pages.flatMap((page) => page.users) || [];
  const total = followersData?.pages[0]?.total || 0;
  const hasMore = hasNextPage || false;

  const handleUserPress = (profileUserId: string) => {
    navigateTo(`/user/${profileUserId}` as any);
  };

  const handleLoadMore = () => {
    if (hasMore && !isFetching) {
      void fetchNextPage();
    }
  };

  const renderItem = ({
    item,
  }: {
    item: {
      id: string;
      username: string | null;
      avatar_url: string | null;
      is_public: boolean | null;
    };
  }) => {
    return (
      <TouchableOpacity
        onPress={() => handleUserPress(item.id)}
        className="flex-row items-center p-4 border-b border-border"
      >
        <Avatar alt={item.username || "User"} className="w-12 h-12">
          {item.avatar_url ? <AvatarImage source={{ uri: item.avatar_url }} /> : null}
          <AvatarFallback>
            <Text className="text-lg">{item.username?.charAt(0)?.toUpperCase() || "U"}</Text>
          </AvatarFallback>
        </Avatar>
        <View className="ml-3 flex-1">
          <Text className="font-semibold text-foreground">{item.username || "Unknown user"}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View className="p-4 border-b border-border">
      <Text className="text-lg font-semibold">
        {total} {total === 1 ? "follower" : "followers"}
      </Text>
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-muted-foreground text-center">No followers yet</Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View className="p-4 items-center">
        {isFetching && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      </View>
    );
  };

  if (!targetUserId) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Invalid user id.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={users}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={renderFooter}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow-1"
    />
  );
}

export default function FollowersScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <FollowersScreen />
    </ErrorBoundary>
  );
}
