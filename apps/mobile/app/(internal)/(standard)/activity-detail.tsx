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
import { Text } from "@repo/ui/components/text";
import { skipToken } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, Heart, Lock, TrendingUp, Waves } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import { ActivityPlanComparison, ZoneDistributionCard } from "@/components/activity";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { StreamChart } from "@/components/activity/charts/StreamChart";
import { ActivityRouteMap } from "@/components/activity/maps/ActivityRouteMap";
import {
  getStreamStats,
  useActivityDetailStreams,
} from "@/components/activity/useActivityDetailStreams";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { DetailDeleteConfirmModal, DetailOverflowMenu } from "@/components/shared/detail";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import {
  formatCalibrationQuality,
  getActivityLoadLabels,
  getThresholdNextAction,
} from "@/lib/activity-load-presentation";
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
import { formatEstimatedIntensityFactor, formatEstimatedTss } from "@/lib/estimatedMetrics";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { useResourceLike } from "@/lib/hooks/useResourceLike";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

const VISIBILITY_LABELS: Record<ContentVisibility, string> = {
  private: "Private",
  followers: "Followers",
  public: "Public",
};

function resolveContentVisibility(activity: {
  content_visibility?: string | null;
  is_private?: boolean;
}) {
  if (
    activity.content_visibility === "private" ||
    activity.content_visibility === "followers" ||
    activity.content_visibility === "public"
  ) {
    return activity.content_visibility;
  }
  return activity.is_private ? "private" : "followers";
}

function getPublicShareUrl(path: string) {
  const origin = (process.env.EXPO_PUBLIC_API_URL ?? "https://gradientpeak.app").replace(/\/$/, "");
  return `${origin}${path}`;
}

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

function VisualStateCard({
  message,
  state = "empty",
  title,
}: {
  message: string;
  state?: "empty" | "error" | "loading" | "private";
  title: string;
}) {
  return (
    <Card>
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

  if (!status || status === "ready") {
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
  activityType: string | null | undefined,
  metersPerSecond: number,
  preferredUnitSystem: PreferredUnitSystem,
): string {
  if (metersPerSecond <= 0) return "--";
  if (activityType === "run") return formatPace(metersPerSecond, preferredUnitSystem);
  if (activityType === "swim") return formatSwimPace(metersPerSecond, preferredUnitSystem);
  return formatSpeed(metersPerSecond, preferredUnitSystem);
}

function formatLapMetricValue(
  activityType: string | null | undefined,
  metersPerSecond: number,
  preferredUnitSystem: PreferredUnitSystem,
): string {
  return (
    formatLapMetric(activityType, metersPerSecond, preferredUnitSystem).split(/[\s/]/)[0] ?? "--"
  );
}

function getLapIndexLabel(
  activityType: string | null | undefined,
  laps: LapDisplayEntry[],
  preferredUnitSystem: PreferredUnitSystem,
): string {
  if (activityType === "run" || activityType === "walk" || activityType === "hike") {
    return preferredUnitSystem === "imperial" ? "Mi" : "Km";
  }
  if (activityType === "swim") return "Len";

  const hasDistanceSplits = laps.some((lap) => lap.distance > 0);
  return hasDistanceSplits ? (preferredUnitSystem === "imperial" ? "Mi" : "Km") : "Lap";
}

function getLapMetricLabel(activityType: string | null | undefined): string {
  if (
    activityType === "run" ||
    activityType === "swim" ||
    activityType === "walk" ||
    activityType === "hike"
  ) {
    return "Pace";
  }

  return "Speed";
}

function buildLapDisplayEntries(
  laps: ActivityLapRecord[],
  activityType: string | null | undefined,
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
        metricLabel: formatLapMetricValue(activityType, speed, preferredUnitSystem),
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
  activityType,
  laps,
  preferredUnitSystem,
}: {
  activityType?: string | null;
  laps: ActivityLapRecord[];
  preferredUnitSystem: PreferredUnitSystem;
}) {
  const displayLaps = useMemo(
    () => buildLapDisplayEntries(laps, activityType, preferredUnitSystem),
    [activityType, laps, preferredUnitSystem],
  );

  if (displayLaps.length === 0) {
    return <VisualStateCard title="Laps" message="No lap data is available for this activity." />;
  }

  const lapIndexLabel = getLapIndexLabel(activityType, displayLaps, preferredUnitSystem);
  const lapMetricLabel = getLapMetricLabel(activityType);

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

  // Fetch activity data
  const { data: activityData, isLoading: isLoadingActivity } = api.activities.getById.useQuery(
    id ? { id } : skipToken,
    { enabled: !!id },
  );

  const activity = activityData?.activity;
  const activityCategory =
    activity?.segments?.find((segment) => segment.role === "activity")?.category ?? null;
  const derived = activityData?.derived;
  const loadMethod = derived?.stress.method;
  const loadLabels = getActivityLoadLabels(loadMethod);
  const loadUnavailableText =
    derived?.stress.unavailable_reason === "private_data"
      ? "Training load is private."
      : derived?.stress.unavailable_reason === "threshold_missing"
        ? getThresholdNextAction(activityCategory)
        : derived?.stress.unavailable_reason === "invalid_data"
          ? "The available activity or threshold data is invalid."
          : "Compatible activity data is missing.";
  const loadCalibrationQuality = derived?.stress.calibration_quality;
  const calibrationText = formatCalibrationQuality(
    loadCalibrationQuality
      ? {
          source: loadCalibrationQuality.source,
          observed_at: loadCalibrationQuality.observed_at,
          stale: loadCalibrationQuality.stale,
          estimate: loadCalibrationQuality.estimate,
          ...(loadCalibrationQuality.calculation_version !== undefined
            ? { calculation_version: loadCalibrationQuality.calculation_version }
            : {}),
        }
      : loadCalibrationQuality,
    activity?.started_at,
  );

  // Get current user to check ownership
  const { user } = useAuth();
  const isOwner = user?.id === activity?.profile_id;

  // Fetch profile for header
  const { data: profile } = api.profiles.getPublicById.useQuery(
    activity?.profile_id ? { id: activity.profile_id } : skipToken,
    { enabled: !!activity?.profile_id },
  );

  // Fetch streams if an activity file exists
  const activityId = activity?.id;
  const currentArtifact = activity?.current_artifact;
  const activityFilePath = currentArtifact?.availability === "accepted" ? currentArtifact.id : null;
  const [shouldLoadDetailedStreams, setShouldLoadDetailedStreams] = useState(false);
  const canLoadDetailedStreams = !!activityFilePath && !!activityId && isOwner;

  useEffect(() => {
    setShouldLoadDetailedStreams(false);
    if (!canLoadDetailedStreams) {
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      setShouldLoadDetailedStreams(true);
    });

    return () => task.cancel();
  }, [canLoadDetailedStreams]);

  const {
    data: streamsData,
    isLoading: isLoadingStreams,
    error: streamsError,
  } = api.activityFiles.getStreams.useQuery(
    canLoadDetailedStreams
      ? {
          activityId: activityId,
          scope: activity?.segments?.[0]?.id
            ? { type: "segment" as const, segmentId: activity.segments[0].id }
            : { type: "session" as const, sessionMessageIndex: 0 },
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
    onSuccess: () => {
      queryClient.activities.invalidate();
      queryClient.home.getDashboard.invalidate();
      queryClient.trends.invalidate();
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
    initialCount: activity?.likes_count,
    initialLiked: activityData?.has_liked,
  });

  const handleLikeToggle = () => {
    if (!activity) return;
    activityLike.toggleLike();
  };

  const comments = useEntityCommentsController({ entityId: activity?.id, entityType: "activity" });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (!activity) return;
    setShowDeleteConfirm(true);
  };

  const contentVisibility = activity ? resolveContentVisibility(activity) : "private";

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

  const { chartStreams, distanceStream, elevationStream, routeCoordinates } =
    useActivityDetailStreams({
      activity,
      streamsData,
    });
  const isPreparingDetailedContent = canLoadDetailedStreams && !shouldLoadDetailedStreams;
  const isDetailedContentLoading =
    !streamsError && (isPreparingDetailedContent || isLoadingStreams);
  const detailedContentPrivateMessage =
    "Detailed streams are private to the activity owner. Summary metrics are still visible.";
  const shouldShowPrivateStreamMessage = !!activityFilePath && !isOwner;

  const streamPresentation = streamsData?.analysis
    ? presentActivityStreamAnalysis(streamsData.analysis)
    : null;

  // Get laps
  const laps = parseActivityLapRecords(streamsData?.laps ?? activity?.laps);
  const ingestionMessage = getIngestionMessage(
    (activity as { ingestion?: unknown } | undefined)?.ingestion,
  );

  // Loading skeleton
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

  const stress = derived?.stress;
  const { calibration_quality: calibrationQuality, ...stressWithoutCalibrationQuality } =
    stress ?? {};
  const activityCardStress =
    stress == null
      ? null
      : {
          ...stressWithoutCalibrationQuality,
          ...(calibrationQuality === undefined ? {} : { calibration_quality: calibrationQuality }),
        };
  const { ingestion, ...activityWithoutIngestion } = activity;
  const { last_error_message: lastErrorMessage, ...ingestionWithoutLastErrorMessage } =
    ingestion ?? {};

  const renderHeaderActions = () => {
    if (!isOwner) {
      return null;
    }

    return (
      <DetailOverflowMenu
        actions={[
          {
            disabled: updatePrivacyMutation.isPending,
            label: "Change visibility",
            onPress: handleChangeVisibility,
            testID: "activity-detail-options-visibility",
          },
          {
            label: "Share",
            onPress: handleShare,
            testID: "activity-detail-options-share",
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
    );
  };

  return (
    <View className="flex-1 bg-background" testID="activity-detail-screen">
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
      <ScrollView className="flex-1 bg-background">
        <View className="p-4 gap-4">
          <ActivityCard
            activity={{
              ...activityWithoutIngestion,
              ...(ingestion === undefined
                ? {}
                : {
                    ingestion:
                      ingestion === null
                        ? null
                        : {
                            ...ingestionWithoutLastErrorMessage,
                            ...(lastErrorMessage === undefined
                              ? {}
                              : { last_error_message: lastErrorMessage }),
                          },
                  }),
              derived: {
                stress: activityCardStress,
              },
            }}
            headerAccessory={
              <Pressable
                onPress={handleLikeToggle}
                disabled={activityLike.isPending}
                testID="activity-detail-like-button"
                className="rounded-full border border-border bg-background px-3 py-2"
              >
                <View className="flex-row items-center gap-1.5">
                  <Heart
                    size={16}
                    className={
                      activityLike.isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground"
                    }
                    color={activityLike.isLiked ? "#ef4444" : undefined}
                  />
                  <Text
                    className={
                      activityLike.isLiked
                        ? "text-red-500 text-sm font-medium"
                        : "text-muted-foreground text-sm"
                    }
                  >
                    {activityLike.likeCount > 0
                      ? activityLike.likeCount
                      : activityLike.isLiked
                        ? "Liked"
                        : "Like"}
                  </Text>
                </View>
              </Pressable>
            }
            owner={{
              id: activity.profile_id,
              username: profile?.username || "Unknown User",
              avatar_url: profile?.avatar_url,
            }}
            showVisualPreview={false}
            variant="detail"
          />

          {routeCoordinates.length > 0 ? (
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
          )}

          {/* Laps */}
          {isDetailedContentLoading ? (
            <VisualStateCard title="Laps" state="loading" message="Loading lap data..." />
          ) : shouldShowPrivateStreamMessage ? (
            <VisualStateCard title="Laps" state="private" message={detailedContentPrivateMessage} />
          ) : laps.length > 0 ? (
            <LapVisualizationCard
              activityType={activityCategory ?? "other"}
              laps={laps}
              preferredUnitSystem={preferredUnitSystem}
            />
          ) : (
            <VisualStateCard title="Laps" message="No lap data is available for this activity." />
          )}

          {elevationStream ? (
            <ElevationProfileChart
              elevationStream={elevationStream}
              distanceStream={distanceStream || undefined}
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
          )}

          {activity.activity_plan_id && activity.activity_plans && (
            <ActivityPlanComparison
              activityPlan={activity.activity_plans}
              actualMetrics={{
                duration: (activity.active_ms ?? activity.elapsed_ms) / 1000,
                tss:
                  derived?.stress.method === "power_threshold"
                    ? (derived.stress.tss ?? undefined)
                    : undefined,
                intensity_factor:
                  derived?.stress.method === "power_threshold"
                    ? (derived.stress.intensity_factor ?? undefined)
                    : undefined,
                adherence_score: undefined,
              }}
              onPress={() => {
                if (activity.activity_plan_id) {
                  router.navigate(ROUTES.PLAN.PLAN_DETAIL(activity.activity_plan_id));
                }
              }}
            />
          )}

          {/* Swim Metrics */}
          {activityCategory === "swim" && (
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
                      {typeof activity.pool_length === "number"
                        ? formatDisplayUnitValue(
                            toDisplayUnitValue(
                              {
                                dimension: "pool_length",
                                value: activity.pool_length,
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
                    <Text className="text-2xl font-bold">{activity.total_strokes ?? "--"}</Text>
                    <Text className="text-xs text-muted-foreground uppercase">Strokes</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold">{activity.avg_swolf ?? "--"}</Text>
                    <Text className="text-xs text-muted-foreground uppercase">Swolf</Text>
                  </View>
                </View>
              </CardContent>
            </Card>
          )}

          {/* Training Load */}
          {derived?.stress && (
            <Card>
              <CardHeader>
                <CardTitle>Training Load</CardTitle>
              </CardHeader>
              <CardContent>
                {derived.stress.tss == null ? (
                  <Text className="text-sm text-muted-foreground">{loadUnavailableText}</Text>
                ) : (
                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Icon as={TrendingUp} size={16} className="text-muted-foreground" />
                        <Text className="text-xs text-muted-foreground uppercase">
                          {loadLabels.load}
                        </Text>
                      </View>
                      <Text className="text-3xl font-bold">
                        {formatEstimatedTss(derived?.stress.tss, { includeUnit: false }) ?? "--"}
                      </Text>
                    </View>

                    {derived?.stress.intensity_factor != null && (
                      <View className="flex-1">
                        <Text className="text-xs text-muted-foreground uppercase mb-1">
                          {loadLabels.intensity}
                        </Text>
                        <Text className="text-3xl font-bold">
                          {formatEstimatedIntensityFactor(derived?.stress.intensity_factor) ?? "--"}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                {calibrationText ? (
                  <Text className="mt-3 text-xs text-muted-foreground">{calibrationText}</Text>
                ) : null}
                {loadMethod === "heart_rate_threshold" ? (
                  <Text className="mt-2 text-xs text-muted-foreground">
                    Estimated HR Load uses summary average heart rate and LTHR; it is separate from
                    Stream HR Load.
                  </Text>
                ) : null}
                {loadMethod === "critical_power_threshold" ? (
                  <Text className="mt-2 text-xs text-muted-foreground">
                    Estimated CP Load uses a guarded power curve from multiple rides and remains
                    separate from FTP-based TSS.
                  </Text>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Zones */}
          {ingestionMessage ? (
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
                    {streamPresentation.heartRateLoad.copy} This diagnostic does not replace summary
                    training load.
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
          )}

          {/* Analysis Charts */}
          {ingestionMessage ? (
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
            testIDPrefix="activity-detail"
          />
        </View>
      </ScrollView>
      {showDeleteConfirm ? (
        <DetailDeleteConfirmModal
          description={`Are you sure you want to delete "${activity.name}"? This action cannot be undone.`}
          entityLabel="Activity"
          entityName={activity.name}
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
