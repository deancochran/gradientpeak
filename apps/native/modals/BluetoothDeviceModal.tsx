import { useGlobalPermissions } from "@/contexts/PermissionsContext";
import { useBluetooth } from "@/hooks/useBluetooth";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface BluetoothDevice {
  id: string;
  name: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  supportedSensors: string[];
}

interface BluetoothDeviceModalProps {
  visible: boolean;
  onClose: () => void;
  onDeviceSelect: (deviceId: string) => void;
  bluetooth: ReturnType<typeof useBluetooth>;
}

export const BluetoothDeviceModal = ({
  visible,
  onClose,
  onDeviceSelect,
  bluetooth,
}: BluetoothDeviceModalProps) => {
  const { permissions, requestSinglePermission } = useGlobalPermissions();

  const {
    isScanning,
    discoveredDevices,
    connectedDevices,
    scanForDevices,
    stopScanForDevices,
    connectDevice,
    isBluetoothEnabled,
  } = bluetooth;

  const handleScanPress = async () => {
    if (isScanning) {
      stopScanForDevices();
      return;
    }

    const isBluetoothPermissionGranted = permissions.bluetooth?.granted;
    if (!isBluetoothPermissionGranted) {
      await requestSinglePermission("bluetooth");
      return;
    }

    if (isBluetoothEnabled) {
      scanForDevices(10000);
    }
  };

  const handleDevicePress = async (device: BluetoothDevice) => {
    if (device.isConnected) {
      onDeviceSelect(device.id);
      onClose();
    } else {
      try {
        await connectDevice(device.id);
        onDeviceSelect(device.id);
        onClose();
      } catch (error) {
        Alert.alert("Connection Failed", "Could not connect to device");
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={bluetoothModalStyles.container}>
        <View style={bluetoothModalStyles.header}>
          <TouchableOpacity
            style={bluetoothModalStyles.closeButton}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={bluetoothModalStyles.title}>Bluetooth Devices</Text>
          <TouchableOpacity
            style={bluetoothModalStyles.scanButton}
            onPress={handleScanPress}
            disabled={!isBluetoothEnabled}
          >
            <Ionicons
              name={isScanning ? "stop" : "search"}
              size={20}
              color={isBluetoothEnabled ? "#111827" : "#9ca3af"}
            />
          </TouchableOpacity>
        </View>

        {!isBluetoothEnabled && (
          <View style={bluetoothModalStyles.bluetoothDisabled}>
            <Ionicons name="bluetooth-outline" size={24} color="#ef4444" />
            <Text style={bluetoothModalStyles.bluetoothDisabledText}>
              Bluetooth is disabled. Please enable it in device settings.
            </Text>
          </View>
        )}

        <ScrollView style={bluetoothModalStyles.deviceList}>
          {connectedDevices.length > 0 && (
            <>
              <Text style={bluetoothModalStyles.sectionTitle}>Connected</Text>
              {connectedDevices.map((device) => (
                <TouchableOpacity
                  key={device.id}
                  style={[
                    bluetoothModalStyles.deviceCard,
                    bluetoothModalStyles.connectedDeviceCard,
                  ]}
                  onPress={() => handleDevicePress(device)}
                >
                  <View style={bluetoothModalStyles.deviceInfo}>
                    <Text style={bluetoothModalStyles.deviceName}>
                      {device.name}
                    </Text>
                    <View style={bluetoothModalStyles.sensorTypes}>
                      {device.supportedSensors.map((sensor) => (
                        <View
                          key={sensor}
                          style={bluetoothModalStyles.sensorChip}
                        >
                          <Text style={bluetoothModalStyles.sensorChipText}>
                            {sensor}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={bluetoothModalStyles.connectionStatus}>
                    <View style={bluetoothModalStyles.connectedIndicator} />
                    <Text style={bluetoothModalStyles.connectedText}>
                      Connected
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {discoveredDevices.length > 0 && (
            <>
              <Text style={bluetoothModalStyles.sectionTitle}>
                {connectedDevices.length > 0 ? "Available" : "Discovered"}
              </Text>
              {discoveredDevices
                .filter((device) => !device.isConnected)
                .map((device) => (
                  <TouchableOpacity
                    key={device.id}
                    style={bluetoothModalStyles.deviceCard}
                    onPress={() => handleDevicePress(device)}
                    disabled={device.isConnecting}
                  >
                    <View style={bluetoothModalStyles.deviceInfo}>
                      <Text style={bluetoothModalStyles.deviceName}>
                        {device.name}
                      </Text>
                      <View style={bluetoothModalStyles.sensorTypes}>
                        {device.supportedSensors.map((sensor) => (
                          <View
                            key={sensor}
                            style={bluetoothModalStyles.sensorChip}
                          >
                            <Text style={bluetoothModalStyles.sensorChipText}>
                              {sensor}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={bluetoothModalStyles.connectionStatus}>
                      {device.isConnecting ? (
                        <Text style={bluetoothModalStyles.connectingText}>
                          Connecting...
                        </Text>
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#9ca3af"
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
            </>
          )}

          {isScanning && (
            <View style={bluetoothModalStyles.scanningIndicator}>
              <Text style={bluetoothModalStyles.scanningText}>
                Scanning for devices...
              </Text>
            </View>
          )}

          {!isScanning &&
            discoveredDevices.length === 0 &&
            isBluetoothEnabled && (
              <View style={bluetoothModalStyles.emptyState}>
                <Ionicons name="bluetooth-outline" size={48} color="#d1d5db" />
                <Text style={bluetoothModalStyles.emptyStateText}>
                  No devices found
                </Text>
                <Text style={bluetoothModalStyles.emptyStateSubtext}>
                  Make sure your fitness devices are in pairing mode
                </Text>
              </View>
            )}
        </ScrollView>
      </View>
    </Modal>
  );
};

// Bluetooth Modal Styles
const bluetoothModalStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    gap: 10,
  },
  closeButton: { padding: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  scanButton: { padding: 8 },
  bluetoothDisabled: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  bluetoothDisabledText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "500",
    flex: 1,
  },
  deviceList: { flex: 1 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
    marginTop: 20,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  connectedDeviceCard: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  deviceInfo: { flexShrink: 1, marginRight: 10 },
  deviceName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  sensorTypes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sensorChip: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sensorChipText: { fontSize: 11, color: "#2563eb", fontWeight: "600" },
  connectionStatus: { flexDirection: "row", alignItems: "center" },
  connectedIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10b981",
    marginRight: 6,
  },
  connectedText: { fontSize: 13, color: "#065f46", fontWeight: "500" },
  connectingText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  scanningIndicator: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  scanningText: { fontSize: 14, color: "#6b7280" },
  emptyState: { alignItems: "center", justifyContent: "center", marginTop: 40 },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#d1d5db",
    marginBottom: 8,
  },
  emptyStateSubtext: { fontSize: 14, color: "#9ca3af", textAlign: "center" },
});
