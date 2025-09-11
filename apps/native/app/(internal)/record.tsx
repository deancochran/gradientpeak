import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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
import { BluetoothDeviceModal } from "@components/modals/BluetoothDeviceModal";
import { ThemedView } from "@components/ThemedView";
import { useGlobalPermissions } from "@lib/contexts/PermissionsContext";
import { useProfile } from "@lib/hooks/api/profiles";
import { useActivityRecording } from "@lib/hooks/useActivityRecording";
import { useBluetooth } from "@lib/hooks/useBluetooth";
import { ActivitySaveService } from "@lib/services/activity-save";
import { router } from "expo-router";

export default function RecordScreen() {
  const { connectedDevices, isBluetoothEnabled, sensorValues, scanForDevices } =
    useBluetooth();
  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();
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

  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(true);

  const hasAllPermissions = Object.values(permissions).every((p) => p?.granted);

  // Debug: Log metrics updates
  useEffect(() => {
    if (isRecording) {
      console.log("📊 Metrics updated:", {
        duration: metrics.duration,
        distance: (metrics.distance / 1000).toFixed(2) + "km",
        heartRate: metrics.heartRate,
        calories: metrics.calories,
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

  // Add sensor data when available - stream in real time
  useEffect(() => {
    if (isRecording && sensorValues?.timestamp) {
      const hasValidSensorData =
        sensorValues.heartRate || sensorValues.power || sensorValues.cadence;

      if (hasValidSensorData) {
        console.log("🔄 Streaming sensor data to recording:", sensorValues);
        addSensorData({
          ...(sensorValues.heartRate && { heartRate: sensorValues.heartRate }),
          ...(sensorValues.power && { power: sensorValues.power }),
          ...(sensorValues.cadence && { cadence: sensorValues.cadence }),
          timestamp: sensorValues.timestamp,
        });
      }
    }
  }, [
    isRecording,
    sensorValues?.heartRate,
    sensorValues?.power,
    sensorValues?.cadence,
    sensorValues?.timestamp,
    addSensorData,
  ]);

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

    const success = await startRecording();
    if (!success) {
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  };

  const handleStopRecording = async () => {
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const formatDistance = (meters: number) => {
      return `${(meters / 1000).toFixed(2)} km`;
    };

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
      const recording = await stopRecording();
      if (!recording) {
        Alert.alert("Error", "No recording data to save.");
        return;
      }

      if (!profile?.id) {
        Alert.alert("Error", "Profile not found. Please try again.");
        return;
      }

      console.log("💾 Saving activity with comprehensive data...");

      // Save activity with comprehensive JSON generation
      const activityId = await ActivitySaveService.saveActivityRecording(
        recording,
        profile.id,
      );

      console.log("✅ Activity saved successfully:", activityId);

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
    await stopRecording();
    Alert.alert("Activity Discarded", "Your recording has been discarded.");
    setIsModalVisible(false);
    router.replace("/(internal)");
  };

  const handleCloseModal = () => {
    if (isRecording || isPaused) {
      Alert.alert(
        "Recording in Progress",
        "Stop the recording before closing.",
        [
          { text: "Continue Recording", style: "cancel" },
          {
            text: "Stop Recording",
            style: "destructive",
            onPress: handleStopRecording,
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

  // Format duration as HH:MM:SS or MM:SS
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

  // Format metrics for display
  const displayMetrics = [
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
      isLive: isRecording,
    },
    {
      id: "currentSpeed",
      title: "Current Speed",
      value: (metrics.currentSpeed * 3.6).toFixed(1), // Convert m/s to km/h
      unit: "km/h",
      icon: "speedometer-outline" as const,
      isLive: isRecording && metrics.currentSpeed > 0,
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
      isLive: !!metrics.heartRate,
    },
    {
      id: "calories",
      title: "Calories",
      value: metrics.calories?.toString() || "0",
      unit: "kcal",
      icon: "flame-outline" as const,
      isLive: isRecording,
    },
    {
      id: "power",
      title: "Power",
      value: sensorValues?.power?.toString() || "--",
      unit: "W",
      icon: "flash-outline" as const,
      isLive: !!sensorValues?.power,
    },
    {
      id: "cadence",
      title: "Cadence",
      value: sensorValues?.cadence?.toString() || "--",
      unit: "rpm",
      icon: "refresh-outline" as const,
      isLive: !!sensorValues?.cadence,
    },
  ];

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
              {isRecording ? "Recording Activity" : "Start Activity"}
            </Text>

            <View style={styles.headerRight} />
          </View>

          {/* Status Bar */}
          <ActivityStatusBar
            isBluetoothEnabled={isBluetoothEnabled}
            connectedDevicesCount={connectedDevices.length}
            isGpsTracking={isRecording}
            gpsPointsCount={Math.floor(metrics.distance / 10)} // Rough GPS points estimate
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
              hasPermissions={hasAllPermissions}
            />
          </View>

          {/* Background Recording Indicator */}
          {isRecording && (
            <View style={styles.backgroundIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.backgroundText}>
                Recording continues in background
              </Text>
            </View>
          )}
        </View>

        {/* Bluetooth Modal */}
        <BluetoothDeviceModal
          visible={bluetoothModalVisible}
          onClose={() => setBluetoothModalVisible(false)}
          onSelectDevice={(deviceId) => {
            console.log("Selected device:", deviceId);
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
  profileInfo: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  profileText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
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
