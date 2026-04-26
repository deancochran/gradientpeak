import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ellipsis, Heart } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { RouteCard } from "@/components/shared/RouteCard";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";

type RouteCoordinate = { latitude: number; longitude: number; altitude?: number };

function calculateCoordinateDistance(left: RouteCoordinate, right: RouteCoordinate): number {
  const earthRadiusMeters = 6371e3;
  const lat1 = (left.latitude * Math.PI) / 180;
  const lat2 = (right.latitude * Math.PI) / 180;
  const deltaLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const deltaLng = ((right.longitude - left.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildRouteStreams(
  coordinates: RouteCoordinate[] | undefined,
): { distanceStream: DecompressedStream; elevationStream: DecompressedStream } | null {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const elevatedCoordinates = coordinates.filter((point) => typeof point.altitude === "number");
  if (elevatedCoordinates.length < 2) {
    return null;
  }

  const distanceValues: number[] = [];
  const elevationValues: number[] = [];
  const timestamps: number[] = [];
  let cumulativeDistance = 0;

  elevatedCoordinates.forEach((point, index) => {
    if (index > 0) {
      cumulativeDistance += calculateCoordinateDistance(elevatedCoordinates[index - 1]!, point);
    }

    distanceValues.push(cumulativeDistance);
    elevationValues.push(point.altitude as number);
    timestamps.push(index);
  });

  return {
    distanceStream: {
      type: "distance",
      dataType: "float",
      values: distanceValues,
      timestamps,
      sampleCount: distanceValues.length,
    },
    elevationStream: {
      type: "elevation",
      dataType: "float",
      values: elevationValues,
      timestamps,
      sampleCount: elevationValues.length,
    },
  };
}

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = api.useUtils();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const { user } = useAuth();

  const { data: route, isLoading } = api.routes.get.useQuery({ id: id! }, { enabled: !!id });
  const { data: routeFull } = api.routes.loadFull.useQuery({ id: id! }, { enabled: !!id });

  const deleteMutation = useReliableMutation(api.routes.delete, {
    invalidate: [utils.routes],
    success: "Route deleted successfully",
    onSuccess: () => router.back(),
  });

  const [isLiked, setIsLiked] = useState(route?.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(route?.has_liked ? 1 : 0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const comments = useEntityCommentsController({ entityId: route?.id, entityType: "route" });

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(route?.has_liked ?? false);
      setLikesCount(route?.has_liked ? 1 : 0);
    },
  });

  const handleToggleLike = () => {
    if (!route?.id) return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(route.id)) {
      Alert.alert("Error", "Cannot save this route - invalid ID");
      return;
    }

    const nextLikedState = !isLiked;
    setIsLiked(nextLikedState);
    setLikesCount((prev) => (nextLikedState ? prev + 1 : Math.max(0, prev - 1)));
    toggleLikeMutation.mutate({
      entity_id: route.id,
      entity_type: "route",
    });
  };

  React.useEffect(() => {
    if (route) {
      setIsLiked(route.has_liked ?? false);
      setLikesCount(route.has_liked ? 1 : 0);
    }
  }, [route?.has_liked]);

  const isOwner = !!user?.id && user.id === route?.profile_id;

  const elevationStreams = useMemo(
    () => buildRouteStreams(routeFull?.coordinates),
    [routeFull?.coordinates],
  );

  const handleDelete = () => {
    if (!route) return;

    setShowDeleteConfirm(true);
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="route-detail-loading"
      >
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!route) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        testID="route-detail-not-found"
      >
        <Text className="text-lg font-semibold text-foreground">Route not found</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          This route may have been removed.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
      </View>
    );
  }

  const renderOptionsMenu = () => {
    if (!isOwner) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger testID="route-detail-options-trigger">
          <View className="rounded-full p-2">
            <Icon as={Ellipsis} size={18} className="text-foreground" />
          </View>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          <DropdownMenuItem
            onPress={handleDelete}
            variant="destructive"
            testID="route-detail-options-delete"
          >
            <Text>Delete Route</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <View className="flex-1 bg-background" testID="route-detail-screen">
      <Stack.Screen options={{ headerRight: renderOptionsMenu }} />
      <ScrollView className="flex-1">
        <View className="p-4 gap-4 pb-6">
          <RouteCard route={route} routeFull={routeFull} />

          <Pressable
            onPress={handleToggleLike}
            className="self-start rounded-full border border-border bg-background px-3 py-2"
            testID="route-detail-like-button"
          >
            <View className="flex-row items-center gap-1.5">
              <Icon
                as={Heart}
                size={16}
                className={isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
              />
              <Text
                className={
                  isLiked ? "text-red-500 text-sm font-medium" : "text-muted-foreground text-sm"
                }
              >
                {likesCount > 0 ? `${likesCount}` : isLiked ? "Liked" : "Like"}
              </Text>
            </View>
          </Pressable>

          {elevationStreams ? (
            <ElevationProfileChart
              elevationStream={elevationStreams.elevationStream}
              distanceStream={elevationStreams.distanceStream}
              height={150}
              showStats={false}
              showHeader={false}
            />
          ) : null}

          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            comments={comments.comments}
            helperText="Discuss the route and share notes before reusing it elsewhere."
            hasMoreComments={comments.hasMoreComments}
            isLoadingMoreComments={comments.isLoadingMoreComments}
            newComment={comments.newComment}
            onAddComment={comments.handleAddComment}
            onChangeNewComment={comments.setNewComment}
            onLoadMoreComments={comments.loadMoreComments}
            testIDPrefix="route-detail"
          />
        </View>
      </ScrollView>
      {showDeleteConfirm ? (
        <AppConfirmModal
          description={`Are you sure you want to delete "${route.name}"? This cannot be undone.`}
          onClose={() => setShowDeleteConfirm(false)}
          primaryAction={{
            label: "Delete Route",
            onPress: () => deleteMutation.mutate({ id: route.id }),
            testID: "route-detail-delete-confirm",
            variant: "destructive",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteConfirm(false),
            variant: "outline",
          }}
          testID="route-detail-delete-modal"
          title="Delete Route"
        />
      ) : null}
    </View>
  );
}
