import type { ActivityDisplayModel, SemanticMetric } from "@repo/core";
import { formatDurationSec } from "@repo/core/utils/dates";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { MessageCircle } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { getUniqueActivityCategoryConfigs } from "@/lib/constants/activities";
import { formatDistanceMeters } from "@/lib/display/formatters";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import {
  type ResourceCardAccessory,
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
  showNotes?: boolean;
  showLike?: boolean;
  testID?: string;
  /** Context action rendered at the top-right of the owner/category row. */
  topRightAction?: ResourceCardAccessory;
};

function formatMetric(
  metric: SemanticMetric,
  preferredUnitSystem: ReturnType<typeof usePreferredUnitSystem>,
) {
  if (metric.status === "unavailable") return "Unavailable";
  if (metric.unit === "meters") {
    return formatDistanceMeters(metric.value, { preferredUnitSystem });
  }
  if (metric.unit === "seconds") return formatDurationSec(metric.value);
  if (metric.unit === "ratio") return metric.value.toFixed(2);
  if (metric.unit === "bpm") return `${Math.round(metric.value)} bpm`;
  if (metric.unit === "watts") return `${Math.round(metric.value)} W`;
  if (metric.unit === "kilocalories") return `${Math.round(metric.value)} kcal`;
  return Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1);
}

function ActivityMetricsRow({ activity }: { activity: ActivityDisplayModel }) {
  const preferredUnitSystem = usePreferredUnitSystem();
  const metrics: ResourceMetric[] = activity.metrics.slice(0, 4).map((metric) => ({
    label: metric.status === "partial" ? `${metric.label} (partial)` : metric.label,
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
  showLike = false,
  showNotes = true,
  testID,
  topRightAction,
}: ActivityCardProps) {
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
  const hasCommentAction = Boolean(onCommentPress);
  const hasBelowMetricsActions =
    belowMetricsActions !== undefined &&
    belowMetricsActions !== null &&
    belowMetricsActions !== false;
  const hasTopRightAction =
    topRightAction !== undefined && topRightAction !== null && topRightAction !== false;

  return (
    <ResourceCardShell
      accessibilityLabel={onPress ? "Open activity" : undefined}
      actionRegion={
        <ResourceOwnerActionRow
          actions={
            hasCommentAction || showLike || hasTopRightAction ? (
              <>
                {onCommentPress ? (
                  <Pressable
                    accessibilityLabel={`Comment, ${resolvedCommentCount} comments`}
                    accessibilityRole="button"
                    className="min-h-11 min-w-11 flex-row items-center justify-center gap-1.5 px-1"
                    onPress={onCommentPress}
                  >
                    <Icon as={MessageCircle} size={18} className="text-muted-foreground" />
                    <Text className="text-sm text-muted-foreground">{resolvedCommentCount}</Text>
                  </Pressable>
                ) : null}
                {showLike ? (
                  <ResourceLikeButton
                    disabled={displayLikePending}
                    isLiked={displayLiked}
                    likeCount={displayLikeCount}
                    onPress={onLikePress ?? toggleLike}
                    testID={`activity-card-like-button-${activity.id}`}
                  />
                ) : null}
                {topRightAction}
              </>
            ) : null
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
        titleClassName="text-base font-semibold text-foreground"
        titleFallback="Activity"
      />

      <ActivityMetricsRow activity={activity} />

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
