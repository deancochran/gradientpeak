import {
  ActivityHeader,
  ActivityPlanComparison,
  MetricCard,
  ZoneDistributionCard,
} from "@/components/activity";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
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

  const { data: activityData, isLoading } = trpc.activities.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  );

  const activity = activityData;

  // Delete mutation
  const deleteMutation = trpc.activities.delete.useMutation({
    onSuccess: () => {
      // Invalidate all activity-related queries
      queryClient.activities.invalidate();
      queryClient.home.getDashboard.invalidate();
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
      `Are you sure you want to delete "${activity.name}"? This action cannot be undone.`,
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
      ],
    );
  };

  const avgPower = activity?.avg_power;
  const avgHeartRate = activity?.avg_heart_rate;
  const avgSpeed = activity?.avg_speed_mps;
  const maxSpeed = activity?.max_speed_mps;
  const avgCadence = activity?.avg_cadence;
  const maxCadence = activity?.max_cadence;
  const tss = activity?.training_stress_score;
  const intensityFactor = activity?.intensity_factor;
  const totalAscent = activity?.elevation_gain_meters;
  const totalDescent = activity?.elevation_loss_meters;

  // Memoize zone data to prevent re-renders
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
            {
              zone: 1,
              time: hrZone1,
              label: "Zone 1 (Recovery)",
            },
            {
              zone: 2,
              time: hrZone2,
              label: "Zone 2 (Endurance)",
            },
            { zone: 3, time: hrZone3, label: "Zone 3 (Tempo)" },
            {
              zone: 4,
              time: hrZone4,
              label: "Zone 4 (Threshold)",
            },
            { zone: 5, time: hrZone5, label: "Zone 5 (VO2 Max)" },
          ]
        : [],
      powerZones: hasPowerZones
        ? [
            {
              zone: 1,
              time: powerZone1,
              label: "Zone 1 (Active Recovery)",
            },
            {
              zone: 2,
              time: powerZone2,
              label: "Zone 2 (Endurance)",
            },
            {
              zone: 3,
              time: powerZone3,
              label: "Zone 3 (Tempo)",
            },
            {
              zone: 4,
              time: powerZone4,
              label: "Zone 4 (Threshold)",
            },
            {
              zone: 5,
              time: powerZone5,
              label: "Zone 5 (VO2 Max)",
            },
            {
              zone: 6,
              time: powerZone6,
              label: "Zone 6 (Anaerobic)",
            },
            {
              zone: 7,
              time: powerZone7,
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
  }, [activity]);

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
              tss: tss ?? undefined,
              intensity_factor: intensityFactor ?? undefined,
              adherence_score: undefined,
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
        {!tss &&
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
