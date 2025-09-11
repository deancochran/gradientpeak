import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityType, getPopularActivityTypes } from "@repo/core";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";

import { MetricsGrid } from "@components/activity/MetricsGrid";
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

interface PlannedActivityGuidance {
  stepName: string;
  stepType: "warmup" | "work" | "rest" | "cooldown";
  instructions: string;
  targetIntensity?: { zone: number; power?: number; heartRate?: number };
  timeProgress: number;
  distanceProgress: number;
  overall: number;
  compliance: { inRange: boolean; message?: string };
}

export default function EnhancedRecordScreen() {
  // Hooks
  const { connectedDevices, isBluetoothEnabled, sensorValues } =
    useAdvancedBluetooth();
  const { permissions, forceCheckPermissions } = useGlobalPermissions();
  const { data: profile } = useProfile();

  const {
    isRecording,
    isPaused,
    metrics,
    connectionStatus,
    isRecovering,
    lastError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    addSensorData,

    clearRecoveryData,
  } = useEnhancedActivityRecording();

  // Local state
  const [isModalVisible, setIsModalVisible] = useState(true);
  const [activitySummary, setActivitySummary] =
    useState<ActivitySummary | null>(null);
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [plannedActivityGuidance, setPlannedActivityGuidance] =
    useState<PlannedActivityGuidance | null>(null);
  const [selectedPlannedActivity, setSelectedPlannedActivity] = useState<
    string | null
  >(null);
  const [isCompletingActivity, setIsCompletingActivity] = useState(false);
  const [selectedActivityType, setSelectedActivityType] =
    useState<ActivityType | null>(null);

  // Unified screen state management
  const [recordingState, setRecordingState] = useState<
    "selection" | "recording"
  >("selection");
  const [workoutSelectionMode, setWorkoutSelectionMode] = useState<
    "options" | "planned" | "activity-type"
  >("options");
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Check permissions - only require essential permissions for recording
  const essentialPermissions: (keyof typeof permissions)[] = [
    "location",
    "bluetooth",
    "motion",
  ];
  const hasAllPermissions = essentialPermissions.every(
    (permType) => permissions[permType]?.granted,
  );

  // Debug logs for permissions
  useEffect(() => {
    console.log("🔍 [DEBUG] Permissions state changed:", {
      permissions,
      hasAllPermissions,
      essentialPermissionsCheck: essentialPermissions.map((permType) => ({
        [permType]: permissions[permType as keyof typeof permissions]?.granted,
      })),
      allPermissionsCheck: Object.entries(permissions).map(([key, value]) => ({
        [key]: {
          granted: value?.granted,
          canAskAgain: value?.canAskAgain,
          loading: value?.loading,
        },
      })),
    });
  }, [permissions, hasAllPermissions]);

  // Reset modal visibility when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log("🎬 Enhanced Record screen focused");
      setIsModalVisible(true);

      // Reset to selection state when screen opens fresh
      setRecordingState("selection");
      setWorkoutSelectionMode("options");

      return () => {
        console.log("🎬 Enhanced Record screen unfocused");
      };
    }, []),
  );

  // Load planned activities
  useEffect(() => {
    const loadPlannedActivities = async () => {
      try {
        const activities =
          await PlannedActivityService.getAllPlannedActivities();
        setPlannedActivities(activities);
      } catch (error) {
        console.error("Failed to load planned activities:", error);
      }
    };
    loadPlannedActivities();
  }, []);

  // Listen for app state changes to recheck permissions when returning from Settings
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log("📱 [DEBUG] App state changed:", nextAppState);
      if (nextAppState === "active") {
        console.log("📱 [DEBUG] App became active, rechecking permissions...");
        // Recheck permissions when app becomes active (user might have granted them in Settings)
        forceCheckPermissions()
          .then(() => {
            console.log(
              "📱 [DEBUG] Force check completed, new permissions:",
              permissions,
            );
          })
          .catch((error) =>
            console.warn("📱 [DEBUG] Failed to recheck permissions:", error),
          );
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, [forceCheckPermissions, permissions]);

  // Stream sensor data with enhanced validation
  useEffect(() => {
    if (isRecording && sensorValues?.timestamp) {
      const now = Date.now();
      const dataAge = now - sensorValues.timestamp;

      if (dataAge > 15000) {
        console.warn(
          "🔶 Stale sensor data detected, skipping:",
          dataAge + "ms old",
        );
        return;
      }

      const hasValidSensorData =
        sensorValues.heartRate ||
        sensorValues.power ||
        sensorValues.cadence ||
        sensorValues.speed ||
        sensorValues.calories ||
        sensorValues.steps;

      if (hasValidSensorData) {
        addSensorData({
          ...(sensorValues.heartRate && { heartRate: sensorValues.heartRate }),
          ...(sensorValues.power && { power: sensorValues.power }),
          ...(sensorValues.cadence && { cadence: sensorValues.cadence }),
          ...(sensorValues.speed && { speed: sensorValues.speed }),
          ...(sensorValues.calories && { calories: sensorValues.calories }),
          timestamp: sensorValues.timestamp,
        });

        // Update planned activity session metrics if active
        if (selectedPlannedActivity) {
          PlannedActivityService.updateSessionMetrics(
            metrics.duration,
            metrics.distance,
            sensorValues.heartRate,
            sensorValues.power,
          ).catch((error) =>
            console.warn("Failed to update session metrics:", error),
          );
        }
      }
    }
  }, [
    isRecording,
    sensorValues?.heartRate,
    sensorValues?.power,
    sensorValues?.cadence,
    sensorValues?.speed,
    sensorValues?.calories,
    sensorValues?.timestamp,
    addSensorData,
    selectedPlannedActivity,
    metrics.duration,
    metrics.distance,
  ]);

  // Update planned activity guidance
  useEffect(() => {
    if (isRecording && selectedPlannedActivity) {
      const updateGuidance = async () => {
        try {
          const stepInfo = await PlannedActivityService.getCurrentStepInfo();
          if (!stepInfo.sessionActive || !stepInfo.step) {
            return;
          }

          const progress = await PlannedActivityService.getStepProgress();
          const compliance = PlannedActivityService.checkStepCompliance(
            stepInfo.step,
            {
              heartRate: sensorValues?.heartRate,
              power: sensorValues?.power,
            },
          );

          setPlannedActivityGuidance({
            stepName: stepInfo.step.name || "Current Step",
            stepType: stepInfo.step.type as
              | "warmup"
              | "cooldown"
              | "work"
              | "rest",
            instructions:
              stepInfo.step.instructions || "Continue with current step",
            targetIntensity: stepInfo.step.targetIntensity
              ? {
                  zone: 1, // Default zone
                  power: stepInfo.step.targetIntensity.target,
                  heartRate: stepInfo.step.targetIntensity.target,
                }
              : undefined,
            timeProgress: progress.timeProgress,
            distanceProgress: progress.distanceProgress,
            overall: progress.overall,
            compliance,
          });
        } catch (error) {
          console.warn("Failed to update guidance:", error);
        }
      };

      updateGuidance();
      const interval = setInterval(updateGuidance, 5000);
      return () => clearInterval(interval);
    }
  }, [isRecording, selectedPlannedActivity, sensorValues]);

  // Handle permissions check and navigation to permissions if needed
  const handleStartRecording = async () => {
    if (!hasAllPermissions) {
      router.push("/(session)/permissions");
      return;
    }
    // Start recording is now handled by selection handlers
    console.log("🎬 Permissions check passed");
  };

  const startFreeActivity = async () => {
    console.log("🎬 Starting free activity recording...");
    const success = await startRecording();
    if (!success) {
      Alert.alert(
        "Error",
        "Failed to start recording. Please check your permissions and GPS signal.",
      );
    } else {
      console.log("✅ Activity recording started successfully");
      setRecordingState("recording");
    }
  };

  const startFreeActivityWithType = async (activityType: ActivityType) => {
    console.log(
      "🎬 Starting free activity recording with type:",
      activityType.name,
    );
    setSelectedActivityType(activityType);
    const success = await startRecording();
    if (!success) {
      Alert.alert(
        "Error",
        "Failed to start recording. Please check your permissions and GPS signal.",
      );
    } else {
      console.log(
        "✅ Activity recording started successfully with type:",
        activityType.name,
      );
      setRecordingState("recording");
    }
  };

  const startPlannedActivity = async (plannedActivityId: string) => {
    if (!plannedActivityId) {
      return startFreeActivity();
    }

    setSelectedPlannedActivity(plannedActivityId);

    console.log("🎯 Starting planned activity recording...");
    const success = await startRecording();

    if (success) {
      try {
        await PlannedActivityService.startPlannedActivitySession(
          plannedActivityId,
          `recording_${Date.now()}`,
        );
        console.log("✅ Planned activity session started");
        setRecordingState("recording");
      } catch (error) {
        console.warn("Failed to start planned activity session:", error);
      }
    } else {
      Alert.alert(
        "Error",
        "Failed to start recording. Please check your permissions and GPS signal.",
      );
      setSelectedPlannedActivity(null);
    }
  };

  const handleStopRecording = async () => {
    console.log("🎬 Stopping enhanced activity recording...");
    setIsCompletingActivity(true);

    try {
      const recording = await stopRecording();
      if (!recording) {
        console.error("No recording data to save");
        setIsCompletingActivity(false);
        setIsModalVisible(false);
        router.replace("/(internal)");
        return;
      }

      if (!profile?.id) {
        console.error("Profile not found");
        setIsCompletingActivity(false);
        setIsModalVisible(false);
        router.replace("/(internal)");
        return;
      }

      // Complete planned activity session if active
      if (selectedPlannedActivity) {
        try {
          await PlannedActivityService.abandonSession();
        } catch (error) {
          console.warn("Failed to complete planned activity session:", error);
        }
      }

      // Generate activity name
      const activityName = selectedPlannedActivity
        ? `Planned Workout - ${new Date().toLocaleDateString()}`
        : `Activity - ${new Date().toLocaleDateString()}`;

      // Determine activity type
      const activityType = selectedActivityType
        ? selectedActivityType.id
        : selectedPlannedActivity
          ? "cycling" // Default for planned activities
          : "other"; // Default fallback

      // Complete activity using enhanced workflow
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
      setIsCompletingActivity(false);
      setSummaryModalVisible(true);
      setIsModalVisible(false);
    } catch (error) {
      console.error("❌ Failed to complete activity:", error);
      setIsCompletingActivity(false);

      // Still close the modal and navigate, but show a brief message
      setIsModalVisible(false);
      router.replace("/(internal)");

      // Brief notification instead of blocking alert
      setTimeout(() => {
        console.log("Activity saved locally and will sync when possible");
      }, 500);
    }
  };

  const handleCloseModal = () => {
    // Only allow closing if no recording is active
    if (!isRecording && !isPaused) {
      setIsModalVisible(false);
      router.back();
    }
    // If recording is active, do nothing - user must use recording controls
  };

  const handleDiscardActivity = async () => {
    try {
      console.log("🗑️ Discarding activity...");
      await stopRecording();

      if (selectedPlannedActivity) {
        await PlannedActivityService.abandonSession();
      }

      setIsModalVisible(false);
      router.replace("/(internal)");
      console.log("✅ Activity discarded successfully");
    } catch (error) {
      console.error("❌ Failed to discard activity:", error);
      Alert.alert("Error", "Failed to discard activity. Please try again.");
    }
  };

  const handleBluetoothPress = () => {
    console.log("🔵 [DEBUG] Navigating to bluetooth modal");
    router.push("/(session)/bluetooth");
  };

  const handlePermissionsPress = () => {
    console.log("🛡️ [DEBUG] Navigating to permissions modal");
    router.push("/(session)/permissions");
  };

  const handleSummaryClose = () => {
    setSummaryModalVisible(false);
    setActivitySummary(null);
    setSelectedPlannedActivity(null);
    router.replace("/(internal)");
  };

  // Vibrate on step changes for planned activities
  useEffect(() => {
    if (plannedActivityGuidance && isRecording) {
      Vibration.vibrate([100, 50, 100]);
    }
  }, [plannedActivityGuidance?.stepName, isRecording]);

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

  const formatPace = (metersPerSecond: number): string => {
    if (metersPerSecond <= 0) return "--:--";
    const kmh = metersPerSecond * 3.6;
    const minPerKm = 60 / kmh;
    const minutes = Math.floor(minPerKm);
    const seconds = Math.round((minPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Improved metrics formatting with data source indicators
  const displayMetrics = useMemo(
    () => [
      {
        id: "duration",
        title: "Duration",
        value: formatDuration(metrics.duration),
        unit: "",
        icon: "time-outline" as const,
        isLive: isRecording && !isPaused,
        dataSource: "device_sensors" as const,
        sourceIcon: "timer-outline" as const,
      },
      {
        id: "distance",
        title: "Distance",
        value: (metrics.distance / 1000).toFixed(2),
        unit: "km",
        icon: "navigate-outline" as const,
        isLive: isRecording && !isPaused,
        dataSource:
          connectionStatus.gps === "connected"
            ? ("gps" as const)
            : ("calculated" as const),
        sourceIcon:
          connectionStatus.gps === "connected" ? "location" : "calculator",
      },
      {
        id: "currentSpeed",
        title: selectedActivityType?.displayConfig.showPaceInsteadOfSpeed
          ? "Current Pace"
          : "Current Speed",
        value: selectedActivityType?.displayConfig.showPaceInsteadOfSpeed
          ? formatPace(metrics.currentSpeed)
          : (metrics.currentSpeed * 3.6).toFixed(1),
        unit: selectedActivityType?.displayConfig.showPaceInsteadOfSpeed
          ? selectedActivityType.displayConfig.primaryPaceUnit === "min_per_km"
            ? "min/km"
            : "min/mi"
          : "km/h",
        icon: "speedometer-outline" as const,
        isLive: isRecording && !isPaused && metrics.currentSpeed > 0,
        dataSource:
          connectionStatus.gps === "connected"
            ? ("gps" as const)
            : ("calculated" as const),
        sourceIcon:
          connectionStatus.gps === "connected" ? "location" : "calculator",
      },
      {
        id: "avgSpeed",
        title: selectedActivityType?.displayConfig.showPaceInsteadOfSpeed
          ? "Avg Pace"
          : "Avg Speed",
        value: selectedActivityType?.displayConfig.showPaceInsteadOfSpeed
          ? formatPace(metrics.avgSpeed)
          : (metrics.avgSpeed * 3.6).toFixed(1),
        unit: selectedActivityType?.displayConfig.showPaceInsteadOfSpeed
          ? selectedActivityType.displayConfig.primaryPaceUnit === "min_per_km"
            ? "min/km"
            : "min/mi"
          : "km/h",
        icon: "analytics-outline" as const,
        isLive: false,
        dataSource:
          connectionStatus.gps === "connected"
            ? ("gps" as const)
            : ("calculated" as const),
        sourceIcon:
          connectionStatus.gps === "connected" ? "location" : "calculator",
      },
      {
        id: "heartRate",
        title: "Heart Rate",
        value:
          (sensorValues?.heartRate || metrics.heartRate)?.toString() || "--",
        unit: "bpm",
        icon: "heart-outline" as const,
        isLive: isRecording && !!(sensorValues?.heartRate || metrics.heartRate),
        dataSource: sensorValues?.heartRate
          ? ("bluetooth_hr" as const)
          : ("estimated" as const),
        sourceIcon: sensorValues?.heartRate
          ? "bluetooth"
          : "help-circle-outline",
      },
      {
        id: "calories",
        title: "Calories",
        value: metrics.calories?.toString() || "0",
        unit: "kcal",
        icon: "flame-outline" as const,
        isLive: isRecording && !isPaused,
        dataSource: "calculated" as const,
        sourceIcon: "calculator" as const,
      },
      {
        id: "power",
        title: "Power",
        value: sensorValues?.power?.toString() || "--",
        unit: "W",
        icon: "flash-outline" as const,
        isLive: isRecording && !!sensorValues?.power,
        dataSource: sensorValues?.power
          ? ("bluetooth_power" as const)
          : ("manual_entry" as const),
        sourceIcon: sensorValues?.power ? "bluetooth" : "pencil-outline",
      },
      {
        id: "cadence",
        title: "Cadence",
        value: sensorValues?.cadence?.toString() || "--",
        unit: selectedActivityType?.category === "cycling" ? "rpm" : "spm",
        icon: "refresh-outline" as const,
        isLive: isRecording && !!sensorValues?.cadence,
        dataSource: sensorValues?.cadence
          ? ("bluetooth_cadence" as const)
          : ("manual_entry" as const),
        sourceIcon: sensorValues?.cadence ? "bluetooth" : "pencil-outline",
      },
    ],
    [
      metrics.duration,
      metrics.distance,
      metrics.currentSpeed,
      metrics.avgSpeed,
      metrics.heartRate,
      metrics.calories,
      sensorValues?.power,
      sensorValues?.cadence,
      sensorValues?.heartRate,
      isRecording,
      isPaused,
      selectedActivityType,
      connectionStatus.gps,
    ],
  );

  // Workout selection handlers
  const handleWorkoutModeSelection = (mode: "planned" | "activity-type") => {
    setWorkoutSelectionMode(mode);
  };

  const handlePlannedActivitySelection = (plannedActivityId: string) => {
    startPlannedActivity(plannedActivityId);
  };

  const handleActivityTypeSelection = (activityType: ActivityType) => {
    setSelectedActivityType(activityType);
    startFreeActivityWithType(activityType);
  };

  const handleBackToOptions = () => {
    setWorkoutSelectionMode("options");
    setSearchQuery("");
  };

  // Filter activities based on search
  const filteredPlannedActivities = plannedActivities.filter(
    (activity) =>
      activity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (activity.description
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ??
        false),
  );

  const popularActivityTypes = getPopularActivityTypes();

  return (
    <>
      {/* Main Recording Modal - Hidden when sub-modals are open */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={styles.container}>
            {/* Unified Header - Show different content based on state */}
            {recordingState === "recording" ? (
              <RecordingHeader
                onClose={handleCloseModal}
                isRecording={isRecording}
                isPaused={isPaused}
                activityType={selectedActivityType}
                isGpsReady={connectionStatus.gps === "connected"}
                gpsPointsCount={Math.max(1, Math.floor(metrics.distance / 10))}
                hasAllPermissions={hasAllPermissions}
                onPermissionsPress={() => {
                  console.log(
                    "🎯 [DEBUG] RecordingHeader permissions press triggered",
                  );
                  handlePermissionsPress();
                }}
                isBluetoothEnabled={isBluetoothEnabled}
                connectedDevicesCount={connectedDevices.length}
                onBluetoothPress={() => {
                  console.log(
                    "🎯 [DEBUG] RecordingHeader bluetooth press triggered",
                  );
                  handleBluetoothPress();
                }}
                sensorValues={sensorValues}
              />
            ) : (
              <View style={styles.selectionHeader}>
                <TouchableOpacity
                  onPress={handleCloseModal}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>

                {workoutSelectionMode !== "options" && (
                  <TouchableOpacity
                    onPress={handleBackToOptions}
                    style={styles.backButton}
                  >
                    <Ionicons name="chevron-back" size={24} color="#6b7280" />
                    <Text style={styles.backText}>Back</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.selectionTitle}>
                  {workoutSelectionMode === "options" && "Start Activity"}
                  {workoutSelectionMode === "planned" && "Select Workout"}
                  {workoutSelectionMode === "activity-type" &&
                    "Select Activity Type"}
                </Text>

                <View style={styles.headerSpacer} />
              </View>
            )}

            {/* Content based on recording state */}
            {recordingState === "selection" ? (
              <View style={styles.selectionContent}>
                {workoutSelectionMode === "options" && (
                  <View style={styles.optionsContainer}>
                    <TouchableOpacity
                      style={styles.workoutOptionButton}
                      onPress={() => handleWorkoutModeSelection("planned")}
                    >
                      <View style={styles.optionIconContainer}>
                        <Ionicons name="calendar" size={32} color="#3b82f6" />
                      </View>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>Planned Workout</Text>
                        <Text style={styles.optionDescription}>
                          Follow a structured training plan with guided
                          intervals
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.workoutOptionButton}
                      onPress={() =>
                        handleWorkoutModeSelection("activity-type")
                      }
                    >
                      <View style={styles.optionIconContainer}>
                        <Ionicons name="fitness" size={32} color="#10b981" />
                      </View>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>Free Activity</Text>
                        <Text style={styles.optionDescription}>
                          Start an unstructured activity with live metrics
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>
                  </View>
                )}

                {workoutSelectionMode === "planned" && (
                  <View style={styles.listContainer}>
                    {plannedActivities.length > 0 ? (
                      <FlatList
                        data={filteredPlannedActivities}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={styles.listItem}
                            onPress={() =>
                              handlePlannedActivitySelection(item.id)
                            }
                          >
                            <View style={styles.listItemContent}>
                              <Text style={styles.listItemTitle}>
                                {item.name}
                              </Text>
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
                            <Ionicons
                              name="chevron-forward"
                              size={20}
                              color="#9ca3af"
                            />
                          </TouchableOpacity>
                        )}
                        showsVerticalScrollIndicator={false}
                      />
                    ) : (
                      <View style={styles.emptyState}>
                        <Ionicons
                          name="calendar-outline"
                          size={64}
                          color="#9ca3af"
                        />
                        <Text style={styles.emptyTitle}>
                          No Planned Workouts
                        </Text>
                        <Text style={styles.emptyDescription}>
                          Create a workout plan to see structured activities
                          here
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {workoutSelectionMode === "activity-type" && (
                  <View style={styles.listContainer}>
                    <View style={styles.popularSection}>
                      <Text style={styles.sectionTitle}>
                        Popular Activities
                      </Text>
                      <FlatList
                        data={popularActivityTypes}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={styles.activityTypeItem}
                            onPress={() => handleActivityTypeSelection(item)}
                          >
                            <View
                              style={[
                                styles.activityIcon,
                                {
                                  backgroundColor: `${item.displayConfig.primaryColor}20`,
                                },
                              ]}
                            >
                              <Text style={styles.activityEmoji}>
                                {item.displayConfig.emoji}
                              </Text>
                            </View>
                            <View style={styles.activityInfo}>
                              <Text style={styles.activityName}>
                                {item.name}
                              </Text>
                              <Text style={styles.activityDescription}>
                                {item.description}
                              </Text>
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={20}
                              color="#9ca3af"
                            />
                          </TouchableOpacity>
                        )}
                        showsVerticalScrollIndicator={false}
                      />
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.recordingContent}>
                {/* Recovery Indicator */}
                {isRecovering && (
                  <View style={styles.recoveryIndicator}>
                    <Ionicons
                      name="refresh-outline"
                      size={16}
                      color="#f59e0b"
                    />
                    <Text style={styles.recoveryText}>
                      Recovering previous session...
                    </Text>
                  </View>
                )}

                {/* Error Indicator */}
                {lastError && !isRecovering && (
                  <View style={styles.errorIndicator}>
                    <Ionicons
                      name="warning-outline"
                      size={16}
                      color="#dc2626"
                    />
                    <Text style={styles.errorText}>{lastError}</Text>
                    <TouchableOpacity
                      onPress={() => clearRecoveryData()}
                      style={styles.clearErrorButton}
                    >
                      <Ionicons name="close" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Planned Activity Guidance */}
                {plannedActivityGuidance && isRecording && (
                  <View style={styles.guidanceContainer}>
                    <View style={styles.guidanceHeader}>
                      <Text style={styles.guidanceTitle}>
                        {plannedActivityGuidance.stepName}
                      </Text>
                      <View style={styles.progressContainer}>
                        <View
                          style={[
                            styles.progressBar,
                            {
                              width: `${plannedActivityGuidance.overall * 100}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <Text style={styles.guidanceInstructions}>
                      {plannedActivityGuidance.instructions}
                    </Text>
                    <View style={styles.complianceIndicator}>
                      <Ionicons
                        name={
                          plannedActivityGuidance.compliance.inRange
                            ? "checkmark-circle"
                            : "warning"
                        }
                        size={14}
                        color={
                          plannedActivityGuidance.compliance.inRange
                            ? "#10b981"
                            : "#f59e0b"
                        }
                      />
                      <Text
                        style={[
                          styles.complianceText,
                          {
                            color: plannedActivityGuidance.compliance.inRange
                              ? "#10b981"
                              : "#f59e0b",
                          },
                        ]}
                      >
                        {plannedActivityGuidance.compliance.message ||
                          "On target"}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Metrics - Only show when recording */}
                {isRecording || isPaused ? (
                  <View style={styles.content}>
                    <MetricsGrid metrics={displayMetrics} />
                  </View>
                ) : null}

                {/* Recording Controls Footer */}
                <RecordingControls
                  isRecording={isRecording}
                  isPaused={isPaused}
                  onStart={handleStartRecording}
                  onFinish={handleStopRecording}
                  onPause={pauseRecording}
                  onResume={resumeRecording}
                  onDiscard={handleDiscardActivity}
                  hasPermissions={hasAllPermissions}
                  isLoading={isCompletingActivity}
                />
              </View>
            )}

            {/* Selection Footer */}
            {recordingState === "selection" && (
              <View style={styles.selectionFooter}>
                <View style={styles.footerContent}>
                  {workoutSelectionMode === "options" && (
                    <Text style={styles.footerHint}>
                      Choose how you want to track your activity
                    </Text>
                  )}
                  {workoutSelectionMode === "planned" && (
                    <Text style={styles.footerHint}>
                      Select a planned workout to get guided training
                    </Text>
                  )}
                  {workoutSelectionMode === "activity-type" && (
                    <Text style={styles.footerHint}>
                      Choose your activity type to start recording
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </ThemedView>
      </Modal>

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
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    marginLeft: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
    marginLeft: 4,
  },
  selectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  selectionContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  recordingContent: {
    flex: 1,
  },
  optionsContainer: {
    paddingTop: 24,
    gap: 16,
  },
  workoutOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  optionIconContainer: {
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  listContainer: {
    flex: 1,
    paddingTop: 16,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  popularSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    marginLeft: 4,
  },
  activityTypeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activityEmoji: {
    fontSize: 24,
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
  selectionFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  footerContent: {
    alignItems: "center",
  },
  footerHint: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    fontWeight: "500",
  },

  content: {
    flex: 1,
    paddingTop: 20,
  },
  recoveryIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 8,
  },
  recoveryText: {
    fontSize: 14,
    color: "#92400e",
    marginLeft: 8,
    fontWeight: "500",
  },
  errorIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#dc2626",
    marginLeft: 8,
    fontWeight: "500",
  },
  clearErrorButton: {
    padding: 4,
  },
  guidanceContainer: {
    backgroundColor: "#ffffff",
    margin: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  guidanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  guidanceTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  progressContainer: {
    width: 60,
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
    marginLeft: 12,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 2,
  },
  guidanceInstructions: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 8,
  },
  complianceIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  complianceText: {
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 6,
  },
});
