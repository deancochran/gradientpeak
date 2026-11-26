import { Icon } from "@repo/ui/components/icon";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Share2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Share } from "react-native";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  DetailScaffold,
} from "@/components/shared/detail";
import { ResourceCardActionButton } from "@/components/shared/ResourceCardPrimitives";
import { RouteCard } from "@/components/shared/RouteCard";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";
import { useEntityCommentsSheet } from "@/components/social/EntityCommentsSheetProvider";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useSessionView } from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { returnToRecordScreen } from "@/lib/navigation/recordingNavigation";
import { omitUndefined } from "@/lib/omitUndefined";
import { useOptionalActivityRecorderService } from "@/lib/providers/ActivityRecorderProvider";
import {
  handleRecordingObjectAction,
  type RecordingObjectActionCandidate,
  resolveRecordingObjectAction,
} from "@/lib/recording/recordingObjectActions";
import { getPublicShareUrl } from "@/lib/share/public-share-url";
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
      const previousPoint = elevatedCoordinates[index - 1];
      if (previousPoint) {
        cumulativeDistance += calculateCoordinateDistance(previousPoint, point);
      }
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
  const routeId = id ?? "";
  const router = useRouter();
  const utils = api.useUtils();
  const { user } = useAuth();
  const recorderService = useOptionalActivityRecorderService();
  const sessionView = useSessionView(recorderService);
  const recordingLifecycle = recorderService?.recordingLifecycle ?? (sessionView ? "idle" : "idle");
  const [shouldLoadGeometry, setShouldLoadGeometry] = useState(false);

  const { data: route, isLoading } = api.routes.get.useQuery(
    { id: routeId },
    { enabled: routeId.length > 0 },
  );
  const { data: routeFull, isFetching: isFetchingRouteFull } = api.routes.loadFull.useQuery(
    { id: routeId },
    {
      enabled: routeId.length > 0 && route?.storage_state === "ready" && shouldLoadGeometry,
    },
  );

  useEffect(() => {
    setShouldLoadGeometry(false);
    if (!routeId || route?.storage_state !== "ready") {
      return;
    }

    const idleCallback = requestIdleCallback(() => {
      setShouldLoadGeometry(true);
    });

    return () => cancelIdleCallback(idleCallback);
  }, [route?.storage_state, routeId]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteMutation = useReliableMutation(api.routes.delete, {
    onSuccess: () => {
      void utils.routes.get.reset({ id: routeId });
      router.back();
      void utils.routes.get.invalidate({ id: routeId });
    },
    onError: async () => {
      setShowDeleteConfirm(false);
      await utils.routes.get.invalidate({ id: routeId });
    },
  });

  const comments = useEntityCommentsController({ entityId: route?.id ?? "", entityType: "route" });
  const entityCommentsSheet = useEntityCommentsSheet();
  const routeLike = useResourceLike({
    entityId: route?.id ?? "",
    entityType: "route",
    ...(route?.likes_count === undefined ? {} : { initialCount: route.likes_count }),
    ...(route?.has_liked === undefined ? {} : { initialLiked: route.has_liked }),
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
  const isDeletionPending = route?.storage_state === "deletion_pending";

  const elevationStreams = useMemo(
    () => buildRouteStreams(routeFull?.coordinates?.map((coordinate) => omitUndefined(coordinate))),
    [routeFull?.coordinates],
  );

  const recordingCandidate = useMemo<RecordingObjectActionCandidate | null>(() => {
    if (!route?.id || route.storage_state !== "ready") return null;
    return {
      objectKind: "route",
      objectId: route.id,
      label: route.name,
      category: (route as { activity_category?: string | null }).activity_category,
      ...(routeFull === undefined
        ? {}
        : { canReadGeometry: Boolean(routeFull.coordinates?.length) }),
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

  const handleAttachToCalendarEvent = () => {
    if (!route) return;
    router.navigate({
      pathname: "/event-detail",
      params: {
        date: format(new Date(), "yyyy-MM-dd"),
        mode: "create",
        routeId: route.id,
        routeName: route.name,
      },
    });
  };

  const canShare = route?.storage_state === "ready";

  const handleShare = async () => {
    if (!route) return;
    if (!canShare) return;
    if (!route.is_public) {
      Alert.alert(
        "Not public",
        "Only public routes have a share link. Make this route public first.",
      );
      return;
    }
    const url = getPublicShareUrl(`/share/routes/${route.id}`);
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert("Share failed", "Could not open the share sheet. Please try again.");
    }
  };

  const renderOptionsMenu = () => {
    if (isDeletionPending) {
      return isOwner ? (
        <DetailOverflowMenu
          actions={[
            {
              label: "Retry Route Deletion",
              onPress: handleDelete,
              testID: "route-detail-options-delete",
              variant: "destructive" as const,
            },
          ]}
          testID="route-detail-options-trigger"
        />
      ) : null;
    }

    return (
      <DetailOverflowMenu
        actions={[
          {
            disabled: recordingAction?.primaryAction === "disabled" || !recordingAction?.command,
            label: recordingAction?.label ?? "Start Activity",
            onPress: handleRecordingAction,
            testID: "route-detail-options-recording",
          },
          {
            label: "Add to Calendar",
            onPress: handleAttachToCalendarEvent,
            testID: "route-detail-options-attach-calendar-event",
          },
          ...(isOwner
            ? [
                {
                  label: "Edit Route",
                  onPress: () => router.navigate(ROUTES.ROUTES.EDIT(route.id) as never),
                  testID: "route-detail-options-edit",
                },
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
        {...omitUndefined({
          headerAccessory: canShare ? (
            <ResourceCardActionButton
              accessibilityLabel="Share route"
              onPress={() => void handleShare()}
              testID="route-detail-share-button"
            >
              <Icon as={Share2} size={20} className="text-foreground" />
            </ResourceCardActionButton>
          ) : undefined,
        })}
        route={omitUndefined(route)}
        {...omitUndefined({
          routeFull:
            isDeletionPending || routeFull === undefined
              ? undefined
              : omitUndefined({
                  coordinates: routeFull.coordinates?.map((coordinate) =>
                    omitUndefined(coordinate),
                  ),
                }),
        })}
        isLiked={routeLike.isLiked}
        likeCount={routeLike.likeCount}
        likePending={routeLike.isPending}
        commentCount={comments.commentCount}
        onCommentPress={() => {
          if (!isDeletionPending && route?.id) {
            entityCommentsSheet?.openEntityComments({ entityId: route.id, entityType: "route" });
          }
        }}
        onLikePress={handleToggleLike}
        showLike={!isDeletionPending}
        variant={isDeletionPending ? "list" : "detail"}
      />

      {isDeletionPending ? (
        <EmptyState
          actionLabel="Retry deletion"
          description="The route file could not be removed yet. Retry deletion to finish removing this route."
          onAction={handleDelete}
          testID="route-detail-deletion-pending"
          title="Route deletion pending"
        />
      ) : elevationStreams ? (
        <ElevationProfileChart
          elevationStream={elevationStreams.elevationStream}
          distanceStream={elevationStreams.distanceStream}
          height={150}
          showStats={false}
          showHeader={false}
        />
      ) : !shouldLoadGeometry || isFetchingRouteFull ? (
        <LoadingState message="Loading route geometry..." />
      ) : (
        <EmptyState
          description="This route does not have enough elevation data to draw a profile."
          title="No elevation profile"
        />
      )}
    </DetailScaffold>
  );
}
