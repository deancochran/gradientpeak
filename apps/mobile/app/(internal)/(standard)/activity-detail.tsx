import type { ContentVisibility } from "@repo/core";
import { type ActivityLapRecord, parseActivityLapRecords } from "@repo/core/schemas";
import {
  formatDisplayUnitValue,
  type PreferredUnitSystem,
  toDisplayUnitValue,
} from "@repo/core/units";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Text } from "@repo/ui/components/text";
import { getNormalizedPowerPresentation } from "@repo/ui/lib/normalized-power-presentation";
import { skipToken, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, Lock, Waves } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from "react-native";
import { ActivityPlanComparison, ZoneDistributionCard } from "@/components/activity";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { StreamChart } from "@/components/activity/charts/StreamChart";
import { ActivityRouteMap } from "@/components/activity/maps/ActivityRouteMap";
import { SessionRpeCard } from "@/components/activity/SessionRpeCard";
import {
  getStreamStats,
  useActivityDetailStreams,
} from "@/components/activity/useActivityDetailStreams";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ActivityCard } from "@/components/shared/ActivityCard";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  DetailScaffold,
} from "@/components/shared/detail";
import { RouteCard } from "@/components/shared/RouteCard";
import { useEntityCommentsSheet } from "@/components/social/EntityCommentsSheetProvider";
import { getCommonLoadPresentation } from "@/lib/activity-load-presentation";
import {
  getStreamArtifactMessage,
  presentActivityStreamAnalysis,
} from "@/lib/activity-stream-presentation";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import {
  formatPaceSecondsPerKilometer,
  formatSpeedMetersPerSecond,
} from "@/lib/display/formatters";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { omitUndefined } from "@/lib/omitUndefined";
import { getPublicShareUrl } from "@/lib/share/public-share-url";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatEffortValue(value: number, unit: string) {
  if (unit === "watts") return `${Math.round(value)} W`;
  if (unit === "bpm") return `${Math.round(value)} bpm`;
  if (unit === "meters_per_second") return `${value.toFixed(2)} m/s`;
  return `${value.toFixed(2)} ${unit}`;
}

const VISIBILITY_LABELS: Record<ContentVisibility, string> = {
  private: "Private",
  followers: "Followers",
  public: "Public",
};

const ACTIVITY_DETAIL_TABS = ["overview", "breakdown", "analysis"] as const;
type ActivityDetailTab = (typeof ACTIVITY_DETAIL_TABS)[number];

function formatPace(metersPerSecond: number, preferredUnitSystem: PreferredUnitSystem): string {
  if (metersPerSecond === 0) return "0:00";
  return formatPaceSecondsPerKilometer(1000 / metersPerSecond, { preferredUnitSystem });
}

function formatSpeed(metersPerSecond: number, preferredUnitSystem: PreferredUnitSystem): string {
  return formatSpeedMetersPerSecond(metersPerSecond, { preferredUnitSystem });
}

function formatSwimPace(metersPerSecond: number, preferredUnitSystem: PreferredUnitSystem): string {
  if (metersPerSecond === 0) return "0:00";
  return formatDisplayUnitValue(
    toDisplayUnitValue(
      {
        dimension: "swimming_pace",
        value: 100 / metersPerSecond,
        unit: "seconds_per_100_meters",
      },
      preferredUnitSystem,
    ),
  );
}

function formatSegmentCategory(activityCategory: string | null): string {
  if (!activityCategory) return "Activity";
  return activityCategory[0]?.toUpperCase() + activityCategory.slice(1);
}

function VisualStateCard({
  message,
  state = "empty",
  testID,
  title,
}: {
  message: string;
  state?: "empty" | "error" | "loading" | "private";
  testID?: string;
  title: string;
}) {
  return (
    <Card testID={testID}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-6">
        <View className="items-center gap-3">
          {state === "loading" ? <ActivityIndicator size="small" className="text-primary" /> : null}
          {state === "error" ? (
            <Icon as={Activity} size={32} className="text-destructive/50" />
          ) : null}
          {state === "private" ? (
            <Icon as={Lock} size={32} className="text-muted-foreground/60" />
          ) : null}
          <Text className="text-center text-sm text-muted-foreground">{message}</Text>
        </View>
      </CardContent>
    </Card>
  );
}

function getIngestionMessage(
  ingestion: unknown,
): { state: "error" | "loading"; message: string } | null {
  const status =
    typeof (ingestion as { status?: unknown } | null)?.status === "string"
      ? (ingestion as { status: string }).status
      : null;

  if (!status || status === "ready" || status === "succeeded") {
    return null;
  }

  if (status === "failed") {
    const lastError = (ingestion as { last_error_message?: unknown } | null)?.last_error_message;
    return {
      state: "error",
      message:
        typeof lastError === "string" && lastError.trim().length > 0
          ? `Activity processing failed: ${lastError}`
          : "Activity processing failed. The original recording is still available for retry.",
    };
  }

  if (status === "pending_upload") {
    return { state: "loading", message: "Activity file is queued for upload." };
  }

  return { state: "loading", message: "Activity file is still processing." };
}

type LapDisplayEntry = {
  distance: number;
  duration: number;
  index: number;
  metricLabel: string;
  performance: number;
  widthPercent: number;
};

function readLapDistance(lap: ActivityLapRecord): number {
  const value = lap?.totalDistance ?? lap?.distance ?? lap?.distanceMeters ?? lap?.distance_meters;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function readLapDuration(lap: ActivityLapRecord): number {
  const value =
    lap?.totalTimerTime ??
    lap?.totalElapsedTime ??
    lap?.totalTime ??
    lap?.duration ??
    lap?.durationSeconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function readLapSpeed(lap: ActivityLapRecord, distance: number, duration: number): number {
  const value = lap?.avgSpeed ?? lap?.averageSpeed ?? lap?.avg_speed;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  return distance > 0 && duration > 0 ? distance / duration : 0;
}

function formatLapMetric(
  activityCategory: string | null | undefined,
  metersPerSecond: number,
  preferredUnitSystem: PreferredUnitSystem,
): string {
  if (metersPerSecond <= 0) return "--";
  if (activityCategory === "run") return formatPace(metersPerSecond, preferredUnitSystem);
  if (activityCategory === "swim") return formatSwimPace(metersPerSecond, preferredUnitSystem);
  return formatSpeed(metersPerSecond, preferredUnitSystem);
}

function formatLapMetricValue(
  activityCategory: string | null | undefined,
  metersPerSecond: number,
  preferredUnitSystem: PreferredUnitSystem,
): string {
  return (
    formatLapMetric(activityCategory, metersPerSecond, preferredUnitSystem).split(/[\s/]/)[0] ??
    "--"
  );
}

function getLapIndexLabel(
  activityCategory: string | null | undefined,
  laps: LapDisplayEntry[],
  preferredUnitSystem: PreferredUnitSystem,
): string {
  if (activityCategory === "run" || activityCategory === "walk" || activityCategory === "hike") {
    return preferredUnitSystem === "imperial" ? "Mi" : "Km";
  }
  if (activityCategory === "swim") return "Len";

  const hasDistanceSplits = laps.some((lap) => lap.distance > 0);
  return hasDistanceSplits ? (preferredUnitSystem === "imperial" ? "Mi" : "Km") : "Lap";
}

function getLapMetricLabel(activityCategory: string | null | undefined): string {
  if (
    activityCategory === "run" ||
    activityCategory === "swim" ||
    activityCategory === "walk" ||
    activityCategory === "hike"
  ) {
    return "Pace";
  }

  return "Speed";
}

function buildLapDisplayEntries(
  laps: ActivityLapRecord[],
  activityCategory: string | null | undefined,
  preferredUnitSystem: PreferredUnitSystem,
): LapDisplayEntry[] {
  const baseEntries = laps
    .map((lap, index) => {
      const distance = readLapDistance(lap);
      const duration = readLapDuration(lap);
      const speed = readLapSpeed(lap, distance, duration);

      return {
        distance,
        duration,
        index,
        metricLabel: formatLapMetricValue(activityCategory, speed, preferredUnitSystem),
        performance: speed > 0 ? speed : duration > 0 ? 1 / duration : 0,
      };
    })
    .filter((lap) => lap.duration > 0 || lap.distance > 0);

  const maxPerformance = baseEntries.reduce((max, lap) => Math.max(max, lap.performance), 0);

  return baseEntries.map((lap) => ({
    ...lap,
    widthPercent: maxPerformance > 0 ? Math.max(18, (lap.performance / maxPerformance) * 100) : 18,
  }));
}

function LapVisualizationCard({
  activityCategory,
  laps,
  preferredUnitSystem,
}: {
  activityCategory?: string | null;
  laps: ActivityLapRecord[];
  preferredUnitSystem: PreferredUnitSystem;
}) {
  const displayLaps = useMemo(
    () => buildLapDisplayEntries(laps, activityCategory, preferredUnitSystem),
    [activityCategory, laps, preferredUnitSystem],
  );

  if (displayLaps.length === 0) {
    return <VisualStateCard title="Laps" message="No lap data is available for this activity." />;
  }

  const lapIndexLabel = getLapIndexLabel(activityCategory, displayLaps, preferredUnitSystem);
  const lapMetricLabel = getLapMetricLabel(activityCategory);

  return (
    <Card testID="lap-visualization-card">
      <CardHeader>
        <CardTitle>Laps ({displayLaps.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <View className="mb-3 flex-row items-center border-b border-border pb-3">
          <Text className="w-10 text-xs font-medium text-muted-foreground">{lapIndexLabel}</Text>
          <Text className="w-16 text-xs font-medium text-muted-foreground">{lapMetricLabel}</Text>
          <View className="flex-1" />
          <Text className="w-14 text-right text-xs font-medium text-muted-foreground">Time</Text>
        </View>

        <View className="gap-1.5">
          {displayLaps.map((lap) => (
            <View key={lap.index} className="flex-row items-center">
              <Text className="w-10 text-sm font-medium text-foreground">{lap.index + 1}</Text>
              <Text className="w-16 text-sm font-medium text-foreground">{lap.metricLabel}</Text>
              <View className="h-8 flex-1 justify-center pr-3">
                <View
                  className="h-7 rounded-lg bg-primary/80"
                  style={{ width: `${lap.widthPercent}%` }}
                />
              </View>
              <Text className="w-14 text-right text-sm font-medium text-foreground">
                {formatDuration(Math.round(lap.duration))}
              </Text>
            </View>
          ))}
        </View>
      </CardContent>
    </Card>
  );
}

function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const preferredUnitSystem = usePreferredUnitSystem();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = api.useUtils();
  const tanstackQueryClient = useQueryClient();

  // Fetch activity data
  const {
    data: activityData,
    isError: isActivityError,
    isLoading: isLoadingActivity,
  } = api.activities.getById.useQuery(id ? { id } : skipToken, { enabled: !!id });
  const effortsQuery = api.activities.getEfforts.useQuery(id ? { id } : skipToken, {
    enabled: !!id,
  });
  const ownedActivitiesQuery = api.activities.listPaginated.useQuery({ limit: 20 });

  const detail = activityData?.detail;
  const activity = detail?.summary;
  const linkedActivityPlanId = detail?.linkedPlan?.id;
  const { data: linkedActivityPlan } = api.activityPlans.getById.useQuery(
    linkedActivityPlanId ? { id: linkedActivityPlanId } : skipToken,
    { enabled: !!linkedActivityPlanId },
  );
  const orderedSegments = useMemo(
    () => [...(detail?.segments ?? [])].sort((left, right) => left.ordinal - right.ordinal),
    [detail?.segments],
  );
  const activitySegments = useMemo(
    () => orderedSegments.filter((segment) => segment.role === "activity"),
    [orderedSegments],
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const selectedActivitySegment =
    activitySegments.find((segment) => segment.id === selectedSegmentId) ?? activitySegments[0];
  const activityCategory = selectedActivitySegment?.activityCategory ?? null;
  const selectedSegmentSummary =
    selectedActivitySegment?.status === "available" ? selectedActivitySegment.summary : null;
  const hasMultipleActivityLegs = activitySegments.length > 1;
  const hasNoActivityLegs = detail !== undefined && activitySegments.length === 0;

  // A new activity, or a refreshed detail response that removed a selected leg, must not retain
  // a selection (and therefore streams or metrics) from the previous activity or leg.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Activity identity also resets selection when an unchanged segment array is reused.
  useEffect(() => {
    setSelectedSegmentId((currentSegmentId) =>
      currentSegmentId && activitySegments.some((segment) => segment.id === currentSegmentId)
        ? currentSegmentId
        : (activitySegments[0]?.id ?? null),
    );
  }, [activity?.id, activitySegments]);

  const normalizedPowerPresentation = getNormalizedPowerPresentation(
    selectedSegmentSummary?.normalizedPowerResult
      ? selectedSegmentSummary.normalizedPowerResult
      : undefined,
  );
  const derived = activityData?.analysis.derived;
  const commonLoadPresentation = getCommonLoadPresentation(derived?.stress.common_load, {
    hasHeartRateSummary:
      typeof detail?.performance.averageHeartRate === "number" &&
      detail.performance.averageHeartRate > 0,
    segmentCommonLoads: activityData?.analysis.segmentLoads.map((segment) => segment.common_load),
  });
  const loadUnavailableText = commonLoadPresentation?.diagnostic
    ? null
    : "Compatible activity data is unavailable.";

  const isOwner = activity?.capabilities.canEdit ?? false;
  const completedActivityProvidersQuery =
    api.activities.getCompletedActivityProviderEligibility.useQuery(
      id && isOwner ? { activityId: id } : skipToken,
      {
        enabled: Boolean(id && isOwner),
        refetchInterval: (query) =>
          query.state.data?.some(
            (provider) => provider.status === "queued" || provider.status === "running",
          )
            ? 5_000
            : false,
      },
    );
  const stravaCompletedActivity = completedActivityProvidersQuery.data?.find(
    (provider) => provider.provider === "strava",
  );

  // Fetch streams if an activity file exists
  const activityId = activity?.id;
  const currentArtifact = detail?.currentArtifact;
  const activityFilePath = currentArtifact?.availability === "accepted" ? currentArtifact.id : null;
  const [shouldLoadDetailedStreams, setShouldLoadDetailedStreams] = useState(false);
  const canLoadDetailedStreams =
    !!activityFilePath && !!activityId && isOwner && !!selectedActivitySegment;

  useEffect(() => {
    setShouldLoadDetailedStreams(false);
    if (!canLoadDetailedStreams) {
      return;
    }

    const idleCallback = requestIdleCallback(() => {
      setShouldLoadDetailedStreams(true);
    });

    return () => cancelIdleCallback(idleCallback);
  }, [canLoadDetailedStreams]);

  const {
    data: streamsData,
    isLoading: isLoadingStreams,
    error: streamsError,
  } = api.activityFiles.getStreams.useQuery(
    canLoadDetailedStreams && selectedActivitySegment
      ? {
          activityId: activityId,
          scope: { type: "segment" as const, segmentId: selectedActivitySegment.id },
        }
      : skipToken,
    {
      enabled: shouldLoadDetailedStreams && canLoadDetailedStreams,
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  );

  // Delete mutation
  const deleteMutation = api.activities.delete.useMutation({
    onSuccess: async () => {
      const deletedActivity = { id: activity?.id ?? id };
      queryClient.activities.getById.setData(deletedActivity, undefined);
      await queryClient.activities.getById.reset(deletedActivity);
      await queryClient.activities.getById.invalidate(deletedActivity);
      queryClient.activities.invalidate();
      queryClient.athleteIntelligence.getReadModel.invalidate();
      void invalidatePostActivityIngestionQueries(tanstackQueryClient);
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to delete activity: ${error.message}`);
    },
  });

  // Privacy toggle mutation
  const updatePrivacyMutation = api.activities.update.useMutation({
    onSuccess: () => {
      queryClient.activities.invalidate();
      queryClient.feed.getFeed.invalidate();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to update visibility: ${error.message}`);
    },
  });

  const activityLike = useResourceLike({
    entityId: activity?.id ?? "",
    entityType: "activity",
    ...(activity?.engagement.likes === undefined
      ? {}
      : { initialCount: activity.engagement.likes }),
    ...(activity?.engagement.viewerHasLiked === undefined
      ? {}
      : { initialLiked: activity.engagement.viewerHasLiked }),
  });

  const handleLikeToggle = () => {
    if (!activity) return;
    activityLike.toggleLike();
  };

  const comments = useEntityCommentsController({
    entityId: activity?.id ?? "",
    entityType: "activity",
  });
  const entityCommentsSheet = useEntityCommentsSheet();
  const [activeTab, setActiveTab] = useState<ActivityDetailTab>("overview");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [importedSourcesExpanded, setImportedSourcesExpanded] = useState(false);
  const resolveImportedSourceMutation = api.activities.resolveImportedSource.useMutation({
    onSuccess: () => queryClient.activities.getById.invalidate({ id: activity?.id ?? id }),
    onError: () => Alert.alert("Error", "Imported source could not be updated."),
  });
  const keepImportedSourceSeparateMutation = api.activities.keepImportedSourceSeparate.useMutation({
    onSuccess: () => queryClient.activities.getById.invalidate({ id: activity?.id ?? id }),
    onError: () => Alert.alert("Error", "Separate activity could not be queued."),
  });
  const sendCompletedActivityMutation = api.activities.sendCompletedActivityToProvider.useMutation({
    retry: false,
    onSuccess: (result) => {
      if (result.status === "queued")
        Alert.alert("Queued", "Your activity will be sent to Strava.");
      else if (result.status === "completed")
        Alert.alert("Sent", "This activity is already on Strava.");
      else if (result.status === "reconnect_required") {
        Alert.alert(
          "Reconnect Strava",
          "Grant activity upload access before sending this activity.",
        );
      } else if (result.status === "dispatch_uncertain") {
        Alert.alert(
          "Upload outcome uncertain",
          "GradientPeak will not automatically upload this activity again.",
        );
      } else Alert.alert("Unable to send", "This activity could not be sent to Strava.");
      if (id) {
        void queryClient.activities.getCompletedActivityProviderEligibility.invalidate({
          activityId: id,
        });
      }
    },
    onError: (error) => Alert.alert("Unable to send", error.message),
  });

  const handleDelete = () => {
    if (!activity) return;
    setShowDeleteConfirm(true);
  };

  const contentVisibility = activity?.visibility ?? "private";

  const handleChangeVisibility = () => {
    if (!activity || !isOwner) return;
    Alert.alert(
      "Change visibility",
      `Current visibility is ${VISIBILITY_LABELS[contentVisibility]}.`,
      [
        {
          text: "Private",
          onPress: () =>
            updatePrivacyMutation.mutate({ id: activity.id, content_visibility: "private" }),
        },
        {
          text: "Followers",
          onPress: () =>
            updatePrivacyMutation.mutate({ id: activity.id, content_visibility: "followers" }),
        },
        {
          text: "Public",
          onPress: () =>
            updatePrivacyMutation.mutate({ id: activity.id, content_visibility: "public" }),
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const handleShare = () => {
    if (!activity) return;
    if (contentVisibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public activities have a share link. Change visibility to Public first.",
      );
      return;
    }
    void Share.share({
      message: getPublicShareUrl(`/share/activities/${activity.id}`),
      url: getPublicShareUrl(`/share/activities/${activity.id}`),
    });
  };

  // Do not render a previous leg's response while a newly selected leg is loading.
  const scopedStreamsData = isLoadingStreams ? undefined : streamsData;
  const { chartStreams, distanceStream, elevationStream, routeCoordinates } =
    useActivityDetailStreams({
      activity: activity
        ? {
            id: activity.id,
            polyline: hasMultipleActivityLegs ? null : (detail?.routePolyline ?? null),
            type: activityCategory,
          }
        : null,
      streamsData: scopedStreamsData
        ? omitUndefined({
            records: scopedStreamsData.records?.map((record) => omitUndefined(record)),
          })
        : scopedStreamsData,
    });
  const isPreparingDetailedContent = canLoadDetailedStreams && !shouldLoadDetailedStreams;
  const isDetailedContentLoading =
    !streamsError && (isPreparingDetailedContent || isLoadingStreams);
  const detailedContentPrivateMessage =
    "Detailed streams are private to the activity owner. Summary metrics are still visible.";
  const shouldShowPrivateStreamMessage = !!activityFilePath && !isOwner;

  const streamPresentation = scopedStreamsData?.analysis
    ? presentActivityStreamAnalysis(scopedStreamsData.analysis)
    : null;

  // Get laps
  const laps = parseActivityLapRecords(
    scopedStreamsData?.laps ?? (activitySegments.length <= 1 ? detail?.laps : []),
  );
  const ingestionMessage = getIngestionMessage(
    detail?.ingestion
      ? { status: detail.ingestion.status, last_error_message: detail.ingestion.lastErrorMessage }
      : null,
  );

  // Loading skeleton
  if (isActivityError) {
    return (
      <DetailScaffold
        isLoading={false}
        loadingTestID="activity-detail-loading"
        notFound
        notFoundDescription="This activity may have been removed."
        notFoundOnActionPress={() => router.back()}
        notFoundTestID="activity-detail-not-found"
        notFoundTitle="Activity not found"
      >
        {null}
      </DetailScaffold>
    );
  }

  if (isLoadingActivity || !activity) {
    return (
      <ScrollView className="flex-1 bg-background" testID="activity-detail-loading">
        <View className="p-4 gap-4">
          <Skeleton className="h-48 w-full bg-muted" />
          <View className="flex-row gap-2">
            <Skeleton className="flex-1 h-24 bg-muted" />
            <Skeleton className="flex-1 h-24 bg-muted" />
          </View>
          <Skeleton className="h-64 w-full bg-muted" />
        </View>
      </ScrollView>
    );
  }

  const renderHeaderActions = () => {
    return (
      <View className="flex-row items-center">
        {isOwner ? (
          <DetailOverflowMenu
            actions={[
              ...(stravaCompletedActivity?.status === "ready"
                ? [
                    {
                      disabled: sendCompletedActivityMutation.isPending,
                      label: sendCompletedActivityMutation.isPending
                        ? "Sending to Strava..."
                        : "Send to Strava",
                      onPress: () =>
                        sendCompletedActivityMutation.mutate({
                          activityId: activity.id,
                          provider: "strava",
                        }),
                      testID: "activity-detail-options-send-strava",
                    },
                  ]
                : []),
              {
                disabled: updatePrivacyMutation.isPending,
                label: "Change visibility",
                onPress: handleChangeVisibility,
                testID: "activity-detail-options-visibility",
              },
              {
                label: deleteMutation.isPending ? "Deleting..." : "Delete Activity",
                onPress: handleDelete,
                testID: "activity-detail-options-delete",
                variant: "destructive",
              },
            ]}
            testID="activity-detail-options-trigger"
          />
        ) : null}
      </View>
    );
  };

  const comparisonDuration =
    detail?.performance.activeSeconds ?? detail?.performance.elapsedSeconds;

  return (
    <View className="flex-1 bg-background" testID="activity-detail-screen">
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
      <ScrollView className="flex-1 bg-background">
        <View className="p-4 gap-4">
          <View className="gap-2" testID="activity-detail-header">
            <ActivityCard
              activity={activity}
              commentCount={comments.commentCount}
              isLiked={activityLike.isLiked}
              likeCount={activityLike.likeCount}
              likePending={activityLike.isPending}
              onCommentPress={() => {
                if (activity?.id) {
                  entityCommentsSheet?.openEntityComments({
                    entityId: activity.id,
                    entityType: "activity",
                  });
                }
              }}
              onLikePress={handleLikeToggle}
              onSharePress={handleShare}
              testID="activity-detail-summary"
            />
            {isOwner && stravaCompletedActivity?.status === "reconnect_required" ? (
              <Pressable
                accessibilityRole="button"
                className="rounded-xl border border-border bg-muted/30 px-4 py-3"
                onPress={() => router.navigate(ROUTES.INTEGRATIONS)}
                testID="activity-detail-strava-reconnect"
              >
                <Text className="text-sm text-foreground">
                  {stravaCompletedActivity.reason} Open integrations to reconnect.
                </Text>
              </Pressable>
            ) : null}
            {isOwner &&
            ["queued", "running", "completed", "dispatch_uncertain", "failed"].includes(
              stravaCompletedActivity?.status ?? "",
            ) ? (
              <View
                className="rounded-xl border border-border bg-muted/30 px-4 py-3"
                testID="activity-detail-strava-upload-status"
              >
                <Text className="text-sm text-foreground">{stravaCompletedActivity?.reason}</Text>
              </View>
            ) : null}
          </View>

          {hasNoActivityLegs ? (
            <VisualStateCard
              message="No recorded activity segment is available for detailed analysis."
              testID="activity-no-recorded-segment"
              title="Recorded segments"
            />
          ) : orderedSegments.length > 1 && activitySegments.length > 0 ? (
            <Card testID="activity-segment-selector">
              <CardHeader>
                <CardTitle>Recorded segments</CardTitle>
              </CardHeader>
              <CardContent className="gap-2">
                {orderedSegments.map((segment) => {
                  const activityLegIndex = activitySegments.findIndex(
                    (activitySegment) => activitySegment.id === segment.id,
                  );
                  const isActivityLeg = segment.role === "activity";
                  const isSelected = selectedActivitySegment?.id === segment.id;
                  const label = isActivityLeg
                    ? `Leg ${activityLegIndex + 1} · ${formatSegmentCategory(segment.activityCategory)}`
                    : segment.role === "transition"
                      ? "Transition"
                      : segment.role === "rest"
                        ? "Rest"
                        : "Unclassified segment";
                  const activeMs =
                    segment.status === "available" && "activeMs" in segment.summary.timing
                      ? segment.summary.timing.activeMs
                      : undefined;

                  return isActivityLeg ? (
                    <Pressable
                      accessibilityLabel={`Select ${label}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      className={
                        isSelected
                          ? "rounded-xl border border-primary bg-primary/10 px-3 py-3"
                          : "rounded-xl border border-border px-3 py-3"
                      }
                      key={segment.id}
                      onPress={() => setSelectedSegmentId(segment.id)}
                      testID={`activity-segment-select-${segment.id}`}
                    >
                      <Text className="font-medium text-foreground">{label}</Text>
                      {activeMs === undefined ? null : (
                        <Text className="mt-1 text-xs text-muted-foreground">
                          Active {formatDuration(Math.round(activeMs / 1_000))}
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <View
                      accessibilityLabel={label}
                      accessibilityRole="text"
                      className="rounded-xl border border-border bg-muted/30 px-3 py-3"
                      key={segment.id}
                      testID={`activity-segment-boundary-${segment.id}`}
                    >
                      <Text className="font-medium text-muted-foreground">{label}</Text>
                      {activeMs === undefined ? null : (
                        <Text className="mt-1 text-xs text-muted-foreground">
                          Active {formatDuration(Math.round(activeMs / 1_000))}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <Tabs
            accessibilityLabel="Activity detail sections"
            onValueChange={(tab) => setActiveTab(tab as ActivityDetailTab)}
            value={activeTab}
          >
            <TabsList className="flex-row rounded-2xl border border-border bg-muted/40 p-1">
              {ACTIVITY_DETAIL_TABS.map((tab) => {
                const selected = activeTab === tab;
                const label = tab[0]?.toUpperCase() + tab.slice(1);

                return (
                  <TabsTrigger
                    accessibilityState={{ selected }}
                    className={
                      selected
                        ? "flex-1 rounded-xl bg-background px-3 py-2 shadow-sm"
                        : "flex-1 rounded-xl px-3 py-2"
                    }
                    key={tab}
                    testId={`activity-detail-tab-${tab}`}
                    value={tab}
                  >
                    <Text
                      className={
                        selected
                          ? "text-center text-sm font-semibold text-foreground"
                          : "text-center text-sm font-semibold text-muted-foreground"
                      }
                    >
                      {label}
                    </Text>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {activeTab === "overview" ? (
            isOwner ? (
              <SessionRpeCard
                activityId={activity.id}
                effectiveSessionRpe={detail?.effectiveSessionRpe ?? null}
              />
            ) : null
          ) : null}

          {activeTab === "overview" && detail?.linkedRoute ? (
            <RouteCard
              onPress={() => router.navigate(ROUTES.ROUTES.DETAIL(detail.linkedRoute?.id ?? ""))}
              route={detail.linkedRoute}
              showAttribution={false}
              showLike={false}
              testID={`activity-detail-linked-route-${detail.linkedRoute.id}`}
              variant="compact"
            />
          ) : null}

          {activeTab === "overview" ? (
            routeCoordinates.length > 0 ? (
              <ActivityRouteMap coordinates={routeCoordinates} height={260} title="Route" />
            ) : isDetailedContentLoading ? (
              <VisualStateCard title="Route" state="loading" message="Loading route data..." />
            ) : shouldShowPrivateStreamMessage ? (
              <VisualStateCard
                title="Route"
                state="private"
                message={detailedContentPrivateMessage}
              />
            ) : (
              <VisualStateCard
                title="Route"
                message="No route data is available for this activity."
              />
            )
          ) : null}

          {/* Laps */}
          {activeTab === "breakdown" ? (
            isDetailedContentLoading ? (
              <VisualStateCard title="Laps" state="loading" message="Loading lap data..." />
            ) : shouldShowPrivateStreamMessage ? (
              <VisualStateCard
                title="Laps"
                state="private"
                message={detailedContentPrivateMessage}
              />
            ) : laps.length > 0 ? (
              <LapVisualizationCard
                activityCategory={activityCategory ?? "other"}
                laps={laps}
                preferredUnitSystem={preferredUnitSystem}
              />
            ) : (
              <VisualStateCard title="Laps" message="No lap data is available for this activity." />
            )
          ) : null}

          {activeTab === "analysis" ? (
            elevationStream ? (
              <ElevationProfileChart
                elevationStream={elevationStream}
                {...(distanceStream == null ? {} : { distanceStream })}
                preferredUnitSystem={preferredUnitSystem}
                title="Elevation Profile"
                height={200}
              />
            ) : isDetailedContentLoading ? (
              <VisualStateCard
                title="Elevation Profile"
                state="loading"
                message="Loading elevation data..."
              />
            ) : shouldShowPrivateStreamMessage ? (
              <VisualStateCard
                title="Elevation Profile"
                state="private"
                message={detailedContentPrivateMessage}
              />
            ) : (
              <VisualStateCard
                title="Elevation Profile"
                message="No elevation data is available for this activity."
              />
            )
          ) : null}

          {activeTab === "overview" &&
          detail?.linkedPlan &&
          linkedActivityPlan?.detail &&
          comparisonDuration !== null &&
          comparisonDuration !== undefined ? (
            <ActivityPlanComparison
              activityPlan={{
                id: linkedActivityPlan.detail.id,
                name: linkedActivityPlan.detail.name,
                structure: linkedActivityPlan.detail.structure,
                metrics: linkedActivityPlan.detail.metrics,
              }}
              actualMetrics={{
                duration: comparisonDuration,
                ...(derived?.stress.common_load === undefined
                  ? {}
                  : { observationQuantification: derived.observationQuantification }),
              }}
              onPress={() => {
                router.navigate(ROUTES.PLAN.PLAN_DETAIL(detail.linkedPlan?.id ?? ""));
              }}
            />
          ) : null}

          {/* Swim Metrics */}
          {activeTab === "breakdown" && activityCategory === "swim" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex-row items-center gap-2">
                  <Icon as={Waves} size={20} className="text-blue-500" />
                  Swim Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <View className="flex-row justify-between">
                  <View className="items-center">
                    <Text className="text-2xl font-bold">
                      {typeof selectedSegmentSummary?.swim?.poolLengthMeters === "number"
                        ? formatDisplayUnitValue(
                            toDisplayUnitValue(
                              {
                                dimension: "pool_length",
                                value: selectedSegmentSummary.swim.poolLengthMeters,
                                unit: "meters",
                              },
                              preferredUnitSystem,
                            ),
                          )
                        : activitySegments.length <= 1 &&
                            typeof detail?.performance.poolLengthMeters === "number"
                          ? formatDisplayUnitValue(
                              toDisplayUnitValue(
                                {
                                  dimension: "pool_length",
                                  value: detail.performance.poolLengthMeters,
                                  unit: "meters",
                                },
                                preferredUnitSystem,
                              ),
                            )
                          : "--"}
                    </Text>
                    <Text className="text-xs text-muted-foreground uppercase">Pool</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold">
                      {selectedSegmentSummary?.swim?.strokeCount ??
                        (activitySegments.length <= 1 ? detail?.performance.totalStrokes : null) ??
                        "--"}
                    </Text>
                    <Text className="text-xs text-muted-foreground uppercase">Strokes</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold">
                      {selectedSegmentSummary?.swim?.averageSwolf ??
                        (activitySegments.length <= 1 ? detail?.performance.averageSwolf : null) ??
                        "--"}
                    </Text>
                    <Text className="text-xs text-muted-foreground uppercase">Swolf</Text>
                  </View>
                </View>
              </CardContent>
            </Card>
          ) : null}

          {/* Canonical Common Load and its normalized intensity are the summary authority. */}
          {activeTab === "breakdown" && (commonLoadPresentation || derived?.stress.common_load) ? (
            <Card>
              <CardHeader>
                <CardTitle>Load & Intensity</CardTitle>
              </CardHeader>
              <CardContent>
                {commonLoadPresentation?.load ? (
                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">Load</Text>
                      <Text className="text-3xl font-bold">{commonLoadPresentation.load}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">
                        Intensity
                      </Text>
                      <Text className="text-lg font-bold">
                        {commonLoadPresentation.intensity ?? "—"}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text className="text-sm text-muted-foreground">
                    {commonLoadPresentation?.diagnostic
                      ? `${commonLoadPresentation.diagnostic.summary} ${commonLoadPresentation.diagnostic.action}`
                      : commonLoadPresentation?.unavailableText
                        ? `${commonLoadPresentation.unavailableText}. ${loadUnavailableText}`
                        : loadUnavailableText}
                  </Text>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "breakdown" ? (
            <Card testID="activity-derived-efforts">
              <CardHeader>
                <CardTitle>Derived Efforts</CardTitle>
              </CardHeader>
              <CardContent className="gap-3">
                {effortsQuery.isLoading ? (
                  <ActivityIndicator size="small" className="text-primary" />
                ) : effortsQuery.isError ? (
                  <Text className="text-sm text-destructive">
                    Derived efforts could not be loaded.
                  </Text>
                ) : effortsQuery.data?.length ? (
                  effortsQuery.data.map((effort) => (
                    <View
                      className="flex-row items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
                      key={effort.id}
                    >
                      <View className="flex-1">
                        <Text className="font-medium capitalize">
                          {effort.activity_category} {effort.effort_type.replaceAll("_", " ")}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {formatDuration(effort.duration_seconds)}
                          {effort.distance_meters ? ` · ${effort.distance_meters} m` : ""}
                        </Text>
                      </View>
                      <Text className="font-semibold">
                        {formatEffortValue(effort.value, effort.unit)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-sm text-muted-foreground">
                    No derived efforts are available for this activity.
                  </Text>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "breakdown" ? (
            activityCategory === "bike" && selectedActivitySegment?.status === "processing" ? (
              <VisualStateCard
                title="Normalized Power"
                state="loading"
                message="Segment analysis is still processing. Normalized Power will appear when analysis completes."
                testID="activity-segment-analysis-processing"
              />
            ) : activityCategory === "bike" && selectedActivitySegment?.status === "failed" ? (
              <VisualStateCard
                title="Normalized Power"
                state="error"
                message={`Segment analysis failed: ${selectedActivitySegment.reason}`}
                testID="activity-segment-analysis-failed"
              />
            ) : activityCategory === "bike" && normalizedPowerPresentation ? (
              <Card testID="activity-normalized-power-card">
                <CardHeader>
                  <CardTitle>{normalizedPowerPresentation.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text className="text-3xl font-bold">
                    {normalizedPowerPresentation.valueWatts === null
                      ? "—"
                      : `${normalizedPowerPresentation.status === "partial" ? "~" : ""}${Math.round(normalizedPowerPresentation.valueWatts)} W`}
                  </Text>
                  <Text className="mt-2 text-xs text-muted-foreground">
                    {normalizedPowerPresentation.evidence}
                  </Text>
                </CardContent>
              </Card>
            ) : null
          ) : null}

          {/* Zones */}
          {activeTab === "analysis" ? (
            ingestionMessage ? (
              <VisualStateCard
                title="Stream Analysis"
                state={ingestionMessage.state}
                message={
                  ingestionMessage.state === "error"
                    ? ingestionMessage.message
                    : getStreamArtifactMessage("processing")
                }
              />
            ) : isDetailedContentLoading ? (
              <VisualStateCard
                title="Stream Analysis"
                state="loading"
                message={getStreamArtifactMessage("loading")}
              />
            ) : streamsError ? (
              <VisualStateCard
                title="Stream Analysis"
                state="error"
                message={getStreamArtifactMessage("error", streamsError.message)}
              />
            ) : shouldShowPrivateStreamMessage ? (
              <VisualStateCard
                title="Stream Analysis"
                state="private"
                message={getStreamArtifactMessage("private")}
              />
            ) : !activityFilePath ? (
              <VisualStateCard
                title="Stream Analysis"
                message={getStreamArtifactMessage("missing")}
              />
            ) : streamPresentation ? (
              <>
                <Card testID="activity-stream-hr-load-card">
                  <CardHeader>
                    <CardTitle>Stream HR Load</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Text className="text-3xl font-bold">
                      {streamPresentation.heartRateLoad.value}
                    </Text>
                    <Text className="mt-2 text-xs text-muted-foreground">
                      {streamPresentation.heartRateLoad.copy} This diagnostic does not replace
                      summary training load.
                    </Text>
                  </CardContent>
                </Card>
                {streamPresentation.distributions.map((distribution) =>
                  distribution.zones.length > 0 ? (
                    <View className="gap-2" key={distribution.key}>
                      <ZoneDistributionCard
                        title={distribution.title}
                        zones={distribution.zones}
                        colors={
                          distribution.key === "power"
                            ? [
                                "bg-gray-400",
                                "bg-blue-400",
                                "bg-green-400",
                                "bg-yellow-400",
                                "bg-orange-400",
                                "bg-red-400",
                                "bg-purple-400",
                              ]
                            : [
                                "bg-blue-400",
                                "bg-green-400",
                                "bg-yellow-400",
                                "bg-orange-400",
                                "bg-red-400",
                              ]
                        }
                        showToggle={true}
                      />
                      <Text className="px-1 text-xs text-muted-foreground">
                        {distribution.qualityCopy}
                      </Text>
                    </View>
                  ) : (
                    <VisualStateCard
                      key={distribution.key}
                      title={distribution.title}
                      message={distribution.qualityCopy}
                    />
                  ),
                )}
              </>
            ) : (
              <VisualStateCard
                title="Stream Analysis"
                state="error"
                message={getStreamArtifactMessage("error")}
              />
            )
          ) : null}

          {/* Analysis Charts */}
          {activeTab === "analysis" ? (
            ingestionMessage ? (
              <VisualStateCard
                title="Analysis Charts"
                state={ingestionMessage.state}
                message={ingestionMessage.message}
              />
            ) : isDetailedContentLoading ? (
              <VisualStateCard
                title="Analysis Charts"
                state="loading"
                message="Loading detailed analysis..."
              />
            ) : streamsError ? (
              <VisualStateCard
                title="Analysis Charts"
                state="error"
                message={`Failed to load analysis: ${streamsError.message}`}
              />
            ) : shouldShowPrivateStreamMessage ? (
              <VisualStateCard
                title="Analysis Charts"
                state="private"
                message={detailedContentPrivateMessage}
              />
            ) : chartStreams.length > 0 ? (
              chartStreams.map((s) => {
                const stats = getStreamStats(s.stream.values);
                return (
                  <View key={s.type}>
                    <StreamChart
                      title={s.label}
                      streams={[s]}
                      xAxisType="time"
                      height={200}
                      showLegend={false}
                    />
                    <View className="flex-row justify-between px-2 mt-2 mb-4">
                      <View className="items-center">
                        <Text className="text-xs text-muted-foreground">Max</Text>
                        <Text className="font-semibold">
                          {Math.round(stats.max)} {s.unit}
                        </Text>
                      </View>
                      <View className="items-center">
                        <Text className="text-xs text-muted-foreground">Avg</Text>
                        <Text className="font-semibold">
                          {Math.round(stats.avg)} {s.unit}
                        </Text>
                      </View>
                      <View className="items-center">
                        <Text className="text-xs text-muted-foreground">Min</Text>
                        <Text className="font-semibold">
                          {Math.round(stats.min)} {s.unit}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <VisualStateCard
                title="Analysis Charts"
                message={
                  currentArtifact
                    ? "No chartable stream data is available for this activity."
                    : "No activity file is available for detailed analysis."
                }
              />
            )
          ) : null}

          {isOwner && activityData?.importedSources?.length ? (
            <Card testID="activity-imported-sources">
              <CardContent className="gap-3 py-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setImportedSourcesExpanded((expanded) => !expanded)}
                >
                  <Text className="font-medium">Imported sources</Text>
                </Pressable>
                {importedSourcesExpanded
                  ? activityData.importedSources.map((source) => (
                      <View className="gap-2 border-t border-border pt-2" key={source.id}>
                        <Text className="text-sm capitalize">
                          {source.provider} ·{" "}
                          {source.resolutionStatus === "review"
                            ? "Needs review"
                            : "Connected source"}
                        </Text>
                        {source.resolutionStatus === "review" ? (
                          <View className="flex-row gap-3">
                            <Pressable
                              disabled={resolveImportedSourceMutation.isPending}
                              onPress={() =>
                                resolveImportedSourceMutation.mutate({
                                  action: "confirm_same",
                                  sourceReferenceId: source.id,
                                })
                              }
                            >
                              <Text className="text-sm font-medium text-primary">
                                Same activity
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={keepImportedSourceSeparateMutation.isPending}
                              onPress={() =>
                                keepImportedSourceSeparateMutation.mutate({
                                  sourceReferenceId: source.id,
                                })
                              }
                            >
                              <Text className="text-sm font-medium text-primary">
                                Keep separate
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={resolveImportedSourceMutation.isPending}
                              onPress={() => {
                                const candidates = (ownedActivitiesQuery.data?.items ?? [])
                                  .filter((candidate) => candidate.id !== activity.id)
                                  .slice(0, 5);
                                Alert.alert(
                                  "Move imported source",
                                  "Attach this source to one of your recent activities.",
                                  [
                                    ...candidates.map((candidate) => ({
                                      text: candidate.title,
                                      onPress: () =>
                                        resolveImportedSourceMutation.mutate({
                                          action: "move",
                                          sourceReferenceId: source.id,
                                          targetActivityId: candidate.id,
                                        }),
                                    })),
                                    { text: "Cancel", style: "cancel" as const },
                                  ],
                                );
                              }}
                            >
                              <Text className="text-sm text-muted-foreground">Move</Text>
                            </Pressable>
                            <Pressable
                              disabled={resolveImportedSourceMutation.isPending}
                              onPress={() =>
                                resolveImportedSourceMutation.mutate({
                                  action: "ignore",
                                  sourceReferenceId: source.id,
                                })
                              }
                            >
                              <Text className="text-sm text-muted-foreground">Ignore</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    ))
                  : null}
              </CardContent>
            </Card>
          ) : null}
        </View>
      </ScrollView>
      {showDeleteConfirm ? (
        <DetailDeleteConfirmModal
          description="Are you sure you want to delete this activity? This action cannot be undone."
          entityLabel="Activity"
          entityName="Activity"
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMutation.mutate({ id: activity.id })}
          pending={deleteMutation.isPending}
          testIDPrefix="activity-detail"
        />
      ) : null}
    </View>
  );
}

export default function ActivityDetailScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityDetailScreen />
    </ErrorBoundary>
  );
}

import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
