import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import {
  Activity,
  Calendar,
  Clock,
  Heart,
  MapPin,
  Mountain,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React from "react";
import { ScrollView, View } from "react-native";

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

function StatCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: any;
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <View className="flex-row items-center gap-2 mb-2">
          <Icon as={icon} size={16} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground uppercase">
            {label}
          </Text>
        </View>
        <View className="flex-row items-baseline gap-1">
          <Text className="text-2xl font-bold">{value}</Text>
          {unit && (
            <Text className="text-sm text-muted-foreground">{unit}</Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function ZoneDistribution({
  title,
  zones,
  colors,
}: {
  title: string;
  zones: { zone: number; time: number; label: string }[];
  colors: string[];
}) {
  const totalTime = zones.reduce((sum, z) => sum + z.time, 0);
  if (totalTime === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {zones.map((zone) => {
          const percentage = totalTime > 0 ? (zone.time / totalTime) * 100 : 0;
          const minutes = Math.floor(zone.time / 60);

          return (
            <View key={zone.zone}>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm font-medium">{zone.label}</Text>
                <Text className="text-sm text-muted-foreground">
                  {minutes}m ({percentage.toFixed(0)}%)
                </Text>
              </View>
              <View className="h-2 bg-muted rounded-full overflow-hidden">
                <View
                  className={colors[zone.zone - 1]}
                  style={{ width: `${percentage}%`, height: "100%" }}
                />
              </View>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ActivityDetailScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();

  const { data: activityData, isLoading } =
    trpc.activities.getActivityWithStreams.useQuery(
      { id: activityId },
      { enabled: !!activityId },
    );

  if (isLoading || !activityData) {
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

  const activity = activityData;
  const hasGPS = activity.activity_streams?.some((s) => s.type === "latlng");
  const hasHeartRate = activity.activity_streams?.some(
    (s) => s.type === "heartrate",
  );
  const hasPower = activity.activity_streams?.some((s) => s.type === "power");
  const hasSpeed = activity.activity_streams?.some((s) => s.type === "speed");
  const hasElevation = activity.activity_streams?.some(
    (s) => s.type === "altitude" || s.type === "elevation",
  );
  const hasCadence = activity.activity_streams?.some(
    (s) => s.type === "cadence",
  );

  // Heart Rate Zones
  const hrZones =
    activity.hr_zone_1_time ||
    activity.hr_zone_2_time ||
    activity.hr_zone_3_time ||
    activity.hr_zone_4_time ||
    activity.hr_zone_5_time
      ? [
          {
            zone: 1,
            time: activity.hr_zone_1_time || 0,
            label: "Zone 1 (Recovery)",
          },
          {
            zone: 2,
            time: activity.hr_zone_2_time || 0,
            label: "Zone 2 (Endurance)",
          },
          {
            zone: 3,
            time: activity.hr_zone_3_time || 0,
            label: "Zone 3 (Tempo)",
          },
          {
            zone: 4,
            time: activity.hr_zone_4_time || 0,
            label: "Zone 4 (Threshold)",
          },
          {
            zone: 5,
            time: activity.hr_zone_5_time || 0,
            label: "Zone 5 (VO2 Max)",
          },
        ]
      : [];

  // Power Zones
  const powerZones =
    activity.power_zone_1_time ||
    activity.power_zone_2_time ||
    activity.power_zone_3_time ||
    activity.power_zone_4_time ||
    activity.power_zone_5_time ||
    activity.power_zone_6_time ||
    activity.power_zone_7_time
      ? [
          {
            zone: 1,
            time: activity.power_zone_1_time || 0,
            label: "Zone 1 (Active Recovery)",
          },
          {
            zone: 2,
            time: activity.power_zone_2_time || 0,
            label: "Zone 2 (Endurance)",
          },
          {
            zone: 3,
            time: activity.power_zone_3_time || 0,
            label: "Zone 3 (Tempo)",
          },
          {
            zone: 4,
            time: activity.power_zone_4_time || 0,
            label: "Zone 4 (Threshold)",
          },
          {
            zone: 5,
            time: activity.power_zone_5_time || 0,
            label: "Zone 5 (VO2 Max)",
          },
          {
            zone: 6,
            time: activity.power_zone_6_time || 0,
            label: "Zone 6 (Anaerobic)",
          },
          {
            zone: 7,
            time: activity.power_zone_7_time || 0,
            label: "Zone 7 (Neuromuscular)",
          },
        ]
      : [];

  const hrColors = [
    "bg-blue-400",
    "bg-green-400",
    "bg-yellow-400",
    "bg-orange-400",
    "bg-red-400",
  ];

  const powerColors = [
    "bg-gray-400",
    "bg-blue-400",
    "bg-green-400",
    "bg-yellow-400",
    "bg-orange-400",
    "bg-red-400",
    "bg-purple-400",
  ];

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        {/* Activity Header */}
        <Card>
          <CardContent className="p-6">
            <View className="items-center mb-4">
              <Text className="text-3xl mb-2">
                {activity.activity_category === "run"
                  ? "🏃"
                  : activity.activity_category === "bike"
                    ? "🚴"
                    : activity.activity_category === "swim"
                      ? "🏊"
                      : activity.activity_category === "strength"
                        ? "💪"
                        : "🎯"}
              </Text>
              <Text className="text-2xl font-bold text-center">
                {activity.name}
              </Text>
            </View>

            <View className="flex-row items-center justify-center gap-2 mb-4">
              <Icon as={Calendar} size={16} className="text-muted-foreground" />
              <Text className="text-sm text-muted-foreground">
                {format(
                  new Date(activity.started_at),
                  "EEEE, MMMM d, yyyy 'at' h:mm a",
                )}
              </Text>
            </View>

            {activity.notes && (
              <View className="mt-4 p-3 bg-muted rounded-lg">
                <Text className="text-sm text-foreground">
                  {activity.notes}
                </Text>
              </View>
            )}
          </CardContent>
        </Card>

        {/* Key Stats Grid */}
        <View className="flex-row gap-2">
          {activity.distance > 0 && (
            <StatCard
              icon={MapPin}
              label="Distance"
              value={formatDistance(activity.distance)}
            />
          )}
          <StatCard
            icon={Clock}
            label="Duration"
            value={formatDuration(activity.elapsed_time)}
          />
        </View>

        <View className="flex-row gap-2">
          {activity.avg_heart_rate && (
            <StatCard
              icon={Heart}
              label="Avg HR"
              value={activity.avg_heart_rate}
              unit="bpm"
            />
          )}
          {activity.avg_power && (
            <StatCard
              icon={Zap}
              label="Avg Power"
              value={activity.avg_power}
              unit="W"
            />
          )}
        </View>

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
                    {activity.training_stress_score}
                  </Text>
                </View>

                {activity.intensity_factor && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Intensity Factor
                    </Text>
                    <Text className="text-3xl font-bold">
                      {(activity.intensity_factor / 100).toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Elevation */}
        {(activity.total_ascent > 0 || activity.total_descent > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Elevation</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row gap-4">
                {activity.total_ascent > 0 && (
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
                      {activity.total_ascent}
                      <Text className="text-sm text-muted-foreground"> m</Text>
                    </Text>
                  </View>
                )}

                {activity.total_descent > 0 && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Descent
                    </Text>
                    <Text className="text-2xl font-bold">
                      {activity.total_descent}
                      <Text className="text-sm text-muted-foreground"> m</Text>
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Speed/Pace Stats */}
        {(activity.avg_speed || activity.max_speed) && (
          <Card>
            <CardHeader>
              <CardTitle>
                {activity.activity_category === "run" ? "Pace" : "Speed"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row gap-4">
                {activity.avg_speed && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Average
                    </Text>
                    <Text className="text-xl font-bold">
                      {activity.activity_category === "run"
                        ? formatPace(activity.avg_speed)
                        : formatSpeed(activity.avg_speed)}
                    </Text>
                  </View>
                )}

                {activity.max_speed && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Maximum
                    </Text>
                    <Text className="text-xl font-bold">
                      {activity.activity_category === "run"
                        ? formatPace(activity.max_speed)
                        : formatSpeed(activity.max_speed)}
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Heart Rate Zones */}
        {hrZones.length > 0 && (
          <ZoneDistribution
            title="Heart Rate Zones"
            zones={hrZones}
            colors={hrColors}
          />
        )}

        {/* Power Zones */}
        {powerZones.length > 0 && (
          <ZoneDistribution
            title="Power Zones"
            zones={powerZones}
            colors={powerColors}
          />
        )}

        {/* Cadence */}
        {(activity.avg_cadence || activity.max_cadence) && (
          <Card>
            <CardHeader>
              <CardTitle>Cadence</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row gap-4">
                {activity.avg_cadence && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Average
                    </Text>
                    <Text className="text-2xl font-bold">
                      {activity.avg_cadence}
                      <Text className="text-sm text-muted-foreground">
                        {" "}
                        rpm
                      </Text>
                    </Text>
                  </View>
                )}

                {activity.max_cadence && (
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Maximum
                    </Text>
                    <Text className="text-2xl font-bold">
                      {activity.max_cadence}
                      <Text className="text-sm text-muted-foreground">
                        {" "}
                        rpm
                      </Text>
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* TODO: Add charts for streams when available */}
        {hasGPS && (
          <Card>
            <CardContent className="p-6">
              <View className="items-center">
                <Icon
                  as={MapPin}
                  size={48}
                  className="text-muted-foreground mb-3"
                />
                <Text className="text-lg font-semibold mb-2">GPS Route</Text>
                <Text className="text-sm text-muted-foreground text-center">
                  Map visualization coming soon
                </Text>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Stream Data Info */}
        {activity.activity_streams && activity.activity_streams.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Available Data Streams</CardTitle>
            </CardHeader>
            <CardContent className="gap-2">
              {activity.activity_streams.map((stream) => (
                <View
                  key={stream.id}
                  className="flex-row items-center justify-between p-2 bg-muted rounded"
                >
                  <Text className="text-sm font-medium capitalize">
                    {stream.type.replace("_", " ")}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {stream.sample_count} samples
                  </Text>
                </View>
              ))}
              <Text className="text-xs text-muted-foreground mt-2 text-center">
                📊 Chart visualizations coming soon
              </Text>
            </CardContent>
          </Card>
        )}
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
