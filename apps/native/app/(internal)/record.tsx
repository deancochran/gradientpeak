import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
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
import { useActivityMetrics } from "@lib/hooks/useActivityMetrics";
import { useAdvancedActivityRecorder } from "@lib/hooks/useAdvancedActivityRecorder";
import { useBluetooth } from "@lib/hooks/useBluetooth";
import { ActivityService } from "@lib/services/activity-service";
import { ProfileService } from "@lib/services/profile-service";
import { supabase } from "@lib/supabase";
import { router } from "expo-router";

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
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [profile, setProfile] = useState<any>(null);

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

      // Get user profile
      const currentProfile = await ProfileService.getCurrentProfile();
      if (currentProfile) {
        setProfile(currentProfile);
        console.log("🎬 Record Screen - Profile loaded:", {
          id: currentProfile.id,
          username: currentProfile.username,
          ftp: currentProfile.ftp,
        });
      }
    } catch (error) {
      console.error("🎬 Record Screen - Initialization error:", error);
    }
  };

  // Show modal when screen is focused
  useEffect(() => {
    const unsubscribe = () => {
      setIsModalVisible(true);
      console.log("🎬 Record Screen - Modal opened");
    };

    unsubscribe();
    return () => {
      console.log("🎬 Record Screen - Component cleanup");
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      console.log("🎬 Record Screen - Starting activity");

      if (!hasAllPermissions) {
        console.warn("🎬 Record Screen - Missing permissions");
        Alert.alert(
          "Permissions Required",
          "Location and other permissions are required to record activitys.",
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

      Alert.alert(
        "Save Activity?",
        "Do you want to save this activity to your activities?",
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
    }
  };

  const handleSaveActivity = async () => {
    try {
      await stopRecording();
      console.log("🎬 Record Screen - Activity saved");

      Alert.alert(
        "Activity Saved!",
        "Your activity has been saved to your activities.",
        [
          {
            text: "View Activities",
            onPress: () => router.push("/(internal)/"),
          },
          { text: "Start New", onPress: () => setIsModalVisible(false) },
        ],
      );
    } catch (error) {
      console.error("🎬 Record Screen - Save activity error:", error);
      Alert.alert("Error", "Failed to save activity");
    }
  };

  const handleDiscardActivity = async () => {
    try {
      await stopRecording();
      console.log("🎬 Record Screen - Activity discarded");
      setIsModalVisible(false);
    } catch (error) {
      console.error("🎬 Record Screen - Discard activity error:", error);
    }
  };

  const handleCloseModal = () => {
    if (isRecording) {
      Alert.alert(
        "Recording in Progress",
        "You have an active activity recording. What would you like to do?",
        [
          { text: "Continue Recording", style: "cancel" },
          {
            text: "Pause & Close",
            onPress: () => {
              pauseActivity();
              setIsModalVisible(false);
            },
          },
          {
            text: "Stop Recording",
            style: "destructive",
            onPress: handleStopRecording,
          },
        ],
      );
    } else {
      console.log("🎬 Record Screen - Modal closed");
      setIsModalVisible(false);
      router.back();
    }
  };

  const handleBluetoothPress = () => {
    setBluetoothModalVisible(true);
  };

  const handleBluetoothDeviceSelect = (deviceId: string) => {
    console.log("🎬 Record Screen - Bluetooth device selected:", deviceId);
    setBluetoothModalVisible(false);
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

  // Reset database handler (dev only)
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
              await ActivityService.clearAllData();
              Alert.alert(
                "Success",
                "Local database has been reset successfully.",
              );
            } catch (error) {
              Alert.alert("Error", "Failed to reset local database.");
              console.error("🎬 Record Screen - Reset database error:", error);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={isModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseModal}
    >
      <ThemedView style={styles.modalContainer} testID="record-modal">
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
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

            <View style={styles.headerRight}>
              {__DEV__ && (
                <TouchableOpacity
                  onPress={handleResetDatabase}
                  style={styles.resetButton}
                >
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Status Bar */}
          <ActivityStatusBar
            isBluetoothEnabled={isBluetoothEnabled}
            connectedDevicesCount={connectedDevices?.length || 0}
            isGpsTracking={isRecording}
            gpsPointsCount={0}
            onBluetoothPress={handleBluetoothPress}
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
    flexDirection: "row",
    gap: 8,
  },
  resetButton: {
    padding: 8,
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
