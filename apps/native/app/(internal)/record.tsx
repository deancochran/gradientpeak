import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
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
import { EnhancedBluetoothModal } from "@components/modals/EnhancedBluetoothModal";
import { PermissionsModal } from "@components/modals/PermissionsModal";
import { PlannedActivityModal } from "@components/modals/PlannedActivityModal";
import { ThemedView } from "@components/ThemedView";
import { useGlobalPermissions } from "@lib/contexts/PermissionsContext";
import { useProfile } from "@lib/hooks/api/profiles";
import { useAdvancedBluetooth } from "@lib/hooks/useAdvancedBluetooth";
import { useEnhancedActivityRecording } from "@lib/hooks/useEnhancedActivityRecording";
import ActivityCompletionService from "@lib/services/activity-completion-service";
import PlannedActivityService from "@lib/services/planned-activity-service";
import { router } from "expo-router";

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
  const { permissions, requestAllRequiredPermissions, forceCheckPermissions } =
    useGlobalPermissions();
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
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);
  const [permissionsModalVisible, setPermissionsModalVisible] = useState(false);

  // Debug modal visibility changes
  useEffect(() => {
    console.log(
      "🔵 [DEBUG] Bluetooth modal visibility changed:",
      bluetoothModalVisible,
    );
  }, [bluetoothModalVisible]);

  useEffect(() => {
    console.log(
      "🛡️ [DEBUG] Permissions modal visibility changed:",
      permissionsModalVisible,
    );
  }, [permissionsModalVisible]);
  const [isModalVisible, setIsModalVisible] = useState(true);
  const [activitySummary, setActivitySummary] =
    useState<ActivitySummary | null>(null);
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [plannedActivityGuidance, setPlannedActivityGuidance] =
    useState<PlannedActivityGuidance | null>(null);
  const [showPlannedActivityPicker, setShowPlannedActivityPicker] =
    useState(false);
  const [selectedPlannedActivity, setSelectedPlannedActivity] = useState<
    string | null
  >(null);
  const [isCompletingActivity, setIsCompletingActivity] = useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);

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
      return () => {
        console.log("🎬 Enhanced Record screen unfocused");
      };
    }, []),
  );

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

  // Handle start recording with planned activity picker
  const handleStartRecording = async () => {
    if (!hasAllPermissions) {
      setPermissionsModalVisible(true);
      return;
    }

    // Show planned activity picker first
    setShowPlannedActivityPicker(true);
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
    }
  };

  const startPlannedActivity = async (plannedActivityId: string) => {
    if (!plannedActivityId) {
      return startFreeActivity();
    }

    setSelectedPlannedActivity(plannedActivityId);
    setShowPlannedActivityPicker(false);

    console.log("🎯 Starting planned activity recording...");
    const success = await startRecording();

    if (success) {
      try {
        await PlannedActivityService.startPlannedActivitySession(
          plannedActivityId,
          `recording_${Date.now()}`,
        );
        console.log("✅ Planned activity session started");
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

      // Complete activity using enhanced workflow
      const completionResult = await ActivityCompletionService.completeActivity(
        recording,
        profile.id,
        activityName,
        "cycling",
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
    if (isRecording || isPaused) {
      Alert.alert(
        "Recording in Progress",
        "You have an active recording. What would you like to do?",
        [
          { text: "Continue Recording", style: "cancel" },
          {
            text: "Stop & Save",
            onPress: handleStopRecording,
          },
          {
            text: "Discard",
            style: "destructive",
            onPress: handleDiscardActivity,
          },
        ],
      );
    } else {
      setIsModalVisible(false);
      router.back();
    }
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
    console.log("🔵 [DEBUG] Bluetooth button pressed, opening modal");
    console.log(
      "🔵 [DEBUG] Current bluetooth modal state before set:",
      bluetoothModalVisible,
    );
    setBluetoothModalVisible(true);
    console.log("🔵 [DEBUG] Called setBluetoothModalVisible(true)");
  };

  const handlePermissionsPress = () => {
    console.log("🛡️ [DEBUG] Permissions button pressed, opening modal");
    console.log(
      "🛡️ [DEBUG] Current permissions modal state before set:",
      permissionsModalVisible,
    );
    console.log("🛡️ [DEBUG] Current permissions state:", {
      permissions,
      hasAllPermissions,
    });
    setPermissionsModalVisible(true);
    console.log("🛡️ [DEBUG] Called setPermissionsModalVisible(true)");
  };

  const handleRequestPermissions = async (): Promise<boolean> => {
    console.log("🔧 [DEBUG] Starting permission request...");
    setIsRequestingPermissions(true);
    try {
      console.log(
        "🔧 [DEBUG] Before requestAllRequiredPermissions, current state:",
        { permissions, hasAllPermissions },
      );
      const success = await requestAllRequiredPermissions();
      console.log("🔧 [DEBUG] Permission request result:", success);

      if (success) {
        console.log("🔧 [DEBUG] Success! Force checking permissions...");
        // Force a recheck of permissions to update the UI state
        await forceCheckPermissions();
        console.log("🔧 [DEBUG] After force check, new state:", {
          permissions,
          hasAllPermissions: Object.values(permissions).every(
            (p) => p?.granted,
          ),
        });
      }
      return success;
    } catch (error) {
      console.error("🔧 [DEBUG] Error in permission request:", error);
      return false;
    } finally {
      setIsRequestingPermissions(false);
    }
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

  // Improved metrics formatting with better live indicators
  const displayMetrics = useMemo(
    () => [
      {
        id: "duration",
        title: "Duration",
        value: formatDuration(metrics.duration),
        unit: "",
        icon: "time-outline" as const,
        isLive: isRecording && !isPaused,
      },
      {
        id: "distance",
        title: "Distance",
        value: (metrics.distance / 1000).toFixed(2),
        unit: "km",
        icon: "navigate-outline" as const,
        isLive: isRecording && !isPaused,
      },
      {
        id: "currentSpeed",
        title: "Current Speed",
        value: (metrics.currentSpeed * 3.6).toFixed(1),
        unit: "km/h",
        icon: "speedometer-outline" as const,
        isLive: isRecording && !isPaused && metrics.currentSpeed > 0,
      },
      {
        id: "avgSpeed",
        title: "Avg Speed",
        value: (metrics.avgSpeed * 3.6).toFixed(1),
        unit: "km/h",
        icon: "analytics-outline" as const,
        isLive: false,
      },
      {
        id: "heartRate",
        title: "Heart Rate",
        value: metrics.heartRate?.toString() || "--",
        unit: "bpm",
        icon: "heart-outline" as const,
        isLive: isRecording && !!metrics.heartRate,
      },
      {
        id: "calories",
        title: "Calories",
        value: metrics.calories?.toString() || "0",
        unit: "kcal",
        icon: "flame-outline" as const,
        isLive: isRecording && !isPaused,
      },
      {
        id: "power",
        title: "Power",
        value: sensorValues?.power?.toString() || "--",
        unit: "W",
        icon: "flash-outline" as const,
        isLive: isRecording && !!sensorValues?.power,
      },
      {
        id: "cadence",
        title: "Cadence",
        value: sensorValues?.cadence?.toString() || "--",
        unit: "rpm",
        icon: "refresh-outline" as const,
        isLive: isRecording && !!sensorValues?.cadence,
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
      isRecording,
      isPaused,
    ],
  );

  // Format permissions for the modal
  const formattedPermissions = {
    location: {
      name: permissions.location?.name || "Location",
      description:
        permissions.location?.description ||
        "Track your route and calculate distance",
      granted: permissions.location?.granted || false,
      canAskAgain: permissions.location?.canAskAgain || true,
      icon: "location" as const,
      required: true,
    },
    bluetooth: {
      name: permissions.bluetooth?.name || "Bluetooth",
      description:
        permissions.bluetooth?.description ||
        "Connect to heart rate monitors and cycling sensors",
      granted: permissions.bluetooth?.granted || false,
      canAskAgain: permissions.bluetooth?.canAskAgain || true,
      icon: "bluetooth" as const,
      required: true,
    },
    motion: {
      name: permissions.motion?.name || "Motion & Fitness",
      description:
        permissions.motion?.description ||
        "Detect movement and calculate calories",
      granted: permissions.motion?.granted || false,
      canAskAgain: permissions.motion?.canAskAgain || true,
      icon: "fitness" as const,
      required: true,
    },
    "location-background": {
      name: permissions["location-background"]?.name || "Background Location",
      description:
        permissions["location-background"]?.description ||
        "Continue tracking when app is in background (optional)",
      granted: permissions["location-background"]?.granted || false,
      canAskAgain: permissions["location-background"]?.canAskAgain || true,
      icon: "location" as const,
      required: false,
    },
  };

  return (
    <>
      {/* Main Recording Modal - Hidden when sub-modals are open */}
      <Modal
        visible={
          isModalVisible && !bluetoothModalVisible && !permissionsModalVisible
        }
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={styles.container}>
            {/* Modal Header */}
            <RecordingHeader
              onClose={handleCloseModal}
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

            {/* Recovery Indicator */}
            {isRecovering && (
              <View style={styles.recoveryIndicator}>
                <Ionicons name="refresh-outline" size={16} color="#f59e0b" />
                <Text style={styles.recoveryText}>
                  Recovering previous session...
                </Text>
              </View>
            )}

            {/* Error Indicator */}
            {lastError && !isRecovering && (
              <View style={styles.errorIndicator}>
                <Ionicons name="warning-outline" size={16} color="#dc2626" />
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
                        { width: `${plannedActivityGuidance.overall * 100}%` },
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
                    {plannedActivityGuidance.compliance.message || "On target"}
                  </Text>
                </View>
              </View>
            )}

            {/* Metrics */}
            <View style={styles.content}>
              <MetricsGrid metrics={displayMetrics} />
            </View>

            {/* Recording Controls Footer */}
            <RecordingControls
              isRecording={isRecording}
              isPaused={isPaused}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onDiscard={handleDiscardActivity}
              hasPermissions={hasAllPermissions}
              isLoading={isCompletingActivity}
            />

            {/* Background Recording Indicator */}
            {isRecording && !isPaused && (
              <View style={styles.backgroundIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.backgroundText}>
                  Recording continues in background
                </Text>
              </View>
            )}
          </View>
        </ThemedView>
      </Modal>

      {/* Enhanced Bluetooth Modal - Separate from main modal */}
      {console.log(
        "🔵 [DEBUG] Rendering EnhancedBluetoothModal with visible:",
        bluetoothModalVisible,
      )}
      <EnhancedBluetoothModal
        visible={bluetoothModalVisible}
        onClose={() => {
          console.log("🔵 [DEBUG] Bluetooth modal closed");
          setBluetoothModalVisible(false);
        }}
        onSelectDevice={(deviceId) => {
          console.log("🔵 [DEBUG] Selected enhanced device:", deviceId);
          setBluetoothModalVisible(false);
        }}
      />

      {/* Permissions Modal - Separate from main modal */}
      {console.log(
        "🛡️ [DEBUG] Rendering PermissionsModal with visible:",
        permissionsModalVisible,
      )}
      <PermissionsModal
        visible={permissionsModalVisible}
        onClose={() => {
          console.log("🛡️ [DEBUG] Permissions modal closed");
          setPermissionsModalVisible(false);
        }}
        permissions={formattedPermissions}
        onRequestPermissions={handleRequestPermissions}
        isRequesting={isRequestingPermissions}
      />

      {/* Planned Activity Modal */}
      <PlannedActivityModal
        visible={showPlannedActivityPicker}
        onClose={() => setShowPlannedActivityPicker(false)}
        onSelect={startPlannedActivity}
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
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
  },

  content: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
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
  backgroundIndicator: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    marginRight: 8,
  },
  backgroundText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
  },
});
