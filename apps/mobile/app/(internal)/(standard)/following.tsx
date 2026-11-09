import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ProfileListRow } from "@/components/profile/ProfileListRow";
import { ResourceList } from "@/components/shared/ResourceList";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function FollowingScreen() {
  const navigateTo = useAppNavigate();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const targetUserId = typeof userId === "string" ? userId : "";

  const limit = 20;

  const {
    data: followingData,
    isLoading,
    isError,
    isFetchingNextPage,
    isRefetching,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = api.social.getFollowing.useInfiniteQuery(
    { user_id: targetUserId, limit },
    { enabled: !!targetUserId, getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const users = followingData?.pages.flatMap((page) => page.users) || [];
  const total = followingData?.pages[0]?.total || 0;
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
    };
  }) => {
    return <ProfileListRow onPress={handleUserPress} profile={item} />;
  };

  const renderHeader = () => (
    <View className="p-4 border-b border-border">
      <Text className="text-lg font-semibold">{total} following</Text>
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
        testID="following-loading-state"
      >
        <LoadingState message="Loading following..." />
      </View>
    );
  }

  if (isError && error) {
    const isPrivate = error.data?.code === "FORBIDDEN";

    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        {isPrivate ? (
          <EmptyState
            description="Follow requests must be accepted before you can see who this profile follows."
            testID="following-private-state"
            title="Following is private"
          />
        ) : (
          <ErrorState
            description="Check your connection and try again."
            onAction={() => void refetch()}
            testID="following-error-state"
            title="Unable to load following"
          />
        )}
      </View>
    );
  }

  return (
    <ResourceList
      testID="following-list"
      data={users}
      renderItem={(item) => renderItem({ item })}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={renderHeader()}
      contentContainerClassName="flex-grow gap-4 pb-6"
      emptyComponent={
        <EmptyState
          description="People you follow will appear here."
          testID="following-empty-state"
          title="Not following anyone yet"
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

export default function FollowingScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <FollowingScreen />
    </ErrorBoundary>
  );
}
