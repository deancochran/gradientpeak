import { decodePolyline, formatDurationSec } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { MessageCircle, Route } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import {
  formatCalibrationQuality,
  getCommonLoadPresentation,
} from "@/lib/activity-load-presentation";
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
    common_load?: unknown;
    tss?: number | null;
    intensity_factor?: number | null;
    method?: string | null;
    unavailable_reason?: string | null;
    calibration_quality?: CalibrationQuality | null;
    stress?: {
      common_load?: unknown;
      tss?: number | null;
      intensity_factor?: number | null;
      method?: string | null;
      unavailable_reason?: string | null;
      calibration_quality?: CalibrationQuality | null;
    } | null;
  } | null;
  segment_loads?: Array<{
    segment_id: string;
    category: string;
    tss?: number | null;
    intensity_factor?: number | null;
    method?: string | null;
    unavailable_reason?: string | null;
    common_load?: unknown;
  }>;
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
  footerAccessory?: ResourceCardAccessory;
  headerAccessory?: ResourceCardAccessory;
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

function getActivityCategories(activity: ActivityCardActivity): string[] {
  const categories = activity.activity_categories?.length
    ? activity.activity_categories
    : activity.segments
        ?.filter((segment) => segment.role === "activity")
        .map((segment) => segment.category)
        .filter((category): category is string => !!category);
  return [...new Set(categories?.length ? categories : ["other"])];
}

function getLoadPresentation(activity: ActivityCardActivity) {
  return getCommonLoadPresentation(
    activity.derived?.common_load ?? activity.derived?.stress?.common_load,
    {
      hasHeartRateSummary:
        typeof activity.avg_heart_rate === "number" && activity.avg_heart_rate > 0,
      segmentCommonLoads: activity.segment_loads?.map((segment) => segment.common_load),
    },
  );
}

function getCalibrationText(activity: ActivityCardActivity): string | null {
  const quality =
    activity.derived?.calibration_quality ?? activity.derived?.stress?.calibration_quality ?? null;
  if (quality) return formatCalibrationQuality(quality, activity.started_at);
  if (activity.derived?.common_load ?? activity.derived?.stress?.common_load) return null;
  const unavailableReason =
    activity.derived?.unavailable_reason ?? activity.derived?.stress?.unavailable_reason ?? null;
  return unavailableReason === "threshold_missing" ? "A required threshold is missing." : null;
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

  if (loadPresentation?.load && loadPresentation.intensity) {
    metrics.push({
      label: "Load",
      value: loadPresentation.load,
      tone: "primary",
    });
    metrics.push({
      label: "Intensity",
      value: loadPresentation.intensity,
      tone: "primary",
    });
  } else {
    metrics.push({
      label: "Load",
      value: loadPresentation?.unavailableText ?? "Unavailable",
      tone: "primary",
    });
  }

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
  const categoryItems = getUniqueActivityCategoryConfigs(getActivityCategories(activity)).map(
    (category) => ({
      icon: category.icon,
      iconClassName: category.color,
      label: category.name,
    }),
  );
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
  const loadPresentation = getLoadPresentation(activity);
  const loadCoverageMessage =
    loadPresentation?.status === "partial"
      ? "Load is incomplete because some activity evidence is missing. Open to review details."
      : loadPresentation?.diagnostic
        ? `${loadPresentation.diagnostic.summary} ${loadPresentation.diagnostic.action}`
        : loadPresentation?.status === "unavailable"
          ? "Load is unavailable until compatible activity evidence is available. Open to review details."
          : null;
  const hasCommentAction = Boolean(onCommentPress);
  const hasFooterAccessory = Boolean(footerAccessory);
  const hasHeaderAccessory = Boolean(headerAccessory);

  return (
    <ResourceCardShell
      accessibilityLabel={`Open activity ${activity.name || "Untitled activity"}`}
      actionRegion={
        <ResourceOwnerActionRow
          actions={
            hasCommentAction || hasFooterAccessory || resolvedShowLike || hasHeaderAccessory ? (
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
          categoryItems={categoryItems}
          fallbackLabel="GradientPeak"
          onOwnerPress={onOwnerPress}
          owner={attributionOwner}
          timestamp={resolvedDateMode === "none" ? null : activity.started_at}
        />
      }
      contentClassName="gap-3 px-3"
      onPress={onPress}
      testID={testID}
    >
      <ResourceCardHeader
        description={showNotes ? activity.notes : null}
        descriptionNumberOfLines={detail ? undefined : 2}
        detail={detail}
        title={activity.name}
        titleClassName={`${detail ? "text-xl" : "text-base"} font-semibold text-foreground`}
        titleFallback="Untitled Activity"
      />

      <ActivityMetricsRow activity={activity} compact={false} />

      {loadCoverageMessage ? (
        <Text className="text-xs text-muted-foreground">{loadCoverageMessage}</Text>
      ) : null}

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
