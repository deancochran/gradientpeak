import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedView } from "@components/ThemedView";
import { useColorScheme } from "@lib/providers/ThemeProvider";
import PlannedActivityService, {
  PlannedActivity,
} from "@lib/services/planned-activity-service";

export default function SelectWorkoutModal() {
  const { isDarkColorScheme } = useColorScheme();
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlannedActivities();
  }, []);

  const loadPlannedActivities = async () => {
    try {
      setLoading(true);
      const activities = await PlannedActivityService.getAllPlannedActivities();
      setPlannedActivities(activities);
    } catch (error) {
      console.error("Failed to load planned activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    console.log("🏋️ [DEBUG] Select workout modal closed via navigation");
    router.back();
  }, []);

  const handleSelectPlannedActivity = useCallback(
    (plannedActivityId: string) => {
      console.log("🏋️ [DEBUG] Selected planned activity:", plannedActivityId);
      // Navigate back to record screen with planned activity selection
      router.replace({
        pathname: "/(session)/record",
        params: { plannedActivityId },
      });
    },
    [],
  );

  const handleStartFreeActivity = useCallback(() => {
    console.log("🏋️ [DEBUG] Starting free activity");
    // Navigate back to record screen without planned activity
    router.replace({
      pathname: "/(session)/record",
      params: { startRecording: "true" },
    });
  }, []);

  const renderPlannedActivity = ({ item }: { item: PlannedActivity }) => (
    <TouchableOpacity
      style={[
        styles.activityItem,
        { backgroundColor: isDarkColorScheme ? "#1f1f1f" : "#ffffff" },
      ]}
      onPress={() => handleSelectPlannedActivity(item.id)}
    >
      <View style={styles.activityHeader}>
        <Text
          style={[
            styles.activityName,
            { color: isDarkColorScheme ? "#ffffff" : "#000000" },
          ]}
        >
          {item.name}
        </Text>
        <Text
          style={[
            styles.activityDuration,
            { color: isDarkColorScheme ? "#cccccc" : "#666666" },
          ]}
        >
          {item.estimatedDuration ? `${item.estimatedDuration} min` : ""}
        </Text>
      </View>
      {item.description && (
        <Text
          style={[
            styles.activityDescription,
            { color: isDarkColorScheme ? "#cccccc" : "#666666" },
          ]}
        >
          {item.description}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: isDarkColorScheme ? "#333333" : "#e5e5e5",
          },
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { color: isDarkColorScheme ? "#ffffff" : "#000000" },
          ]}
        >
          Select Workout
        </Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons
            name="close"
            size={24}
            color={isDarkColorScheme ? "#ffffff" : "#000000"}
          />
        </TouchableOpacity>
      </View>

      {/* Free Activity Option */}
      <TouchableOpacity
        style={[styles.freeActivityButton, { backgroundColor: "#3b82f6" }]}
        onPress={handleStartFreeActivity}
      >
        <Ionicons name="play" size={20} color="#ffffff" />
        <Text style={styles.freeActivityText}>Start Unplanned Activity</Text>
      </TouchableOpacity>

      {/* Planned Activities List */}
      <View style={styles.sectionHeader}>
        <Text
          style={[
            styles.sectionTitle,
            { color: isDarkColorScheme ? "#ffffff" : "#000000" },
          ]}
        >
          Planned Workouts
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text
            style={[
              styles.loadingText,
              { color: isDarkColorScheme ? "#cccccc" : "#666666" },
            ]}
          >
            Loading workouts...
          </Text>
        </View>
      ) : plannedActivities.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="fitness-outline"
            size={64}
            color={isDarkColorScheme ? "#666666" : "#cccccc"}
          />
          <Text
            style={[
              styles.emptyTitle,
              { color: isDarkColorScheme ? "#ffffff" : "#000000" },
            ]}
          >
            No Planned Workouts
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: isDarkColorScheme ? "#cccccc" : "#666666" },
            ]}
          >
            Start an unplanned activity or create a workout plan
          </Text>
        </View>
      ) : (
        <FlatList
          data={plannedActivities}
          renderItem={renderPlannedActivity}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
  },
  freeActivityButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  freeActivityText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  listContainer: {
    padding: 16,
  },
  activityItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  activityName: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  activityDuration: {
    fontSize: 14,
    fontWeight: "500",
  },
  activityDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
