import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, InteractionManager, View } from "react-native";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  DetailScaffold,
} from "@/components/shared/detail";
import { RouteCard } from "@/components/shared/RouteCard";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { useRecordingLifecycle } from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { returnToRecordScreen } from "@/lib/navigation/recordingNavigation";
import { useOptionalSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import {
  handleRecordingObjectAction,
  type RecordingObjectActionCandidate,
  resolveRecordingObjectAction,
} from "@/lib/recording/recordingObjectActions";
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
  const { user } = useAuth();
  const recorderService = useOptionalSharedActivityRecorder();
  const recordingLifecycle = useRecordingLifecycle(recorderService);
  const [shouldLoadGeometry, setShouldLoadGeometry] = useState(false);

  const { data: route, isLoading } = api.routes.get.useQuery({ id: id! }, { enabled: !!id });
  const { data: routeFull, isFetching: isFetchingRouteFull } = api.routes.loadFull.useQuery(
    { id: id! },
    { enabled: !!id && shouldLoadGeometry },
  );

  useEffect(() => {
    setShouldLoadGeometry(false);
    if (!id) {
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      setShouldLoadGeometry(true);
    });

    return () => task.cancel();
  }, [id]);

  const deleteMutation = useReliableMutation(api.routes.delete, {
    invalidate: [utils.routes],
    success: "Route deleted successfully",
    onSuccess: () => router.back(),
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const comments = useEntityCommentsController({ entityId: route?.id, entityType: "route" });
  const routeLike = useResourceLike({
    entityId: route?.id ?? "",
    entityType: "route",
    initialCount: route?.likes_count,
    initialLiked: route?.has_liked,
  });

  const handleToggleLike = () => {
    if (!route?.id) return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(route.id)) {
      Alert.alert("Error", "Cannot save this route - invalid ID");
      return;
    }

    routeLike.toggleLike();
  };

  const isOwner = !!user?.id && user.id === route?.profile_id;

  const elevationStreams = useMemo(
    () => buildRouteStreams(routeFull?.coordinates),
    [routeFull?.coordinates],
  );

  const recordingCandidate = useMemo<RecordingObjectActionCandidate | null>(() => {
    if (!route?.id) return null;
    return {
      objectKind: "route",
      objectId: route.id,
      label: route.name,
      category: (route as { activity_category?: string | null }).activity_category,
      canReadGeometry: routeFull ? Boolean(routeFull.coordinates?.length) : undefined,
    };
  }, [route, routeFull]);

  const recordingAction = recordingCandidate
    ? resolveRecordingObjectAction({
        candidate: recordingCandidate,
        lifecycle: recordingLifecycle,
        service: recorderService,
      })
    : null;

  const handleRecordingAction = async () => {
    if (!recordingCandidate || !recordingAction) return;
    await handleRecordingObjectAction({
      candidate: recordingCandidate,
      command: recordingAction.command,
      navigateToRecord: () => returnToRecordScreen(router),
      service: recorderService,
    });
  };

  const handleDelete = () => {
    if (!route) return;

    setShowDeleteConfirm(true);
  };

  const renderOptionsMenu = () => {
    return (
      <DetailOverflowMenu
        actions={[
          {
            disabled: recordingAction?.primaryAction === "disabled" || !recordingAction?.command,
            label: recordingAction?.label ?? "Start Activity",
            onPress: handleRecordingAction,
            testID: "route-detail-options-recording",
          },
          ...(isOwner
            ? [
                {
                  label: "Delete Route",
                  onPress: handleDelete,
                  testID: "route-detail-options-delete",
                  variant: "destructive" as const,
                },
              ]
            : []),
        ]}
        testID="route-detail-options-trigger"
      />
    );
  };

  if (isLoading || !route) {
    return (
      <DetailScaffold
        headerRight={renderOptionsMenu}
        isLoading={isLoading}
        loadingLabel="Loading route..."
        loadingTestID="route-detail-loading"
        notFound={!route}
        notFoundDescription="This route may have been removed."
        notFoundOnActionPress={() => router.back()}
        notFoundTestID="route-detail-not-found"
        notFoundTitle="Route not found"
      >
        {null}
      </DetailScaffold>
    );
  }

  return (
    <DetailScaffold
      contentContainerClassName="p-4 gap-4 pb-6"
      headerRight={renderOptionsMenu}
      modals={
        showDeleteConfirm ? (
          <DetailDeleteConfirmModal
            entityLabel="Route"
            entityName={route.name}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={() => deleteMutation.mutate({ id: route.id })}
            pending={deleteMutation.isPending}
            testIDPrefix="route-detail"
          />
        ) : null
      }
      screenTestID="route-detail-screen"
    >
      <RouteCard
        route={route}
        routeFull={routeFull}
        isLiked={routeLike.isLiked}
        likeCount={routeLike.likeCount}
        likePending={routeLike.isPending}
        onLikePress={handleToggleLike}
        variant="detail"
      />

      {elevationStreams ? (
        <ElevationProfileChart
          elevationStream={elevationStreams.elevationStream}
          distanceStream={elevationStreams.distanceStream}
          height={150}
          showStats={false}
          showHeader={false}
        />
      ) : !shouldLoadGeometry || isFetchingRouteFull ? (
        <View className="items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-6">
          <ActivityIndicator size="small" className="text-primary" />
          <Text className="text-sm text-muted-foreground">Loading route geometry...</Text>
        </View>
      ) : (
        <View className="items-center gap-2 rounded-2xl border border-border bg-muted/20 px-4 py-6">
          <Text className="text-sm font-medium text-foreground">No elevation profile</Text>
          <Text className="text-center text-sm text-muted-foreground">
            This route does not have enough elevation data to draw a profile.
          </Text>
        </View>
      )}

      <EntityCommentsSection
        addCommentPending={comments.addCommentPending}
        commentCount={comments.commentCount}
        comments={comments.comments}
        hasMoreComments={comments.hasMoreComments}
        isLoadingMoreComments={comments.isLoadingMoreComments}
        newComment={comments.newComment}
        onAddComment={comments.handleAddComment}
        onChangeNewComment={comments.setNewComment}
        onLoadMoreComments={comments.loadMoreComments}
        testIDPrefix="route-detail"
      />
    </DetailScaffold>
  );
}
