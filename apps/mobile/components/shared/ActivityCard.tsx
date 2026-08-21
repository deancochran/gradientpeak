import type { ActivityDisplayModel, SemanticMetric } from "@repo/core";
import { formatDurationSec } from "@repo/core/utils/dates";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { MessageCircle, Share2 } from "lucide-react-native";
import { Alert, Share, View } from "react-native";
import { getUniqueActivityCategoryConfigs } from "@/lib/constants/activities";
import { formatDistanceMeters } from "@/lib/display/formatters";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import {
  type ResourceCardAccessory,
  ResourceCardActionButton,
  ResourceCardHeader,
  ResourceCardShell,
  ResourceLikeButton,
  type ResourceMetric,
  ResourceMetricsRow,
  ResourceOwnerActionRow,
} from "./ResourceCardPrimitives";

type ActivityCardProps = {
  activity: ActivityDisplayModel;
  /** Context actions rendered directly below the canonical metrics row. */
  belowMetricsActions?: ResourceCardAccessory;
  commentCount?: number | null;
  dateMode?: "absolute" | "none" | "relative";
  isLiked?: boolean | null;
  likeCount?: number | null;
  likePending?: boolean;
  onCommentPress?: () => void;
  onLikePress?: () => void;
  onOwnerPress?: () => void;
  onPress?: () => void;
  onSharePress?: () => void;
  showNotes?: boolean;
  testID?: string;
  /** Context action rendered at the top-right of the owner/category row. */
  topRightAction?: ResourceCardAccessory;
};

function formatMetric(
  metric: SemanticMetric,
  preferredUnitSystem: ReturnType<typeof usePreferredUnitSystem>,
) {
  if (metric.status === "unavailable") return "Unavailable";
  const approximationPrefix =
    metric.status === "partial" &&
    (metric.key === "common_load" || metric.key === "normalized_intensity")
      ? "~"
      : "";
  if (metric.unit === "meters") {
    return `${approximationPrefix}${formatDistanceMeters(metric.value, { preferredUnitSystem })}`;
  }
  if (metric.unit === "seconds") return `${approximationPrefix}${formatDurationSec(metric.value)}`;
  if (metric.unit === "ratio") return `${approximationPrefix}${metric.value.toFixed(2)}`;
  if (metric.unit === "bpm") return `${approximationPrefix}${Math.round(metric.value)} bpm`;
  if (metric.unit === "watts") return `${approximationPrefix}${Math.round(metric.value)} W`;
  if (metric.unit === "kilocalories")
    return `${approximationPrefix}${Math.round(metric.value)} kcal`;
  return `${approximationPrefix}${Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)}`;
}

function ActivityMetricsRow({ activity }: { activity: ActivityDisplayModel }) {
  const preferredUnitSystem = usePreferredUnitSystem();
  const metrics: ResourceMetric[] = activity.metrics.slice(0, 4).map((metric) => ({
    label:
      metric.status === "partial" &&
      metric.key !== "common_load" &&
      metric.key !== "normalized_intensity"
        ? `${metric.label} (partial)`
        : metric.label,
    value: formatMetric(metric, preferredUnitSystem),
    tone:
      metric.key === "common_load" || metric.key === "normalized_intensity" ? "primary" : undefined,
  }));

  if (metrics.length === 0) {
    return null;
  }

  return <ResourceMetricsRow maxItems={4} metrics={metrics} testID="activity-card-metrics" />;
}

export function ActivityCard({
  activity,
  belowMetricsActions,
  commentCount,
  dateMode,
  isLiked,
  likeCount,
  likePending = false,
  onCommentPress,
  onLikePress,
  onOwnerPress,
  onPress,
  onSharePress,
  showNotes = true,
  testID,
  topRightAction,
}: ActivityCardProps) {
  const navigateTo = useAppNavigate();
  const categoryItems = getUniqueActivityCategoryConfigs(
    activity.activityComposition.categories.length > 0
      ? activity.activityComposition.categories
      : ["other"],
  ).map((category) => ({
    icon: category.icon,
    iconClassName: category.color,
    label: category.name,
  }));
  const resolvedDateMode = dateMode ?? "relative";
  const resolvedCommentCount = commentCount ?? activity.engagement.comments;
  const {
    isLiked: internalLiked,
    isPending: internalLikePending,
    likeCount: internalLikeCount,
    toggleLike,
  } = useResourceLike({
    entityId: activity.id,
    entityType: "activity",
    initialCount: activity.engagement.likes,
    initialLiked: activity.engagement.viewerHasLiked,
  });
  const displayLiked = isLiked ?? internalLiked;
  const displayLikeCount = likeCount ?? internalLikeCount;
  const displayLikePending = likePending || internalLikePending;
  const attributionOwner = {
    avatar_url: activity.owner.avatarUrl,
    id: activity.owner.id,
    username: activity.owner.username,
  };
  const handleComment = onCommentPress ?? onPress ?? (() => navigateTo(activity.href as never));
  const hasBelowMetricsActions =
    belowMetricsActions !== undefined &&
    belowMetricsActions !== null &&
    belowMetricsActions !== false;
  const handleShare = async () => {
    if (onSharePress) {
      try {
        await onSharePress();
      } catch {
        Alert.alert("Unable to share", "The activity could not be shared. Try again.");
      }
      return;
    }
    if (activity.visibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public activities have a share link. Change visibility to Public first.",
      );
      return;
    }
    const origin = (process.env.EXPO_PUBLIC_API_URL ?? "https://gradientpeak.app").replace(
      /\/$/,
      "",
    );
    const url = `${origin}/share/activities/${activity.id}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert("Unable to share", "The activity could not be shared. Try again.");
    }
  };

  return (
    <ResourceCardShell
      accessibilityLabel={onPress ? `Open activity ${activity.title}` : undefined}
      actionRegion={
        <ResourceOwnerActionRow
          actions={
            <>
              <ResourceCardActionButton
                accessibilityLabel="Share activity"
                onPress={() => void handleShare()}
                testID={`activity-card-share-button-${activity.id}`}
              >
                <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
                  <Icon as={Share2} size={14} className="text-muted-foreground" />
                  <Text className="ml-1 text-xs font-medium text-muted-foreground">Share</Text>
                </View>
              </ResourceCardActionButton>
              {topRightAction}
            </>
          }
          categoryItems={categoryItems}
          fallbackLabel="GradientPeak"
          onOwnerPress={onOwnerPress}
          owner={attributionOwner}
          timestamp={resolvedDateMode === "none" ? null : activity.time.startedAt}
        />
      }
      contentClassName="gap-3 px-3"
      onPress={onPress}
      testID={testID}
    >
      <ResourceCardHeader
        description={showNotes ? activity.notes : null}
        descriptionNumberOfLines={2}
        title={activity.title}
      />

      <ActivityMetricsRow activity={activity} />

      <View className="flex-row items-center gap-2" testID="activity-card-social-actions">
        <ResourceLikeButton
          disabled={displayLikePending || activity.capabilities?.canLike === false}
          isLiked={displayLiked}
          likeCount={displayLikeCount}
          onPress={onLikePress ?? toggleLike}
          testID={`activity-card-like-button-${activity.id}`}
        />
        <ResourceCardActionButton
          accessibilityLabel={`Comment, ${resolvedCommentCount} comments`}
          onPress={handleComment}
          testID={`activity-card-comment-button-${activity.id}`}
        >
          <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
            <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
            <Text className="ml-1 text-xs font-medium text-muted-foreground">
              {resolvedCommentCount > 0 ? `Comments ${resolvedCommentCount}` : "Comments"}
            </Text>
          </View>
        </ResourceCardActionButton>
      </View>

      {hasBelowMetricsActions ? (
        <View testID="activity-card-below-metrics-actions">{belowMetricsActions}</View>
      ) : null}
    </ResourceCardShell>
  );
}

export const activityCardFormatters = {
  duration: formatDurationSec,
  distance: formatDistanceMeters,
};
