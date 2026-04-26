import { decodePolyline } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  Clock,
  Ellipsis,
  Heart,
  MapPin,
  Timer,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import {
  ActivityHeader,
  ActivityPlanComparison,
  ZoneDistributionCard,
} from "@/components/activity";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { StreamChart } from "@/components/activity/charts/StreamChart";
import { ActivityRouteMap } from "@/components/activity/maps/ActivityRouteMap";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";

// Re-defining interface from StreamChart as it's not exported
interface StreamData {
  type: string;
  stream: DecompressedStream;
  color: string;
  label: string;
  unit: string;
  yAxis?: "left" | "right";
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
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

// Calculate summary stats for a stream
function getStreamStats(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 };
  let min = values[0] ?? 0;
  let max = values[0] ?? 0;
  let sum = 0;

  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }

  return {
    min,
    max,
    avg: sum / values.length,
  };
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

  // Fetch profile for header
  const { data: profile } = api.profiles.getPublicById.useQuery(
    { id: activity?.profile_id },
    { enabled: !!activity?.profile_id },
  );

  // Fetch streams if fit file exists
  const activityId = activity?.id;
  const fitFilePath = activity?.fit_file_path;

  const {
    data: streamsData,
    isLoading: isLoadingStreams,
    error: streamsError,
  } = api.fitFiles.getStreams.useQuery(
    {
      fitFilePath: fitFilePath!,
      activityId: activityId,
    },
    {
      enabled: !!fitFilePath && !!activityId,
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

  // Like mutation
  const [liked, setLiked] = useState(activityData?.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(activity?.likes_count ?? 0);

  useEffect(() => {
    setLiked(activityData?.has_liked ?? false);
    setLikesCount(activity?.likes_count ?? 0);
  }, [activity?.likes_count, activityData?.has_liked]);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onSuccess: (data) => {
      setLiked(data.liked);
      setLikesCount((prev: number) => (data.liked ? prev + 1 : prev - 1));
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to update like: ${error.message}`);
    },
  });

  const handleLikeToggle = () => {
    if (!activity) return;
    toggleLikeMutation.mutate({
      entity_id: activity.id,
      entity_type: "activity",
    });
  };

  const comments = useEntityCommentsController({ entityId: activity?.id, entityType: "activity" });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Get current user to check ownership
  const { user } = useAuth();
  const isOwner = user?.id === activity?.profile_id;

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

  const routeCoordinates = useMemo(() => {
    if (activity?.polyline) {
      return decodePolyline(activity.polyline);
    }

    const records = streamsData?.records;
    if (!records || records.length === 0) {
      return [];
    }

    const coordinates: Array<{ latitude: number; longitude: number }> = [];

    for (const record of records as any[]) {
      const latitude =
        typeof record.positionLat === "number"
          ? record.positionLat
          : typeof record.latitude === "number"
            ? record.latitude
            : null;
      const longitude =
        typeof record.positionLong === "number"
          ? record.positionLong
          : typeof record.longitude === "number"
            ? record.longitude
            : null;

      if (
        latitude !== null &&
        longitude !== null &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180 &&
        !(latitude === 0 && longitude === 0)
      ) {
        coordinates.push({ latitude, longitude });
      }
    }

    return coordinates;
  }, [activity?.polyline, streamsData?.records]);

  // Process streams data for charts
  const { chartStreams, elevationStream, distanceStream } = useMemo(() => {
    if (!streamsData?.records)
      return { chartStreams: [], elevationStream: null, distanceStream: null };

    const hrData: { val: number; ts: number }[] = [];
    const powerData: { val: number; ts: number }[] = [];
    const speedData: { val: number; ts: number }[] = [];
    const cadenceData: { val: number; ts: number }[] = [];
    const altData: { val: number; ts: number }[] = [];
    const distData: { val: number; ts: number }[] = [];

    streamsData.records.forEach((r: any) => {
      const ts = new Date(r.timestamp).getTime();

      if (r.heartRate !== undefined) hrData.push({ val: r.heartRate, ts });
      if (r.power !== undefined) powerData.push({ val: r.power, ts });

      if (r.speed !== undefined) {
        let val = r.speed * 3.6;
        if (activity?.type === "run") {
          val = r.speed > 0.1 ? 1000 / r.speed / 60 : 0;
        }
        speedData.push({ val, ts });
      }

      if (r.cadence !== undefined) cadenceData.push({ val: r.cadence, ts });
      if (r.altitude !== undefined) altData.push({ val: r.altitude, ts });
      if (r.distance !== undefined) distData.push({ val: r.distance, ts });
    });

    const createStream = (
      type: string,
      data: { val: number; ts: number }[],
    ): StreamData["stream"] => ({
      type,
      dataType: "float",
      values: data.map((d) => d.val),
      timestamps: data.map((d) => d.ts),
      sampleCount: data.length,
    });

    const streams: StreamData[] = [];

    if (hrData.length > 0) {
      streams.push({
        type: "heartrate",
        stream: createStream("heartrate", hrData),
        color: "#ef4444",
        label: "Heart Rate",
        unit: "bpm",
      });
    }

    if (powerData.length > 0) {
      streams.push({
        type: "power",
        stream: createStream("power", powerData),
        color: "#a855f7",
        label: "Power",
        unit: "W",
      });
    }

    if (speedData.length > 0) {
      const isRun = activity?.type === "run";
      streams.push({
        type: "speed",
        stream: createStream("speed", speedData),
        color: "#3b82f6",
        label: isRun ? "Pace" : "Speed",
        unit: isRun ? "min/km" : "km/h",
      });
    }

    if (cadenceData.length > 0) {
      streams.push({
        type: "cadence",
        stream: createStream("cadence", cadenceData),
        color: "#22c55e",
        label: "Cadence",
        unit: activity?.type === "run" ? "spm" : "rpm",
      });
    }

    const elevStream = altData.length > 0 ? createStream("altitude", altData) : null;
    const distStream = distData.length > 0 ? createStream("distance", distData) : null;

    return {
      chartStreams: streams,
      elevationStream: elevStream,
      distanceStream: distStream,
    };
  }, [streamsData, activity]);

  // Memoize zone data
  const { hrZones, powerZones, hrColors, powerColors } = useMemo(() => {
    return {
      hrZones: (derived?.zones.hr ?? []).map((zone) => ({
        zone: zone.zone,
        time: zone.seconds,
        label: zone.label,
      })),
      powerZones: (derived?.zones.power ?? []).map((zone) => ({
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
  }, [derived]);

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
      <DropdownMenu>
        <DropdownMenuTrigger testID="activity-detail-options-trigger">
          <View className="rounded-full p-2">
            <Icon as={Ellipsis} size={18} className="text-foreground" />
          </View>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          <DropdownMenuItem
            onPress={handleToggleVisibility}
            disabled={updatePrivacyMutation.isPending}
            testID="activity-detail-options-visibility"
          >
            <Text>{activity.is_private ? "Make Public" : "Make Private"}</Text>
          </DropdownMenuItem>
          <DropdownMenuItem
            onPress={handleDelete}
            variant="destructive"
            testID="activity-detail-options-delete"
          >
            <Text>{deleteMutation.isPending ? "Deleting..." : "Delete Activity"}</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <View className="flex-1 bg-background" testID="activity-detail-screen">
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
      <ScrollView className="flex-1 bg-background">
        <View className="p-4 gap-4">
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="gap-4 p-4">
              <View className="flex-row items-start gap-3">
                <View className="flex-1">
                  <ActivityHeader
                    user={{
                      id: activity.profile_id,
                      username: profile?.username || "Unknown User",
                      avatarUrl: profile?.avatar_url,
                    }}
                    activity={{
                      type: activity.type,
                      name: activity.name,
                      startedAt: activity.started_at,
                      device_manufacturer: activity.device_manufacturer,
                      device_product: activity.device_product,
                    }}
                    notes={activity.notes ?? undefined}
                    variant="embedded"
                  />
                </View>
                <Pressable
                  onPress={handleLikeToggle}
                  disabled={toggleLikeMutation.isPending}
                  testID="activity-detail-like-button"
                  className="rounded-full border border-border bg-background px-3 py-2"
                >
                  <View className="flex-row items-center gap-1.5">
                    <Heart
                      size={16}
                      className={liked ? "fill-red-500 text-red-500" : "text-muted-foreground"}
                      color={liked ? "#ef4444" : undefined}
                    />
                    <Text
                      className={
                        liked ? "text-red-500 text-sm font-medium" : "text-muted-foreground text-sm"
                      }
                    >
                      {likesCount > 0 ? likesCount : liked ? "Liked" : "Like"}
                    </Text>
                  </View>
                </Pressable>
              </View>

              <View className="flex-row flex-wrap gap-2">
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Distance: {formatDistance(activity.distance_meters)}
                  </Text>
                </View>
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Duration: {formatDuration(activity.duration_seconds)}
                  </Text>
                </View>
                {derived?.stress.tss != null ? (
                  <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                    <Text className="text-xs font-medium text-foreground">
                      TSS: {Math.round(derived.stress.tss)}
                    </Text>
                  </View>
                ) : null}
                {derived?.stress.intensity_factor != null ? (
                  <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                    <Text className="text-xs font-medium text-foreground">
                      IF: {derived.stress.intensity_factor.toFixed(2)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </CardContent>
          </Card>

          {activity.activity_plan_id && activity.activity_plans && (
            <ActivityPlanComparison
              activityPlan={activity.activity_plans as any}
              actualMetrics={{
                duration: activity.duration_seconds,
                tss: derived?.stress.tss ?? undefined,
                intensity_factor: derived?.stress.intensity_factor ?? undefined,
                adherence_score: undefined,
              }}
            />
          )}

          {routeCoordinates.length > 0 ? (
            <ActivityRouteMap coordinates={routeCoordinates} height={260} title="Route" />
          ) : null}

          {elevationStream && (
            <ElevationProfileChart
              elevationStream={elevationStream}
              distanceStream={distanceStream || undefined}
              title="Elevation Profile"
              height={200}
            />
          )}

          {/* Key Stats */}
          <View className="flex-row flex-wrap gap-2">
            <View className="flex-row gap-2 w-full">
              <MetricCard
                icon={MapPin}
                label="Distance"
                value={formatDistance(activity.distance_meters)}
              />
              <MetricCard
                icon={Clock}
                label="Duration"
                value={formatDuration(activity.duration_seconds)}
              />
            </View>

            <View className="flex-row gap-2 w-full">
              {activity.avg_heart_rate && (
                <MetricCard
                  icon={Heart}
                  label="Avg HR"
                  value={Math.round(activity.avg_heart_rate)}
                  unit="bpm"
                />
              )}
              {activity.avg_power && (
                <MetricCard
                  icon={Zap}
                  label="Avg Power"
                  value={Math.round(activity.avg_power)}
                  unit="W"
                />
              )}
              {!activity.avg_power && activity.avg_speed_mps && (
                <MetricCard
                  icon={Timer}
                  label={
                    activity.type === "run"
                      ? "Avg Pace"
                      : activity.type === "swim"
                        ? "Avg Pace"
                        : "Avg Speed"
                  }
                  value={
                    activity.type === "run"
                      ? formatPace(activity.avg_speed_mps).split(" ")[0]
                      : activity.type === "swim"
                        ? formatSwimPace(activity.avg_speed_mps).split(" ")[0]
                        : formatSpeed(activity.avg_speed_mps).split(" ")[0]
                  }
                  unit={
                    activity.type === "run" ? "/km" : activity.type === "swim" ? "/100m" : "km/h"
                  }
                />
              )}
            </View>

            {activity.avg_power && activity.avg_speed_mps && (
              <View className="flex-row gap-2 w-full">
                <MetricCard
                  icon={Timer}
                  label={
                    activity.type === "run"
                      ? "Avg Pace"
                      : activity.type === "swim"
                        ? "Avg Pace"
                        : "Avg Speed"
                  }
                  value={
                    activity.type === "run"
                      ? formatPace(activity.avg_speed_mps).split(" ")[0]
                      : activity.type === "swim"
                        ? formatSwimPace(activity.avg_speed_mps).split(" ")[0]
                        : formatSpeed(activity.avg_speed_mps).split(" ")[0]
                  }
                  unit={
                    activity.type === "run" ? "/km" : activity.type === "swim" ? "/100m" : "km/h"
                  }
                />
                <View className="flex-1" />
              </View>
            )}
          </View>

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
                      {derived?.stress.tss != null ? Math.round(derived.stress.tss) : "--"}
                    </Text>
                  </View>

                  {derived?.stress.intensity_factor != null && (
                    <View className="flex-1">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">
                        Intensity Factor
                      </Text>
                      <Text className="text-3xl font-bold">
                        {derived?.stress.intensity_factor?.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              </CardContent>
            </Card>
          )}

          {/* Zones */}
          {hrZones.length > 0 && (
            <ZoneDistributionCard
              title="Heart Rate Zones"
              zones={hrZones}
              colors={hrColors}
              showToggle={true}
            />
          )}
          {powerZones.length > 0 && (
            <ZoneDistributionCard
              title="Power Zones"
              zones={powerZones}
              colors={powerColors}
              showToggle={true}
            />
          )}

          {/* Analysis Charts */}
          {activity.fit_file_path && (
            <>
              {isLoadingStreams ? (
                <Card>
                  <CardContent className="py-8">
                    <View className="items-center gap-3">
                      <ActivityIndicator size="small" className="text-primary" />
                      <Text className="text-sm text-muted-foreground">
                        Loading detailed analysis...
                      </Text>
                    </View>
                  </CardContent>
                </Card>
              ) : streamsError ? (
                <Card>
                  <CardContent className="py-8">
                    <View className="items-center gap-3">
                      <Icon as={Activity} size={32} className="text-destructive/50" />
                      <Text className="text-sm text-center text-muted-foreground">
                        Failed to load analysis: {streamsError.message}
                      </Text>
                    </View>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {chartStreams.map((s) => {
                    const stats = getStreamStats(s.stream.values as number[]);
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
              )}
            </>
          )}

          {/* Laps */}
          {laps && laps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Laps ({laps.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <View className="gap-2">
                  <View className="flex-row border-b border-border pb-2 mb-2">
                    <Text className="w-10 font-semibold text-xs text-muted-foreground">#</Text>
                    <Text className="flex-1 font-semibold text-xs text-muted-foreground">Time</Text>
                    <Text className="flex-1 font-semibold text-xs text-muted-foreground">
                      Distance
                    </Text>
                    <Text className="flex-1 font-semibold text-xs text-muted-foreground text-right">
                      {activity.type === "swim" ? "Time" : "Pace"}
                    </Text>
                  </View>

                  {laps.map((lap: any, index: number) => {
                    const lapDistance = lap.totalDistance || lap.distance || 0;
                    const lapTime = lap.totalTime || lap.totalTimerTime || 0;
                    const lapSpeed =
                      lap.avgSpeed || (lapDistance > 0 && lapTime > 0 ? lapDistance / lapTime : 0);

                    return (
                      <View
                        key={index}
                        className="flex-row py-2 border-b border-border/50 last:border-0"
                      >
                        <Text className="w-10 font-medium text-sm">{index + 1}</Text>
                        <Text className="flex-1 text-sm">{formatDuration(lapTime)}</Text>
                        <Text className="flex-1 text-sm">
                          {lapDistance >= 1000
                            ? `${(lapDistance / 1000).toFixed(2)} km`
                            : `${Math.round(lapDistance)} m`}
                        </Text>
                        <Text className="flex-1 text-sm text-right">
                          {activity.type === "swim"
                            ? formatDuration(lapTime)
                            : lapSpeed > 0
                              ? formatPace(lapSpeed)
                              : "--"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </CardContent>
            </Card>
          )}

          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            comments={comments.comments}
            helperText="Discuss the activity after reviewing the route, metrics, and charts."
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
        <AppConfirmModal
          description={`Are you sure you want to delete "${activity.name}"? This action cannot be undone.`}
          onClose={() => setShowDeleteConfirm(false)}
          primaryAction={{
            label: deleteMutation.isPending ? "Deleting..." : "Delete Activity",
            onPress: () => deleteMutation.mutate({ id: activity.id }),
            testID: "activity-detail-delete-confirm",
            variant: "destructive",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteConfirm(false),
            variant: "outline",
          }}
          testID="activity-detail-delete-modal"
          title="Delete Activity"
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
