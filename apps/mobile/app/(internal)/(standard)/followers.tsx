import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ProfileListRow } from "@/components/profile/ProfileListRow";
import { ResourceList } from "@/components/shared/ResourceList";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function FollowersScreen() {
  const navigateTo = useAppNavigate();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const targetUserId = typeof userId === "string" ? userId : "";

  const limit = 20;

  const {
    data: followersData,
    isLoading,
    isError,
    isFetchingNextPage,
    isRefetching,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = api.social.getFollowers.useInfiniteQuery(
    { user_id: targetUserId, limit },
    { enabled: !!targetUserId, getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const users = followersData?.pages.flatMap((page) => page.users) || [];
  const total = followersData?.pages[0]?.total || 0;
  const handleUserPress = (profileUserId: string) => {
    navigateTo(`/user/${profileUserId}`);
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
    return <ProfileListRow onPress={handleUserPress} profile={item} />;
  };

  const renderHeader = () => (
    <View className="p-4 border-b border-border">
      <Text className="text-lg font-semibold">
        {total} {total === 1 ? "follower" : "followers"}
      </Text>
    </View>
  );

  if (!targetUserId) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Invalid user id.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="followers-loading-state"
      >
        <LoadingState message="Loading followers..." />
      </View>
    );
  }

  if (isError && error) {
    const isPrivate = error.data?.code === "FORBIDDEN";

    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        {isPrivate ? (
          <EmptyState
            description="Follow requests must be accepted before you can see who follows this profile."
            testID="followers-private-state"
            title="Followers are private"
          />
        ) : (
          <ErrorState
            description="Check your connection and try again."
            onAction={() => void refetch()}
            testID="followers-error-state"
            title="Unable to load followers"
          />
        )}
      </View>
    );
  }

  return (
    <ResourceList
      testID="followers-list"
      data={users}
      renderItem={(item) => renderItem({ item })}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={renderHeader()}
      contentContainerClassName="flex-grow gap-4 pb-6"
      emptyComponent={
        <EmptyState
          description="People who follow this profile will appear here."
          testID="followers-empty-state"
          title="No followers yet"
        />
      }
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      loadingMoreLabel="Loading more people..."
      onLoadMore={() => void fetchNextPage()}
      onRefresh={() => refetch()}
      refreshing={isRefetching}
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
