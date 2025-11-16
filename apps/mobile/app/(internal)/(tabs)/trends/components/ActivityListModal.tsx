// gradientpeak/apps/mobile/app/(internal)/(tabs)/trends/components/ActivityListModal.tsx

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  X,
  Zap,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

interface ActivityListModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  dateFrom: string;
  dateTo: string;
  intensityZone?: string;
  onClose: () => void;
}

/**
 * Modal for displaying filtered activities with drill-down from trends
 * Simple, stable navigation pattern for enterprise reliability
 */
export function ActivityListModal({
  visible,
  title,
  subtitle,
  dateFrom,
  dateTo,
  intensityZone,
  onClose,
}: ActivityListModalProps) {
  const router = useRouter();

  // Fetch activities for the date range
  const { data: activities = [], isLoading } = trpc.activities.list.useQuery(
    {
      date_from: dateFrom,
      date_to: dateTo,
    },
    {
      enabled: visible,
    },
  );

  // Filter by intensity zone if specified
  const filteredActivities = intensityZone
    ? activities.filter((activity) => {
        const if_value = activity.intensity_factor || 0;
        // Map intensity factor to zones
        switch (intensityZone) {
          case "recovery":
            return if_value < 0.55;
          case "endurance":
            return if_value >= 0.55 && if_value < 0.75;
          case "tempo":
            return if_value >= 0.75 && if_value < 0.85;
          case "threshold":
            return if_value >= 0.85 && if_value < 0.95;
          case "vo2max":
            return if_value >= 0.95 && if_value < 1.05;
          case "anaerobic":
            return if_value >= 1.05 && if_value < 1.15;
          case "neuromuscular":
            return if_value >= 1.15;
          default:
            return true;
        }
      })
    : activities;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatActivityType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getActivityIcon = (type: string) => {
    if (type.includes("run")) return Activity;
    if (type.includes("bike")) return Activity;
    if (type.includes("swim")) return Activity;
    return Activity;
  };

  const getIntensityColor = (if_value: number | null) => {
    if (!if_value) return "text-gray-400";
    if (if_value < 0.55) return "text-blue-500";
    if (if_value < 0.75) return "text-green-500";
    if (if_value < 0.85) return "text-yellow-500";
    if (if_value < 0.95) return "text-orange-500";
    if (if_value < 1.05) return "text-red-500";
    if (if_value < 1.15) return "text-red-600";
    return "text-purple-600";
  };

  const handleActivityPress = (activityId: string) => {
    onClose();
    // Navigate to activity detail view
    router.push({
      pathname: "/(internal)/(tabs)/plan/activities/[activity_id]" as any,
      params: { activity_id: activityId },
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900">{title}</Text>
              {subtitle && (
                <Text className="text-sm text-gray-600 mt-1">{subtitle}</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="ml-4 p-2 rounded-full bg-gray-100"
            >
              <Icon as={X} size={20} className="text-gray-600" />
            </TouchableOpacity>
          </View>

          {/* Filter info */}
          <View className="flex-row items-center gap-2 mt-2">
            <View className="flex-row items-center gap-1 px-2 py-1 bg-blue-50 rounded">
              <Icon as={Calendar} size={12} className="text-blue-600" />
              <Text className="text-xs text-blue-600">
                {formatDate(dateFrom)} - {formatDate(dateTo)}
              </Text>
            </View>
            {intensityZone && (
              <View className="flex-row items-center gap-1 px-2 py-1 bg-purple-50 rounded">
                <Icon as={Zap} size={12} className="text-purple-600" />
                <Text className="text-xs text-purple-600 capitalize">
                  {intensityZone}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Activity List */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
            <Text className="text-gray-600 mt-2">Loading activities...</Text>
          </View>
        ) : filteredActivities.length === 0 ? (
          <View className="flex-1 items-center justify-center p-6">
            <View className="bg-gray-100 rounded-full p-4 mb-4">
              <Icon as={Activity} size={32} className="text-gray-400" />
            </View>
            <Text className="text-lg font-semibold text-gray-900 mb-2">
              No Activities Found
            </Text>
            <Text className="text-sm text-gray-600 text-center">
              {intensityZone
                ? `No activities in the ${intensityZone} zone for this period`
                : "No activities found for this date range"}
            </Text>
          </View>
        ) : (
          <ScrollView className="flex-1">
            <View className="p-4">
              {/* Summary */}
              <View className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <View className="flex-row items-center justify-around">
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-blue-900">
                      {filteredActivities.length}
                    </Text>
                    <Text className="text-xs text-blue-600 mt-1">
                      Activities
                    </Text>
                  </View>
                  <View className="w-px h-8 bg-blue-200" />
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-blue-900">
                      {Math.round(
                        filteredActivities.reduce(
                          (sum, a) => sum + (a.training_stress_score || 0),
                          0,
                        ),
                      )}
                    </Text>
                    <Text className="text-xs text-blue-600 mt-1">
                      Total TSS
                    </Text>
                  </View>
                  <View className="w-px h-8 bg-blue-200" />
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-blue-900">
                      {formatDuration(
                        filteredActivities.reduce(
                          (sum, a) => sum + ((a as any).duration_seconds || 0),
                          0,
                        ),
                      )}
                    </Text>
                    <Text className="text-xs text-blue-600 mt-1">
                      Total Time
                    </Text>
                  </View>
                </View>
              </View>

              {/* Activity Cards */}
              <View className="gap-3">
                {filteredActivities.map((activity) => (
                  <Pressable
                    key={activity.id}
                    onPress={() => handleActivityPress(activity.id)}
                    className="bg-white rounded-lg border border-gray-200 p-4 active:bg-gray-50"
                  >
                    {/* Header */}
                    <View className="flex-row items-start justify-between mb-3">
                      <View className="flex-1 mr-3">
                        <Text
                          className="text-base font-semibold text-gray-900 mb-1"
                          numberOfLines={1}
                        >
                          {activity.name || "Untitled Activity"}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {formatDate(activity.started_at)}
                        </Text>
                      </View>
                      <View className="bg-green-100 rounded-full p-2">
                        <Icon
                          as={CheckCircle2}
                          size={16}
                          className="text-green-600"
                        />
                      </View>
                    </View>

                    {/* Activity Type */}
                    <View className="flex-row items-center gap-2 mb-3">
                      <Icon
                        as={getActivityIcon(activity.activity_type)}
                        size={14}
                        className="text-gray-600"
                      />
                      <Text className="text-sm text-gray-600">
                        {formatActivityType(activity.activity_type)}
                      </Text>
                    </View>

                    {/* Metrics */}
                    <View className="flex-row items-center gap-4">
                      <View className="flex-row items-center gap-1">
                        <Icon as={Clock} size={14} className="text-gray-500" />
                        <Text className="text-sm text-gray-700">
                          {formatDuration(
                            (activity as any).duration_seconds || 0,
                          )}
                        </Text>
                      </View>

                      <Text className="text-gray-400">•</Text>

                      <Text className="text-sm text-gray-700">
                        {Math.round(activity.training_stress_score || 0)} TSS
                      </Text>

                      {activity.intensity_factor && (
                        <>
                          <Text className="text-gray-400">•</Text>
                          <View className="flex-row items-center gap-1">
                            <Icon
                              as={Zap}
                              size={14}
                              className={getIntensityColor(
                                activity.intensity_factor,
                              )}
                            />
                            <Text
                              className={`text-sm font-medium ${getIntensityColor(activity.intensity_factor)}`}
                            >
                              IF {activity.intensity_factor.toFixed(2)}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
