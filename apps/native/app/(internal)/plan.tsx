import { ThemedView } from "@components/ThemedView";
import { ProfileService } from "@lib/services/profile-service";
import { WorkoutService } from "@lib/services/workout-service";
import { Ionicons } from "@expo/vector-icons";
import { SPORT_TYPES, WORKOUT_TYPES, type Profile } from "@repo/core/schemas";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

interface PlannedWorkout {
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState<PlannedWorkout[]>([]);

  // Initialize screen
  useEffect(() => {
    console.log("📅 Plan Screen - Initializing");
    initializePlanScreen();
  }, []);

  const initializePlanScreen = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log("📅 Plan Screen - Loading profile and workouts");

      const currentProfile = await ProfileService.getCurrentProfile();
      if (currentProfile) {
        setProfile(currentProfile);
        console.log("📅 Plan Screen - Profile loaded:", {
          id: currentProfile.id,
          username: currentProfile.username,
        });

        // Load planned workouts (mock data for now)
        await loadPlannedWorkouts();
      } else {
        setError("Profile not found. Please set up your profile first.");
        console.warn("📅 Plan Screen - No profile found");
      }
    } catch (err) {
      console.error("📅 Plan Screen - Initialization error:", err);
      setError("Failed to load training plan");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlannedWorkouts = async () => {
    try {
      // Mock planned workouts data
      const mockWorkouts: PlannedWorkout[] = [
        {
          id: "1",
          date: new Date().toISOString().split("T")[0],
          type: "INTERVAL",
          sport: "RIDE",
          name: "Threshold Intervals",
          duration: 3600,
          description: "5x8min @ FTP with 3min recovery",
          completed: false,
          targetTSS: 95,
        },
        {
          id: "2",
          date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
          type: "RECOVERY",
          sport: "RUN",
          name: "Recovery Run",
          duration: 2400,
          description: "Easy pace for 40min",
          completed: false,
          targetTSS: 35,
        },
        {
          id: "3",
          date: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
          type: "ENDURANCE",
          sport: "RIDE",
          name: "Long Ride",
          duration: 7200,
          description: "Steady Zone 2 ride",
          completed: false,
          targetTSS: 140,
        },
      ];

      setPlannedWorkouts(mockWorkouts);
      updateCurrentWeek(mockWorkouts, selectedDate);
      console.log(
        "📅 Plan Screen - Planned workouts loaded:",
        mockWorkouts.length,
      );
    } catch (err) {
      console.error("📅 Plan Screen - Error loading workouts:", err);
      throw err;
    }
  };

  const updateCurrentWeek = (workouts: PlannedWorkout[], date: string) => {
    const selected = new Date(date);
    const startOfWeek = new Date(selected);
    startOfWeek.setDate(selected.getDate() - selected.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const weekWorkouts = workouts.filter((workout) => {
      const workoutDate = new Date(workout.date);
      return workoutDate >= startOfWeek && workoutDate <= endOfWeek;
    });

    setCurrentWeek(weekWorkouts);
    console.log("📅 Plan Screen - Current week updated:", {
      date,
      workouts: weekWorkouts.length,
    });
  };

  const handleRefresh = useCallback(async () => {
    console.log("📅 Plan Screen - Refreshing");
    setIsRefreshing(true);
    try {
      await loadPlannedWorkouts();
    } catch (err) {
      console.error("📅 Plan Screen - Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleDateSelect = (date: string) => {
    console.log("📅 Plan Screen - Date selected:", date);
    setSelectedDate(date);
    updateCurrentWeek(plannedWorkouts, date);
  };

  const markWorkoutCompleted = async (workoutId: string) => {
    try {
      console.log("📅 Plan Screen - Marking workout completed:", workoutId);

      const updatedWorkouts = plannedWorkouts.map((workout) =>
        workout.id === workoutId ? { ...workout, completed: true } : workout,
      );

      setPlannedWorkouts(updatedWorkouts);
      updateCurrentWeek(updatedWorkouts, selectedDate);

      Alert.alert("Success", "Workout marked as completed!");
    } catch (err) {
      console.error("📅 Plan Screen - Error completing workout:", err);
      Alert.alert("Error", "Failed to update workout status");
    }
  };

  const getCalendarMarkedDates = (): Record<string, CalendarMarking> => {
    const marked: Record<string, CalendarMarking> = {};

    plannedWorkouts.forEach((workout) => {
      marked[workout.date] = {
        marked: true,
        dotColor: workout.completed ? "#10b981" : "#3b82f6",
        completed: workout.completed,
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

  const getWorkoutIcon = (sport: string, type: string) => {
    const sportIcon =
      sport === "RIDE" ? "bicycle" : sport === "RUN" ? "walk" : "fitness";
    return sportIcon;
  };

  const getWorkoutColor = (type: string) => {
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

  const selectedDateWorkouts = plannedWorkouts.filter(
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
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
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

        {/* Selected Date Workouts */}
        <View style={styles.workoutsSection}>
          <Text style={styles.sectionTitle}>
            {selectedDate === new Date().toISOString().split("T")[0]
              ? "Today's Workouts"
              : `Workouts for ${new Date(selectedDate).toLocaleDateString()}`}
          </Text>

          {selectedDateWorkouts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>No workouts scheduled</Text>
              <Text style={styles.emptyStateSubtext}>
                Tap + to add a workout
              </Text>
            </View>
          ) : (
            selectedDateWorkouts.map((workout) => (
              <View key={workout.id} style={styles.workoutCard}>
                <View style={styles.workoutHeader}>
                  <View
                    style={[
                      styles.workoutIconContainer,
                      { backgroundColor: getWorkoutColor(workout.type) },
                    ]}
                  >
                    <Ionicons
                      name={getWorkoutIcon(workout.sport, workout.type) as any}
                      size={20}
                      color="#ffffff"
                    />
                  </View>

                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutName}>{workout.name}</Text>
                    <Text style={styles.workoutType}>
                      {workout.type.replace("_", " ")} •{" "}
                      {WorkoutService.formatDuration(workout.duration)}
                    </Text>
                    {workout.targetTSS && (
                      <Text style={styles.workoutTSS}>
                        Target: {workout.targetTSS} TSS
                      </Text>
                    )}
                  </View>

                  {!workout.completed && (
                    <TouchableOpacity
                      onPress={() => markWorkoutCompleted(workout.id)}
                      style={styles.completeButton}
                    >
                      <Ionicons name="checkmark" size={16} color="#10b981" />
                    </TouchableOpacity>
                  )}

                  {workout.completed && (
                    <View style={styles.completedBadge}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#10b981"
                      />
                    </View>
                  )}
                </View>

                {workout.description && (
                  <Text style={styles.workoutDescription}>
                    {workout.description}
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
                <Text style={styles.weekStatLabel}>Workouts</Text>
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
  workoutsSection: {
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
  workoutCard: {
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
  workoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  workoutIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  workoutType: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  workoutTSS: {
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
  workoutDescription: {
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
