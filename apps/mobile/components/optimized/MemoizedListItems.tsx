import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { format } from "date-fns";
import { Clock, MapPin, TrendingUp } from "lucide-react-native";
import { memo } from "react";
import { TouchableOpacity, View } from "react-native";

/**
 * Memoized Activity Card Component
 *
 * Only re-renders when id, name, or distance changes.
 * Prevents unnecessary re-renders when parent component updates.
 *
 * @example
 * ```tsx
 * <FlatList
 *   data={activities}
 *   renderItem={({ item }) => (
 *     <ActivityListItem
 *       activity={item}
 *       onPress={() => handlePress(item.id)}
 *     />
 *   )}
 *   keyExtractor={(item) => item.id}
 * />
 * ```
 */
export const ActivityListItem = memo(
  ({
    activity,
    onPress,
  }: {
    activity: {
      id: string;
      name: string;
      distance_meters?: number | null;
      duration_seconds?: number | null;
      started_at: string;
      type?: string | null;
    };
    onPress?: () => void;
  }) => {
    const distanceKm = activity.distance_meters
      ? activity.distance_meters / 1000
      : null;
    const durationMinutes = activity.duration_seconds
      ? Math.floor(activity.duration_seconds / 60)
      : null;

    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Card className="mb-3">
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-base font-semibold flex-1">
                {activity.name || "Untitled Activity"}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {activity.type || "Activity"}
              </Text>
            </View>

            <View className="flex-row items-center gap-4">
              {distanceKm != null && (
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} className="text-muted-foreground" />
                  <Text className="text-sm text-muted-foreground">
                    {distanceKm.toFixed(1)} km
                  </Text>
                </View>
              )}

              {durationMinutes != null && (
                <View className="flex-row items-center gap-1">
                  <Clock size={14} className="text-muted-foreground" />
                  <Text className="text-sm text-muted-foreground">
                    {durationMinutes} min
                  </Text>
                </View>
              )}

              <Text className="text-xs text-muted-foreground ml-auto">
                {format(new Date(activity.started_at), "MMM d, yyyy")}
              </Text>
            </View>
          </CardContent>
        </Card>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    // Custom comparison - only re-render if these specific fields change
    return (
      prev.activity.id === next.activity.id &&
      prev.activity.name === next.activity.name &&
      prev.activity.distance_meters === next.activity.distance_meters &&
      prev.activity.duration_seconds === next.activity.duration_seconds &&
      prev.activity.type === next.activity.type
    );
  },
);

ActivityListItem.displayName = "ActivityListItem";

/**
 * Memoized Planned Activity Card Component
 *
 * Only re-renders when relevant fields change.
 * Optimized for calendar/schedule views.
 *
 * @example
 * ```tsx
 * <FlatList
 *   data={plannedActivities}
 *   renderItem={({ item }) => (
 *     <PlannedActivityListItem
 *       activity={item}
 *       onPress={() => handlePress(item.id)}
 *     />
 *   )}
 *   keyExtractor={(item) => item.id}
 * />
 * ```
 */
export const PlannedActivityListItem = memo(
  ({
    activity,
    onPress,
    showDate = true,
  }: {
    activity: {
      id: string;
      scheduled_date: string;
      title?: string | null;
      duration_minutes?: number | null;
      intensity?: string | null;
      completed_at?: string | null;
      activity_plan?: {
        id: string;
        title: string;
      };
    };
    onPress?: () => void;
    showDate?: boolean;
  }) => {
    const isCompleted = !!activity.completed_at;
    const intensity = activity.intensity || "Moderate";

    const getIntensityColor = (intensity: string) => {
      switch (intensity.toLowerCase()) {
        case "easy":
          return "text-green-500";
        case "moderate":
          return "text-blue-500";
        case "hard":
          return "text-orange-500";
        case "very hard":
          return "text-red-500";
        default:
          return "text-gray-500";
      }
    };

    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Card className={`mb-3 ${isCompleted ? "opacity-60" : ""}`}>
          <CardContent className="p-4">
            <View className="flex-row items-start justify-between mb-2">
              <View className="flex-1">
                <Text className="text-base font-semibold mb-1">
                  {activity.activity_plan?.title ||
                    activity.title ||
                    "Planned Activity"}
                </Text>
                {showDate && (
                  <Text className="text-xs text-muted-foreground">
                    {format(new Date(activity.scheduled_date), "EEEE, MMM d")}
                  </Text>
                )}
              </View>

              {isCompleted && (
                <View className="bg-green-100 px-2 py-1 rounded">
                  <Text className="text-xs text-green-700 font-medium">
                    ✓ Done
                  </Text>
                </View>
              )}
            </View>

            <View className="flex-row items-center gap-4">
              {activity.duration_minutes != null && (
                <View className="flex-row items-center gap-1">
                  <Clock size={14} className="text-muted-foreground" />
                  <Text className="text-sm text-muted-foreground">
                    {Math.floor(activity.duration_minutes)} min
                  </Text>
                </View>
              )}

              <View className="flex-row items-center gap-1">
                <TrendingUp
                  size={14}
                  className={getIntensityColor(intensity)}
                />
                <Text className={`text-sm ${getIntensityColor(intensity)}`}>
                  {intensity}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    // Custom comparison
    return (
      prev.activity.id === next.activity.id &&
      prev.activity.title === next.activity.title &&
      prev.activity.duration_minutes === next.activity.duration_minutes &&
      prev.activity.intensity === next.activity.intensity &&
      prev.activity.completed_at === next.activity.completed_at &&
      prev.activity.activity_plan?.id === next.activity.activity_plan?.id &&
      prev.activity.activity_plan?.title ===
        next.activity.activity_plan?.title &&
      prev.showDate === next.showDate
    );
  },
);

PlannedActivityListItem.displayName = "PlannedActivityListItem";

/**
 * Memoized Training Week Card Component
 *
 * Shows weekly summary with optimized re-renders.
 * Only updates when week data actually changes.
 *
 * @example
 * ```tsx
 * <WeeklySummaryCard
 *   week={weekData}
 *   onPress={() => handleWeekPress(weekData.weekNumber)}
 * />
 * ```
 */
export const WeeklySummaryCard = memo(
  ({
    week,
    onPress,
  }: {
    week: {
      weekNumber: number;
      weekStart: string;
      weekEnd: string;
      totalDistance: number;
      totalTSS: number;
      activitiesCompleted: number;
      activitiesPlanned: number;
    };
    onPress?: () => void;
  }) => {
    const completionRate =
      week.activitiesPlanned > 0
        ? Math.round((week.activitiesCompleted / week.activitiesPlanned) * 100)
        : 0;

    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Card className="mb-3">
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-lg font-semibold">
                  Week {week.weekNumber}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {format(new Date(week.weekStart), "MMM d")} -{" "}
                  {format(new Date(week.weekEnd), "MMM d")}
                </Text>
              </View>

              <View className="bg-primary/10 px-3 py-2 rounded-lg">
                <Text className="text-sm font-semibold text-primary">
                  {completionRate}%
                </Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-2xl font-bold">
                  {week.totalDistance.toFixed(1)}
                </Text>
                <Text className="text-xs text-muted-foreground">km</Text>
              </View>

              <View className="flex-1 items-center">
                <Text className="text-2xl font-bold">{week.totalTSS}</Text>
                <Text className="text-xs text-muted-foreground">TSS</Text>
              </View>

              <View className="flex-1 items-end">
                <Text className="text-2xl font-bold">
                  {week.activitiesCompleted}/{week.activitiesPlanned}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  activities
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    // Only re-render if actual values change
    return (
      prev.week.weekNumber === next.week.weekNumber &&
      prev.week.totalDistance === next.week.totalDistance &&
      prev.week.totalTSS === next.week.totalTSS &&
      prev.week.activitiesCompleted === next.week.activitiesCompleted &&
      prev.week.activitiesPlanned === next.week.activitiesPlanned
    );
  },
);

WeeklySummaryCard.displayName = "WeeklySummaryCard";

/**
 * Memoized Metric Card Component
 *
 * Generic card for displaying metrics.
 * Prevents re-renders when parent updates.
 *
 * @example
 * ```tsx
 * <MetricCard
 *   label="Distance"
 *   value="42.2 km"
 *   icon={<MapPin size={20} />}
 * />
 * ```
 */
export const MetricCard = memo(
  ({
    label,
    value,
    subtitle,
    icon,
  }: {
    label: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ReactNode;
  }) => {
    return (
      <Card className="flex-1">
        <CardContent className="p-4">
          {icon && <View className="mb-2">{icon}</View>}
          <Text className="text-2xl font-bold mb-1">{value}</Text>
          <Text className="text-xs text-muted-foreground">{label}</Text>
          {subtitle && (
            <Text className="text-xs text-muted-foreground mt-1">
              {subtitle}
            </Text>
          )}
        </CardContent>
      </Card>
    );
  },
  (prev, next) => {
    return (
      prev.label === next.label &&
      prev.value === next.value &&
      prev.subtitle === next.subtitle
    );
  },
);

MetricCard.displayName = "MetricCard";
