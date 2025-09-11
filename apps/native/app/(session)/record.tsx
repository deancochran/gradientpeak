import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { RecordingBodySection } from "@components/activity/RecordingBodySection";
import { RecordingControls } from "@components/activity/RecordingControls";
import { RecordingHeader } from "@components/activity/RecordingHeader";
import { ActivitySummaryModal } from "@components/modals/ActivitySummaryModal";
import { ThemedView } from "@components/ThemedView";
import { useGlobalPermissions } from "@lib/contexts/PermissionsContext";
import { useProfile } from "@lib/hooks/api/profiles";
import { useAdvancedBluetooth } from "@lib/hooks/useAdvancedBluetooth";
import { useEnhancedActivityRecording } from "@lib/hooks/useEnhancedActivityRecording";
import ActivityCompletionService from "@lib/services/activity-completion-service";
import PlannedActivityService, {
  PlannedActivity,
} from "@lib/services/planned-activity-service";

import { ActivityType } from "@repo/core";

interface ActivitySummary {
  id: string;
  name: string;
  duration: string;
  distance: string;
  averageSpeed: string;
  maxSpeed: string;
  calories: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averagePower?: number;
  maxPower?: number;
  elevation?: {
    gain: number;
    loss: number;
  };
  tss?: number;
  if?: number;
  np?: number;
}

export default function RecordScreen() {
  // Hooks
  const { connectedDevices, isBluetoothEnabled, sensorValues } =
    useAdvancedBluetooth();
  const { hasAllRequiredPermissions } = useGlobalPermissions();
  const { data: profile } = useProfile();

  const {
    isRecording,
    isPaused,
    metrics,
    connectionStatus,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useEnhancedActivityRecording();

  // Local state for activity selection
  const [workoutSelectionMode, setWorkoutSelectionMode] = useState<
    "none" | "choosing" | "planned" | "unplanned"
  >("none");
  const [selectedActivityType, setSelectedActivityType] =
    useState<ActivityType | null>(null);
  const [selectedPlannedActivity, setSelectedPlannedActivity] = useState<
    string | null
  >(null);
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>(
    [],
  );

  // Loading and completion states
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Activity summary modal
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [activitySummary, setActivitySummary] =
    useState<ActivitySummary | null>(null);

  // Load planned activities on mount
  useEffect(() => {
    const loadPlannedActivities = async () => {
      try {
        const activities =
          await PlannedActivityService.getAllPlannedActivities();
        setPlannedActivities(activities);
      } catch (error) {
        console.error("Failed to load planned activities:", error);
        // Use demo data if service fails
        setPlannedActivities([
          {
            id: "demo-1",
            name: "Morning Interval Session",
            description: "High-intensity intervals for endurance building",
            estimatedDuration: 45,
            activityType: "cycling",
            steps: [],
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: "demo",
              difficulty: "moderate" as const,
              tags: [],
            },
          },
          {
            id: "demo-2",
            name: "Recovery Ride",
            description: "Easy-paced recovery session",
            estimatedDuration: 30,
            activityType: "cycling",
            steps: [],
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: "demo",
              difficulty: "easy" as const,
              tags: [],
            },
          },
        ]);
      }
    };
    loadPlannedActivities();
  }, []);

  // Start selection process when screen loads
  useEffect(() => {
    if (workoutSelectionMode === "none") {
      setWorkoutSelectionMode("choosing");
    }
  }, [workoutSelectionMode]);

  // Determine if user can close (not recording or paused)
  const canClose = !isRecording && !isPaused;

  // Determine if activity is selected
  const hasSelectedActivity =
    selectedActivityType !== null || selectedPlannedActivity !== null;

  // Determine if recording can start (activity selected and requirements met)
  const canStartRecording =
    hasSelectedActivity &&
    hasAllRequiredPermissions &&
    connectionStatus.gps === "connected";

  // Navigation handlers
  const handleClose = useCallback(() => {
    if (canClose) {
      router.back();
    }
  }, [canClose]);

  const handlePermissionsPress = useCallback(() => {
    router.push("/(session)/permissions");
  }, []);

  const handleBluetoothPress = useCallback(() => {
    router.push("/(session)/bluetooth");
  }, []);

  // Activity selection handlers
  const handleWorkoutModeSelection = useCallback(
    (mode: "planned" | "unplanned") => {
      setWorkoutSelectionMode(mode);
    },
    [],
  );

  const handleBackToOptions = useCallback(() => {
    setWorkoutSelectionMode("choosing");
  }, []);

  const handlePlannedActivitySelection = useCallback((activityId: string) => {
    setSelectedPlannedActivity(activityId);
    setWorkoutSelectionMode("none"); // Hide selection UI
  }, []);

  const handleActivityTypeSelection = useCallback(
    (activityType: ActivityType) => {
      setSelectedActivityType(activityType);
      setWorkoutSelectionMode("none"); // Hide selection UI
    },
    [],
  );

  // Recording control handlers
  const handleStart = useCallback(async () => {
    if (!canStartRecording) return;

    setIsStarting(true);
    try {
      const success = await startRecording();
      if (!success) {
        console.error("Failed to start recording");
      }
    } catch (error) {
      console.error("Error starting recording:", error);
    } finally {
      setIsStarting(false);
    }
  }, [canStartRecording, startRecording]);

  const handlePause = useCallback(async () => {
    try {
      await pauseRecording();
    } catch (error) {
      console.error("Error pausing recording:", error);
    }
  }, [pauseRecording]);

  const handleResume = useCallback(async () => {
    try {
      await resumeRecording();
    } catch (error) {
      console.error("Error resuming recording:", error);
    }
  }, [resumeRecording]);

  const handleFinish = useCallback(async () => {
    setIsCompleting(true);
    try {
      const recording = await stopRecording();

      if (!recording || !profile?.id) {
        console.error("No recording data or profile to save");
        router.replace("/(internal)");
        return;
      }

      // Generate activity name
      const activityName = selectedPlannedActivity
        ? `Planned Workout - ${new Date().toLocaleDateString()}`
        : `${selectedActivityType?.name || "Activity"} - ${new Date().toLocaleDateString()}`;

      // Determine activity type
      const activityType = selectedActivityType
        ? selectedActivityType.id
        : selectedPlannedActivity
          ? "cycling" // Default for planned activities
          : "other";

      // Complete activity
      const completionResult = await ActivityCompletionService.completeActivity(
        recording,
        profile.id,
        activityName,
        activityType,
        {
          uploadToCloud: true,
          createStreams: true,
          calculateMetrics: true,
          saveLocalJson: true,
        },
      );

      // Create activity summary
      const summary: ActivitySummary = {
        id: completionResult.activityRecord.id,
        name: completionResult.activityRecord.name,
        duration: formatDuration(recording.metrics.duration),
        distance: formatDistance(recording.metrics.distance),
        averageSpeed: formatSpeed(recording.metrics.avgSpeed),
        maxSpeed: formatSpeed(completionResult.activityRecord.maxSpeed || 0),
        calories: recording.metrics.calories || 0,
        averageHeartRate: completionResult.activityRecord.averageHeartRate,
        maxHeartRate: completionResult.activityRecord.maxHeartRate,
        averagePower: completionResult.activityRecord.averagePower,
        maxPower: completionResult.activityRecord.maxPower,
        elevation: completionResult.activityRecord.elevation
          ? {
              gain: completionResult.activityRecord.elevation.gain,
              loss: completionResult.activityRecord.elevation.loss || 0,
            }
          : undefined,
        tss: completionResult.activityRecord.trainingStressScore,
        if: completionResult.activityRecord.intensityFactor,
        np: completionResult.activityRecord.normalizedPower,
      };

      setActivitySummary(summary);
      setSummaryModalVisible(true);
    } catch (error) {
      console.error("Failed to complete activity:", error);
      router.replace("/(internal)");
    } finally {
      setIsCompleting(false);
    }
  }, [stopRecording, profile, selectedPlannedActivity, selectedActivityType]);

  const handleDiscard = useCallback(async () => {
    try {
      await stopRecording();
      if (selectedPlannedActivity) {
        await PlannedActivityService.abandonSession();
      }
      router.replace("/(internal)");
    } catch (error) {
      console.error("Failed to discard activity:", error);
      router.replace("/(internal)");
    }
  }, [stopRecording, selectedPlannedActivity]);

  const handleSummaryClose = useCallback(() => {
    setSummaryModalVisible(false);
    setActivitySummary(null);
    router.replace("/(internal)");
  }, []);

  // Utility functions
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

  const formatDistance = (meters: number): string => {
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const formatSpeed = (metersPerSecond: number): string => {
    return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
  };

  return (
    <ThemedView style={styles.container}>
      {/* Recording Header */}
      <RecordingHeader
        onClose={canClose ? handleClose : undefined}
        canClose={canClose}
        isRecording={isRecording}
        isPaused={isPaused}
        selectedActivityType={selectedActivityType}
        selectedPlannedActivity={selectedPlannedActivity}
        isGpsReady={connectionStatus.gps === "connected"}
        gpsSignalStrength="good"
        hasAllPermissions={hasAllRequiredPermissions}
        onPermissionsPress={handlePermissionsPress}
        isBluetoothEnabled={isBluetoothEnabled}
        connectedDevicesCount={connectedDevices.length}
        onBluetoothPress={handleBluetoothPress}
        sensorValues={sensorValues}
      />

      {/* Recording Body */}
      <RecordingBodySection
        workoutSelectionMode={workoutSelectionMode}
        selectedActivityType={selectedActivityType}
        selectedPlannedActivity={selectedPlannedActivity}
        isRecording={isRecording}
        isPaused={isPaused}
        plannedActivities={plannedActivities}
        metrics={{
          duration: metrics.duration,
          distance: metrics.distance,
          currentSpeed: metrics.currentSpeed,
          avgSpeed: metrics.avgSpeed,
          calories: metrics.calories || 0,
          elevation: 0,
        }}
        connectionStatus={{
          gps:
            connectionStatus.gps === "connected"
              ? "connected"
              : connectionStatus.gps === "connecting"
                ? "connecting"
                : "disconnected",
          bluetooth:
            connectionStatus.bluetooth === "connected"
              ? "connected"
              : connectionStatus.bluetooth === "connecting"
                ? "connecting"
                : "disconnected",
        }}
        sensorValues={sensorValues}
        onWorkoutModeSelection={handleWorkoutModeSelection}
        onPlannedActivitySelection={handlePlannedActivitySelection}
        onActivityTypeSelection={handleActivityTypeSelection}
        onBackToOptions={handleBackToOptions}
      />

      {/* Recording Footer */}
      <RecordingControls
        isRecording={isRecording}
        isPaused={isPaused}
        hasSelectedActivity={hasSelectedActivity}
        canStartRecording={canStartRecording}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onFinish={handleFinish}
        onDiscard={handleDiscard}
        isStarting={isStarting}
        isCompleting={isCompleting}
      />

      {/* Activity Summary Modal */}
      <ActivitySummaryModal
        visible={summaryModalVisible}
        summary={activitySummary}
        onClose={handleSummaryClose}
        onViewActivities={() => {
          setSummaryModalVisible(false);
          router.replace("/(internal)");
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
});
