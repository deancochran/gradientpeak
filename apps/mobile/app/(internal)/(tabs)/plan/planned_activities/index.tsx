import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  Activity,
  Bike,
  Calendar,
  Clock,
  Dumbbell,
  Footprints,
  Plus,
  Waves,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { PlannedActivityDetailModal } from "../components/modals/PlannedActivityDetailModal";

const ACTIVITY_CONFIGS = {
  outdoor_run: {
    name: "Outdoor Run",
    icon: Footprints,
    color: "text-blue-600",
  },
  outdoor_bike: { name: "Outdoor Bike", icon: Bike, color: "text-green-600" },
  indoor_treadmill: {
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    icon: Bike,
    color: "text-orange-600",
  },
  indoor_strength: {
    name: "Strength Training",
    icon: Dumbbell,
    color: "text-red-600",
  },
  indoor_swim: { name: "Swimming", icon: Waves, color: "text-cyan-600" },
  other: { name: "Other Activity", icon: Activity, color: "text-gray-600" },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    padding: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  headerSubtitle: {
    color: "#6b7280",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 32,
    maxWidth: 300,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDescription: {
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: "#6b7280",
  },
  scrollContent: {
    paddingBottom: 100,
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  groupBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  groupBadgeText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  groupContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  activityCard: {
    opacity: 1,
  },
  activityCardPressed: {
    opacity: 0.7,
  },
  activityContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  activityIconContainer: {
    marginRight: 12,
    marginTop: 4,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  activityDetails: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  activityName: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  activityTime: {
    fontSize: 14,
    fontWeight: "500",
    color: "#3b82f6",
  },
  activityType: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
  },
  activityMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 4,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default function ScheduledScreen() {
  const router = useRouter();
  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);

  // Query all scheduled activities
  const { data: scheduledData, isLoading } =
    trpc.plannedActivities.list.useQuery({
      limit: 100, // Get all activities for scheduling view
    });

  const scheduledActivities = scheduledData?.items || [];

  const handleActivityTap = (activityId: string) => {
    setSelectedPlannedActivityId(activityId);
  };

  const handleScheduleNew = () => {
    router.push({
      pathname: "../library",
      params: { scheduleIntent: "true" },
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const groupActivitiesByDate = (activities: any[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000);
    const nextWeekStart = new Date(
      endOfWeek.getTime() + 1 * 24 * 60 * 60 * 1000,
    );
    const nextWeekEnd = new Date(
      nextWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000,
    );

    const groups = {
      today: [] as any[],
      tomorrow: [] as any[],
      thisWeek: [] as any[],
      nextWeek: [] as any[],
      later: [] as any[],
    };

    activities.forEach((activity) => {
      const date = new Date(activity.scheduled_date);
      const activityDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );

      if (activityDate.getTime() === today.getTime()) {
        groups.today.push(activity);
      } else if (activityDate.getTime() === tomorrow.getTime()) {
        groups.tomorrow.push(activity);
      } else if (
        activityDate >= startOfWeek &&
        activityDate <= endOfWeek &&
        activityDate > today
      ) {
        groups.thisWeek.push(activity);
      } else if (activityDate >= nextWeekStart && activityDate <= nextWeekEnd) {
        groups.nextWeek.push(activity);
      } else {
        groups.later.push(activity);
      }
    });

    return groups;
  };

  const renderActivityCard = (activity: any) => {
    const config =
      ACTIVITY_CONFIGS[
        activity.activity_plan?.activity_type as keyof typeof ACTIVITY_CONFIGS
      ] || ACTIVITY_CONFIGS.other;

    return (
      <TouchableOpacity
        key={activity.id}
        onPress={() => handleActivityTap(activity.id)}
        style={styles.activityCard}
        activeOpacity={0.7}
      >
        <Card>
          <CardContent className="p-4">
            <View style={styles.activityContent}>
              {/* Icon */}
              <View style={styles.activityIconContainer}>
                <View style={styles.activityIcon}>
                  <Icon as={config.icon} size={20} className={config.color} />
                </View>
              </View>

              {/* Content */}
              <View style={styles.activityDetails}>
                {/* Header */}
                <View style={styles.activityHeader}>
                  <Text style={styles.activityName}>
                    {activity.activity_plan?.name || "Unnamed Activity"}
                  </Text>
                  <Text style={styles.activityTime}>
                    {formatTime(activity.scheduled_date)}
                  </Text>
                </View>

                {/* Activity Type */}
                <Text style={styles.activityType}>{config.name}</Text>

                {/* Metadata */}
                <View style={styles.activityMeta}>
                  {activity.activity_plan?.estimated_duration && (
                    <View style={styles.metaItem}>
                      <Icon
                        as={Clock}
                        size={14}
                        className="text-muted-foreground"
                      />
                      <Text style={styles.metaText}>
                        {activity.activity_plan.estimated_duration} min
                      </Text>
                    </View>
                  )}

                  {activity.activity_plan?.estimated_tss && (
                    <Text style={styles.metaText}>
                      TSS: {activity.activity_plan.estimated_tss}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </CardContent>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderGroup = (title: string, activities: any[]) => {
    if (activities.length === 0) return null;

    return (
      <View key={title} style={styles.groupContainer}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>{title}</Text>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>{activities.length}</Text>
          </View>
        </View>
        <View style={styles.groupContent}>
          {activities.map(renderActivityCard)}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading scheduled activities...</Text>
      </View>
    );
  }

  if (!scheduledActivities || scheduledActivities.length === 0) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Scheduled Activities</Text>
          <Text style={styles.headerSubtitle}>
            Your planned activities will appear here
          </Text>
        </View>

        {/* Empty State */}
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <Icon as={Calendar} size={64} className="text-muted-foreground" />
            <Text style={styles.emptyTitle}>No Activities Scheduled</Text>
            <Text style={styles.emptyDescription}>
              Browse the library to get started with your training plan
            </Text>
            <Button onPress={handleScheduleNew} className="w-full">
              <Icon
                as={Plus}
                size={16}
                className="text-primary-foreground mr-2"
              />
              <Text className="text-primary-foreground">
                Schedule from Library
              </Text>
            </Button>
          </View>
        </View>
      </View>
    );
  }

  const groupedActivities = groupActivitiesByDate(scheduledActivities);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scheduled Activities</Text>
        <Text style={styles.headerSubtitle}>
          {scheduledActivities.length} activity
          {scheduledActivities.length !== 1 ? "s" : ""} scheduled
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
      >
        {renderGroup("Today", groupedActivities.today)}
        {renderGroup("Tomorrow", groupedActivities.tomorrow)}
        {renderGroup("This Week", groupedActivities.thisWeek)}
        {renderGroup("Next Week", groupedActivities.nextWeek)}
        {renderGroup("Later", groupedActivities.later)}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleScheduleNew}
        activeOpacity={0.8}
      >
        <Icon as={Plus} size={24} className="text-white" />
      </TouchableOpacity>

      {/* Modal */}
      {selectedPlannedActivityId && (
        <PlannedActivityDetailModal
          plannedActivityId={selectedPlannedActivityId}
          isVisible={!!selectedPlannedActivityId}
          onClose={() => setSelectedPlannedActivityId(null)}
        />
      )}
    </View>
  );
}
