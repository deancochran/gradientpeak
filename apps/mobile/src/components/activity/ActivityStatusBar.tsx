import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ActivityStatusBarProps {
  isBluetoothEnabled: boolean;
  connectedDevicesCount: number;
  isGpsTracking: boolean;
  gpsPointsCount: number;
  onBluetoothPress?: () => void;
  sensorValues?: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    timestamp?: number;
  };
}

export const ActivityStatusBar: React.FC<ActivityStatusBarProps> = ({
  isBluetoothEnabled,
  connectedDevicesCount,
  isGpsTracking,
  gpsPointsCount,
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
    <View style={styles.statusContainer}>
      <TouchableOpacity
        style={styles.statusButton}
        onPress={onBluetoothPress}
        testID="bluetooth-status-button"
      >
        <Ionicons
          name={
            connectedDevicesCount > 0 && isBluetoothEnabled
              ? hasFreshSensorData
                ? "bluetooth"
                : "bluetooth-outline"
              : "bluetooth-outline"
          }
          size={16}
          color={
            connectedDevicesCount > 0 &&
            isBluetoothEnabled &&
            hasFreshSensorData
              ? "#10b981"
              : connectedDevicesCount > 0 && isBluetoothEnabled
                ? "#f59e0b"
                : "#9ca3af"
          }
        />
        <Text
          style={[
            styles.statusText,
            connectedDevicesCount > 0 &&
              isBluetoothEnabled &&
              styles.statusActiveText,
          ]}
        >
          {!isBluetoothEnabled
            ? "BT Off"
            : connectedDevicesCount > 0
              ? hasFreshSensorData
                ? `${activeSensors} active sensor(s)`
                : `${connectedDevicesCount} connected`
              : "No sensors"}
        </Text>
        {hasFreshSensorData && activeSensors > 0 && (
          <View style={styles.sensorIndicators}>
            {sensorValues?.heartRate && (
              <View style={styles.sensorBadge}>
                <Ionicons name="heart" size={10} color="#ef4444" />
                <Text style={styles.sensorBadgeText}>
                  {sensorValues.heartRate}
                </Text>
              </View>
            )}
            {sensorValues?.power && (
              <View style={styles.sensorBadge}>
                <Ionicons name="flash" size={10} color="#f59e0b" />
                <Text style={styles.sensorBadgeText}>
                  {sensorValues.power}W
                </Text>
              </View>
            )}
            {sensorValues?.cadence && (
              <View style={styles.sensorBadge}>
                <Ionicons name="refresh" size={10} color="#8b5cf6" />
                <Text style={styles.sensorBadgeText}>
                  {sensorValues.cadence}
                </Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.statusButton}>
        <Ionicons
          name={isGpsTracking ? "locate" : "locate-outline"}
          size={16}
          color={isGpsTracking ? "#10b981" : "#9ca3af"}
        />
        <Text
          style={[styles.statusText, isGpsTracking && styles.statusActiveText]}
        >
          GPS {isGpsTracking ? "Active" : "Inactive"}
        </Text>
        {isGpsTracking && gpsPointsCount > 0 && (
          <Text style={styles.statusDetailText}>{gpsPointsCount} points</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  statusContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  statusButton: {
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minWidth: 120,
  },
  statusText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 4,
    fontWeight: "500",
    textAlign: "center",
  },
  statusActiveText: {
    color: "#10b981",
  },
  statusDetailText: {
    fontSize: 10,
    color: "#9ca3af",
    marginLeft: 4,
  },
  sensorIndicators: {
    flexDirection: "row",
    marginTop: 4,
    gap: 4,
  },
  sensorBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  sensorBadgeText: {
    fontSize: 9,
    color: "#374151",
    fontWeight: "600",
  },
});
