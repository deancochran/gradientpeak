import {
  ActivityHeader,
  ActivityPlanComparison,
  ActivityRouteMap,
  ElevationProfileChart,
  MetricCard,
  MultiMetricChart,
  StreamChart,
  ZoneDistributionCard,
} from "@/components/activity";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useActivityStreams } from "@/lib/hooks/useActivityStreams";
import { trpc } from "@/lib/trpc";
import { router, useLocalSearchParams } from "expo-router";
import {
  Clock,
  Heart,
  MapPin,
  Mountain,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

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

function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = trpc.useUtils();

  const { data: activityData, isLoading } =
    trpc.activities.getActivityWithStreams.useQuery(
      { id: id! },
      { enabled: !!id },
    );

  const activity = activityData;

  // Delete mutation
  const deleteMutation = trpc.activities.delete.useMutation({
    onSuccess: () => {
      // Invalidate all activity-related queries
      queryClient.activities.invalidate();
      queryClient.home.dashboard.invalidate();
      queryClient.trends.invalidate();

      // Navigate back to activity list
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to delete activity: ${error.message}`);
    },
  });

  // Handle delete with confirmation
  const handleDelete = () => {
    if (!activity) return;

    Alert.alert(
      "Delete Activity",
      `Are you sure you want to delete "${activity.name}"? This action cannot be undone and will recalculate all your fitness metrics.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate({ id: activity.id });
          },
        },
      ]
    );
  };

  // Decompress and process streams
  const {
    streams,
    hasGPS,
    hasHeartRate,
    hasPower,
    hasSpeed,
    hasElevation,
    hasCadence,
    getGPSCoordinates,
    getGPSCoordinatesWithTimestamps,
    getElevationStream,
  } = useActivityStreams(activity?.activity_streams);

  // Extract metrics from JSONB field
  const metrics = activity?.metrics as {
    avg_power?: number;
    avg_heart_rate?: number;
    avg_speed?: number;
    max_speed?: number;
    avg_cadence?: number;
    max_cadence?: number;
    tss?: number;
    intensity_factor?: number;
    if?: number;
    total_ascent?: number;
    total_descent?: number;
    adherence_score?: number;
  } | null;

  const avgPower = metrics?.avg_power;
  const avgHeartRate = metrics?.avg_heart_rate;
  const avgSpeed = metrics?.avg_speed;
  const maxSpeed = metrics?.max_speed;
  const avgCadence = metrics?.avg_cadence;
  const maxCadence = metrics?.max_cadence;
  const tss = metrics?.tss;
  const intensityFactor = metrics?.intensity_factor || metrics?.if;
  const totalAscent = metrics?.total_ascent;
  const totalDescent = metrics?.total_descent;

  // Memoize zone data to prevent re-renders
  const { hrZones, powerZones, hrColors, powerColors } = useMemo(() => {
    const hrZoneSeconds = activity?.hr_zone_seconds || [];
    const powerZoneSeconds = activity?.power_zone_seconds || [];

    return {
      hrZones: hrZoneSeconds.some((time) => time > 0)
        ? [
            {
              zone: 1,
              time: hrZoneSeconds[0] || 0,
              label: "Zone 1 (Recovery)",
            },
            {
              zone: 2,
              time: hrZoneSeconds[1] || 0,
              label: "Zone 2 (Endurance)",
            },
            { zone: 3, time: hrZoneSeconds[2] || 0, label: "Zone 3 (Tempo)" },
            {
              zone: 4,
              time: hrZoneSeconds[3] || 0,
              label: "Zone 4 (Threshold)",
            },
            { zone: 5, time: hrZoneSeconds[4] || 0, label: "Zone 5 (VO2 Max)" },
          ]
        : [],
      powerZones: powerZoneSeconds.some((time) => time > 0)
        ? [
            {
              zone: 1,
              time: powerZoneSeconds[0] || 0,
              label: "Zone 1 (Active Recovery)",
            },
            {
              zone: 2,
              time: powerZoneSeconds[1] || 0,
              label: "Zone 2 (Endurance)",
            },
            {
              zone: 3,
              time: powerZoneSeconds[2] || 0,
              label: "Zone 3 (Tempo)",
            },
            {
              zone: 4,
              time: powerZoneSeconds[3] || 0,
              label: "Zone 4 (Threshold)",
            },
            {
              zone: 5,
              time: powerZoneSeconds[4] || 0,
              label: "Zone 5 (VO2 Max)",
            },
            {
              zone: 6,
              time: powerZoneSeconds[5] || 0,
              label: "Zone 6 (Anaerobic)",
            },
            {
              zone: 7,
              time: powerZoneSeconds[6] || 0,
              label: "Zone 7 (Neuromuscular)",
            },
          ]
        : [],
      hrColors: [
        "bg-blue-400",
        "bg-green-400",
        "bg-yellow-400",
        "bg-orange-400",
        "bg-red-400",
      ],
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
  }, [activity?.hr_zone_seconds, activity?.power_zone_seconds]);

  // Get stream data (already memoized by the hook, no need for additional useMemo)
  const gpsCoordinates = getGPSCoordinates();
  const gpsData = getGPSCoordinatesWithTimestamps();
  const speedStream = streams.get("speed");
  const speedColorData = speedStream?.values as number[] | undefined;
  const elevationStreamData = getElevationStream();
  const distanceStream = streams.get("distance");
  const powerStream = streams.get("power");
  const heartRateStream = streams.get("heartrate");
  const cadenceStream = streams.get("cadence");

  // Memoize individual stream configurations
  const powerStreamConfig = useMemo(
    () =>
      hasPower && powerStream
        ? [
            {
              type: "power" as const,
              stream: powerStream,
              color: "#eab308",
              label: "Power",
              unit: "W",
            },
          ]
        : null,
    [hasPower, powerStream],
  );

  const hrStreamConfig = useMemo(
    () =>
      hasHeartRate && heartRateStream
        ? [
            {
              type: "heartrate" as const,
              stream: heartRateStream,
              color: "#ef4444",
              label: "Heart Rate",
              unit: "bpm",
            },
          ]
        : null,
    [hasHeartRate, heartRateStream],
  );

  const speedStreamConfig = useMemo(
    () =>
      hasSpeed && speedStream
        ? [
            {
              type: "speed" as const,
              stream: speedStream,
              color: "#3b82f6",
              label: activity?.type === "run" ? "Pace" : "Speed",
              unit: activity?.type === "run" ? "min/km" : "km/h",
            },
          ]
        : null,
    [hasSpeed, speedStream, activity?.type],
  );

  const cadenceStreamConfig = useMemo(
    () =>
      hasCadence && cadenceStream
        ? [
            {
              type: "cadence" as const,
              stream: cadenceStream,
              color: "#8b5cf6",
              label: "Cadence",
              unit: activity?.type === "run" ? "spm" : "rpm",
            },
          ]
        : null,
    [hasCadence, cadenceStream, activity?.type],
  );

  // Show loading state after all hooks
  if (isLoading || !activity) {
    return (
      <ScrollView className="flex-1 bg-background">
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

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        {/* Activity Header */}
        <ActivityHeader
          type={activity.type as any}
          name={activity.name}
          startedAt={activity.started_at}
          notes={activity.notes ?? undefined}
        />

        {/* Activity Plan Comparison */}
        {activity.activity_plan_id && activity.activity_plans && (
          <ActivityPlanComparison
            activityPlan={activity.activity_plans as any}
            actualMetrics={{
              duration: activity.duration_seconds,
              tss: metrics?.tss,
              intensity_factor: intensityFactor,
              adherence_score: metrics?.adherence_score,
            }}
          />
        )}

        {/* Key Stats Grid */}
        <View className="flex-row gap-2">
          {activity.distance_meters > 0 && (
            <MetricCard
              icon={MapPin}
              label="Distance"
              value={formatDistance(activity.distance_meters)}
            />
          )}
          <MetricCard
            icon={Clock}
            label="Duration"
            value={formatDuration(activity.duration_seconds)}
          />
        </View>

        <View className="flex-row gap-2">
          {avgHeartRate && (
            <MetricCard
              icon={Heart}
              label="Avg HR"
              value={Math.round(avgHeartRate)}
              unit="bpm"
            />
          )}
          {avgPower && (
            <MetricCard
              icon={Zap}
              label="Avg Power"
              value={Math.round(avgPower)}
              unit="W"
            />
          )}
        </View>

        {/* Empty state when no additional metrics are available */}
        {!hasGPS &&
          !hasElevation &&
          !hasPower &&
          !hasHeartRate &&
          !hasSpeed &&
          !hasCadence &&
          !tss &&
          !avgSpeed &&
          !maxSpeed &&
          !avgCadence &&
          !maxCadence &&
          !totalAscent &&
          !totalDescent &&
          hrZones.length === 0 &&
          powerZones.length === 0 && (
            <Card className="mt-4">
              <CardContent className="py-12">
                <View className="items-center justify-center">
                  <Icon
                    as={TrendingUp}
                    size={48}
                    className="text-muted-foreground mb-4"
                  />
                  <Text className="text-lg font-semibold text-center mb-2">
                    Limited Metrics Available
                  </Text>
                  <Text className="text-sm text-muted-foreground text-center max-w-sm">
                    This activity has basic duration and distance data. Connect
                    sensors during recording to capture detailed metrics like
                    heart rate, power, and pace.
                  </Text>
                </View>
              </CardContent>
            </Card>
          )}

        {/* GPS Route Map - Only show if GPS data is meaningful (>10 points with variation) */}
        {hasGPS &&
          gpsCoordinates.length > 10 &&
          (() => {
            // Check if GPS data has meaningful variation (not all same location)
            const firstLat = gpsCoordinates[0]?.latitude;
            const firstLng = gpsCoordinates[0]?.longitude;
            const hasVariation = gpsCoordinates.some(
              (coord) =>
                Math.abs(coord.latitude - firstLat) > 0.0001 ||
                Math.abs(coord.longitude - firstLng) > 0.0001,
            );
            return hasVariation;
          })() && (
            <ActivityRouteMap
              coordinates={gpsCoordinates}
              timestamps={gpsData.timestamps}
              colorBy="speed"
              colorData={speedColorData}
              height={300}
              showMarkers={true}
            />
          )}

        {/* Elevation Profile */}
        {hasElevation && elevationStreamData && (
          <ElevationProfileChart
            elevationStream={elevationStreamData}
            distanceStream={distanceStream}
            height={200}
            showStats={true}
          />
        )}

        {/* Multi-Metric Chart */}
        {(hasPower || hasHeartRate || hasSpeed) && (
          <MultiMetricChart
            activityType={activity.type as any}
            streams={streams}
            height={300}
          />
        )}

        {/* Individual Stream Charts - Note: HR is shown in MultiMetricChart above, so we don't duplicate it here */}
        {powerStreamConfig && (
          <StreamChart
            title="Power"
            streams={powerStreamConfig}
            xAxisType="time"
            height={250}
            showLegend={false}
          />
        )}

        {speedStreamConfig && (
          <StreamChart
            title={activity.type === "run" ? "Pace" : "Speed"}
            streams={speedStreamConfig}
            xAxisType="time"
            height={250}
            showLegend={false}
          />
        )}

        {cadenceStreamConfig && (
          <StreamChart
            title="Cadence"
            streams={cadenceStreamConfig}
            xAxisType="time"
            height={250}
            showLegend={false}
          />
        )}

        {/* Training Load */}
        {tss && (
          <Card>
            <CardHeader>
              <CardTitle>Training Load</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Icon
                      as={TrendingUp}
                      size={16}
                      className="text-muted-foreground"
                    />
                    <Text className="text-xs text-muted-foreground uppercase">
                      TSS
                    </Text>
                  </View>
                  <Text className="text-3xl font-bold">{Math.round(tss)}</Text>
                </View>

                {intensityFactor && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Intensity Factor
                    </Text>
                    <Text className="text-3xl font-bold">
                      {intensityFactor.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Elevation Stats */}
        {((totalAscent && totalAscent > 0) ||
          (totalDescent && totalDescent > 0)) && (
          <Card>
            <CardHeader>
              <CardTitle>Elevation</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row gap-4">
                {totalAscent && totalAscent > 0 && (
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Icon
                        as={Mountain}
                        size={16}
                        className="text-muted-foreground"
                      />
                      <Text className="text-xs text-muted-foreground uppercase">
                        Ascent
                      </Text>
                    </View>
                    <Text className="text-2xl font-bold">
                      {Math.round(totalAscent)}
                      <Text className="text-sm text-muted-foreground"> m</Text>
                    </Text>
                  </View>
                )}

                {totalDescent && totalDescent > 0 && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Descent
                    </Text>
                    <Text className="text-2xl font-bold">
                      {Math.round(totalDescent)}
                      <Text className="text-sm text-muted-foreground"> m</Text>
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Speed/Pace Stats */}
        {(avgSpeed || maxSpeed) && (
          <Card>
            <CardHeader>
              <CardTitle>
                {activity.type === "run" ? "Pace" : "Speed"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row gap-4">
                {avgSpeed && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Average
                    </Text>
                    <Text className="text-xl font-bold">
                      {activity.type === "run"
                        ? formatPace(avgSpeed)
                        : formatSpeed(avgSpeed)}
                    </Text>
                  </View>
                )}

                {maxSpeed && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Maximum
                    </Text>
                    <Text className="text-xl font-bold">
                      {activity.type === "run"
                        ? formatPace(maxSpeed)
                        : formatSpeed(maxSpeed)}
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Heart Rate Zones */}
        {hrZones.length > 0 && (
          <ZoneDistributionCard
            title="Heart Rate Zones"
            zones={hrZones}
            colors={hrColors}
            showToggle={true}
          />
        )}

        {/* Power Zones */}
        {powerZones.length > 0 && (
          <ZoneDistributionCard
            title="Power Zones"
            zones={powerZones}
            colors={powerColors}
            showToggle={true}
          />
        )}

        {/* Cadence */}
        {(avgCadence || maxCadence) && (
          <Card>
            <CardHeader>
              <CardTitle>Cadence</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row gap-4">
                {avgCadence && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Average
                    </Text>
                    <Text className="text-2xl font-bold">
                      {Math.round(avgCadence)}
                      <Text className="text-sm text-muted-foreground">
                        {" "}
                        {activity.type === "run" ? "spm" : "rpm"}
                      </Text>
                    </Text>
                  </View>
                )}

                {maxCadence && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Maximum
                    </Text>
                    <Text className="text-2xl font-bold">
                      {Math.round(maxCadence)}
                      <Text className="text-sm text-muted-foreground">
                        {" "}
                        {activity.type === "run" ? "spm" : "rpm"}
                      </Text>
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Delete Activity Button */}
        <View className="mt-8 mb-4">
          <Pressable
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex-row items-center justify-center gap-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20"
          >
            <Icon
              as={Trash2}
              size={20}
              className={deleteMutation.isPending ? "text-muted-foreground" : "text-destructive"}
            />
            <Text className={`font-semibold ${deleteMutation.isPending ? "text-muted-foreground" : "text-destructive"}`}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Activity"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

export default function ActivityDetailScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityDetailScreen />
    </ErrorBoundary>
  );
}
