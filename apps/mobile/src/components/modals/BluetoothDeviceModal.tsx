import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useBluetooth, type BluetoothDevice } from "@/lib/hooks/useBluetooth";

interface BluetoothDeviceModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDevice: (deviceId: string) => void;
}

export const BluetoothDeviceModal: React.FC<BluetoothDeviceModalProps> = ({
  visible,
  onClose,
  onSelectDevice,
}) => {
  const {
    allDevices,
    connectedDevices,
    isScanning,
    isBluetoothEnabled,
    scanForDevices,
    stopScan,
    connectDevice,
    disconnectDevice,
  } = useBluetooth();

  const [hasScanned, setHasScanned] = useState(false);
  const isMountedRef = useRef(true);

  // Handle modal lifecycle
  useEffect(() => {
    if (visible) {
      isMountedRef.current = true;
      // Only auto-scan once when modal opens, and only if we haven't scanned yet
      if (isBluetoothEnabled && !hasScanned && !isScanning) {
        setHasScanned(true);
        scanForDevices(15000);
      }
    } else {
      // Stop scanning when modal closes
      stopScan();
      setHasScanned(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [
    visible,
    isBluetoothEnabled,
    hasScanned,
    isScanning,
    scanForDevices,
    stopScan,
  ]);

  // Stop scanning when component unmounts
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  const handleManualScan = () => {
    if (isScanning) {
      stopScan();
    } else {
      scanForDevices(15000);
      setHasScanned(true);
    }
  };

  const handleDevicePress = async (device: BluetoothDevice) => {
    if (!isMountedRef.current) return;

    try {
      if (device.isConnected) {
        // Show confirmation before disconnecting
        Alert.alert(
          "Disconnect Device",
          `Are you sure you want to disconnect from ${device.name || "this device"}?`,
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Disconnect",
              style: "destructive",
              onPress: async () => {
                await disconnectDevice(device.id);
              },
            },
          ],
        );
      } else {
        // Connect to device
        await connectDevice(device.id);
        onSelectDevice(device.id);
      }
    } catch (error) {
      console.error("Device connection error:", error);
      Alert.alert(
        "Connection Error",
        `Failed to ${device.isConnected ? "disconnect from" : "connect to"} ${device.name || "device"}. Please try again.`,
        [{ text: "OK" }],
      );
    }
  };

  const getDeviceIcon = (device: BluetoothDevice) => {
    if (device.isConnected) return "checkmark-circle";

    // Try to determine device type from name
    const name = device.name?.toLowerCase() || "";
    if (name.includes("heart") || name.includes("hr")) return "heart";
    if (name.includes("power") || name.includes("bike")) return "bicycle";
    if (name.includes("cadence") || name.includes("speed"))
      return "speedometer";

    return "bluetooth";
  };

  const renderItem = ({ item }: { item: BluetoothDevice }) => (
    <TouchableOpacity
      style={[styles.deviceItem, item.isConnected && styles.connectedDevice]}
      onPress={() => handleDevicePress(item)}
    >
      <View style={styles.deviceInfo}>
        <View style={styles.deviceHeader}>
          <Ionicons
            name={getDeviceIcon(item)}
            size={20}
            color={item.isConnected ? "#10b981" : "#6b7280"}
          />
          <Text
            style={[
              styles.deviceName,
              item.isConnected && styles.connectedDeviceName,
            ]}
          >
            {item.name || "Unknown Device"}
          </Text>
          {item.isConnected && (
            <View style={styles.connectedBadge}>
              <Text style={styles.connectedBadgeText}>CONNECTED</Text>
            </View>
          )}
        </View>
        <Text style={styles.deviceDetails}>RSSI: {item.rssi ?? "N/A"} dBm</Text>
      </View>

      <View style={styles.deviceActions}>
        <Text
          style={[
            styles.actionText,
            item.isConnected ? styles.disconnectText : styles.connectText,
          ]}
        >
          {item.isConnected ? "Tap to disconnect" : "Tap to connect"}
        </Text>
        <Ionicons
          name={
            item.isConnected ? "remove-circle-outline" : "add-circle-outline"
          }
          size={24}
          color={item.isConnected ? "#ef4444" : "#007AFF"}
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Bluetooth Devices</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        {!isBluetoothEnabled && (
          <View style={styles.bluetoothDisabledMessage}>
            <Ionicons name="bluetooth-outline" size={24} color="#ef4444" />
            <Text style={styles.bluetoothDisabledText}>
              Bluetooth is disabled. Please enable it in Settings.
            </Text>
          </View>
        )}

        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            {connectedDevices.length} connected •{" "}
            {allDevices.length - connectedDevices.length} discovered
          </Text>
          {isScanning && (
            <View style={styles.scanningIndicator}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.scanningText}>Scanning...</Text>
            </View>
          )}
        </View>

        <FlatList
          data={allDevices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.deviceList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {!isScanning ? (
                <>
                  <Ionicons
                    name="bluetooth-outline"
                    size={48}
                    color="#9ca3af"
                  />
                  <Text style={styles.emptyStateText}>No devices found</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Make sure your devices are in pairing mode and try scanning
                  </Text>
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.scanningText}>
                    Scanning for devices...
                  </Text>
                </>
              )}
            </View>
          }
        />

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.scanButton,
              !isBluetoothEnabled && styles.disabledButton,
            ]}
            onPress={handleManualScan}
            disabled={!isBluetoothEnabled}
          >
            <Ionicons
              name={isScanning ? "stop" : "refresh"}
              size={20}
              color="white"
            />
            <Text style={styles.actionButtonText}>
              {isScanning ? "Stop Scan" : "Scan for Devices"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  closeButton: {
    padding: 4,
  },
  bluetoothDisabledMessage: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    padding: 16,
    margin: 16,
    borderRadius: 8,
    gap: 12,
  },
  bluetoothDisabledText: {
    flex: 1,
    color: "#dc2626",
    fontWeight: "500",
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  statusText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  scanningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scanningText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  deviceList: {
    flex: 1,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  connectedDevice: {
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 4,
    borderLeftColor: "#10b981",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  connectedDeviceName: {
    color: "#059669",
  },
  connectedBadge: {
    backgroundColor: "#10b981",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  connectedBadgeText: {
    fontSize: 10,
    color: "white",
    fontWeight: "700",
  },
  deviceDetails: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 32,
  },
  deviceActions: {
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 10,
    textAlign: "center",
  },
  connectText: {
    color: "#007AFF",
  },
  disconnectText: {
    color: "#ef4444",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 16,
    textAlign: "center",
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  actions: {
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  scanButton: {
    backgroundColor: "#007AFF",
  },
  disabledButton: {
    backgroundColor: "#9ca3af",
  },
  actionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
