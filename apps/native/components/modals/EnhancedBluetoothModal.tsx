import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  useAdvancedBluetooth,
  type BluetoothDevice,
  type DeviceType,
} from "@lib/hooks/useAdvancedBluetooth";

interface EnhancedBluetoothModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDevice?: (deviceId: string) => void;
}

const getDeviceIcon = (type: DeviceType): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case "SMARTWATCH":
      return "watch-outline";
    case "HEART_RATE_MONITOR":
      return "heart-outline";
    case "POWER_METER":
      return "flash-outline";
    case "CADENCE_SENSOR":
      return "refresh-outline";
    case "SPEED_SENSOR":
      return "speedometer-outline";
    case "FITNESS_SENSOR":
      return "fitness-outline";
    default:
      return "bluetooth-outline";
  }
};

const getDeviceTypeColor = (type: DeviceType): string => {
  switch (type) {
    case "SMARTWATCH":
      return "#8b5cf6";
    case "HEART_RATE_MONITOR":
      return "#ef4444";
    case "POWER_METER":
      return "#f59e0b";
    case "CADENCE_SENSOR":
      return "#10b981";
    case "SPEED_SENSOR":
      return "#3b82f6";
    case "FITNESS_SENSOR":
      return "#6366f1";
    default:
      return "#6b7280";
  }
};

const getConnectionStateColor = (state: string): string => {
  switch (state) {
    case "connected":
      return "#10b981";
    case "connecting":
    case "reconnecting":
      return "#f59e0b";
    case "disconnected":
    default:
      return "#ef4444";
  }
};

const getConnectionStateText = (
  state: string,
  reconnectAttempts: number = 0,
): string => {
  switch (state) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "reconnecting":
      return reconnectAttempts > 0
        ? `Reconnecting (${reconnectAttempts})`
        : "Reconnecting...";
    case "disconnected":
    default:
      return "Disconnected";
  }
};

const getDeviceTypeDisplayName = (type: DeviceType): string => {
  switch (type) {
    case "SMARTWATCH":
      return "Smart Watch";
    case "HEART_RATE_MONITOR":
      return "Heart Rate Monitor";
    case "POWER_METER":
      return "Power Meter";
    case "CADENCE_SENSOR":
      return "Cadence Sensor";
    case "SPEED_SENSOR":
      return "Speed Sensor";
    case "FITNESS_SENSOR":
      return "Fitness Sensor";
    default:
      return "Unknown Device";
  }
};

export const EnhancedBluetoothModal: React.FC<EnhancedBluetoothModalProps> = ({
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
    connectDevice,
    disconnectDevice,
    stopScan,
    getConnectionState,
    getReconnectAttempts,
    toggleAutoReconnect,
    forceReconnect,
  } = useAdvancedBluetooth();

  const [connectionStates, setConnectionStates] = useState<
    Record<string, string>
  >({});

  // Memoize device IDs to prevent unnecessary re-renders
  const deviceIds = useMemo(() => allDevices.map((d) => d.id), [allDevices]);

  // Update connection states periodically - optimized to prevent loops
  useEffect(() => {
    if (!visible || deviceIds.length === 0) return;

    const updateStates = () => {
      const states: Record<string, string> = {};
      deviceIds.forEach((deviceId) => {
        states[deviceId] = getConnectionState(deviceId);
      });

      setConnectionStates((prev) => {
        // Only update if states actually changed
        const hasChanged =
          deviceIds.some((id) => prev[id] !== states[id]) ||
          Object.keys(prev).length !== deviceIds.length;

        return hasChanged ? states : prev;
      });
    };

    updateStates();
    const interval = setInterval(updateStates, 2000);

    return () => clearInterval(interval);
  }, [visible, deviceIds.length, getConnectionState]);

  const handleConnect = useCallback(
    async (device: BluetoothDevice) => {
      try {
        console.log(`🔄 Connecting to ${device.name} (${device.type})`);
        await connectDevice(device.id);
        onSelectDevice?.(device.id);
      } catch (error) {
        console.warn("Connection failed:", error);
        Alert.alert(
          "Connection Failed",
          `Failed to connect to ${device.name}. Please try again.`,
          [
            { text: "OK" },
            {
              text: "Retry",
              onPress: () => handleConnect(device),
            },
          ],
        );
      }
    },
    [connectDevice, onSelectDevice],
  );

  const handleDisconnect = useCallback(
    async (device: BluetoothDevice) => {
      try {
        console.log(`🔌 Disconnecting from ${device.name}`);
        await disconnectDevice(device.id);
      } catch (error) {
        console.warn("Disconnection failed:", error);
        Alert.alert(
          "Disconnection Failed",
          `Failed to disconnect from ${device.name}.`,
        );
      }
    },
    [disconnectDevice],
  );

  const handleDeviceOptions = useCallback(
    (device: BluetoothDevice) => {
      const state = connectionStates[device.id] || "disconnected";
      const reconnectAttempts = getReconnectAttempts(device.id);

      const options = [{ text: "Cancel", style: "cancel" as const }];

      if (state === "connected") {
        options.unshift({
          text: "Disconnect",
          onPress: () => handleDisconnect(device),
        });
      } else if (state === "disconnected") {
        options.unshift({
          text: "Connect",
          onPress: () => handleConnect(device),
        });
      } else if (state === "reconnecting") {
        options.unshift({
          text: "Force Reconnect",
          onPress: () => forceReconnect(device.id),
        });
      }

      options.unshift({
        text: device.autoReconnect
          ? "Disable Auto-Reconnect"
          : "Enable Auto-Reconnect",
        onPress: () => toggleAutoReconnect(device.id, !device.autoReconnect),
      });

      Alert.alert(
        `${device.name} Options`,
        `Type: ${getDeviceTypeDisplayName(device.type)}`,
        options,
      );
    },
    [
      connectionStates,
      getReconnectAttempts,
      handleConnect,
      handleDisconnect,
      forceReconnect,
      toggleAutoReconnect,
    ],
  );

  const renderDevice = ({ item: device }: { item: BluetoothDevice }) => {
    const state = connectionStates[device.id] || "disconnected";
    const reconnectAttempts = getReconnectAttempts(device.id);
    const isConnected = state === "connected";
    const isConnecting = state === "connecting" || state === "reconnecting";

    return (
      <TouchableOpacity
        style={[styles.deviceItem, isConnected && styles.connectedDevice]}
        onPress={() => {
          if (isConnected) {
            onSelectDevice?.(device.id);
          } else if (!isConnecting) {
            handleConnect(device);
          }
        }}
        onLongPress={() => handleDeviceOptions(device)}
      >
        <View style={styles.deviceMain}>
          <View
            style={[
              styles.deviceIcon,
              { backgroundColor: getDeviceTypeColor(device.type) },
            ]}
          >
            <Ionicons
              name={getDeviceIcon(device.type)}
              size={24}
              color="#ffffff"
            />
          </View>

          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{device.name}</Text>
            <View style={styles.deviceMeta}>
              <Text style={styles.deviceType}>
                {getDeviceTypeDisplayName(device.type)}
              </Text>
              {device.rssi && (
                <Text style={styles.deviceRssi}>• {device.rssi} dBm</Text>
              )}
            </View>
          </View>

          <View style={styles.deviceStatus}>
            <View
              style={[
                styles.connectionIndicator,
                { backgroundColor: getConnectionStateColor(state) },
              ]}
            />
            <Text
              style={[
                styles.connectionText,
                { color: getConnectionStateColor(state) },
              ]}
            >
              {getConnectionStateText(state, reconnectAttempts)}
            </Text>

            {device.autoReconnect && (
              <View style={styles.autoReconnectBadge}>
                <Ionicons name="refresh" size={12} color="#3b82f6" />
              </View>
            )}
          </View>
        </View>

        {isConnected && (
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={() => handleDisconnect(device)}
          >
            <Ionicons name="close-circle" size={20} color="#ef4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const handleScan = useCallback(() => {
    if (isScanning) {
      stopScan();
    } else {
      scanForDevices(20000); // 20 second scan
    }
  }, [isScanning, scanForDevices, stopScan]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>

          <Text style={styles.title}>Bluetooth Devices</Text>

          <TouchableOpacity
            onPress={handleScan}
            style={[styles.scanButton, isScanning && styles.scanButtonActive]}
            disabled={!isBluetoothEnabled}
          >
            <Ionicons
              name={isScanning ? "stop-circle" : "search"}
              size={24}
              color={
                isBluetoothEnabled
                  ? isScanning
                    ? "#ef4444"
                    : "#3b82f6"
                  : "#9ca3af"
              }
            />
          </TouchableOpacity>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={styles.statusItem}>
            <Ionicons
              name={isBluetoothEnabled ? "bluetooth" : "bluetooth-off"}
              size={16}
              color={isBluetoothEnabled ? "#10b981" : "#ef4444"}
            />
            <Text style={styles.statusText}>
              Bluetooth {isBluetoothEnabled ? "On" : "Off"}
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Ionicons name="link" size={16} color="#3b82f6" />
            <Text style={styles.statusText}>
              {connectedDevices.length} Connected
            </Text>
          </View>

          {isScanning && (
            <View style={styles.statusItem}>
              <Ionicons name="search" size={16} color="#f59e0b" />
              <Text style={styles.statusText}>Scanning...</Text>
            </View>
          )}
        </View>

        {/* Devices List */}
        <FlatList
          data={allDevices}
          keyExtractor={(item) => item.id}
          renderItem={renderDevice}
          style={styles.devicesList}
          contentContainerStyle={styles.devicesListContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {!isBluetoothEnabled ? (
                <>
                  <Ionicons name="bluetooth-off" size={48} color="#9ca3af" />
                  <Text style={styles.emptyStateText}>Bluetooth is Off</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Turn on Bluetooth to discover devices
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="search" size={48} color="#9ca3af" />
                  <Text style={styles.emptyStateText}>No Devices Found</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Tap the search icon to scan for devices
                  </Text>
                </>
              )}
            </View>
          }
        />

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Long press devices for more options
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  scanButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  scanButtonActive: {
    backgroundColor: "#fee2e2",
  },
  statusContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 20,
  },
  statusText: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 6,
  },
  devicesList: {
    flex: 1,
  },
  devicesListContent: {
    padding: 20,
  },
  deviceItem: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  connectedDevice: {
    borderColor: "#10b981",
    backgroundColor: "#f0fdf4",
  },
  deviceMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  deviceMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceType: {
    fontSize: 14,
    color: "#6b7280",
  },
  deviceRssi: {
    fontSize: 12,
    color: "#9ca3af",
    marginLeft: 4,
  },
  deviceStatus: {
    alignItems: "flex-end",
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: "500",
  },
  autoReconnectBadge: {
    marginTop: 4,
    padding: 2,
    backgroundColor: "#dbeafe",
    borderRadius: 4,
  },
  disconnectButton: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
    textAlign: "center",
    maxWidth: 280,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  footerText: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
  },
});
