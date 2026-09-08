import { decodePolyline } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { MessageCircle, Share2 } from "lucide-react-native";
import { useMemo } from "react";
import { Alert, Share, View } from "react-native";
import {
  type ResourceCardAccessory,
  ResourceCardActionButton,
  ResourceCardHeader,
  ResourceCardShell,
  ResourceLikeButton,
  ResourceMetricsRow,
  ResourceOwnerActionRow,
} from "@/components/shared/ResourceCardPrimitives";
import { StaticRouteMapPreview } from "@/components/shared/StaticRouteMapPreview";
import { getActivityCategoryConfig } from "@/lib/constants/activities";
import { formatDistanceMeters, formatElevationMeters } from "@/lib/display/formatters";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { getPublicShareUrl } from "@/lib/share/public-share-url";

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
  is_public?: boolean | null;
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
  headerAccessory?: ResourceCardAccessory;
  commentCount?: number | null;
  isLiked?: boolean | null;
  likeCount?: number | null;
  likePending?: boolean;
  onLikePress?: () => void;
  onCommentPress?: () => void;
  route: RouteCardRoute;
  routeFull?: RouteCardFullRoute | null;
  onPress?: () => void;
  showAttribution?: boolean;
  showLike?: boolean;
  testID?: string;
  variant?: "default" | "compact" | "detail" | "list";
};

export function RouteCard({
  headerAccessory,
  commentCount = 0,
  isLiked,
  likeCount,
  likePending,
  onLikePress,
  onCommentPress,
  route,
  routeFull,
  onPress,
  showAttribution,
  showLike,
  testID,
  variant = "default",
}: RouteCardProps) {
  const preferredUnitSystem = usePreferredUnitSystem();
  const activityConfig = getActivityCategoryConfig(route.activity_category || "other");
  const isCompact = variant === "compact";
  const isDetail = variant === "detail";
  const isList = variant === "list";
  const isDense = isCompact || isList;
  const shouldShowAttribution = showAttribution ?? !isList;
  const shouldShowLike = showLike ?? !isList;
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
  const hasListActions = isList && Boolean(headerAccessory || shouldShowLike);

  const handleLikePress = () => {
    if (onLikePress) {
      onLikePress();
      return;
    }

    toggleLike();
  };
  const handleCommentPress = onCommentPress ?? onPress;
  const handleShare = async () => {
    if (route.is_public !== true) {
      Alert.alert(
        "Not public",
        "Only public routes have a share link. Change visibility to Public first.",
      );
      return;
    }

    const url = getPublicShareUrl(`/share/routes/${route.id}`);
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert("Unable to share", "The route could not be shared. Try again.");
    }
  };

  const coordinates = useMemo<RouteCoordinate[]>(() => {
    if (routeFull?.coordinates?.length) {
      return routeFull.coordinates;
    }

    return route.polyline ? decodePolyline(route.polyline) : [];
  }, [route.polyline, routeFull?.coordinates]);

  return (
    <ResourceCardShell
      accessibilityLabel={onPress ? `Open route ${route.name || "Untitled route"}` : undefined}
      actionRegion={
        !isList || shouldShowAttribution ? (
          <ResourceOwnerActionRow
            actions={
              !isDense ? (
                <>
                  {headerAccessory}
                  <ResourceCardActionButton
                    accessibilityLabel="Share route"
                    onPress={() => void handleShare()}
                    testID={`route-card-share-button-${route.id}`}
                  >
                    <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
                      <Icon as={Share2} size={14} className="text-muted-foreground" />
                      <Text className="ml-1 text-xs font-medium text-muted-foreground">Share</Text>
                    </View>
                  </ResourceCardActionButton>
                </>
              ) : isList && hasListActions ? (
                <>
                  {headerAccessory}
                  {shouldShowLike ? (
                    <ResourceLikeButton
                      disabled={resolvedLikePending}
                      isLiked={resolvedLiked}
                      likeCount={resolvedLikesCount}
                      onPress={handleLikePress}
                      testID={`route-card-like-button-${route.id}`}
                    />
                  ) : null}
                </>
              ) : undefined
            }
            categoryIcon={activityConfig.icon}
            categoryIconClassName={activityConfig.color}
            categoryLabel={activityConfig.name}
            compact={isDense}
            fallbackLabel="GradientPeak"
            owner={shouldShowAttribution ? (route.owner ?? null) : null}
            timestamp={
              shouldShowAttribution ? (route.created_at ?? route.updated_at ?? null) : null
            }
          />
        ) : isList && hasListActions ? (
          <View className="flex-row items-center justify-end gap-2">
            {headerAccessory}
            {shouldShowLike ? (
              <ResourceLikeButton
                disabled={resolvedLikePending}
                isLiked={resolvedLiked}
                likeCount={resolvedLikesCount}
                onPress={handleLikePress}
                testID={`route-card-like-button-${route.id}`}
              />
            ) : null}
          </View>
        ) : undefined
      }
      compact={isDense}
      onPress={onPress}
      testID={testID ?? `route-card-${route.id}`}
    >
      <ResourceCardHeader
        compact={isDense}
        description={isList ? undefined : route.description}
        descriptionFallback={isList ? undefined : `${activityConfig.name} route`}
        detail={isDetail}
        title={route.name}
        titleFallback="Untitled route"
      />

      <ResourceMetricsRow
        compact={isDense}
        metrics={[
          {
            label: "Distance",
            value: formatDistanceMeters(route.total_distance ?? 0, { preferredUnitSystem }),
          },
          {
            label: "Climb",
            value: formatElevationMeters(route.total_ascent, { preferredUnitSystem }),
          },
          {
            label: "Descent",
            value: formatElevationMeters(route.total_descent, { preferredUnitSystem }),
          },
        ]}
      />

      {!isDense ? (
        <View className="flex-row items-center gap-2" testID="route-card-social-actions">
          {shouldShowLike ? (
            <ResourceLikeButton
              disabled={resolvedLikePending}
              isLiked={resolvedLiked}
              likeCount={resolvedLikesCount}
              onPress={handleLikePress}
              testID={`route-card-like-button-${route.id}`}
            />
          ) : null}
          <ResourceCardActionButton
            accessibilityLabel={
              commentCount && commentCount > 0 ? `Comments, ${commentCount}` : "Comments"
            }
            disabled={!handleCommentPress}
            onPress={handleCommentPress ?? (() => {})}
            testID={`route-card-comments-button-${route.id}`}
          >
            <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
              <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
              <Text className="ml-1 text-xs font-medium text-muted-foreground">
                {commentCount && commentCount > 0 ? `Comments ${commentCount}` : "Comments"}
              </Text>
            </View>
          </ResourceCardActionButton>
        </View>
      ) : null}

      {!isList ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          <View className="aspect-[16/9] bg-muted">
            {coordinates.length > 0 ? (
              <StaticRouteMapPreview
                coordinates={coordinates}
                showMarkers={true}
                strokeColor="#f97316"
                strokeWidth={4}
                testID={`route-card-map-preview-${route.id}`}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text className="text-muted-foreground">No GPS data available</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}
    </ResourceCardShell>
  );
}
