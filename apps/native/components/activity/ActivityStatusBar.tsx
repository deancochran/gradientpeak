import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ActivityStatusBarProps {
  isBluetoothEnabled: boolean;
  connectedDevicesCount: number;
  isGpsTracking: boolean;
  gpsPointsCount: number;
  onBluetoothPress?: () => void;
}

export const ActivityStatusBar: React.FC<ActivityStatusBarProps> = ({
  isBluetoothEnabled,
  connectedDevicesCount,
  isGpsTracking,
  gpsPointsCount,
  onBluetoothPress,
}) => {
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
              ? `${connectedDevicesCount} sensor(s)`
              : "No sensors"}
        </Text>
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
    flexDirection: "row",
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
  },
  statusText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 4,
    fontWeight: "500",
  },
  statusActiveText: {
    color: "#10b981",
  },
  statusDetailText: {
    fontSize: 10,
    color: "#9ca3af",
    marginLeft: 4,
  },
});
