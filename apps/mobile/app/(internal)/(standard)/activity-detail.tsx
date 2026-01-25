import {
  ActivityHeader,
  ActivityPlanComparison,
  MetricCard,
  ZoneDistributionCard,
} from "@/components/activity";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { StreamChart } from "@/components/activity/charts/StreamChart";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";
import { decodePolyline } from "@repo/core";
import { router, useLocalSearchParams } from "expo-router";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Heart,
  MapPin,
  Mountain,
  Timer,
  Trash2,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import MapView, { Polyline as MapPolyline, Region } from "react-native-maps";

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
  const queryClient = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"overview" | "analysis" | "laps">(
    "overview",
  );

  const { data: activityData, isLoading } = trpc.activities.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  );

  const activity = activityData as any;

  // Fetch profile for header
  const { data: profile } = trpc.profiles.getPublicById.useQuery(
    { id: activity?.profile_id },
    { enabled: !!activity?.profile_id },
  );

  // Fetch streams if fit file exists
  const { data: streamsData, isLoading: isLoadingStreams } =
    trpc.fitFiles.getStreams.useQuery(
      { fitFilePath: activity?.fit_file_path! },
      { enabled: !!activity?.fit_file_path },
    );

  // Delete mutation
  const deleteMutation = trpc.activities.delete.useMutation({
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

  const handleDelete = () => {
    if (!activity) return;
    Alert.alert(
      "Delete Activity",
      `Are you sure you want to delete "${activity.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id: activity.id }),
        },
      ],
    );
  };

  // Process map data
  const mapRegion = useMemo(() => {
    if (!activity?.map_bounds) return null;
    const bounds = activity.map_bounds as any;
    const midLat = (bounds.min_lat + bounds.max_lat) / 2;
    const midLng = (bounds.min_lng + bounds.max_lng) / 2;
    const deltaLat = Math.abs(bounds.max_lat - bounds.min_lat) * 1.1; // 10% padding
    const deltaLng = Math.abs(bounds.max_lng - bounds.min_lng) * 1.1;

    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: Math.max(deltaLat, 0.005),
      longitudeDelta: Math.max(deltaLng, 0.005),
    } as Region;
  }, [activity]);

  const routeCoordinates = useMemo(() => {
    if (!activity?.polyline) return [];
    return decodePolyline(activity.polyline);
  }, [activity]);

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
        // Logic for speed/pace
        let val = r.speed * 3.6; // Default km/h
        if (activity?.type === "run") {
          // Calculate Pace (min/km)
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

    const elevStream =
      altData.length > 0 ? createStream("altitude", altData) : null;
    const distStream =
      distData.length > 0 ? createStream("distance", distData) : null;

    return {
      chartStreams: streams,
      elevationStream: elevStream,
      distanceStream: distStream,
    };
  }, [streamsData, activity]);

  // Memoize zone data
  const { hrZones, powerZones, hrColors, powerColors } = useMemo(() => {
    const hrZone1 = activity?.hr_zone_1_seconds || 0;
    const hrZone2 = activity?.hr_zone_2_seconds || 0;
    const hrZone3 = activity?.hr_zone_3_seconds || 0;
    const hrZone4 = activity?.hr_zone_4_seconds || 0;
    const hrZone5 = activity?.hr_zone_5_seconds || 0;

    const powerZone1 = activity?.power_zone_1_seconds || 0;
    const powerZone2 = activity?.power_zone_2_seconds || 0;
    const powerZone3 = activity?.power_zone_3_seconds || 0;
    const powerZone4 = activity?.power_zone_4_seconds || 0;
    const powerZone5 = activity?.power_zone_5_seconds || 0;
    const powerZone6 = activity?.power_zone_6_seconds || 0;
    const powerZone7 = activity?.power_zone_7_seconds || 0;

    const hasHrZones =
      hrZone1 > 0 || hrZone2 > 0 || hrZone3 > 0 || hrZone4 > 0 || hrZone5 > 0;
    const hasPowerZones =
      powerZone1 > 0 ||
      powerZone2 > 0 ||
      powerZone3 > 0 ||
      powerZone4 > 0 ||
      powerZone5 > 0 ||
      powerZone6 > 0 ||
      powerZone7 > 0;

    return {
      hrZones: hasHrZones
        ? [
            { zone: 1, time: hrZone1, label: "Zone 1 (Recovery)" },
            { zone: 2, time: hrZone2, label: "Zone 2 (Endurance)" },
            { zone: 3, time: hrZone3, label: "Zone 3 (Tempo)" },
            { zone: 4, time: hrZone4, label: "Zone 4 (Threshold)" },
            { zone: 5, time: hrZone5, label: "Zone 5 (VO2 Max)" },
          ]
        : [],
      powerZones: hasPowerZones
        ? [
            { zone: 1, time: powerZone1, label: "Zone 1 (Active Recovery)" },
            { zone: 2, time: powerZone2, label: "Zone 2 (Endurance)" },
            { zone: 3, time: powerZone3, label: "Zone 3 (Tempo)" },
            { zone: 4, time: powerZone4, label: "Zone 4 (Threshold)" },
            { zone: 5, time: powerZone5, label: "Zone 5 (VO2 Max)" },
            { zone: 6, time: powerZone6, label: "Zone 6 (Anaerobic)" },
            { zone: 7, time: powerZone7, label: "Zone 7 (Neuromuscular)" },
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
  }, [activity]);

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

  const renderOverview = () => (
    <View className="gap-4">
      {/* Map Section */}
      {routeCoordinates.length > 0 && mapRegion && (
        <Card className="overflow-hidden">
          <View className="h-64 w-full">
            <MapView
              style={{ flex: 1 }}
              region={mapRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <MapPolyline
                coordinates={routeCoordinates}
                strokeWidth={3}
                strokeColor="#2563eb"
              />
            </MapView>
            <Pressable
              onPress={() => setActiveTab("analysis")}
              className="absolute bottom-2 right-2 bg-background/90 px-3 py-1 rounded-full border border-border"
            >
              <Text className="text-xs font-medium">View Analysis</Text>
            </Pressable>
          </View>
        </Card>
      )}

      {/* Activity Plan Comparison */}
      {activity.activity_plan_id && activity.activity_plans && (
        <ActivityPlanComparison
          activityPlan={activity.activity_plans as any}
          actualMetrics={{
            duration: activity.duration_seconds,
            tss: activity.training_stress_score ?? undefined,
            intensity_factor: activity.intensity_factor ?? undefined,
            adherence_score: undefined,
          }}
        />
      )}

      {/* Key Stats Grid */}
      <View className="flex-row flex-wrap gap-2">
        {/* Row 1 */}
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

        {/* Row 2 */}
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
                activity.type === "run"
                  ? "/km"
                  : activity.type === "swim"
                    ? "/100m"
                    : "km/h"
              }
            />
          )}
        </View>

        {/* Row 3 - If we have both Power and Speed, show Speed here */}
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
                activity.type === "run"
                  ? "/km"
                  : activity.type === "swim"
                    ? "/100m"
                    : "km/h"
              }
            />
            {/* Spacer to keep alignment if single item */}
            <View className="flex-1" />
          </View>
        )}
      </View>

      {/* Swim Specifics - Pool & Strokes */}
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
                <Text className="text-2xl font-bold">
                  {activity.pool_length ?? "--"}
                </Text>
                <Text className="text-xs text-muted-foreground uppercase">
                  Pool (m)
                </Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold">
                  {activity.total_strokes ?? "--"}
                </Text>
                <Text className="text-xs text-muted-foreground uppercase">
                  Strokes
                </Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold">
                  {activity.avg_swolf ?? "--"}
                </Text>
                <Text className="text-xs text-muted-foreground uppercase">
                  Swolf
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* Training Load */}
      {activity.training_stress_score && (
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
                <Text className="text-3xl font-bold">
                  {Math.round(activity.training_stress_score)}
                </Text>
              </View>

              {activity.intensity_factor && (
                <View className="flex-1">
                  <Text className="text-xs text-muted-foreground uppercase mb-1">
                    Intensity Factor
                  </Text>
                  <Text className="text-3xl font-bold">
                    {activity.intensity_factor.toFixed(2)}
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
    </View>
  );

  const renderAnalysis = () => {
    if (isLoadingStreams) {
      return (
        <View className="gap-4">
          <Skeleton className="h-48 w-full bg-muted" />
          <Skeleton className="h-48 w-full bg-muted" />
          <Skeleton className="h-48 w-full bg-muted" />
        </View>
      );
    }

    if (chartStreams.length === 0 && !elevationStream) {
      return (
        <Card className="mt-4">
          <CardContent className="py-12">
            <View className="items-center justify-center">
              <Icon
                as={Activity}
                size={48}
                className="text-muted-foreground mb-4"
              />
              <Text className="text-lg font-semibold text-center mb-2">
                No Detailed Analysis
              </Text>
              <Text className="text-sm text-muted-foreground text-center max-w-sm">
                Detailed stream data (HR, Power, etc.) is not available for this
                activity.
              </Text>
            </View>
          </CardContent>
        </Card>
      );
    }

    return (
      <View className="gap-6">
        {/* Map (Expanded) */}
        {routeCoordinates.length > 0 && mapRegion && (
          <View className="h-80 w-full rounded-lg overflow-hidden border border-border">
            <MapView
              style={{ flex: 1 }}
              region={mapRegion}
              showsUserLocation={false}
            >
              <MapPolyline
                coordinates={routeCoordinates}
                strokeWidth={4}
                strokeColor="#2563eb"
              />
            </MapView>
          </View>
        )}

        {/* Charts */}
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
              {/* Stats Row */}
              <View className="flex-row justify-between px-2 mt-2">
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

        {/* Elevation Profile */}
        {elevationStream && (
          <View>
            <ElevationProfileChart
              elevationStream={elevationStream}
              distanceStream={distanceStream || undefined}
              title="Elevation Profile"
              height={200}
            />
          </View>
        )}
      </View>
    );
  };

  const renderLaps = () => {
    // We need laps from streams query or activity object.
    // Fit files getStreams returns laps in summary.
    const laps = streamsData?.laps || (activity as any).laps;

    if (!laps || laps.length === 0) {
      return (
        <Card className="mt-4">
          <CardContent className="py-12">
            <Text className="text-center text-muted-foreground">
              No lap data available.
            </Text>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Laps</CardTitle>
        </CardHeader>
        <CardContent>
          <View className="gap-2">
            {/* Header Row */}
            <View className="flex-row border-b border-border pb-2 mb-2">
              <Text className="w-8 font-semibold text-xs text-muted-foreground">
                #
              </Text>
              <Text className="flex-1 font-semibold text-xs text-muted-foreground">
                Time
              </Text>
              <Text className="flex-1 font-semibold text-xs text-muted-foreground">
                Dist
              </Text>
              <Text className="flex-1 font-semibold text-xs text-muted-foreground text-right">
                Avg Pace
              </Text>
            </View>
            {/* Rows */}
            {laps.map((lap: any, index: number) => (
              <View
                key={index}
                className="flex-row py-2 border-b border-border/50"
              >
                <Text className="w-8 font-medium text-sm">{index + 1}</Text>
                <Text className="flex-1 text-sm">
                  {formatDuration(lap.totalTime)}
                </Text>
                <Text className="flex-1 text-sm">
                  {Math.round(lap.totalDistance)}m
                </Text>
                <Text className="flex-1 text-sm text-right">
                  {activity?.type === "swim"
                    ? formatDuration(lap.totalTime) // Swim usually wants time per length or lap
                    : formatPace(lap.avgSpeed)}
                </Text>
              </View>
            ))}
          </View>
        </CardContent>
      </Card>
    );
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        {/* Header */}
        <ActivityHeader
          user={{
            username: profile?.username || "Unknown User",
            avatarUrl: profile?.avatar_url,
          }}
          activity={{
            type: activity.type,
            name: activity.name,
            startedAt: activity.started_at,
            device_manufacturer: activity.device_manufacturer,
            device_product: activity.device_product,
            location: activity.location,
          }}
          notes={activity.notes ?? undefined}
        />

        {/* Tab Switcher */}
        <View className="flex-row bg-muted/50 p-1 rounded-lg">
          {(["overview", "analysis", "laps"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-md items-center justify-center ${
                activeTab === tab ? "bg-background shadow-sm" : ""
              }`}
            >
              <Text
                className={`font-medium capitalize ${activeTab === tab ? "text-foreground" : "text-muted-foreground"}`}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content */}
        <View>
          {activeTab === "overview" && renderOverview()}
          {activeTab === "analysis" && renderAnalysis()}
          {activeTab === "laps" && renderLaps()}
        </View>

        {/* Footer Actions */}
        <View className="mt-8 mb-4">
          <Pressable
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex-row items-center justify-center gap-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20"
          >
            <Icon
              as={Trash2}
              size={20}
              className={
                deleteMutation.isPending
                  ? "text-muted-foreground"
                  : "text-destructive"
              }
            />
            <Text
              className={`font-semibold ${deleteMutation.isPending ? "text-muted-foreground" : "text-destructive"}`}
            >
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
