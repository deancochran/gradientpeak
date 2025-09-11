import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ActivityStatusBar } from "@components/activity/ActivityStatusBar";
import { MetricsGrid } from "@components/activity/MetricsGrid";
import { RecordingControls } from "@components/activity/RecordingControls";
import { EnhancedBluetoothModal } from "@components/modals/EnhancedBluetoothModal";
import { ThemedView } from "@components/ThemedView";
import { useGlobalPermissions } from "@lib/contexts/PermissionsContext";
import { useProfile } from "@lib/hooks/api/profiles";
import { useActivityRecording } from "@lib/hooks/useActivityRecording";
import { useAdvancedBluetooth } from "@lib/hooks/useAdvancedBluetooth";
import { ActivitySaveService } from "@lib/services/activity-save";
import { router } from "expo-router";

export default function RecordScreen() {
  // Hooks
  const {
    connectedDevices,
    isBluetoothEnabled,
    sensorValues,
    getConnectionState,
    getReconnectAttempts,
  } = useAdvancedBluetooth();
  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();

  // Debug sensor values updates
  useEffect(() => {
    if (sensorValues && Object.keys(sensorValues).length > 0) {
      console.log("🎬 Record Screen - Received sensor values:", sensorValues);
    }
  }, [sensorValues]);
  const { data: profile } = useProfile();

  const {
    isRecording,
    isPaused,
    metrics,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    addSensorData,
  } = useActivityRecording();

  // Local state
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(true);

  // Memoized permissions check for performance
  const hasAllPermissions = useMemo(
    () => Object.values(permissions).every((p) => p?.granted),
    [permissions],
  );

  // Reset modal visibility when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log("🎬 Record screen focused - resetting modal visibility");
      setIsModalVisible(true);
      return () => {
        console.log("🎬 Record screen unfocused");
      };
    }, []),
  );

  // Debug: Log metrics updates with better formatting
  useEffect(() => {
    if (isRecording) {
      console.log("📊 Metrics updated:", {
        duration: formatDuration(metrics.duration),
        distance: (metrics.distance / 1000).toFixed(2) + "km",
        heartRate: metrics.heartRate ? `${metrics.heartRate} bpm` : "N/A",
        calories: `${metrics.calories} kcal`,
        speed: (metrics.currentSpeed * 3.6).toFixed(1) + "km/h",
      });
    }
  }, [
    isRecording,
    metrics.duration,
    metrics.distance,
    metrics.heartRate,
    metrics.calories,
    metrics.currentSpeed,
  ]);

  // Stream sensor data with enhanced validation and smartwatch support
  useEffect(() => {
    if (isRecording && sensorValues?.timestamp) {
      // Filter out stale data (older than 15 seconds for smartwatches)
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

      console.log("🔍 Record Screen - Sensor data check:", {
        heartRate: sensorValues.heartRate,
        power: sensorValues.power,
        cadence: sensorValues.cadence,
        speed: sensorValues.speed,
        calories: sensorValues.calories,
        steps: sensorValues.steps,
        hasValidSensorData,
        dataAge: dataAge + "ms",
        isRecording,
      });

      if (hasValidSensorData) {
        console.log("🔄 Streaming enhanced sensor data:", {
          heartRate: sensorValues.heartRate,
          power: sensorValues.power,
          cadence: sensorValues.cadence,
          speed: sensorValues.speed,
          calories: sensorValues.calories,
          steps: sensorValues.steps,
          age: dataAge + "ms",
          devices: connectedDevices.length,
        });

        addSensorData({
          ...(sensorValues.heartRate && { heartRate: sensorValues.heartRate }),
          ...(sensorValues.power && { power: sensorValues.power }),
          ...(sensorValues.cadence && { cadence: sensorValues.cadence }),
          ...(sensorValues.speed && { speed: sensorValues.speed }),
          ...(sensorValues.calories && { calories: sensorValues.calories }),
          timestamp: sensorValues.timestamp,
        });
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
    connectedDevices.length,
    addSensorData,
  ]);

  // Handlers
  const handleStartRecording = async () => {
    if (!hasAllPermissions) {
      Alert.alert(
        "Permissions Required",
        "Location permissions are required to record activities.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Grant Permissions",
            onPress: () => requestAllRequiredPermissions(),
          },
        ],
      );
      return;
    }

    console.log("🎬 Starting activity recording...");
    const success = await startRecording();
    if (!success) {
      Alert.alert("Error", "Failed to start recording. Please try again.");
    } else {
      console.log("✅ Activity recording started successfully");
    }
  };

  const handleStopRecording = async () => {
    console.log("🎬 Stopping activity recording...");

    Alert.alert(
      "Save Activity?",
      `Duration: ${formatDuration(metrics.duration)}\nDistance: ${formatDistance(metrics.distance)}`,
      [
        {
          text: "Discard",
          style: "destructive",
          onPress: handleDiscardActivity,
        },
        { text: "Cancel", style: "cancel" },
        { text: "Save", onPress: handleSaveActivity },
      ],
    );
  };

  const handleSaveActivity = async () => {
    try {
      console.log("💾 Saving activity...");

      const recording = await stopRecording();
      if (!recording) {
        Alert.alert("Error", "No recording data to save.");
        return;
      }

      if (!profile?.id) {
        Alert.alert("Error", "Profile not found. Please try again.");
        return;
      }

      // Save activity with comprehensive data
      const activityId = await ActivitySaveService.saveActivityRecording(
        recording,
        profile.id,
      );

      console.log("✅ Activity saved successfully:", activityId);

      // Close modal and navigate
      setIsModalVisible(false);
      router.replace("/(internal)");

      // Show success message after navigation
      setTimeout(() => {
        Alert.alert(
          "Activity Saved! 🎉",
          `Duration: ${formatDuration(recording.metrics.duration)}\nDistance: ${(recording.metrics.distance / 1000).toFixed(2)} km\n\nYour activity has been saved locally and will sync to the cloud when connected.`,
          [
            {
              text: "View Activities",
              onPress: () => router.replace("/(internal)"),
            },
            { text: "OK" },
          ],
        );
      }, 500);
    } catch (error) {
      console.error("❌ Failed to save activity:", error);
      Alert.alert(
        "Save Failed",
        "Failed to save your activity. Please try again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Retry", onPress: handleSaveActivity },
        ],
      );
    }
  };

  const handleDiscardActivity = async () => {
    try {
      console.log("🗑️ Discarding activity...");

      await stopRecording();

      setIsModalVisible(false);
      router.replace("/(internal)");

      // Show confirmation after navigation
      setTimeout(() => {
        Alert.alert(
          "Activity Discarded",
          "Your recording has been discarded.",
          [{ text: "OK" }],
        );
      }, 500);

      console.log("✅ Activity discarded successfully");
    } catch (error) {
      console.error("❌ Failed to discard activity:", error);
      Alert.alert("Error", "Failed to discard activity. Please try again.");
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

  const handleBluetoothPress = () => {
    setBluetoothModalVisible(true);
  };

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

  return (
    <Modal
      visible={isModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseModal}
    >
      <ThemedView style={styles.modalContainer}>
        <View style={styles.container}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={handleCloseModal}
              style={styles.closeButton}
            >
              <Ionicons name="chevron-down" size={28} color="#6b7280" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>
              {isRecording
                ? isPaused
                  ? "Activity Paused"
                  : "Recording Activity"
                : "Start Activity"}
            </Text>

            <View style={styles.headerRight} />
          </View>

          {/* Status Bar */}
          <ActivityStatusBar
            isBluetoothEnabled={isBluetoothEnabled}
            connectedDevicesCount={connectedDevices.length}
            isGpsTracking={isRecording && !isPaused}
            gpsPointsCount={Math.max(1, Math.floor(metrics.distance / 10))}
            onBluetoothPress={handleBluetoothPress}
            sensorValues={sensorValues}
          />

          {/* Metrics */}
          <View style={styles.content}>
            <MetricsGrid metrics={displayMetrics} />

            <RecordingControls
              isRecording={isRecording}
              isPaused={isPaused}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onDiscard={handleDiscardActivity}
              hasPermissions={hasAllPermissions}
            />
          </View>

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

        {/* Enhanced Bluetooth Modal */}
        <EnhancedBluetoothModal
          visible={bluetoothModalVisible}
          onClose={() => setBluetoothModalVisible(false)}
          onSelectDevice={(deviceId) => {
            console.log("Selected enhanced device:", deviceId);
            setBluetoothModalVisible(false);
          }}
        />
      </ThemedView>
    </Modal>
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
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  headerRight: {
    width: 44, // Match close button width for centering
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },
  backgroundIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#ef4444",
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    marginRight: 8,
  },
  backgroundText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
});
