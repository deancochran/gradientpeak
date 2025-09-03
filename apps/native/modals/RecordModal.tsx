import { Card } from "@/components/ui/card";
import { useGlobalPermissions } from "@/contexts/PermissionsContext";
import { useBluetooth } from "@/hooks/useBluetooth";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Button,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BluetoothDeviceModal } from "./BluetoothDeviceModal";

const screenWidth = Dimensions.get("window").width;

// Helper to format seconds into MM:SS or HH:MM:SS
const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = seconds.toString().padStart(2, "0");
  const paddedMinutes = minutes.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
};

interface RecordModalProps {
  visible: boolean;
  onClose: () => void;
  bluetooth: ReturnType<typeof useBluetooth>;
}

export const RecordModal = ({
  visible,
  onClose,
  bluetooth,
}: RecordModalProps) => {
  const [selectedActivityType, setSelectedActivityType] = useState("running");
  const [currentPage, setCurrentPage] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();
  const hasAllPermissions = useMemo(
    () => Object.values(permissions).every((p) => p?.granted),
    [permissions],
  );

  const {
    sensorValues = {},
    clearSensorData,
    startWorkoutWithSensors,
    hasConnectedDevices,
    isBluetoothEnabled,
    connectedDevices,
  } = bluetooth;

  const activityTypes = [
    { id: "running", name: "Running", icon: "walk" },
    { id: "cycling", name: "Cycling", icon: "bicycle" },
    { id: "walking", name: "Walking", icon: "walk" },
    { id: "swimming", name: "Swimming", icon: "water" },
    { id: "other", name: "Other", icon: "fitness" },
  ];

  const workoutPages = useMemo(
    () => [
      { title: "Duration", value: formatDuration(duration), unit: "time" },
      { title: "Distance", value: "0.0", unit: "km" }, // Placeholder
      { title: "Pace", value: "0:00", unit: "/km" }, // Placeholder
      {
        title: "Heart Rate",
        value: sensorValues.heartRate?.toString() || "--",
        unit: "bpm",
        isLive: !!sensorValues.heartRate,
      },
      {
        title: "Power",
        value: sensorValues.power?.toString() || "--",
        unit: "watts",
        isLive: !!sensorValues.power,
      },
      {
        title: "Cadence",
        value: sensorValues.cadence?.toString() || "--",
        unit: "rpm",
        isLive: !!sensorValues.cadence,
      },
    ],
    [duration, sensorValues],
  );

  // Timer effect for recording duration
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Animation and State Reset Effect
  useEffect(() => {
    if (visible) {
      // Reset state when modal becomes visible for a fresh start
      setIsRecording(false);
      setIsPaused(false);
      setDuration(0);
      setCurrentPage(0);
      setBluetoothModalVisible(false); // Reset bluetooth modal state

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      // Reset animation value when hidden
      fadeAnim.setValue(0);
      // Also close bluetooth modal if record modal is closing
      setBluetoothModalVisible(false);
    }
  }, [visible]);

  const handleStartRecording = async () => {
    if (!hasAllPermissions) {
      await requestAllRequiredPermissions();
      return;
    }
    setIsRecording(true);
    startWorkoutWithSensors();
  };

  const handlePauseRecording = () => {
    setIsPaused(true);
  };

  const handleResumeRecording = () => {
    setIsPaused(false);
  };

  const handleStopRecording = () => {
    setIsPaused(true);

    Alert.alert(
      "End Workout",
      "Are you sure you want to end this workout? All data will be discarded.",
      [
        { text: "Cancel", style: "cancel", onPress: () => setIsPaused(false) }, // Resume if cancelled
        {
          text: "End",
          onPress: () => {
            if (timerRef.current) {
              clearInterval(timerRef.current);
            }
            setIsRecording(false);
            clearSensorData();
            onClose();
          },
          style: "destructive",
        },
      ],
      { cancelable: false },
    );
  };

  const handleOpenBluetoothModal = () => {
    console.log("Opening Bluetooth modal from RecordModal");
    setBluetoothModalVisible(true);
  };

  const handleCloseBluetoothModal = () => {
    console.log("Closing Bluetooth modal from RecordModal");
    setBluetoothModalVisible(false);
  };

  const handleDeviceSelect = (deviceId: string) => {
    console.log("Device selected in RecordModal:", deviceId);
    // Handle device selection here if needed
    setBluetoothModalVisible(false);
  };

  const renderFooterButtons = () => {
    if (!isRecording) {
      return (
        <View style={modalStyles.footerInitial}>
          <Button
            style={modalStyles.startButton}
            onPress={handleStartRecording}
            disabled={!hasAllPermissions}
          >
            <Text style={modalStyles.startButtonText}>Start</Text>
          </Button>
        </View>
      );
    }

    return (
      <View style={modalStyles.footerRecording}>
        <TouchableOpacity
          style={modalStyles.stopButton}
          onPress={handleStopRecording}
        >
          <Ionicons name="stop-circle-outline" size={28} color="#ef4444" />
          <Text style={modalStyles.stopButtonText}>Stop</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={isPaused ? handleResumeRecording : handlePauseRecording}
          style={modalStyles.mainActionButton}
        >
          <Ionicons
            name={isPaused ? "play-circle" : "pause-circle"}
            size={80}
            color="#111827"
          />
        </TouchableOpacity>

        <View style={{ width: 60 }} />
      </View>
    );
  };

  return (
    <>
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
            <TouchableOpacity style={modalStyles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={modalStyles.headerTitle}>
              {isRecording ? "Recording Workout" : "Record Workout"}
            </Text>
            <TouchableOpacity style={modalStyles.activityTypeButton}>
              <Ionicons
                name={
                  activityTypes.find((type) => type.id === selectedActivityType)
                    ?.icon as any
                }
                size={20}
                color="#111827"
              />
            </TouchableOpacity>
          </View>

          {/* Bluetooth Status */}
          <TouchableOpacity
            style={modalStyles.bluetoothStatus}
            onPress={handleOpenBluetoothModal}
            testID="bluetooth-status-button"
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
                ? "Bluetooth Off - Tap to manage"
                : hasConnectedDevices
                  ? `${connectedDevices.length} sensor(s) connected`
                  : "No sensors - Tap to connect"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>

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
                <View
                  key={index}
                  style={{
                    width: screenWidth,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 40,
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
                </View>
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
          </View>

          {/* Footer */}
          <View style={modalStyles.footer}>{renderFooterButtons()}</View>
        </Animated.View>
      </Modal>

      {/* Bluetooth Device Modal - Now inside RecordModal */}
      <BluetoothDeviceModal
        visible={bluetoothModalVisible}
        onClose={handleCloseBluetoothModal}
        onDeviceSelect={handleDeviceSelect}
        bluetooth={bluetooth}
      />
    </>
  );
};

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
  bluetoothStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  bluetoothStatusText: {
    fontSize: 14,
    fontWeight: "500",
    marginHorizontal: 4,
  },
  bluetoothConnectedText: { color: "#059669" },
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
  footer: {
    paddingTop: 16,
    paddingBottom: 40,
    paddingHorizontal: 20,
    marginTop: "auto",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  footerInitial: {
    alignItems: "center",
  },
  startButton: {
    backgroundColor: "#111827",
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 64,
  },
  startButtonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
  },
  footerRecording: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stopButton: {
    alignItems: "center",
    width: 60,
  },
  stopButtonText: {
    color: "#ef4444",
    fontSize: 14,
    marginTop: 4,
  },
  mainActionButton: {
    // No specific styles needed, icon is sized
  },
});
