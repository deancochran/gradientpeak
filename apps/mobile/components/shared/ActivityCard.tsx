import { decodePolyline, formatDurationSec } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { MessageCircle, Route } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import {
  formatCalibrationQuality,
  getActivityLoadLabels,
  getThresholdNextAction,
} from "@/lib/activity-load-presentation";
import { getActivityCategoryConfig } from "@/lib/constants/activities";
import { formatDistanceMeters } from "@/lib/display/formatters";
import { formatEstimatedIntensityFactor, formatEstimatedTss } from "@/lib/estimatedMetrics";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceLikeButton,
  type ResourceMetric,
  ResourceMetricsRow,
  ResourceOwnerActionRow,
} from "./ResourceCardPrimitives";
import { StaticRouteMapPreview } from "./StaticRouteMapPreview";

type RouteCoordinate = { latitude: number; longitude: number };

const COMPACT_ROUTE_PREVIEW_HEIGHT = 128;

export type ActivityCardActivity = {
  id: string;
  name?: string | null;
  activity_kind?: "single" | "multisport" | "unknown";
  activity_categories?: readonly string[];
  segments?: Array<{ role?: string; category?: string | null }>;
  started_at?: string | Date | null;
  distance_meters?: number | null;
  elapsed_ms?: number | null;
  elapsed_seconds?: number | null;
  active_ms?: number | null;
  moving_ms?: number | null;
  timing_coverage?: "complete" | "partial" | "unavailable";
  avg_heart_rate?: number | null;
  avg_power?: number | null;
  avg_speed_mps?: number | null;
  device_manufacturer?: string | null;
  device_product?: string | null;
  notes?: string | null;
  polyline?: string | null;
  current_artifact?: { id: string; availability?: string | null } | null;
  likes_count?: number | null;
  comments_count?: number | null;
  has_liked?: boolean | null;
  derived?: {
    tss?: number | null;
    intensity_factor?: number | null;
    method?: string | null;
    unavailable_reason?: string | null;
    calibration_quality?: CalibrationQuality | null;
    stress?: {
      tss?: number | null;
      intensity_factor?: number | null;
      method?: string | null;
      unavailable_reason?: string | null;
      calibration_quality?: CalibrationQuality | null;
    } | null;
  } | null;
  ingestion?: {
    status?: string | null;
    last_error_message?: string | null;
  } | null;
  profile?: ActivityCardOwner | null;
};

type CalibrationQuality = {
  source:
    | "manual"
    | "validated_test"
    | "observed_effort"
    | "provider"
    | "modeled"
    | "estimated"
    | "unknown";
  observed_at: string | null;
  stale: boolean;
  estimate: boolean;
};

export type ActivityCardOwner = {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
};

type ActivityCardProps = {
  activity: ActivityCardActivity;
  commentCount?: number | null;
  dateMode?: "absolute" | "none" | "relative";
  footerAccessory?: ReactNode;
  headerAccessory?: ReactNode;
  isLiked?: boolean | null;
  likeCount?: number | null;
  likePending?: boolean;
  onCommentPress?: () => void;
  onLikePress?: () => void;
  onOwnerPress?: () => void;
  onPress?: () => void;
  owner?: ActivityCardOwner | null;
  showNotes?: boolean;
  showLike?: boolean;
  showRouteIndicator?: boolean;
  showVisualPreview?: boolean;
  testID?: string;
  variant?: "detail" | "list";
};

function CompactRoutePreview({ coordinates }: { coordinates: RouteCoordinate[] }) {
  if (coordinates.length < 2) {
    return null;
  }

  return (
    <View
      className="overflow-hidden rounded-2xl border border-border bg-card"
      style={{ height: COMPACT_ROUTE_PREVIEW_HEIGHT }}
    >
      <StaticRouteMapPreview
        coordinates={coordinates}
        showMarkers={true}
        strokeColor="#f97316"
        strokeWidth={4}
      />
    </View>
  );
}

function getDerivedValue(activity: ActivityCardActivity, key: "tss" | "intensity_factor") {
  return activity.derived?.[key] ?? activity.derived?.stress?.[key] ?? null;
}

function getActivityCategory(activity: ActivityCardActivity): string {
  return (
    activity.activity_categories?.[0] ??
    activity.segments?.find((segment) => segment.role === "activity")?.category ??
    "other"
  );
}

function getLoadPresentation(activity: ActivityCardActivity) {
  const method = activity.derived?.method ?? activity.derived?.stress?.method ?? null;
  const unavailableReason =
    activity.derived?.unavailable_reason ?? activity.derived?.stress?.unavailable_reason ?? null;
  const labels = getActivityLoadLabels(method);
  const unavailableText =
    unavailableReason === "private_data"
      ? "Private"
      : unavailableReason === "threshold_missing"
        ? "No prior threshold"
        : unavailableReason === "invalid_data"
          ? "Invalid data"
          : unavailableReason === "activity_data_missing"
            ? "Missing activity data"
            : "--";
  return { ...labels, unavailableText };
}

function getCalibrationText(activity: ActivityCardActivity): string | null {
  const quality =
    activity.derived?.calibration_quality ?? activity.derived?.stress?.calibration_quality ?? null;
  if (quality) return formatCalibrationQuality(quality, activity.started_at);
  const unavailableReason =
    activity.derived?.unavailable_reason ?? activity.derived?.stress?.unavailable_reason ?? null;
  return unavailableReason === "threshold_missing"
    ? getThresholdNextAction(getActivityCategory(activity))
    : null;
}

function getIngestionStatusText(activity: ActivityCardActivity): string | null {
  const status = activity.ingestion?.status;

  if (!status || status === "ready") return null;
  if (status === "failed") return "Processing failed";
  if (status === "pending_upload") return "Queued for upload";
  return "Processing activity file";
}

function ActivityMetricsRow({
  activity,
  compact,
}: {
  activity: ActivityCardActivity;
  compact: boolean;
}) {
  const preferredUnitSystem = usePreferredUnitSystem();
  const tss = getDerivedValue(activity, "tss");
  const intensityFactor = getDerivedValue(activity, "intensity_factor");
  const loadPresentation = getLoadPresentation(activity);
  const metrics: ResourceMetric[] = [];

  if (typeof activity.distance_meters === "number" && activity.distance_meters > 0) {
    metrics.push({
      label: "Distance",
      value: formatDistanceMeters(activity.distance_meters, { preferredUnitSystem }),
    });
  }

  const elapsedSeconds =
    activity.elapsed_seconds ??
    (typeof (activity.active_ms ?? activity.elapsed_ms) === "number"
      ? (activity.active_ms ?? activity.elapsed_ms ?? 0) / 1000
      : null);
  if (typeof elapsedSeconds === "number" && elapsedSeconds > 0) {
    metrics.push({ label: "Elapsed", value: formatDurationSec(elapsedSeconds) });
  }

  metrics.push({
    label: loadPresentation.load,
    value: formatEstimatedTss(tss, { includeUnit: false }) ?? loadPresentation.unavailableText,
    tone: "primary",
  });

  metrics.push({
    label: loadPresentation.intensity,
    value: formatEstimatedIntensityFactor(intensityFactor) ?? "--",
    tone: "primary",
  });

  if (metrics.length === 0) {
    return null;
  }

  return <ResourceMetricsRow compact={compact} maxItems={4} metrics={metrics} />;
}

export function ActivityCard({
  activity,
  commentCount,
  dateMode,
  footerAccessory,
  headerAccessory,
  isLiked,
  likeCount,
  likePending = false,
  onCommentPress,
  onLikePress,
  onOwnerPress,
  onPress,
  owner: ownerProp,
  showLike,
  showNotes = true,
  showRouteIndicator = true,
  showVisualPreview,
  testID,
  variant = "list",
}: ActivityCardProps) {
  const detail = variant === "detail";
  const list = variant === "list";
  const resolvedShowLike = showLike ?? list;
  const activityType = getActivityCategory(activity);
  const activityConfig = getActivityCategoryConfig(activityType);
  const owner = ownerProp ?? activity.profile ?? null;
  const resolvedDateMode = dateMode ?? "relative";
  const resolvedCommentCount = commentCount ?? activity.comments_count ?? 0;
  const {
    isLiked: internalLiked,
    isPending: internalLikePending,
    likeCount: internalLikeCount,
    toggleLike,
  } = useResourceLike({
    entityId: activity.id,
    entityType: "activity",
    initialCount: activity.likes_count,
    initialLiked: activity.has_liked,
  });
  const displayLiked = isLiked ?? internalLiked;
  const displayLikeCount = likeCount ?? internalLikeCount;
  const displayLikePending = likePending || internalLikePending;
  const shouldShowVisualPreview = showVisualPreview ?? false;
  const shouldShowCompactRoutePreview = list && showVisualPreview !== false;
  const attributionOwner = owner
    ? {
        avatar_url: owner.avatar_url ?? owner.avatarUrl ?? null,
        id: owner.id,
        username: owner.username,
      }
    : null;
  const decodedPolylineCoordinates = useMemo(() => {
    if (!shouldShowVisualPreview && !shouldShowCompactRoutePreview) return [];
    if (!activity.polyline) return [];
    try {
      return decodePolyline(activity.polyline);
    } catch {
      return [];
    }
  }, [activity.polyline, shouldShowCompactRoutePreview, shouldShowVisualPreview]);
  const routeCoordinates = decodedPolylineCoordinates;
  const ingestionStatusText = getIngestionStatusText(activity);
  const calibrationText = getCalibrationText(activity);
  const hasCommentAction = Boolean(onCommentPress);
  const hasFooterAccessory = Boolean(footerAccessory);
  const hasHeaderAccessory = Boolean(headerAccessory);

  return (
    <ResourceCardShell contentClassName="gap-3 px-3" onPress={onPress} testID={testID}>
      <ResourceOwnerActionRow
        actions={
          hasCommentAction || hasFooterAccessory || resolvedShowLike || hasHeaderAccessory ? (
            <>
              {onCommentPress ? (
                <Pressable
                  className="flex-row items-center gap-1.5"
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    onCommentPress();
                  }}
                >
                  <Icon as={MessageCircle} size={18} className="text-muted-foreground" />
                  <Text className="text-sm text-muted-foreground">{resolvedCommentCount}</Text>
                </Pressable>
              ) : null}

              {footerAccessory}

              {resolvedShowLike ? (
                <ResourceLikeButton
                  disabled={displayLikePending}
                  isLiked={displayLiked}
                  likeCount={displayLikeCount}
                  onPress={onLikePress ?? toggleLike}
                  testID={`activity-card-like-button-${activity.id}`}
                />
              ) : null}

              {headerAccessory}
            </>
          ) : null
        }
        categoryIcon={activityConfig.icon}
        categoryIconClassName={activityConfig.color}
        categoryLabel={activityConfig.name}
        fallbackLabel="GradientPeak"
        onOwnerPress={onOwnerPress}
        owner={attributionOwner}
        timestamp={resolvedDateMode === "none" ? null : activity.started_at}
      />

      <ResourceCardHeader
        description={showNotes ? activity.notes : null}
        descriptionNumberOfLines={detail ? undefined : 2}
        detail={detail}
        title={activity.name}
        titleClassName={`${detail ? "text-xl" : "text-base"} font-semibold text-foreground`}
        titleFallback="Untitled Activity"
      />

      <ActivityMetricsRow activity={activity} compact={false} />

      {calibrationText ? (
        <Text className="text-xs text-muted-foreground">{calibrationText}</Text>
      ) : null}

      {ingestionStatusText ? (
        <Text
          className={
            activity.ingestion?.status === "failed"
              ? "text-xs font-medium text-destructive"
              : "text-xs font-medium text-muted-foreground"
          }
          testID={`activity-card-ingestion-status-${activity.id}`}
        >
          {ingestionStatusText}
        </Text>
      ) : null}

      {shouldShowVisualPreview && routeCoordinates.length > 0 ? (
        <View
          className="overflow-hidden rounded-2xl border border-border bg-card"
          testID={`activity-card-route-preview-${activity.id}`}
        >
          <View className="h-36 bg-muted">
            <StaticRouteMapPreview
              coordinates={routeCoordinates}
              showMarkers={true}
              strokeColor="#f97316"
              strokeWidth={4}
            />
          </View>
        </View>
      ) : shouldShowCompactRoutePreview && routeCoordinates.length > 0 ? (
        <CompactRoutePreview coordinates={routeCoordinates} />
      ) : showRouteIndicator && activity.polyline ? (
        <View className="flex-row items-center gap-1.5">
          <Icon as={Route} size={14} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">Route available</Text>
        </View>
      ) : null}
    </ResourceCardShell>
  );
}

export const activityCardFormatters = {
  duration: formatDurationSec,
  distance: formatDistanceMeters,
};
