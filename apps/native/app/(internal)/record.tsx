import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, // Import Alert
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedView } from "@/components/ThemedView";
import { MetricsGrid } from "@/components/workout/MetricsGrid";
import { RecordingControls } from "@/components/workout/RecordingControls";
import { WorkoutStatusBar } from "@/components/workout/WorkoutStatusBar";
import { useGlobalPermissions } from "@/contexts/PermissionsContext";
import { useAdvancedWorkoutRecorder } from "@/hooks/useAdvancedWorkoutRecorder";
import { useBluetooth } from "@/hooks/useBluetooth";
import { useWorkoutMetrics } from "@/hooks/useWorkoutMetrics";
import { BluetoothDeviceModal } from "@/modals/BluetoothDeviceModal";

// Import WorkoutService
import { WorkoutService } from "@/lib/services/workout-service";

// Supabase
import { supabase } from "@/lib/supabase";

export default function RecordScreen() {
  // Hooks
  const { connectedDevices, isBluetoothEnabled, sensorValues } = useBluetooth();
  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();
  const hasAllPermissions = useMemo(
    () => Object.values(permissions).every((p) => p?.granted),
    [permissions],
  );

  const {
    isRecording,
    isPaused,
    duration,
    distance: totalDistance,
    currentSpeed,
    startWorkout,
    pauseWorkout,
    resumeWorkout: resumeRecording,
    stopWorkout: stopRecording,
    addSensorData,
  } = useAdvancedWorkoutRecorder();

  const workoutMetrics = useWorkoutMetrics({
    duration,
    totalDistance,
    currentSpeed,
    locations: [], // TODO: Get from advanced recorder session
    sensorValues,
    isRecording,
    isPaused,
    isTracking: isRecording,
  });

  // Local state
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Fetch user
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error);
      } else {
        setUserId(user?.id ?? null);
      }
    };
    fetchUser();
  }, []);

  // Handlers
  const handleStartRecording = async () => {
    try {
      console.log("Starting workout...");
      if (!hasAllPermissions) {
        console.warn(
          "Cannot start workout: user permissions haven't been granted yet",
        );
        await requestAllRequiredPermissions();
        return;
      }
      if (!userId) {
        console.warn("Cannot start workout: user not available yet");
        return;
      }
      await startWorkout(userId);
    } catch (error) {
      console.error("Failed to start workout:", error);
    }
  };

  const handleBluetoothPress = () => {
    setBluetoothModalVisible(true);
  };

  const handleBluetoothDeviceSelect = (deviceId: string) => {
    console.log("Selected device:", deviceId);
    setBluetoothModalVisible(false);
  };

  // *** ADD THIS HANDLER ***
  const handleResetDatabase = () => {
    Alert.alert(
      "Reset Database",
      "Are you sure you want to delete all local activities? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await WorkoutService.clearAllData();
              Alert.alert(
                "Success",
                "Local database has been reset successfully.",
              );
            } catch (error) {
              Alert.alert("Error", "Failed to reset local database.");
              console.error(error);
            }
          },
        },
      ],
    );
  };

  // Add sensor data to recording when available
  useEffect(() => {
    if (isRecording && sensorValues) {
      addSensorData({
        messageType: "record",
        data: sensorValues,
      });
    }
  }, [isRecording, sensorValues, addSensorData]);

  return (
    <ThemedView style={styles.root} testID="record-screen">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          {/* *** ADD THIS BUTTON (DEV ONLY) *** */}
          {__DEV__ && (
            <TouchableOpacity
              onPress={handleResetDatabase}
              style={styles.resetButton}
            >
              <Ionicons name="trash-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          )}

          <Text style={styles.headerTitle}>
            {isRecording ? "Recording Workout" : "Ready to Record"}
          </Text>
          <TouchableOpacity style={styles.activityTypeButton}>
            <Ionicons name="walk" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        {/* Status Bar */}
        <WorkoutStatusBar
          isBluetoothEnabled={isBluetoothEnabled}
          connectedDevicesCount={connectedDevices?.length || 0}
          isGpsTracking={isRecording}
          gpsPointsCount={0} // TODO: Get GPS points from advanced recorder session
          onBluetoothPress={handleBluetoothPress}
        />

        {/* Metrics */}
        <View style={styles.content}>
          <MetricsGrid metrics={workoutMetrics} />
          <RecordingControls
            isRecording={isRecording}
            isPaused={isPaused}
            onStart={handleStartRecording}
            onStop={stopRecording}
            onPause={pauseWorkout}
            onResume={resumeRecording}
            hasPermissions={hasAllPermissions}
          />
        </View>
      </Animated.View>

      {/* Bluetooth Modal */}
      <BluetoothDeviceModal
        visible={bluetoothModalVisible}
        onClose={() => setBluetoothModalVisible(false)}
        onSelectDevice={handleBluetoothDeviceSelect}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: "600", color: "#111827" },
  activityTypeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  // *** ADD THIS STYLE ***
  resetButton: {
    padding: 8,
  },
  content: { flex: 1 },
  // footer: { paddingHorizontal: 20, paddingBottom: 40 },
});
