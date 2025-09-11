import { Ionicons } from "@expo/vector-icons";
import { ActivityType } from "@repo/core";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RecordingHeaderProps {
  // Close functionality - only show when not recording
  onClose?: () => void;
  canClose: boolean;

  // Recording state
  isRecording: boolean;
  isPaused: boolean;

  // Activity selection
  selectedActivityType?: ActivityType | null;
  selectedPlannedActivity?: string | null;

  // GPS status
  isGpsReady: boolean;
  gpsSignalStrength?: "excellent" | "good" | "fair" | "poor";

  // Permissions status
  hasAllPermissions: boolean;
  onPermissionsPress: () => void;

  // Bluetooth status
  isBluetoothEnabled: boolean;
  connectedDevicesCount: number;
  onBluetoothPress: () => void;

  // Live sensor indicators
  sensorValues?: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    timestamp?: number;
  };
}

export const RecordingHeader: React.FC<RecordingHeaderProps> = ({
  onClose,
  canClose,
  isRecording,
  isPaused,
  selectedActivityType,
  selectedPlannedActivity,
  isGpsReady,
  gpsSignalStrength = "good",
  hasAllPermissions,
  onPermissionsPress,
  isBluetoothEnabled,
  connectedDevicesCount,
  onBluetoothPress,
  sensorValues,
}) => {
  const getGpsColor = () => {
    if (!isGpsReady) return "#ef4444";
    return "#10b981";
  };

  const getBluetoothColor = () => {
    if (!isBluetoothEnabled) return "#ef4444";
    if (connectedDevicesCount === 0) return "#f59e0b";
    return "#10b981";
  };

  const getPermissionsColor = () => {
    return hasAllPermissions ? "#10b981" : "#ef4444";
  };

  const getRecordingStatusText = () => {
    if (isRecording && !isPaused) return "Recording";
    if (isPaused) return "Paused";
    if (selectedActivityType || selectedPlannedActivity) return "Ready";
    return "Select Activity";
  };

  const getRecordingStatusColor = () => {
    if (isRecording && !isPaused) return "#ef4444";
    if (isPaused) return "#f59e0b";
    if (selectedActivityType || selectedPlannedActivity) return "#10b981";
    return "#6b7280";
  };

  return (
    <View style={styles.container}>
      {/* Left Side - Close button or Status */}
      <View style={styles.leftSection}>
        {canClose && onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
        ) : (
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getRecordingStatusColor() },
              ]}
            />
            <Text
              style={[styles.statusText, { color: getRecordingStatusColor() }]}
            >
              {getRecordingStatusText()}
            </Text>
          </View>
        )}
      </View>

      {/* Center - Activity Type Display */}
      <View style={styles.centerSection}>
        {selectedActivityType && (
          <View style={styles.activityTypeDisplay}>
            <Text style={styles.activityEmoji}>
              {selectedActivityType.displayConfig.emoji}
            </Text>
            <Text style={styles.activityName}>{selectedActivityType.name}</Text>
          </View>
        )}
        {selectedPlannedActivity && !selectedActivityType && (
          <View style={styles.plannedActivityDisplay}>
            <Ionicons name="calendar" size={16} color="#3b82f6" />
            <Text style={styles.plannedActivityText}>Planned Workout</Text>
          </View>
        )}
      </View>

      {/* Right Side - System Status Indicators */}
      <View style={styles.rightSection}>
        {/* GPS Indicator */}
        <TouchableOpacity style={styles.indicator} disabled>
          <Ionicons name="location" size={16} color={getGpsColor()} />
          <Text style={[styles.indicatorText, { color: getGpsColor() }]}>
            GPS
          </Text>
        </TouchableOpacity>

        {/* Permissions Indicator */}
        <TouchableOpacity style={styles.indicator} onPress={onPermissionsPress}>
          <Ionicons
            name="shield-checkmark"
            size={16}
            color={getPermissionsColor()}
          />
          <Text
            style={[styles.indicatorText, { color: getPermissionsColor() }]}
          >
            Permissions
          </Text>
        </TouchableOpacity>

        {/* Bluetooth Indicator */}
        <TouchableOpacity style={styles.indicator} onPress={onBluetoothPress}>
          <Ionicons name="bluetooth" size={16} color={getBluetoothColor()} />
          <Text style={[styles.indicatorText, { color: getBluetoothColor() }]}>
            BLE {connectedDevicesCount > 0 ? `(${connectedDevicesCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    minHeight: 60,
  },

  leftSection: {
    flex: 1,
    alignItems: "flex-start",
  },

  centerSection: {
    flex: 2,
    alignItems: "center",
  },

  rightSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },

  closeButton: {
    padding: 4,
  },

  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },

  activityTypeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  activityEmoji: {
    fontSize: 18,
  },

  activityName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },

  plannedActivityDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  plannedActivityText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3b82f6",
  },

  indicator: {
    alignItems: "center",
    gap: 2,
    minWidth: 40,
  },

  indicatorText: {
    fontSize: 9,
    fontWeight: "500",
    textAlign: "center",
  },
});
