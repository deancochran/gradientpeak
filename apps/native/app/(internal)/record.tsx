// Enhanced record.tsx with Bluetooth integration
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useBluetooth } from "@/hooks/useBluetooth";
import { UsePermissions } from "@/lib/contexts/PermissionsContext";
import { BluetoothDevice, SensorData } from "@/stores/bluetooth";

const { width: screenWidth } = Dimensions.get("window");

// Bluetooth Device Selection Modal
function BluetoothDeviceModal({
  visible,
  onClose,
  onDeviceSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onDeviceSelect: (deviceId: string) => void;
}) {
  const {
    isScanning,
    discoveredDevices,
    connectedDevices,
    scanForDevices,
    stopScanForDevices,
    connectDevice,
    isBluetoothEnabled,
  } = useBluetooth();

  const handleScanPress = () => {
    if (isScanning) {
      stopScanForDevices();
    } else {
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
}

// Permission Styles
const permissionStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  message: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  permissionItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  permissionText: {
    fontSize: 15,
    color: "#374151",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  primaryButton: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});

// Permission Alert Component
function PermissionAlert({
  visible,
  onClose,
  onRequestPermissions,
  missingPermissions,
}: {
  visible: boolean;
  onClose: () => void;
  onRequestPermissions: () => void;
  missingPermissions: string[];
}) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={permissionStyles.overlay}>
        <View style={permissionStyles.container}>
          <View style={permissionStyles.header}>
            <Ionicons name="warning" size={24} color="#f59e0b" />
            <Text style={permissionStyles.title}>Permissions Required</Text>
          </View>

          <Text style={permissionStyles.message}>
            To start recording workouts, please grant the following permissions:
          </Text>

          {missingPermissions.map((permission, index) => (
            <View key={index} style={permissionStyles.permissionItem}>
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color="#6b7280"
              />
              <Text style={permissionStyles.permissionText}>{permission}</Text>
            </View>
          ))}

          <View style={permissionStyles.buttons}>
            <Button
              variant="outline"
              style={permissionStyles.button}
              onPress={onClose}
            >
              <Text>Maybe Later</Text>
            </Button>
            <Button
              variant="default"
              style={[permissionStyles.button, permissionStyles.primaryButton]}
              onPress={onRequestPermissions}
            >
              <Text style={permissionStyles.primaryButtonText}>
                Grant Permissions
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Record Modal Component
function RecordModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [selectedActivityType, setSelectedActivityType] = useState("running");
  const [currentPage, setCurrentPage] = useState(0);
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { allRequiredPermissionsGranted } = UsePermissions();

  const {
    connectedDevices,
    currentSensorData,
    hasConnectedDevices,
    getCurrentSensorValues,
    startWorkoutWithSensors,
    clearSensorData,
    isBluetoothEnabled,
  } = useBluetooth({
    onSensorData: (data: SensorData) => {
      // Handle real-time sensor data updates
      console.log("Sensor data updated:", data);
    },
    onDeviceConnected: (deviceId: string, deviceName: string) => {
      console.log(`Device connected: ${deviceName}`);
    },
    onDeviceDisconnected: (deviceId: string, deviceName: string) => {
      console.log(`Device disconnected: ${deviceName}`);
    },
  });

  const activityTypes = [
    { id: "running", name: "Running", icon: "walk" },
    { id: "cycling", name: "Cycling", icon: "bicycle" },
    { id: "walking", name: "Walking", icon: "walk" },
    { id: "swimming", name: "Swimming", icon: "water" },
    { id: "other", name: "Other", icon: "fitness" },
  ];

  // Get current sensor values
  const sensorValues = getCurrentSensorValues();

  const workoutPages = [
    { title: "Duration", value: "00:00", unit: "min:sec" },
    { title: "Distance", value: "0.0", unit: "km" },
    { title: "Pace", value: "0:00", unit: "/km" },
    {
      title: "Heart Rate",
      value: sensorValues.heartRate?.toString() || "--",
      unit: "bpm",
      isLive: !!sensorValues.heartRate && sensorValues.isDataFresh,
    },
    {
      title: "Power",
      value: sensorValues.power?.toString() || "--",
      unit: "watts",
      isLive: !!sensorValues.power && sensorValues.isDataFresh,
    },
    {
      title: "Cadence",
      value: sensorValues.cadence?.toString() || "--",
      unit: "rpm",
      isLive: !!sensorValues.cadence && sensorValues.isDataFresh,
    },
  ];

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  const handleStartRecording = () => {
    if (!allRequiredPermissionsGranted) {
      Alert.alert(
        "Permissions Required",
        "Please grant all required permissions before starting a workout.",
        [{ text: "OK" }],
      );
      return;
    }

    const workoutInfo = startWorkoutWithSensors();
    setIsRecording(true);

    console.log("Starting workout recording...", workoutInfo);

    // Show connected sensors info
    if (workoutInfo.connectedDeviceCount > 0) {
      Alert.alert(
        "Workout Started",
        `Recording with ${workoutInfo.connectedDeviceCount} connected sensor${workoutInfo.connectedDeviceCount > 1 ? "s" : ""}`,
        [{ text: "OK" }],
      );
    }
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    clearSensorData();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="record-modal"
    >
      <Animated.View
        style={[modalStyles.container, { opacity: fadeAnim }]}
        testID="record-modal-container"
      >
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity
            style={modalStyles.closeButton}
            onPress={onClose}
            testID="record-modal-close-button"
            accessibilityLabel="Close record workout modal"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>

          <Text style={modalStyles.headerTitle} testID="record-modal-title">
            {isRecording ? "Recording Workout" : "Record Workout"}
          </Text>

          <TouchableOpacity
            style={modalStyles.activityTypeButton}
            testID="activity-type-selector"
            accessibilityLabel="Select activity type"
            accessibilityRole="button"
          >
            <Ionicons
              name={
                activityTypes.find((type) => type.id === selectedActivityType)
                  ?.icon as any
              }
              size={20}
              color="#111827"
            />
            <Text style={modalStyles.activityTypeText}>
              {
                activityTypes.find((type) => type.id === selectedActivityType)
                  ?.name
              }
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Bluetooth Status Bar */}
        <View style={modalStyles.bluetoothStatus}>
          <TouchableOpacity
            style={modalStyles.bluetoothStatusButton}
            onPress={() => setBluetoothModalVisible(true)}
          >
            <Ionicons
              name={
                hasConnectedDevices && isBluetoothEnabled
                  ? "bluetooth"
                  : "bluetooth-outline"
              }
              size={20}
              color={
                hasConnectedDevices && isBluetoothEnabled
                  ? "#10b981"
                  : "#9ca3af"
              }
            />
            <Text
              style={[
                modalStyles.bluetoothStatusText,
                hasConnectedDevices && isBluetoothEnabled
                  ? modalStyles.bluetoothConnectedText
                  : modalStyles.bluetoothDisconnectedText,
              ]}
            >
              {!isBluetoothEnabled
                ? "Bluetooth Off"
                : hasConnectedDevices
                  ? `${connectedDevices.length} sensor${connectedDevices.length > 1 ? "s" : ""} connected`
                  : "No sensors"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Metrics */}
        <View style={modalStyles.content}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const pageIndex = Math.round(
                event.nativeEvent.contentOffset.x /
                  event.nativeEvent.layoutMeasurement.width,
              );
              setCurrentPage(pageIndex);
            }}
            style={modalStyles.metricsContainer}
          >
            {workoutPages.map((page, index) => (
              <Animated.View
                key={index}
                style={{
                  width: screenWidth,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 40,
                  opacity: fadeAnim,
                  transform: [
                    {
                      translateY: fadeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20 * (index + 1), 0],
                      }),
                    },
                  ],
                }}
              >
                <Card style={modalStyles.metricCard}>
                  <View style={modalStyles.metricHeader}>
                    <Text style={modalStyles.metricTitle}>{page.title}</Text>
                    {page.isLive && (
                      <View style={modalStyles.liveIndicator}>
                        <View style={modalStyles.liveDot} />
                        <Text style={modalStyles.liveText}>LIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      modalStyles.metricValue,
                      page.isLive && modalStyles.liveMetricValue,
                    ]}
                  >
                    {page.value}
                  </Text>
                  <Text style={modalStyles.metricUnit}>{page.unit}</Text>
                </Card>
              </Animated.View>
            ))}
          </ScrollView>

          <View style={modalStyles.pageIndicators}>
            {workoutPages.map((_, index) => (
              <View
                key={index}
                style={[
                  modalStyles.pageIndicator,
                  {
                    backgroundColor:
                      index === currentPage ? "#111827" : "#d1d5db",
                  },
                ]}
              />
            ))}
          </View>

          {/* Permission Status Indicator */}
          {!allRequiredPermissionsGranted && (
            <View style={modalStyles.permissionWarning}>
              <Ionicons name="warning" size={16} color="#f59e0b" />
              <Text style={modalStyles.permissionWarningText}>
                Some permissions are missing. Recording may not work properly.
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={modalStyles.footer}>
          <View style={modalStyles.footerButtons}>
            <Button
              variant="outline"
              style={modalStyles.footerButton}
              onPress={() => setBluetoothModalVisible(true)}
              testID="bluetooth-devices-button"
              accessibilityLabel="Manage Bluetooth devices"
              accessibilityRole="button"
            >
              <Ionicons name="bluetooth" size={16} color="#6b7280" />
              <Text style={modalStyles.footerButtonTextSecondary}>Devices</Text>
            </Button>

            <Button
              variant={isRecording ? "destructive" : "default"}
              style={[
                modalStyles.footerButton,
                modalStyles.primaryFooterButton,
                !allRequiredPermissionsGranted &&
                  !isRecording &&
                  modalStyles.disabledFooterButton,
              ]}
              onPress={isRecording ? handleStopRecording : handleStartRecording}
              testID="start-stop-recording-button"
              accessibilityLabel={
                isRecording
                  ? "Stop recording workout"
                  : "Start recording workout"
              }
              accessibilityRole="button"
              disabled={!allRequiredPermissionsGranted && !isRecording}
            >
              <Ionicons
                name={isRecording ? "stop" : "play"}
                size={16}
                color="white"
              />
              <Text
                style={[
                  modalStyles.footerButtonTextPrimary,
                  !allRequiredPermissionsGranted &&
                    !isRecording &&
                    modalStyles.disabledFooterButtonText,
                ]}
              >
                {isRecording ? "Stop" : "Start"}
              </Text>
            </Button>

            <Button
              variant="ghost"
              style={modalStyles.footerButton}
              onPress={() => {}}
              testID="record-settings-button"
              accessibilityLabel="Workout settings"
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={20} color="#6b7280" />
            </Button>
          </View>
        </View>
      </Animated.View>

      <BluetoothDeviceModal
        visible={bluetoothModalVisible}
        onClose={() => setBluetoothModalVisible(false)}
        onDeviceSelect={(deviceId) => {
          console.log("Selected device:", deviceId);
        }}
      />
    </Modal>
  );
}

export default function RecordScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [permissionAlertVisible, setPermissionAlertVisible] = useState(false);
  const { permissions, allRequiredPermissionsGranted, requestAllPermissions } =
    UsePermissions();

  const {
    hasConnectedDevices,
    connectedDevices,
    isBluetoothEnabled,
    autoConnectPreferredDevices,
  } = useBluetooth({ autoInitialize: true, autoConnect: true });

  const getMissingPermissions = () => {
    return Object.values(permissions)
      .filter((p) => p.required && !p.granted)
      .map((p) => p.description);
  };

  const handleRecordPress = () => {
    if (allRequiredPermissionsGranted) {
      setModalVisible(true);
    } else {
      setPermissionAlertVisible(true);
    }
  };

  const handleRequestPermissions = async () => {
    setPermissionAlertVisible(false);
    await requestAllPermissions();

    // If permissions are now granted, open the modal
    if (allRequiredPermissionsGranted) {
      setModalVisible(true);
    }
  };

  // Try to auto-connect when component mounts
  useEffect(() => {
    if (isBluetoothEnabled && allRequiredPermissionsGranted) {
      autoConnectPreferredDevices();
    }
  }, [isBluetoothEnabled, allRequiredPermissionsGranted]);

  return (
    <ThemedView style={styles.container} testID="record-screen">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="record-scroll-view"
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons
              name="add-circle-outline"
              size={80}
              color={allRequiredPermissionsGranted ? "#111827" : "#9ca3af"}
            />
          </View>

          <Text style={styles.title}>Ready to Record</Text>
          <Text style={styles.subtitle}>
            Track your workout with real-time metrics and GPS tracking
          </Text>

          {/* Bluetooth Status */}
          {isBluetoothEnabled && hasConnectedDevices && (
            <View style={styles.bluetoothStatus}>
              <Ionicons name="bluetooth" size={20} color="#10b981" />
              <Text style={styles.bluetoothStatusText}>
                {connectedDevices.length} sensor
                {connectedDevices.length > 1 ? "s" : ""} connected
              </Text>
            </View>
          )}

          {/* Permission Status */}
          {!allRequiredPermissionsGranted && (
            <View style={styles.permissionStatus}>
              <Ionicons name="information-circle" size={20} color="#f59e0b" />
              <Text style={styles.permissionStatusText}>
                Grant permissions to unlock all features
              </Text>
            </View>
          )}

          <View style={styles.featuresContainer}>
            {[
              {
                icon: "location-outline",
                title: "GPS Tracking",
                description: "Accurate route and distance tracking",
                requiresPermission: "location",
              },
              {
                icon: "heart-outline",
                title: "Heart Rate & Sensors",
                description: `Monitor heart rate, power, and cadence${hasConnectedDevices ? ` (${connectedDevices.length} connected)` : ""}`,
                requiresPermission: "bluetooth",
                isEnabled:
                  permissions.bluetooth?.granted &&
                  (isBluetoothEnabled || hasConnectedDevices),
              },
              {
                icon: "time-outline",
                title: "Real-time Metrics",
                description: "Live pace, distance, and duration",
                requiresPermission: null,
              },
            ].map((feature, idx) => {
              const isEnabled =
                feature.isEnabled !== undefined
                  ? feature.isEnabled
                  : !feature.requiresPermission ||
                    permissions[
                      feature.requiresPermission as keyof typeof permissions
                    ]?.granted;

              return (
                <Card
                  style={[
                    styles.featureCard,
                    !isEnabled && styles.disabledFeatureCard,
                  ]}
                  key={idx}
                >
                  <Ionicons
                    name={feature.icon as any}
                    size={24}
                    color={isEnabled ? "#111827" : "#9ca3af"}
                  />
                  <View style={styles.featureTextContainer}>
                    <Text
                      style={[
                        styles.featureTitle,
                        !isEnabled && styles.disabledFeatureTitle,
                      ]}
                    >
                      {feature.title}
                    </Text>
                    <Text
                      style={[
                        styles.featureDescription,
                        !isEnabled && styles.disabledFeatureDescription,
                      ]}
                    >
                      {feature.description}
                    </Text>
                  </View>
                  {!isEnabled && (
                    <Ionicons name="lock-closed" size={16} color="#9ca3af" />
                  )}
                </Card>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.recordButtonContainer}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            !allRequiredPermissionsGranted && styles.disabledRecordButton,
          ]}
          onPress={handleRecordPress}
          activeOpacity={0.8}
          testID="main-record-button"
          accessibilityLabel="Open workout recording options"
          accessibilityRole="button"
        >
          <Ionicons
            name="add"
            size={32}
            color={allRequiredPermissionsGranted ? "white" : "#9ca3af"}
          />
          <Text
            style={[
              styles.recordButtonText,
              !allRequiredPermissionsGranted && styles.disabledRecordButtonText,
            ]}
          >
            Start Workout
          </Text>
        </TouchableOpacity>
      </View>

      <PermissionAlert
        visible={permissionAlertVisible}
        onClose={() => setPermissionAlertVisible(false)}
        onRequestPermissions={handleRequestPermissions}
        missingPermissions={getMissingPermissions()}
      />

      <RecordModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </ThemedView>
  );
}

// Modal Styles
const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  closeButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  activityTypeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 8,
  },
  activityTypeText: { fontSize: 14, fontWeight: "500", color: "#111827" },
  bluetoothStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0f2fe",
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  bluetoothStatusButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  bluetoothStatusText: {
    fontSize: 14,
    fontWeight: "500",
    marginHorizontal: 4,
  },
  bluetoothConnectedText: { color: "#0284c7" },
  bluetoothDisconnectedText: { color: "#6b7280" },
  content: { flex: 1, alignItems: "center", justifyContent: "center" },
  metricsContainer: {
    width: "100%",
    overflow: "hidden",
  },
  metricCard: {
    width: screenWidth - 40,
    height: 260,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 0,
    padding: 32,
    borderRadius: 16,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  metricTitle: { fontSize: 16, fontWeight: "600", color: "#6b7280" },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fecaca",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#dc2626",
    marginRight: 6,
  },
  liveText: { fontSize: 12, fontWeight: "700", color: "#dc2626" },
  metricValue: {
    fontSize: 64,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 70,
  },
  liveMetricValue: { color: "#dc2626" },
  metricUnit: { fontSize: 14, color: "#6b7280", marginTop: 8 },
  pageIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 32,
  },
  pageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  permissionWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff3e0",
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 20,
    marginTop: 20,
    gap: 8,
  },
  permissionWarningText: {
    fontSize: 13,
    color: "#ff8f00",
    fontWeight: "500",
  },
  footer: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
    marginTop: "auto",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  footerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  footerButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  footerButtonTextSecondary: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  primaryFooterButton: { backgroundColor: "#111827" },
  footerButtonTextPrimary: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  disabledFooterButton: { backgroundColor: "#e5e7eb" },
  disabledFooterButtonText: { color: "#9ca3af" },
});

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

// Main Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 120,
  },
  content: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconContainer: { marginBottom: 24 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 40,
    maxWidth: 280,
  },

  bluetoothStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1fae5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  bluetoothStatusText: {
    fontSize: 14,
    color: "#065f46",
    fontWeight: "500",
  },

  permissionStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3cd",
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  permissionStatusText: {
    fontSize: 14,
    color: "#92400e",
    fontWeight: "500",
  },

  featuresContainer: { gap: 16, width: "100%" },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  disabledFeatureCard: {
    backgroundColor: "#f9fafb",
    opacity: 0.7,
  },
  featureTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  featureDescription: { fontSize: 14, color: "#6b7280" },
  disabledFeatureTitle: { color: "#9ca3af" },
  disabledFeatureDescription: { color: "#d1d5db" },

  recordButtonContainer: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  recordButton: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  recordButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  disabledRecordButton: {
    backgroundColor: "#e5e7eb",
    shadowOpacity: 0.1,
  },
  disabledRecordButtonText: {
    color: "#9ca3af",
  },
});
