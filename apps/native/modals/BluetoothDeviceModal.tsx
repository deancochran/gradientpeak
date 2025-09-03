import { BluetoothDevice, useBluetooth } from "@/hooks/useBluetooth";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
    discoveredDevices,
    connectedDevices,
    isScanning,
    isBluetoothEnabled,
    scanForDevices,
    stopScan,
    connectDevice,
  } = useBluetooth();

  // Auto-scan when modal opens
  useEffect(() => {
    if (visible && isBluetoothEnabled && !isScanning) {
      scanForDevices(10000); // 10s scan
    }
    if (!visible) stopScan();
  }, [visible, isBluetoothEnabled, isScanning, scanForDevices, stopScan]);

  const handleDevicePress = async (device: BluetoothDevice) => {
    try {
      await connectDevice(device.id);
      onSelectDevice(device.id);
      onClose();
    } catch {
      alert("Failed to connect to device. Please try again.");
    }
  };

  const renderItem = ({ item }: { item: BluetoothDevice }) => (
    <TouchableOpacity
      style={{
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#ccc",
        flexDirection: "row",
        justifyContent: "space-between",
      }}
      onPress={() => handleDevicePress(item)}
    >
      <View>
        <Text style={{ fontSize: 16, fontWeight: "500" }}>{item.name}</Text>
        <Text style={{ fontSize: 12, color: "#666" }}>
          RSSI: {item.rssi ?? "N/A"}
        </Text>
      </View>
      {isScanning && <ActivityIndicator size="small" color="#007AFF" />}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
          Bluetooth Devices
        </Text>

        <FlatList
          data={[...connectedDevices, ...discoveredDevices]}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            !isScanning ? (
              <Text
                style={{ textAlign: "center", marginTop: 20, color: "#666" }}
              >
                No devices found
              </Text>
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={{ marginLeft: 8 }}>Scanning...</Text>
              </View>
            )
          }
        />

        <TouchableOpacity
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: "#007AFF",
            borderRadius: 8,
            alignItems: "center",
          }}
          onPress={isScanning ? stopScan : () => scanForDevices(10000)}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>
            {isScanning ? "Stop Scan" : "Rescan"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: "#FF3B30",
            borderRadius: 8,
            alignItems: "center",
          }}
          onPress={onClose}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};
