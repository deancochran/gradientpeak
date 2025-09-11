import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RecordingHeaderProps {
  onClose: () => void;
  // GPS status
  isGpsReady: boolean;
  gpsPointsCount?: number;
  // Permissions status
  hasAllPermissions: boolean;
  onPermissionsPress: () => void;
  // BLE status
  isBluetoothEnabled: boolean;
  connectedDevicesCount: number;
  onBluetoothPress: () => void;
  // Sensor data for live indicators
  sensorValues?: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    timestamp?: number;
  };
}

export const RecordingHeader: React.FC<RecordingHeaderProps> = ({
  onClose,
  isGpsReady,
  gpsPointsCount = 0,
  hasAllPermissions,
  onPermissionsPress,
  isBluetoothEnabled,
  connectedDevicesCount,
  onBluetoothPress,
  sensorValues,
}) => {
  // Check if sensor data is fresh (within last 5 seconds)
  const now = Date.now();
  const sensorDataAge = sensorValues?.timestamp
    ? now - sensorValues.timestamp
    : Infinity;
  const hasFreshSensorData = sensorDataAge < 5000;

  const activeSensors = sensorValues
    ? Object.keys(sensorValues).filter(
        (key) =>
          key !== "timestamp" &&
          sensorValues[key as keyof typeof sensorValues] != null &&
          sensorValues[key as keyof typeof sensorValues]! > 0,
      ).length
    : 0;

  return (
    <View style={styles.container}>
      {/* Close Button */}
      <TouchableOpacity onPress={onClose} style={styles.closeButton}>
        <Ionicons name="chevron-down" size={28} color="#6b7280" />
      </TouchableOpacity>

      {/* Status Indicators */}
      <View style={styles.indicatorsContainer}>
        {/* GPS Indicator */}
        <TouchableOpacity
          style={[styles.indicator, isGpsReady && styles.indicatorActive]}
          onPress={() => {
            console.log(
              "📍 [DEBUG] GPS indicator pressed (informational only)",
            );
          }}
        >
          <Ionicons
            name={isGpsReady ? "locate" : "locate-outline"}
            size={16}
            color={isGpsReady ? "#10b981" : "#9ca3af"}
          />
          {isGpsReady && gpsPointsCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{gpsPointsCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Permissions Indicator */}
        <TouchableOpacity
          style={[
            styles.indicator,
            hasAllPermissions && styles.indicatorActive,
          ]}
          onPress={() => {
            console.log(
              "🛡️ [DEBUG] Permissions indicator pressed in RecordingHeader",
            );
            onPermissionsPress();
          }}
        >
          <Ionicons
            name={hasAllPermissions ? "shield-checkmark" : "shield-outline"}
            size={16}
            color={hasAllPermissions ? "#10b981" : "#ef4444"}
          />
        </TouchableOpacity>

        {/* BLE Indicator */}
        <TouchableOpacity
          style={[
            styles.indicator,
            connectedDevicesCount > 0 &&
              isBluetoothEnabled &&
              styles.indicatorActive,
          ]}
          onPress={() => {
            console.log(
              "🔵 [DEBUG] Bluetooth indicator pressed in RecordingHeader",
            );
            onBluetoothPress();
          }}
        >
          <Ionicons
            name={
              connectedDevicesCount > 0 && isBluetoothEnabled
                ? "bluetooth"
                : "bluetooth-outline"
            }
            size={16}
            color={
              connectedDevicesCount > 0 && isBluetoothEnabled
                ? "#10b981"
                : "#9ca3af"
            }
          />
          {connectedDevicesCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{connectedDevicesCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  indicatorsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 16,
    gap: 12,
  },
  indicator: {
    position: "relative",
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  indicatorActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#10b981",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  badgeText: {
    fontSize: 10,
    color: "#ffffff",
    fontWeight: "600",
  },
});
