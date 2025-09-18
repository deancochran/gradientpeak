import { ThemedView } from "@/components/ThemedView";
import { useProfile } from "@/lib/api/trpc-hooks";
import { ActivityService } from "@/lib/services";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
// Local type definitions
const WORKOUT_TYPES = {
  INTERVAL: "INTERVAL",
  RECOVERY: "RECOVERY",
  ENDURANCE: "ENDURANCE",
  TEMPO: "TEMPO",
  THRESHOLD: "THRESHOLD",
} as const;

const SPORT_TYPES = {
  RIDE: "RIDE",
  RUN: "RUN",
  SWIM: "SWIM",
} as const;

interface PlannedActivity {
  id: string;
  date: string;
  type: keyof typeof WORKOUT_TYPES;
  sport: keyof typeof SPORT_TYPES;
  name: string;
  duration: number;
  description?: string;
  completed: boolean;
  targetTSS?: number;
}

interface CalendarMarking {
  marked: boolean;
  dotColor: string;
  selectedColor?: string;
  completed?: boolean;
}

export default function PlanScreen() {
  // TanStack Query hooks
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const {
    data: plannedActivities = [],
    isLoading: activitiesLoading,
    error: activitiesError,
    refetch: refetchActivities,
  } = usePlannedActivitiesByDate({ date: selectedDate });

  const [error, setError] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState<PlannedActivity[]>([]);

  // Combined loading state
  const isLoading = profileLoading || activitiesLoading;

  // Initialize screen
  useEffect(() => {
    console.log("📅 Plan Screen - Initializing");

    if (profile) {
      console.log("📅 Plan Screen - Profile loaded:", {
        id: profile.id,
        username: profile.username,
      });
    } else if (!profileLoading && !profile) {
      setError("Profile not found. Please set up your profile first.");
      console.warn("📅 Plan Screen - No profile found");
    }

    if (activitiesError) {
      console.error("📅 Plan Screen - Activities error:", activitiesError);
      setError("Failed to load training plan");
    }
  }, [profile, profileLoading, activitiesError]);

  // Update current week when planned activities or selected date changes
  useEffect(() => {
    if (plannedActivities.length > 0) {
      updateCurrentWeek(plannedActivities, selectedDate);
      console.log(
        "📅 Plan Screen - Planned activities loaded:",
        plannedActivities.length,
      );
    }
  }, [plannedActivities, selectedDate]);

  const updateCurrentWeek = (activities: PlannedActivity[], date: string) => {
    const selected = new Date(date);
    const startOfWeek = new Date(selected);
    startOfWeek.setDate(selected.getDate() - selected.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const weekActivities = activities.filter((activity) => {
      const activityDate = new Date(activity.date);
      return activityDate >= startOfWeek && activityDate <= endOfWeek;
    });

    setCurrentWeek(weekActivities);
    console.log("📅 Plan Screen - Current week updated:", {
      date,
      activities: weekActivities.length,
    });
  };

  const handleRefresh = useCallback(async () => {
    console.log("📅 Plan Screen - Refreshing");
    try {
      await refetchActivities();
    } catch (err) {
      console.error("📅 Plan Screen - Refresh error:", err);
    }
  }, [refetchActivities]);

  const handleDateSelect = (date: string) => {
    console.log("📅 Plan Screen - Date selected:", date);
    setSelectedDate(date);
    // updateCurrentWeek will be called automatically via useEffect when plannedActivities changes
  };

  const markActivityCompleted = async (activityId: string) => {
    try {
      console.log("📅 Plan Screen - Marking activity completed:", activityId);

      // TODO: Implement mutation for marking activity as completed
      // For now, just show success message
      Alert.alert("Success", "Activity marked as completed!");

      // Refetch activities to get updated state
      await refetchActivities();
    } catch (err) {
      console.error("📅 Plan Screen - Error completing activity:", err);
      Alert.alert("Error", "Failed to update activity status");
    }
  };

  const getCalendarMarkedDates = (): Record<string, CalendarMarking> => {
    const marked: Record<string, CalendarMarking> = {};

    plannedActivities.forEach((activity) => {
      marked[activity.date] = {
        marked: true,
        dotColor: activity.completed ? "#10b981" : "#3b82f6",
        completed: activity.completed,
      };
    });

    // Mark selected date
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selectedColor: "#3b82f6",
      };
    }

    return marked;
  };

  const getActivityIcon = (sport: string, type: string) => {
    const sportIcon =
      sport === "RIDE" ? "bicycle" : sport === "RUN" ? "walk" : "fitness";
    return sportIcon;
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "INTERVAL":
        return "#ef4444";
      case "THRESHOLD":
        return "#f59e0b";
      case "ENDURANCE":
        return "#3b82f6";
      case "RECOVERY":
        return "#10b981";
      case "VO2_MAX":
        return "#8b5cf6";
      default:
        return "#6b7280";
    }
  };

  const selectedDateActivities = plannedActivities.filter(
    (w) => w.date === selectedDate,
  );
  const weeklyTSS = currentWeek.reduce((sum, w) => sum + (w.targetTSS || 0), 0);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading training plan...</Text>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={activitiesLoading}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Training Plan</Text>
          <View style={styles.headerStats}>
            <Text style={styles.weeklyTSS}>Week: {weeklyTSS} TSS</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Calendar */}
        <View style={styles.calendarContainer}>
          <Calendar
            current={selectedDate}
            onDayPress={(day) => handleDateSelect(day.dateString)}
            markedDates={getCalendarMarkedDates()}
            theme={{
              backgroundColor: "#ffffff",
              calendarBackground: "#ffffff",
              textSectionTitleColor: "#6b7280",
              selectedDayBackgroundColor: "#3b82f6",
              selectedDayTextColor: "#ffffff",
              todayTextColor: "#3b82f6",
              dayTextColor: "#111827",
              textDisabledColor: "#d1d5db",
              arrowColor: "#3b82f6",
              monthTextColor: "#111827",
              textDayFontWeight: "500",
              textMonthFontWeight: "600",
              textDayHeaderFontWeight: "600",
            }}
            style={styles.calendar}
          />
        </View>

        {/* Selected Date Activities */}
        <View style={styles.activitysSection}>
          <Text style={styles.sectionTitle}>
            {selectedDate === new Date().toISOString().split("T")[0]
              ? "Today's Activities"
              : `Activities for ${new Date(selectedDate).toLocaleDateString()}`}
          </Text>

          {selectedDateActivities.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>No activitys scheduled</Text>
              <Text style={styles.emptyStateSubtext}>
                Tap + to add a activity
              </Text>
            </View>
          ) : (
            selectedDateActivities.map((activity) => (
              <View key={activity.id} style={styles.activityCard}>
                <View style={styles.activityHeader}>
                  <View
                    style={[
                      styles.activityIconContainer,
                      { backgroundColor: getActivityColor(activity.type) },
                    ]}
                  >
                    <Ionicons
                      name={
                        getActivityIcon(
                          activity.sport,
                          activity.type,
                        ) as keyof typeof Ionicons.glyphMap
                      }
                      size={20}
                      color="#ffffff"
                    />
                  </View>

                  <View style={styles.activityInfo}>
                    <Text style={styles.activityName}>{activity.name}</Text>
                    <Text style={styles.activityType}>
                      {activity.type.replace("_", " ")} •{" "}
                      {ActivityService.formatDuration(activity.duration)}
                    </Text>
                    {activity.targetTSS && (
                      <Text style={styles.activityTSS}>
                        Target: {activity.targetTSS} TSS
                      </Text>
                    )}
                  </View>

                  {!activity.completed && (
                    <TouchableOpacity
                      onPress={() => markActivityCompleted(activity.id)}
                      style={styles.completeButton}
                    >
                      <Ionicons name="checkmark" size={16} color="#10b981" />
                    </TouchableOpacity>
                  )}

                  {activity.completed && (
                    <View style={styles.completedBadge}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#10b981"
                      />
                    </View>
                  )}
                </View>

                {activity.description && (
                  <Text style={styles.activityDescription}>
                    {activity.description}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Week Overview */}
        {currentWeek.length > 0 && (
          <View style={styles.weekSection}>
            <Text style={styles.sectionTitle}>This Week</Text>
            <View style={styles.weekStats}>
              <View style={styles.weekStatItem}>
                <Text style={styles.weekStatValue}>{currentWeek.length}</Text>
                <Text style={styles.weekStatLabel}>Activities</Text>
              </View>
              <View style={styles.weekStatItem}>
                <Text style={styles.weekStatValue}>{weeklyTSS}</Text>
                <Text style={styles.weekStatLabel}>Target TSS</Text>
              </View>
              <View style={styles.weekStatItem}>
                <Text style={styles.weekStatValue}>
                  {currentWeek.filter((w) => w.completed).length}
                </Text>
                <Text style={styles.weekStatLabel}>Completed</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
  },
  headerStats: {
    alignItems: "flex-end",
  },
  weeklyTSS: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3b82f6",
  },
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
  },
  calendarContainer: {
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 10,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  calendar: {
    borderRadius: 8,
  },
  activitysSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  activityCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  activityIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  activityType: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  activityTSS: {
    fontSize: 12,
    color: "#3b82f6",
    fontWeight: "500",
  },
  completeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#f0fdf4",
  },
  completedBadge: {
    padding: 4,
  },
  activityDescription: {
    fontSize: 14,
    color: "#374151",
    fontStyle: "italic",
    paddingLeft: 52,
  },
  weekSection: {
    paddingHorizontal: 20,
    marginBottom: 100,
  },
  weekStats: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  weekStatItem: {
    flex: 1,
    alignItems: "center",
  },
  weekStatValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  weekStatLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
});
