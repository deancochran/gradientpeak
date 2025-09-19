import { Ionicons } from "@expo/vector-icons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  Button,
  View,
} from "react-native";

import {
  useAdvancedBluetooth,
  type BluetoothDevice,
  type DeviceType,
} from "@/lib/hooks/useAdvancedBluetooth";

interface EnhancedBluetoothModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDevice?: (deviceId: string) => void;
}

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

const getSignalStrengthIcon = (
  rssi?: number | null,
): keyof typeof Ionicons.glyphMap => {
  if (!rssi) return "radio-outline";
  if (rssi > -50) return "radio";
  if (rssi > -70) return "radio-outline";
  return "radio-outline";
};

const getSignalStrengthColor = (rssi?: number | null): string => {
  if (!rssi) return "#9ca3af";
  if (rssi > -50) return "#10b981";
  if (rssi > -70) return "#f59e0b";
  return "#ef4444";
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
  } = useAdvancedBluetooth();

  const [connectionStates, setConnectionStates] = useState<
    Record<string, string>
  >({});
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(
    new Set(),
  );
  const autoSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const noNewDevicesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastDeviceCountRef = useRef<number>(0);

  // Memoize device IDs to prevent unnecessary re-renders
  const deviceIds = useMemo(() => allDevices.map((d) => d.id), [allDevices]);

  // Separate connected and available devices
  const { connectedDevicesList, availableDevicesList } = useMemo(() => {
    const connected = allDevices.filter((device) =>
      connectedDevices.some(
        (connectedDevice) => connectedDevice.id === device.id,
      ),
    );
    const available = allDevices.filter(
      (device) =>
        !connectedDevices.some(
          (connectedDevice) => connectedDevice.id === device.id,
        ),
    );
    return {
      connectedDevicesList: connected,
      availableDevicesList: available,
    };
  }, [allDevices, connectedDevices]);

  // Auto-start search when modal opens
  useEffect(() => {
    if (visible && isBluetoothEnabled && !isScanning) {
      console.log("🔍 Auto-starting Bluetooth scan on modal open");
      scanForDevices(20000); // 20 second initial scan

      // Set timeout to stop scanning
      autoSearchTimeoutRef.current = setTimeout(() => {
        if (isScanning) {
          console.log("🛑 Auto-stopping scan after timeout");
          stopScan();
        }
      }, 20000);
    }

    return () => {
      if (autoSearchTimeoutRef.current !== null) {
        clearTimeout(autoSearchTimeoutRef.current);
        autoSearchTimeoutRef.current = null;
      }
      if (noNewDevicesTimeoutRef.current !== null) {
        clearTimeout(noNewDevicesTimeoutRef.current);
        noNewDevicesTimeoutRef.current = null;
      }
    };
  }, [visible, isBluetoothEnabled, isScanning, scanForDevices, stopScan]);

  // Auto-stop scanning when no new devices found for 10 seconds
  useEffect(() => {
    if (!isScanning) return;

    const currentDeviceCount = allDevices.length;

    if (currentDeviceCount !== lastDeviceCountRef.current) {
      // New device found, reset timeout
      lastDeviceCountRef.current = currentDeviceCount;

      if (noNewDevicesTimeoutRef.current !== null) {
        clearTimeout(noNewDevicesTimeoutRef.current);
      }

      noNewDevicesTimeoutRef.current = setTimeout(() => {
        if (isScanning) {
          console.log("🛑 Auto-stopping scan - no new devices found for 10s");
          stopScan();
        }
      }, 10000);
    }

    return () => {
      if (noNewDevicesTimeoutRef.current !== null) {
        clearTimeout(noNewDevicesTimeoutRef.current);
        noNewDevicesTimeoutRef.current = null;
      }
    };
  }, [allDevices.length, isScanning, stopScan]);

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
        setConnectingDevices((prev) => new Set(prev).add(device.id));

        await connectDevice(device.id);
        onSelectDevice?.(device.id);

        // Don't close modal - keep it open as per requirements
        console.log(`✅ Successfully connected to ${device.name}`);
      } catch (error) {
        console.warn("Connection failed:", error);
        // Simple error handling - just log for MVP
      } finally {
        setConnectingDevices((prev) => {
          const newSet = new Set(prev);
          newSet.delete(device.id);
          return newSet;
        });
      }
    },
    [connectDevice, onSelectDevice],
  );

  const handleDisconnect = useCallback(
    async (device: BluetoothDevice) => {
      try {
        console.log(`🔌 Disconnecting from ${device.name}`);
        setConnectingDevices((prev) => new Set(prev).add(device.id));

        await disconnectDevice(device.id);
        console.log(`✅ Successfully disconnected from ${device.name}`);
      } catch (error) {
        console.warn("Disconnection failed:", error);
        // Simple error handling - just log for MVP
      } finally {
        setConnectingDevices((prev) => {
          const newSet = new Set(prev);
          newSet.delete(device.id);
          return newSet;
        });
      }
    },
    [disconnectDevice],
  );

  const renderDevice = ({ item: device }: { item: BluetoothDevice }) => {
    const state = connectionStates[device.id] || "disconnected";
    const isConnected = state === "connected";
    const isProcessing = connectingDevices.has(device.id);

    return (
      <View style={[styles.deviceItem, isConnected && styles.connectedDevice]}>
        <View style={styles.deviceMain}>
          {/* Signal Strength Icon */}
          <View style={styles.signalContainer}>
            <Ionicons
              name={getSignalStrengthIcon(device.rssi)}
              size={20}
              color={getSignalStrengthColor(device.rssi)}
            />
          </View>

          {/* Device Info */}
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={styles.deviceType}>
              {getDeviceTypeDisplayName(device.type)}
            </Text>
          </View>

          {/* Connect/Disconnect Button */}
          <Button
            style={[
              styles.actionButton,
              isConnected ? styles.disconnectButton : styles.connectButton,
            ]}
            onPress={() => {
              if (isConnected) {
                handleDisconnect(device);
              } else {
                handleConnect(device);
              }
            }}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size={16} color="#ffffff" />
            ) : (
              <Text style={styles.actionButtonText}>
                {isConnected ? "Disconnect" : "Connect"}
              </Text>
            )}
          </Button>
        </View>
      </View>
    );
  };

  const handleManualScan = useCallback(() => {
    if (isScanning) {
      stopScan();
      if (autoSearchTimeoutRef.current !== null) {
        clearTimeout(autoSearchTimeoutRef.current);
        autoSearchTimeoutRef.current = null;
      }
      if (noNewDevicesTimeoutRef.current !== null) {
        clearTimeout(noNewDevicesTimeoutRef.current);
        noNewDevicesTimeoutRef.current = null;
      }
    } else {
      console.log("🔍 Manual Bluetooth scan triggered");
      scanForDevices(20000); // 20 second scan

      autoSearchTimeoutRef.current = setTimeout(() => {
        if (isScanning) {
          console.log("🛑 Stopping manual scan after timeout");
          stopScan();
        }
      }, 20000);
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
          <Button onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </Button>

          <Text style={styles.title}>Bluetooth Devices</Text>

          <Button
            onPress={handleManualScan}
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
          </Button>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={styles.statusItem}>
            <Ionicons
              name={isBluetoothEnabled ? "bluetooth" : "bluetooth-outline"}
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
        <View style={styles.devicesList}>
          {/* Connected Devices Section */}
          {connectedDevicesList.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Connected Devices</Text>
              <FlatList
                data={connectedDevicesList}
                keyExtractor={(item) => `connected-${item.id}`}
                renderItem={renderDevice}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* Available Devices Section */}
          {availableDevicesList.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Available Devices</Text>
              <FlatList
                data={availableDevicesList}
                keyExtractor={(item) => `available-${item.id}`}
                renderItem={renderDevice}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* Empty State */}
          {allDevices.length === 0 && (
            <View style={styles.emptyState}>
              {!isBluetoothEnabled ? (
                <>
                  <Ionicons
                    name="bluetooth-outline"
                    size={48}
                    color="#9ca3af"
                  />
                  <Text style={styles.emptyStateText}>Bluetooth is Off</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Turn on Bluetooth to discover devices
                  </Text>
                </>
              ) : isScanning ? (
                <>
                  <ActivityIndicator size={48} color="#3b82f6" />
                  <Text style={styles.emptyStateText}>
                    Searching for Devices...
                  </Text>
                  <Text style={styles.emptyStateSubtext}>
                    Make sure your devices are in pairing mode
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="search" size={48} color="#9ca3af" />
                  <Text style={styles.emptyStateText}>No Devices Found</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Search automatically started. Ensure devices are in pairing
                    mode.
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Search starts automatically. Modal stays open when connecting
            devices.
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
    paddingVertical: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  deviceItem: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    marginHorizontal: 20,
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
  signalContainer: {
    width: 40,
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
  deviceType: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  connectButton: {
    backgroundColor: "#3b82f6",
  },
  disconnectButton: {
    backgroundColor: "#ef4444",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
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
