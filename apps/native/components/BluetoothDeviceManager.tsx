// components/BluetoothDeviceManager.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  BluetoothDevice,
  SensorType,
  useBluetoothStore,
} from "@/stores/bluetooth";

interface BluetoothDeviceManagerProps {
  visible: boolean;
  onClose: () => void;
}

export default function BluetoothDeviceManager({
  visible,
  onClose,
}: BluetoothDeviceManagerProps) {
  const [currentTab, setCurrentTab] = useState<
    "devices" | "sensors" | "settings"
  >("devices");

  const {
    discoveredDevices,
    connectedDevices,
    isScanning,
    isBluetoothEnabled,
    devicePreferences,
    connectionErrors,
    currentSensorData,
    startScanning,
    stopScanning,
    connectToDevice,
    disconnectFromDevice,
    setPreferredDevice,
    updateDevicePreferences,
    initializeBluetooth,
  } = useBluetoothStore();

  useEffect(() => {
    if (visible && isBluetoothEnabled) {
      initializeBluetooth();
    }
  }, [visible, isBluetoothEnabled]);

  const handleScanPress = () => {
    if (isScanning) {
      stopScanning();
    } else {
      if (!isBluetoothEnabled) {
        Alert.alert(
          "Bluetooth Disabled",
          "Please enable Bluetooth to scan for devices.",
          [{ text: "OK" }],
        );
        return;
      }
      startScanning(15000);
    }
  };

  const handleDeviceConnect = async (device: BluetoothDevice) => {
    if (device.isConnected) {
      try {
        await disconnectFromDevice(device.id);
      } catch (error) {
        Alert.alert("Disconnect Failed", "Failed to disconnect from device.");
      }
    } else {
      try {
        await connectToDevice(device.id);
      } catch (error) {
        Alert.alert("Connection Failed", "Failed to connect to device.");
      }
    }
  };

  const getSensorIcon = (sensorType: SensorType) => {
    switch (sensorType) {
      case "heartRate":
        return "heart";
      case "power":
        return "flash";
      case "cadence":
        return "refresh";
      case "speed":
        return "speedometer";
      default:
        return "fitness";
    }
  };

  const renderDeviceItem = ({ item: device }: { item: BluetoothDevice }) => {
    const error = connectionErrors.get(device.id);

    return (
      <Card style={styles.deviceCard}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceInfo}>
            <View style={styles.deviceTitleRow}>
              <Text style={styles.deviceName}>{device.name}</Text>
              {device.isConnected && (
                <View style={styles.connectedBadge}>
                  <Text style={styles.connectedBadgeText}>Connected</Text>
                </View>
              )}
            </View>

            <Text style={styles.deviceId}>ID: {device.id.slice(-8)}</Text>

            <View style={styles.deviceMeta}>
              <Text style={styles.rssi}>RSSI: {device.rssi} dBm</Text>
              {device.deviceInfo?.manufacturer && (
                <Text style={styles.manufacturer}>
                  {device.deviceInfo.manufacturer}
                </Text>
              )}
            </View>

            <View style={styles.sensorsContainer}>
              {device.supportedSensors.map((sensor) => (
                <View key={sensor} style={styles.sensorChip}>
                  <Ionicons
                    name={getSensorIcon(sensor) as any}
                    size={12}
                    color="#6b7280"
                  />
                  <Text style={styles.sensorText}>
                    {sensor.charAt(0).toUpperCase() + sensor.slice(1)}
                  </Text>
                </View>
              ))}
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          <TouchableOpacity
            style={[
              styles.connectButton,
              device.isConnected && styles.connectedButton,
              device.isConnecting && styles.connectingButton,
            ]}
            onPress={() => handleDeviceConnect(device)}
            disabled={device.isConnecting}
          >
            <Ionicons
              name={
                device.isConnecting
                  ? "reload"
                  : device.isConnected
                    ? "checkmark"
                    : "add"
              }
              size={20}
              color={device.isConnected ? "#10b981" : "#111827"}
            />
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  const renderSensorPreferences = () => {
    const sensorTypes: { type: SensorType; label: string; icon: string }[] = [
      { type: "heartRate", label: "Heart Rate", icon: "heart" },
      { type: "power", label: "Power", icon: "flash" },
      { type: "cadence", label: "Cadence", icon: "refresh" },
      { type: "speed", label: "Speed", icon: "speedometer" },
    ];

    return (
      <View style={styles.sensorsTab}>
        <Card style={styles.sensorDataCard}>
          <Text style={styles.sensorDataTitle}>Live Sensor Data</Text>

          <View style={styles.sensorDataGrid}>
            {[
              {
                label: "Heart Rate",
                value: currentSensorData.heartRate,
                unit: "bpm",
              },
              { label: "Power", value: currentSensorData.power, unit: "W" },
              {
                label: "Cadence",
                value: currentSensorData.cadence,
                unit: "rpm",
              },
              { label: "Speed", value: currentSensorData.speed, unit: "km/h" },
            ].map((metric) => (
              <View key={metric.label} style={styles.sensorDataItem}>
                <Text style={styles.sensorDataValue}>
                  {metric.value ?? "--"}
                </Text>
                <Text style={styles.sensorDataLabel}>{metric.label}</Text>
                <Text style={styles.sensorDataUnit}>{metric.unit}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Preferred Devices</Text>

        {sensorTypes.map((sensor) => {
          const availableDevices = Array.from(connectedDevices.values()).filter(
            (device) => device.supportedSensors.includes(sensor.type),
          );

          const preferredDeviceId = devicePreferences[
            `preferred${sensor.type.charAt(0).toUpperCase() + sensor.type.slice(1)}Device` as keyof typeof devicePreferences
          ] as string;

          const preferredDevice = availableDevices.find(
            (d) => d.id === preferredDeviceId,
          );

          return (
            <Card key={sensor.type} style={styles.preferenceCard}>
              <View style={styles.preferenceHeader}>
                <View style={styles.preferenceInfo}>
                  <Ionicons
                    name={sensor.icon as any}
                    size={20}
                    color="#111827"
                  />
                  <Text style={styles.preferenceLabel}>{sensor.label}</Text>
                </View>

                <Text style={styles.preferenceValue}>
                  {preferredDevice
                    ? preferredDevice.name
                    : "No device selected"}
                </Text>
              </View>

              {availableDevices.length > 0 && (
                <View style={styles.deviceOptions}>
                  {availableDevices.map((device) => (
                    <TouchableOpacity
                      key={device.id}
                      style={[
                        styles.deviceOption,
                        device.id === preferredDeviceId &&
                          styles.selectedDeviceOption,
                      ]}
                      onPress={() => setPreferredDevice(sensor.type, device.id)}
                    >
                      <Text
                        style={[
                          styles.deviceOptionText,
                          device.id === preferredDeviceId &&
                            styles.selectedDeviceOptionText,
                        ]}
                      >
                        {device.name}
                      </Text>
                      {device.id === preferredDeviceId && (
                        <Ionicons name="checkmark" size={16} color="#10b981" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Card>
          );
        })}
      </View>
    );
  };

  const renderSettings = () => (
    <View style={styles.settingsTab}>
      <Card style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Auto Connect</Text>
            <Text style={styles.settingDescription}>
              Automatically connect to preferred devices when available
            </Text>
          </View>
          <Switch
            value={devicePreferences.autoConnect}
            onValueChange={(value) =>
              updateDevicePreferences({ autoConnect: value })
            }
            trackColor={{ false: "#e5e7eb", true: "#10b981" }}
            thumbColor={devicePreferences.autoConnect ? "#ffffff" : "#f3f4f6"}
          />
        </View>
      </Card>

      <Card style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Bluetooth Status</Text>
            <Text style={styles.settingDescription}>
              {isBluetoothEnabled ? "Enabled" : "Disabled"}
            </Text>
          </View>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: isBluetoothEnabled ? "#10b981" : "#ef4444" },
            ]}
          />
        </View>
      </Card>

      <Card style={styles.settingCard}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Connected Devices</Text>
          <Text style={styles.settingDescription}>
            {connectedDevices.size} device(s) connected
          </Text>
        </View>

        {connectedDevices.size > 0 && (
          <View style={styles.connectedDevicesList}>
            {Array.from(connectedDevices.values()).map((device) => (
              <View key={device.id} style={styles.connectedDeviceItem}>
                <Text style={styles.connectedDeviceName}>{device.name}</Text>
                <TouchableOpacity
                  onPress={() => handleDeviceConnect(device)}
                  style={styles.disconnectButton}
                >
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );

  const allDevices = Array.from(discoveredDevices.values()).sort((a, b) => {
    if (a.isConnected && !b.isConnected) return -1;
    if (!a.isConnected && b.isConnected) return 1;
    return b.rssi - a.rssi;
  });

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
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Bluetooth Devices</Text>

          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanningButton]}
            onPress={handleScanPress}
          >
            <Ionicons
              name={isScanning ? "stop" : "search"}
              size={20}
              color={isScanning ? "#ef4444" : "#111827"}
            />
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          {[
            { id: "devices", label: "Devices", icon: "bluetooth" },
            { id: "sensors", label: "Sensors", icon: "heart" },
            { id: "settings", label: "Settings", icon: "settings" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, currentTab === tab.id && styles.activeTab]}
              onPress={() => setCurrentTab(tab.id as any)}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={currentTab === tab.id ? "#111827" : "#6b7280"}
              />
              <Text
                style={[
                  styles.tabLabel,
                  currentTab === tab.id && styles.activeTabLabel,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {currentTab === "devices" && (
            <View style={styles.devicesTab}>
              {!isBluetoothEnabled && (
                <Card style={styles.warningCard}>
                  <Ionicons name="warning" size={24} color="#f59e0b" />
                  <Text style={styles.warningText}>
                    Bluetooth is disabled. Please enable it in your device
                    settings.
                  </Text>
                </Card>
              )}

              <View style={styles.scanSection}>
                <Text style={styles.sectionTitle}>
                  {isScanning
                    ? "Scanning..."
                    : `Found ${allDevices.length} devices`}
                </Text>

                {isScanning && (
                  <Text style={styles.scanningText}>
                    Looking for fitness sensors...
                  </Text>
                )}
              </View>

              <FlatList
                data={allDevices}
                renderItem={renderDeviceItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.devicesList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="bluetooth" size={48} color="#d1d5db" />
                    <Text style={styles.emptyStateTitle}>No devices found</Text>
                    <Text style={styles.emptyStateDescription}>
                      {isBluetoothEnabled
                        ? "Tap scan to discover fitness sensors nearby"
                        : "Enable Bluetooth to discover devices"}
                    </Text>
                  </View>
                }
              />
            </View>
          )}

          {currentTab === "sensors" && renderSensorPreferences()}
          {currentTab === "settings" && renderSettings()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f3f3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  scanButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f3f3",
    alignItems: "center",
    justifyContent: "center",
  },
  scanningButton: {
    backgroundColor: "#fee2e2",
  },

  // Tab Navigation
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  activeTab: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  activeTabLabel: {
    color: "#111827",
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Devices Tab
  devicesTab: {
    flex: 1,
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fef3cd",
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: "#92400e",
    fontWeight: "500",
  },
  scanSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  scanningText: {
    fontSize: 14,
    color: "#6b7280",
  },
  devicesList: {
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },

  // Device Card
  deviceCard: {
    marginBottom: 12,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  deviceInfo: {
    flex: 1,
    marginRight: 12,
  },
  deviceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  connectedBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  connectedBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#15803d",
  },
  deviceId: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 8,
  },
  deviceMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  rssi: {
    fontSize: 12,
    color: "#6b7280",
  },
  manufacturer: {
    fontSize: 12,
    color: "#6b7280",
  },
  sensorsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sensorChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  sensorText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7280",
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 8,
    fontWeight: "500",
  },
  connectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  connectedButton: {
    backgroundColor: "#dcfce7",
  },
  connectingButton: {
    backgroundColor: "#fef3cd",
  },

  // Sensors Tab
  sensorsTab: {
    flex: 1,
  },
  sensorDataCard: {
    padding: 20,
    marginBottom: 24,
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  sensorDataTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  sensorDataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  sensorDataItem: {
    width: "48%",
    alignItems: "center",
    marginBottom: 16,
  },
  sensorDataValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sensorDataLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 2,
  },
  sensorDataUnit: {
    fontSize: 10,
    color: "#9ca3af",
  },
  preferenceCard: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  preferenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  preferenceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
  },
  preferenceValue: {
    fontSize: 14,
    color: "#6b7280",
  },
  deviceOptions: {
    gap: 8,
  },
  deviceOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  selectedDeviceOption: {
    backgroundColor: "#dcfce7",
  },
  deviceOptionText: {
    fontSize: 14,
    color: "#374151",
  },
  selectedDeviceOptionText: {
    color: "#15803d",
    fontWeight: "500",
  },

  // Settings Tab
  settingsTab: {
    flex: 1,
  },
  settingCard: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  connectedDevicesList: {
    marginTop: 12,
    gap: 8,
  },
  connectedDeviceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  connectedDeviceName: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fee2e2",
    borderRadius: 6,
  },
  disconnectButtonText: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "500",
  },
});
