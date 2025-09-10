import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    StyleSheet,
    Text,
    View
} from "react-native";

import { ActivityStatusBar } from "@components/activity/ActivityStatusBar";
import { MetricsGrid } from "@components/activity/MetricsGrid";
import { RecordingControls } from "@components/activity/RecordingControls";
import { BluetoothDeviceModal } from "@components/modals/BluetoothDeviceModal";
import { ThemedView } from "@components/ThemedView";
import { useGlobalPermissions } from "@lib/contexts/PermissionsContext";
import { useProfile } from "@lib/hooks/api/profiles";
import { useActivityMetrics } from "@lib/hooks/useActivityMetrics";
import { useAdvancedActivityRecorder } from "@lib/hooks/useAdvancedActivityRecorder";
import { useBluetooth } from "@lib/hooks/useBluetooth";
import { ActivityService } from "@lib/services/activity-service";
import { supabase } from "@lib/supabase";

interface RecordScreenProps {
  onSessionComplete?: () => void; // Callback when session is completed/discarded
}

export default function RecordScreen({ onSessionComplete }: RecordScreenProps) {
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
    startActivity,
    pauseActivity,
    resumeActivity: resumeRecording,
    stopActivity: stopRecording,
    addSensorData,
  } = useAdvancedActivityRecorder();

  const activityMetrics = useActivityMetrics({
    duration,
    totalDistance,
    currentSpeed,
    locations: [],
    sensorValues,
    isRecording,
    isPaused,
    isTracking: isRecording,
  });

  // Local state
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // TanStack Query hooks
  const { data: profile, isLoading: profileLoading } = useProfile();

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Initialize screen
  useEffect(() => {
    console.log("🎬 Record Screen - Initializing");
    initializeRecordScreen();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const initializeRecordScreen = async () => {
    try {
      // Get user session
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) {
        console.error("🎬 Record Screen - Auth error:", error);
      } else {
        setUserId(user?.id ?? null);
        console.log("🎬 Record Screen - User loaded:", user?.email);
      }

      // Profile is now handled by useProfile hook
      if (profile) {
        console.log("🎬 Record Screen - Profile loaded:", {
          id: profile.id,
          username: profile.username,
          ftp: profile.ftp,
        });
      }
    } catch (error) {
      console.error("🎬 Record Screen - Initialization error:", error);
    }
  };

  const handleStartRecording = async () => {
    try {
      console.log("🎬 Record Screen - Starting activity");

      if (!hasAllPermissions) {
        console.warn("🎬 Record Screen - Missing permissions");
        Alert.alert(
          "Permissions Required",
          "Location and other permissions are required to record activities.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Grant Permissions",
              onPress: async () => {
                await requestAllRequiredPermissions();
              },
            },
          ],
        );
        return;
      }

      if (!userId) {
        console.warn("🎬 Record Screen - No user ID");
        Alert.alert("Error", "User not authenticated. Please sign in again.");
        return;
      }

      await startActivity(userId);
      console.log("🎬 Record Screen - Activity started successfully");
    } catch (error) {
      console.error("🎬 Record Screen - Start recording error:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  };

  const handleStopRecording = async () => {
    try {
      console.log("🎬 Record Screen - Stopping activity");

      // Get current session metrics for display in confirmation dialog
      const session = ActivityService.getCurrentSession();
      const durationText = session?.liveMetrics?.totalTimerTime
        ? ActivityService.formatDuration(session.liveMetrics.totalTimerTime)
        : "0:00";
      const distanceText = session?.liveMetrics?.distance
        ? `${(session.liveMetrics.distance / 1000).toFixed(2)} km`
        : "0.00 km";

      Alert.alert(
        "Save Activity?",
        `Duration: ${durationText}\nDistance: ${distanceText}\n\nDo you want to save this activity?`,
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
    } catch (error) {
      console.error("🎬 Record Screen - Stop recording error:", error);
      Alert.alert("Error", "Failed to stop recording. Please try again.");
    }
  };

  const handleSaveActivity = async () => {
    try {
      console.log("🎬 Record Screen - Saving activity...");

      // Stop the recording and let the service handle saving
      await stopRecording();

      console.log("🎬 Record Screen - Activity saved successfully");

      // Ensure session is properly cleaned up
      const session = ActivityService.getCurrentSession();
      if (!session || session.status === "stopped") {
        console.log("🎬 Record Screen - Session cleaned up, safe to navigate");

        // Call callback to notify parent that session is complete
        onSessionComplete?.();

        // Show success message after navigation
        setTimeout(() => {
          Alert.alert(
            "Activity Saved!",
            "Your activity has been saved and will sync to the cloud when connected.",
            [{ text: "OK" }],
          );
        }, 500);
      } else {
        console.warn("🎬 Record Screen - Session not properly cleaned up, staying on record screen");
        Alert.alert("Error", "Session cleanup incomplete. Please try again.");
      }
    } catch (error) {
      console.error("🎬 Record Screen - Save activity error:", error);
      Alert.alert("Error", "Failed to save activity. Please try again.");
    }
  };

  const handleDiscardActivity = async () => {
    try {
      console.log("🎬 Record Screen - Discarding activity...");

      // Stop the recording without saving
      await stopRecording();

      console.log("🎬 Record Screen - Activity discarded");

      // Ensure session is properly cleaned up
      const session = ActivityService.getCurrentSession();
      if (!session || session.status === "stopped") {
        console.log("🎬 Record Screen - Session discarded and cleaned up, safe to navigate");

        // Call callback to notify parent that session is complete
        onSessionComplete?.();

        // Show confirmation
        setTimeout(() => {
          Alert.alert(
            "Activity Discarded",
            "Your activity recording has been discarded.",
            [{ text: "OK" }]
          );
        }, 500);
      } else {
        console.warn("🎬 Record Screen - Session not properly cleaned up after discard, staying on record screen");
        Alert.alert("Error", "Session cleanup incomplete. Please try again.");
      }
    } catch (error) {
      console.error("🎬 Record Screen - Discard activity error:", error);
      Alert.alert("Error", "Failed to discard activity. Please try again.");
    }
  };

  const handleBluetoothPress = () => {
    setBluetoothModalVisible(true);
  };

  const handleBluetoothDeviceSelect = (deviceId: string) => {
    console.log("🎬 Record Screen - Bluetooth device selected:", deviceId);
    setBluetoothModalVisible(false);
  };

  // Add sensor data to recording when available with improved validation
  useEffect(() => {
    if (isRecording && sensorValues && Object.keys(sensorValues).length > 0) {
      // Only add sensor data if we have meaningful values
      const validSensorData = Object.entries(sensorValues).reduce((acc, [key, value]) => {
        // Filter out invalid or stale data
        if (value != null && value > 0) {
          // Check timestamp freshness (within last 10 seconds)
          const now = Date.now();
          const dataAge = sensorValues.timestamp ? (now - sensorValues.timestamp) : 0;

          if (dataAge < 10000) { // Data is fresh (less than 10 seconds old)
            acc[key] = value;
          } else {
            console.warn(`🔶 Stale sensor data for ${key}: ${dataAge}ms old`);
          }
        }
        return acc;
      }, {} as Record<string, any>);

      // Only add if we have valid sensor data
      if (Object.keys(validSensorData).length > 0) {
        addSensorData({
          messageType: "record",
          data: {
            ...validSensorData,
            sensorTimestamp: sensorValues.timestamp,
          },
        });

        // Log sensor data integration occasionally
        const recordMessages = ActivityService.getCurrentSession()?.recordMessages || [];
        if (recordMessages.length % 30 === 0 && recordMessages.length > 0) {
          console.log("📡 BLE Sensor Data Integrated:", {
            sensors: Object.keys(validSensorData),
            values: validSensorData,
            recordCount: recordMessages.length,
          });
        }
      }
    }
  }, [isRecording, sensorValues, addSensorData]);

  return (
    <ThemedView style={styles.container} testID="record-screen">
      <Animated.View
        style={[
          styles.contentContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isRecording ? "Recording Activity" : "Start Activity"}
          </Text>
        </View>

        {/* Status Bar */}
        <ActivityStatusBar
          isBluetoothEnabled={isBluetoothEnabled}
          connectedDevicesCount={connectedDevices?.length || 0}
          isGpsTracking={isRecording}
          gpsPointsCount={activityMetrics.find(m => m.id === 'distance')?.value ? Math.max(1, parseInt(activityMetrics.find(m => m.id === 'distance')?.value || '0')) : 0}
          onBluetoothPress={handleBluetoothPress}
          sensorValues={sensorValues}
        />

        {/* Profile Info */}
        {profile && (
          <View style={styles.profileInfo}>
            <Text style={styles.profileText}>
              Recording as: {profile.username || "User"}
              {profile.ftp && ` • FTP: ${profile.ftp}W`}
            </Text>
          </View>
        )}

        {/* Metrics */}
        <View style={styles.content}>
          <MetricsGrid metrics={activityMetrics} />

          <RecordingControls
            isRecording={isRecording}
            isPaused={isPaused}
            onStart={handleStartRecording}
            onStop={handleStopRecording}
            onPause={pauseActivity}
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
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
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
