import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, Heart, Lock, TrendingUp, Waves } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
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
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { formatEstimatedIntensityFactor, formatEstimatedTss } from "@/lib/estimatedMetrics";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
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

function formatPace(metersPerSecond: number): string {
  if (metersPerSecond === 0) return "0:00";
  const secondsPerKm = 1000 / metersPerSecond;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
}

function formatSpeed(metersPerSecond: number): string {
  const kmh = (metersPerSecond * 3.6).toFixed(1);
  return `${kmh} km/h`;
}

function formatSwimPace(metersPerSecond: number): string {
  if (metersPerSecond === 0) return "0:00";
  const secondsPer100m = 100 / metersPerSecond;
  const minutes = Math.floor(secondsPer100m / 60);
  const seconds = Math.floor(secondsPer100m % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /100m`;
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

type ZoneDisplayEntry = {
  zone: number;
  time: number;
  label: string;
};

type LapDisplayEntry = {
  distance: number;
  duration: number;
  index: number;
  metricLabel: string;
  performance: number;
  widthPercent: number;
};

const HR_ZONE_LABELS = [
  "Zone 1 (Recovery)",
  "Zone 2 (Endurance)",
  "Zone 3 (Tempo)",
  "Zone 4 (Threshold)",
  "Zone 5 (VO2 Max)",
] as const;

function getHrZoneIndexFromThresholdPercent(thresholdPercent: number): number {
  if (thresholdPercent < 81) return 0;
  if (thresholdPercent < 90) return 1;
  if (thresholdPercent < 94) return 2;
  if (thresholdPercent < 100) return 3;
  return 4;
}

function readRecordHeartRate(record: any): number | null {
  const value = record?.heartRate ?? record?.heart_rate ?? record?.heart_rate_bpm;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function readRecordTimestampSeconds(record: any): number | null {
  const value = record?.timestamp ?? record?.time ?? record?.startTime;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000 ? value / 1000 : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed / 1000 : null;
  }

  return null;
}

function buildHeartRateZonesFromRecords(input: {
  records?: any[] | null;
  thresholdHr?: number | null;
  maxHeartRate?: number | null;
}): ZoneDisplayEntry[] {
  const samples = (input.records ?? [])
    .map((record, index) => ({
      heartRate: readRecordHeartRate(record),
      timestampSeconds: readRecordTimestampSeconds(record) ?? index,
    }))
    .filter(
      (sample): sample is { heartRate: number; timestampSeconds: number } =>
        sample.heartRate !== null,
    );

  if (samples.length === 0) {
    return [];
  }

  const maxObservedHeartRate = samples.reduce(
    (max, sample) => Math.max(max, sample.heartRate),
    input.maxHeartRate ?? 0,
  );
  const thresholdHr =
    input.thresholdHr ?? (maxObservedHeartRate > 0 ? maxObservedHeartRate * 0.85 : null);

  if (!thresholdHr || thresholdHr <= 0) {
    return [];
  }

  const zoneSeconds = [0, 0, 0, 0, 0];

  samples.forEach((sample, index) => {
    const nextTimestamp = samples[index + 1]?.timestampSeconds;
    const previousTimestamp = samples[index - 1]?.timestampSeconds;
    const sampleSeconds =
      typeof nextTimestamp === "number" && nextTimestamp > sample.timestampSeconds
        ? nextTimestamp - sample.timestampSeconds
        : typeof previousTimestamp === "number" && sample.timestampSeconds > previousTimestamp
          ? sample.timestampSeconds - previousTimestamp
          : 1;
    const zoneIndex = getHrZoneIndexFromThresholdPercent((sample.heartRate / thresholdHr) * 100);
    zoneSeconds[zoneIndex] += sampleSeconds;
  });

  return HR_ZONE_LABELS.map((label, index) => ({
    zone: index + 1,
    time: Math.max(0, Math.round(zoneSeconds[index] ?? 0)),
    label,
  })).filter((zone) => zone.time > 0);
}

function readLapDistance(lap: any): number {
  const value = lap?.totalDistance ?? lap?.distance ?? lap?.distanceMeters ?? lap?.distance_meters;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function readLapDuration(lap: any): number {
  const value =
    lap?.totalTimerTime ??
    lap?.totalElapsedTime ??
    lap?.totalTime ??
    lap?.duration ??
    lap?.durationSeconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function readLapSpeed(lap: any, distance: number, duration: number): number {
  const value = lap?.avgSpeed ?? lap?.averageSpeed ?? lap?.avg_speed;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  return distance > 0 && duration > 0 ? distance / duration : 0;
}

function formatLapMetric(activityType: string | null | undefined, metersPerSecond: number): string {
  if (metersPerSecond <= 0) return "--";
  if (activityType === "run") return formatPace(metersPerSecond);
  if (activityType === "swim") return formatSwimPace(metersPerSecond);
  return formatSpeed(metersPerSecond);
}

function formatLapMetricValue(
  activityType: string | null | undefined,
  metersPerSecond: number,
): string {
  return formatLapMetric(activityType, metersPerSecond).split(" ")[0] ?? "--";
}

function getLapIndexLabel(
  activityType: string | null | undefined,
  laps: LapDisplayEntry[],
): string {
  if (activityType === "run" || activityType === "walk" || activityType === "hike") return "Km";
  if (activityType === "swim") return "Len";

  const hasDistanceSplits = laps.some((lap) => lap.distance > 0);
  return hasDistanceSplits ? "Km" : "Lap";
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
  laps: any[],
  activityType: string | null | undefined,
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
        metricLabel: formatLapMetricValue(activityType, speed),
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
}: {
  activityType?: string | null;
  laps: any[];
}) {
  const displayLaps = useMemo(
    () => buildLapDisplayEntries(laps, activityType),
    [activityType, laps],
  );

  if (displayLaps.length === 0) {
    return <VisualStateCard title="Laps" message="No lap data is available for this activity." />;
  }

  const lapIndexLabel = getLapIndexLabel(activityType, displayLaps);
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
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = api.useUtils();

  // Fetch activity data
  const { data: activityData, isLoading: isLoadingActivity } = api.activities.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  );

  const activity = activityData?.activity as any;
  const derived = activityData?.derived;

  // Get current user to check ownership
  const { profile: authProfile, user } = useAuth();
  const isOwner = user?.id === activity?.profile_id;

  // Fetch profile for header
  const { data: profile } = api.profiles.getPublicById.useQuery(
    { id: activity?.profile_id },
    { enabled: !!activity?.profile_id },
  );

  // Fetch streams if an activity file exists
  const activityId = activity?.id;
  const activityFilePath = activity?.activity_file_path;
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
    {
      activityFilePath: activityFilePath!,
      activityId: activityId,
    },
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

  const handleToggleVisibility = () => {
    if (!activity || !isOwner) return;
    updatePrivacyMutation.mutate({
      id: activity.id,
      is_private: !activity.is_private,
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

  // Memoize zone data
  const { hrZones, powerZones, hrColors, powerColors } = useMemo(() => {
    const derivedHrZones = (derived?.zones?.hr ?? []).map((zone) => ({
      zone: zone.zone,
      time: zone.seconds,
      label: zone.label,
    }));
    const streamHrZones = buildHeartRateZonesFromRecords({
      records: streamsData?.records,
      thresholdHr: (authProfile as any)?.lthr ?? (authProfile as any)?.threshold_hr ?? null,
      maxHeartRate: activity?.max_heart_rate ?? null,
    });

    return {
      hrZones: derivedHrZones.length > 0 ? derivedHrZones : streamHrZones,
      powerZones: (derived?.zones?.power ?? []).map((zone) => ({
        zone: zone.zone,
        time: zone.seconds,
        label: zone.label,
      })),
      hrColors: ["bg-blue-400", "bg-green-400", "bg-yellow-400", "bg-orange-400", "bg-red-400"],
      powerColors: [
        "bg-gray-400",
        "bg-blue-400",
        "bg-green-400",
        "bg-yellow-400",
        "bg-orange-400",
        "bg-red-400",
        "bg-purple-400",
      ],
    };
  }, [activity?.max_heart_rate, authProfile, derived, streamsData?.records]);

  // Get laps
  const laps = streamsData?.laps || (activity as any)?.laps;

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

  const renderHeaderActions = () => {
    if (!isOwner) {
      return null;
    }

    return (
      <DetailOverflowMenu
        actions={[
          {
            disabled: updatePrivacyMutation.isPending,
            label: activity.is_private ? "Make Public" : "Make Private",
            onPress: handleToggleVisibility,
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
    );
  };

  return (
    <View className="flex-1 bg-background" testID="activity-detail-screen">
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
      <ScrollView className="flex-1 bg-background">
        <View className="p-4 gap-4">
          <ActivityCard
            activity={{
              ...activity,
              derived: {
                ...(activity.derived ?? {}),
                stress: derived?.stress ?? null,
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
          ) : laps && laps.length > 0 ? (
            <LapVisualizationCard activityType={activity.type} laps={laps} />
          ) : (
            <VisualStateCard title="Laps" message="No lap data is available for this activity." />
          )}

          {elevationStream ? (
            <ElevationProfileChart
              elevationStream={elevationStream}
              distanceStream={distanceStream || undefined}
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
              activityPlan={activity.activity_plans as any}
              actualMetrics={{
                duration: activity.duration_seconds,
                tss: derived?.stress.tss ?? undefined,
                intensity_factor: derived?.stress.intensity_factor ?? undefined,
                adherence_score: undefined,
              }}
              onPress={() => router.navigate(ROUTES.PLAN.PLAN_DETAIL(activity.activity_plan_id))}
            />
          )}

          {/* Swim Metrics */}
          {activity.type === "swim" && (
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
                    <Text className="text-2xl font-bold">{activity.pool_length ?? "--"}</Text>
                    <Text className="text-xs text-muted-foreground uppercase">Pool (m)</Text>
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
          {(derived?.stress.tss != null || derived?.stress.intensity_factor != null) && (
            <Card>
              <CardHeader>
                <CardTitle>Training Load</CardTitle>
              </CardHeader>
              <CardContent>
                <View className="flex-row gap-4">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Icon as={TrendingUp} size={16} className="text-muted-foreground" />
                      <Text className="text-xs text-muted-foreground uppercase">TSS</Text>
                    </View>
                    <Text className="text-3xl font-bold">
                      {formatEstimatedTss(derived?.stress.tss, { includeUnit: false }) ?? "--"}
                    </Text>
                  </View>

                  {derived?.stress.intensity_factor != null && (
                    <View className="flex-1">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">
                        Intensity Factor
                      </Text>
                      <Text className="text-3xl font-bold">
                        {formatEstimatedIntensityFactor(derived?.stress.intensity_factor) ?? "--"}
                      </Text>
                    </View>
                  )}
                </View>
              </CardContent>
            </Card>
          )}

          {/* Zones */}
          {hrZones.length > 0 ? (
            <ZoneDistributionCard
              title="Heart Rate Zones"
              zones={hrZones}
              colors={hrColors}
              showToggle={true}
            />
          ) : (
            <VisualStateCard
              title="Heart Rate Zones"
              message="No heart rate zone data is available for this activity."
            />
          )}
          {powerZones.length > 0 ? (
            <ZoneDistributionCard
              title="Power Zones"
              zones={powerZones}
              colors={powerColors}
              showToggle={true}
            />
          ) : (
            <VisualStateCard
              title="Power Zones"
              message="No power zone data is available for this activity."
            />
          )}

          {/* Analysis Charts */}
          {isDetailedContentLoading ? (
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
            <>
              {chartStreams.map((s) => {
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
              })}
            </>
          ) : (
            <VisualStateCard
              title="Analysis Charts"
              message={
                activity.activity_file_path
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
