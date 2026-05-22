import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CalendarDays, Target, Users } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { ResourceList } from "@/components/shared/ResourceList";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { FeedEmptyState } from "./FeedEmptyState";
import type { FeedActivityItem } from "./types";
import { useFeedListController } from "./useFeedListController";

interface FeedListProps {
  onCommentPress?: (activityId: string) => void;
}

function FeedShortcuts() {
  const navigateTo = useAppNavigate();
  const shortcuts = [
    { label: "Groups", icon: Users, onPress: () => navigateTo("/groups" as any) },
    { label: "Plan", icon: Target, onPress: () => navigateTo("/plan" as any) },
    { label: "Calendar", icon: CalendarDays, onPress: () => navigateTo("/calendar" as any) },
  ];

  return (
    <View className="gap-3">
      <View className="rounded-3xl border border-border bg-card p-4">
        <Text className="text-base font-semibold text-foreground">Quick actions</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Jump into the surfaces that keep training social and consistent.
        </Text>
        <View className="mt-4 flex-row gap-3">
          {shortcuts.map((shortcut) => (
            <Pressable
              accessibilityRole="button"
              className="flex-1 items-center gap-2 rounded-2xl border border-border bg-background px-2 py-3"
              key={shortcut.label}
              onPress={shortcut.onPress}
              testID={`home-shortcut-${shortcut.label.toLowerCase()}`}
            >
              <Icon as={shortcut.icon} size={20} className="text-foreground" />
              <Text className="text-xs font-medium text-foreground">{shortcut.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Feed
      </Text>
    </View>
  );
}

export function FeedList({ onCommentPress }: FeedListProps) {
  const navigateTo = useAppNavigate();
  const {
    hasNextPage,
    handleLoadMore,
    handleRefresh,
    feedItems,
    isFetchingNextPage,
    isLoading,
    isLoadingError,
    refreshing,
  } = useFeedListController();

  const renderItem = useCallback(
    (item: FeedActivityItem) => (
      <ActivityCard
        activity={item}
        dateMode="absolute"
        onCommentPress={onCommentPress ? () => onCommentPress(item.id) : undefined}
        onPress={() => navigateTo(`/activity-detail?id=${item.id}` as any)}
        showLike
        variant="list"
      />
    ),
    [navigateTo, onCommentPress],
  );

  const keyExtractor = useCallback((item: FeedActivityItem) => item.id, []);

  return (
    <ResourceList
      contentContainerClassName="gap-3 p-4 pb-6"
      data={feedItems}
      emptyComponent={<FeedEmptyState />}
      errorTitle="Failed to load feed"
      hasNextPage={hasNextPage}
      isError={isLoadingError}
      isFetchingNextPage={isFetchingNextPage}
      isLoading={isLoading}
      keyExtractor={keyExtractor}
      ListHeaderComponent={<FeedShortcuts />}
      loadingSkeletonCount={3}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      renderItem={renderItem}
    />
  );
}
