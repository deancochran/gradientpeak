import { decodePolyline } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import React, { useMemo } from "react";
import { View } from "react-native";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceLikeButton,
  ResourceMetricsRow,
  ResourceOwnerActionRow,
} from "@/components/shared/ResourceCardPrimitives";
import { StaticRouteMapPreview } from "@/components/shared/StaticRouteMapPreview";
import { getActivityCategoryConfig } from "@/lib/constants/activities";
import { useResourceLike } from "@/lib/hooks/useResourceLike";

type RouteCoordinate = {
  latitude: number;
  longitude: number;
  altitude?: number;
};

type RouteCardRoute = {
  id: string;
  name: string;
  description?: string | null;
  activity_category?: string | null;
  total_distance?: number | null;
  total_ascent?: number | null;
  total_descent?: number | null;
  polyline?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  likes_count?: number | null;
  has_liked?: boolean | null;
  owner?: {
    id?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
};

type RouteCardFullRoute = {
  coordinates?: RouteCoordinate[];
};

type RouteCardProps = {
  headerAccessory?: ReactNode;
  isLiked?: boolean | null;
  likeCount?: number | null;
  likePending?: boolean;
  onLikePress?: () => void;
  route: RouteCardRoute;
  routeFull?: RouteCardFullRoute | null;
  onPress?: () => void;
  showAttribution?: boolean;
  showLike?: boolean;
  variant?: "default" | "compact" | "detail";
};

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(2)} km`;
}

export function RouteCard({
  headerAccessory,
  isLiked,
  likeCount,
  likePending,
  onLikePress,
  route,
  routeFull,
  onPress,
  showAttribution = true,
  showLike = true,
  variant = "default",
}: RouteCardProps) {
  const activityConfig = getActivityCategoryConfig(route.activity_category || "other");
  const isCompact = variant === "compact";
  const isDetail = variant === "detail";
  const {
    isLiked: internalLiked,
    isPending: internalLikePending,
    likeCount: internalLikesCount,
    toggleLike,
  } = useResourceLike({
    entityId: route.id,
    entityType: "route",
    initialCount: route.likes_count,
    initialLiked: route.has_liked,
  });

  const resolvedLiked = isLiked ?? internalLiked;
  const resolvedLikesCount = likeCount ?? internalLikesCount;
  const resolvedLikePending = likePending ?? internalLikePending;

  const handleLikePress = () => {
    if (onLikePress) {
      onLikePress();
      return;
    }

    toggleLike();
  };

  const coordinates = useMemo<RouteCoordinate[]>(() => {
    if (routeFull?.coordinates?.length) {
      return routeFull.coordinates;
    }

    return route.polyline ? decodePolyline(route.polyline) : [];
  }, [route.polyline, routeFull?.coordinates]);

  return (
    <ResourceCardShell compact={isCompact} onPress={onPress}>
      <ResourceOwnerActionRow
        actions={
          <>
            {headerAccessory}
            {showLike ? (
              <ResourceLikeButton
                disabled={resolvedLikePending}
                isLiked={resolvedLiked}
                likeCount={resolvedLikesCount}
                onPress={handleLikePress}
                testID={`route-card-like-button-${route.id}`}
              />
            ) : null}
          </>
        }
        categoryIcon={activityConfig.icon}
        categoryIconClassName={activityConfig.color}
        categoryLabel={activityConfig.name}
        compact={isCompact}
        fallbackLabel="GradientPeak"
        owner={showAttribution ? (route.owner ?? null) : null}
        timestamp={showAttribution ? (route.created_at ?? route.updated_at ?? null) : null}
      />

      <ResourceCardHeader
        compact={isCompact}
        description={route.description}
        descriptionFallback={`${activityConfig.name} route`}
        detail={isDetail}
        title={route.name}
        titleFallback="Untitled route"
      />

      <ResourceMetricsRow
        compact={isCompact}
        metrics={[
          { label: "Distance", value: formatDistance(route.total_distance ?? 0) },
          {
            label: "Climb",
            value:
              route.total_ascent != null && route.total_ascent > 0
                ? `${route.total_ascent}m`
                : "--",
          },
          {
            label: "Descent",
            value:
              route.total_descent != null && route.total_descent > 0
                ? `${route.total_descent}m`
                : "--",
          },
        ]}
      />

      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        <View className="aspect-[16/9] bg-muted">
          {coordinates.length > 0 ? (
            <StaticRouteMapPreview
              coordinates={coordinates}
              showMarkers={true}
              strokeColor="#f97316"
              strokeWidth={4}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted-foreground">No GPS data available</Text>
            </View>
          )}
        </View>
      </View>
    </ResourceCardShell>
  );
}
