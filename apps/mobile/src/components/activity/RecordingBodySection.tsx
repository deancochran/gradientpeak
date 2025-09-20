import { Ionicons } from "@expo/vector-icons";
import { ActivityType, getPopularActivityTypes } from "@repo/core";
import React from "react";
import {
    Button,
    FlatList,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { PlannedActivity } from "@/lib/services/planned-activity-service";
import { MetricsGrid } from "./MetricsGrid";

interface RecordingBodySectionProps {
  // Selection state
  workoutSelectionMode: "none" | "choosing" | "planned" | "unplanned";
  selectedActivityType: ActivityType | null;
  selectedPlannedActivity: string | null;

  // Recording state
  isRecording: boolean;
  isPaused: boolean;

  // Requirements checking
  hasSelectedActivity: boolean;
  canStartRecording: boolean;
  hasAllRequiredPermissions: boolean;
  requiresGPS: boolean;

  // Activity data
  plannedActivities: PlannedActivity[];

  // Metrics data (for unplanned activities)
  metrics: {
    duration: number;
    distance: number;
    currentSpeed: number;
    avgSpeed: number;
    calories: number;
    elevation: number;
  };

  // Connection status for metrics display
  connectionStatus: {
    gps: "connected" | "connecting" | "disconnected";
    bluetooth: "connected" | "connecting" | "disconnected";
  };

  // Sensor values
  sensorValues?: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    timestamp?: number;
  };

  // Callbacks
  onWorkoutModeSelection: (mode: "planned" | "unplanned") => void;
  onPlannedActivitySelection: (activityId: string) => void;
  onActivityTypeSelection: (activityType: ActivityType) => void;
  onBackToOptions: () => void;
  onPermissionsPress?: () => void;
}

export const RecordingBodySection: React.FC<RecordingBodySectionProps> = ({
  workoutSelectionMode,
  selectedActivityType,
  selectedPlannedActivity,
  isRecording,
  isPaused,
  hasSelectedActivity,
  canStartRecording,
  hasAllRequiredPermissions,
  requiresGPS,
  plannedActivities,
  metrics,
  connectionStatus,
  sensorValues,
  onWorkoutModeSelection,
  onPlannedActivitySelection,
  onActivityTypeSelection,
  onBackToOptions,
  onPermissionsPress,
}) => {
  // Show metrics grid when activity is selected and recording
  if (
    (selectedActivityType || selectedPlannedActivity) &&
    (isRecording || isPaused)
  ) {
    if (selectedPlannedActivity) {
      // Demo planned activity display
      return (
        <View style={styles.container}>
          <View style={styles.plannedActivityDisplay}>
            <View style={styles.currentStepCard}>
              <Text style={styles.stepTitle}>Current Step</Text>
              <Text style={styles.stepName}>Warmup</Text>
              <Text style={styles.stepDescription}>
                Easy pace for 10 minutes
              </Text>

              <View style={styles.targetZones}>
                <View style={styles.zoneItem}>
                  <Text style={styles.zoneLabel}>Target HR</Text>
                  <Text style={styles.zoneValue}>120-140 bpm</Text>
                </View>
                <View style={styles.zoneItem}>
                  <Text style={styles.zoneLabel}>Target Power</Text>
                  <Text style={styles.zoneValue}>150-180 W</Text>
                </View>
              </View>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: "30%" }]} />
              </View>
              <Text style={styles.progressText}>3:00 / 10:00</Text>
            </View>

            <View style={styles.workoutOverview}>
              <Text style={styles.overviewTitle}>Activity Steps</Text>
              <View style={styles.stepsList}>
                <View style={[styles.stepItem, styles.activeStep]}>
                  <Text style={styles.stepItemText}>1. Warmup - 10min</Text>
                </View>
                <View style={styles.stepItem}>
                  <Text style={styles.stepItemText}>2. Intervals - 5x3min</Text>
                </View>
                <View style={styles.stepItem}>
                  <Text style={styles.stepItemText}>3. Recovery - 2min</Text>
                </View>
                <View style={styles.stepItem}>
                  <Text style={styles.stepItemText}>4. Cooldown - 10min</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      );
    } else {
      // Unplanned activity metrics display
      const formattedMetrics = [
        {
          id: "duration",
          title: "Duration",
          value: formatDuration(metrics.duration),
          unit: "",
          isLive: isRecording && !isPaused,
          dataSource: "device_sensors",
          sourceIcon: "timer-outline",
        },
        {
          id: "distance",
          title: "Distance",
          value: (metrics.distance / 1000).toFixed(2),
          unit: "km",
          isLive: isRecording && !isPaused,
          dataSource:
            connectionStatus.gps === "connected" ? "gps" : "calculated",
          sourceIcon:
            connectionStatus.gps === "connected" ? "location" : "calculator",
        },
        {
          id: "speed",
          title: "Speed",
          value: (metrics.currentSpeed * 3.6).toFixed(1),
          unit: "km/h",
          isLive: isRecording && !isPaused,
          dataSource:
            connectionStatus.gps === "connected" ? "gps" : "calculated",
          sourceIcon:
            connectionStatus.gps === "connected" ? "location" : "calculator",
        },
        {
          id: "calories",
          title: "Calories",
          value: metrics.calories.toString(),
          unit: "kcal",
          isLive: isRecording && !isPaused,
          dataSource: "calculated",
          sourceIcon: "calculator",
        },
        {
          id: "heartRate",
          title: "Heart Rate",
          value: sensorValues?.heartRate?.toString() || "--",
          unit: "bpm",
          isLive: isRecording && !!sensorValues?.heartRate,
          dataSource: sensorValues?.heartRate ? "bluetooth" : "none",
          sourceIcon: sensorValues?.heartRate
            ? "bluetooth"
            : "help-circle-outline",
        },
        {
          id: "elevation",
          title: "Elevation",
          value: metrics.elevation.toString(),
          unit: "m",
          isLive: false,
          dataSource: "gps",
          sourceIcon: "trending-up",
        },
      ];

      return (
        <View style={styles.container}>
          <MetricsGrid metrics={formattedMetrics} />
        </View>
      );
    }
  }

  // Show requirements not met message when activity is selected but can't start recording
  if (hasSelectedActivity && !canStartRecording) {
    const requirementsIssues = [];

    if (!hasAllRequiredPermissions) {
      requirementsIssues.push("Permissions required");
    }

    if (requiresGPS && connectionStatus.gps !== "connected") {
      requirementsIssues.push("GPS connection needed");
    }

    return (
      <View style={styles.container}>
        <View style={styles.requirementsContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#f59e0b" />
          <Text style={styles.requirementsTitle}>Requirements Not Met</Text>
          <Text style={styles.requirementsDescription}>
            Your activity is selected but some requirements need to be resolved
            before recording can start.
          </Text>

          <View style={styles.requirementsList}>
            {!hasAllRequiredPermissions && (
              <Button
                style={styles.requirementItem}
                onPress={onPermissionsPress}
              >
                <View style={styles.requirementIcon}>
                  <Ionicons name="shield-outline" size={20} color="#ef4444" />
                </View>
                <View style={styles.requirementContent}>
                  <Text style={styles.requirementTitle}>
                    Permissions Required
                  </Text>
                  <Text style={styles.requirementSubtext}>
                    Tap to grant location, bluetooth, and motion permissions
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </Button>
            )}

            {requiresGPS && connectionStatus.gps !== "connected" && (
              <View style={styles.requirementItem}>
                <View style={styles.requirementIcon}>
                  <Ionicons name="location-outline" size={20} color="#f59e0b" />
                </View>
                <View style={styles.requirementContent}>
                  <Text style={styles.requirementTitle}>
                    GPS Connection Required
                  </Text>
                  <Text style={styles.requirementSubtext}>
                    {connectionStatus.gps === "connecting"
                      ? "Waiting for GPS signal..."
                      : selectedActivityType?.environment === "outdoor"
                        ? "Move to an area with better sky visibility"
                        : "GPS is required for accurate distance tracking"}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.requirementsFooter}>
            Activity: {selectedActivityType?.name || "Planned Activity"}
            {selectedActivityType?.environment && (
              <Text style={styles.environmentBadge}>
                {" • "}
                {selectedActivityType.environment}
              </Text>
            )}
          </Text>
        </View>
      </View>
    );
  }

  // Show selection interface when no activity is selected
  return (
    <View style={styles.container}>
      {workoutSelectionMode === "none" ||
      workoutSelectionMode === "choosing" ? (
        <View style={styles.selectionContainer}>
          <Text style={styles.selectionTitle}>Choose Activity Type</Text>

          <View style={styles.optionsContainer}>
            <Button
              style={styles.optionButton}
              onPress={() => onWorkoutModeSelection("planned")}
            >
              <Ionicons name="calendar-outline" size={32} color="#3b82f6" />
              <Text style={styles.optionTitle}>Planned Activity</Text>
              <Text style={styles.optionDescription}>
                Follow a structured training plan
              </Text>
            </Button>

            <Button
              style={styles.optionButton}
              onPress={() => onWorkoutModeSelection("unplanned")}
            >
              <Ionicons name="fitness-outline" size={32} color="#10b981" />
              <Text style={styles.optionTitle}>Unplanned Activity</Text>
              <Text style={styles.optionDescription}>
                Record a free-form activity
              </Text>
            </Button>
          </View>
        </View>
      ) : workoutSelectionMode === "planned" ? (
        <View style={styles.listContainer}>
          <View style={styles.navigationHeader}>
            <Button
              onPress={onBackToOptions}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={20} color="#6b7280" />
              <Text style={styles.backText}>Back</Text>
            </Button>
            <Text style={styles.listTitle}>Select Activity</Text>
          </View>

          {plannedActivities.length > 0 ? (
            <FlatList
              data={plannedActivities}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Button
                  style={styles.listItem}
                  onPress={() => onPlannedActivitySelection(item.id)}
                >
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemTitle}>{item.name}</Text>
                    {item.description && (
                      <Text style={styles.listItemDescription}>
                        {item.description}
                      </Text>
                    )}
                    {item.estimatedDuration && (
                      <Text style={styles.listItemMeta}>
                        Duration: {item.estimatedDuration} min
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </Button>
              )}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyTitle}>No Planned Workouts</Text>
              <Text style={styles.emptyDescription}>
                Create a activity plan to see activities here
              </Text>
            </View>
          )}
        </View>
      ) : workoutSelectionMode === "unplanned" ? (
        <View style={styles.listContainer}>
          <View style={styles.navigationHeader}>
            <Button
              onPress={onBackToOptions}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={20} color="#6b7280" />
              <Text style={styles.backText}>Back</Text>
            </Button>
            <Text style={styles.listTitle}>Select Activity Type</Text>
          </View>

          <FlatList
            data={getPopularActivityTypes()}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Button
                style={styles.activityTypeItem}
                onPress={() => onActivityTypeSelection(item)}
              >
                <View style={styles.activityIcon}>
                  <Text style={styles.activityEmoji}>
                    {item.displayConfig.emoji}
                  </Text>
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityName}>{item.name}</Text>
                  <Text style={styles.activityDescription}>
                    {item.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </Button>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  // Selection Interface
  selectionContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  selectionTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    marginBottom: 32,
  },
  optionsContainer: {
    gap: 16,
  },
  optionButton: {
    padding: 24,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 12,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },

  // List Interface
  listContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  navigationHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  backText: {
    fontSize: 16,
    color: "#6b7280",
    marginLeft: 4,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  listItemDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  listItemMeta: {
    fontSize: 12,
    color: "#9ca3af",
  },

  // Activity Type List
  activityTypeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  activityEmoji: {
    fontSize: 20,
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
  activityDescription: {
    fontSize: 14,
    color: "#6b7280",
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },

  // Planned Activity Display
  plannedActivityDisplay: {
    flex: 1,
    padding: 20,
  },
  currentStepCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  stepName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 16,
    color: "#475569",
    marginBottom: 16,
  },
  targetZones: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  zoneItem: {
    flex: 1,
  },
  zoneLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
  },
  zoneValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  progressBar: {
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#475569",
    textAlign: "center",
  },
  workoutOverview: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  overviewTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 12,
  },
  stepsList: {
    gap: 8,
  },
  stepItem: {
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  activeStep: {
    backgroundColor: "#dbeafe",
    borderColor: "#3b82f6",
  },
  stepItemText: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "500",
  },

  // Requirements Not Met Styles
  requirementsContainer: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  requirementsTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  requirementsDescription: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  requirementsList: {
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  requirementIcon: {
    marginRight: 12,
  },
  requirementContent: {
    flex: 1,
  },
  requirementTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  requirementSubtext: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 18,
  },
  requirementsFooter: {
    fontSize: 14,
    color: "#9ca3af",
    fontStyle: "italic",
    textAlign: "center",
  },
  environmentBadge: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
    textTransform: "capitalize",
  },
});

// Helper function for duration formatting
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
};
