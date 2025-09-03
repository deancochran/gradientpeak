// record.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGlobalPermissions } from "@/contexts/PermissionsContext";
import { useBluetooth } from "@/hooks/useBluetooth";
import { BluetoothDeviceModal } from "@/modals/BluetoothDeviceModal";

const screenWidth = Dimensions.get("window").width;

// Format seconds -> MM:SS or HH:MM:SS
const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
};

export default function RecordScreen() {
  const bluetooth = useBluetooth({ autoInitialize: true, autoConnect: true });
  const {
    sensorValues = {},
    clearSensorData,
    startWorkoutWithSensors,
    hasConnectedDevices,
    isBluetoothEnabled,
    connectedDevices,
    autoConnectPreferredDevices,
  } = bluetooth;

  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();
  const hasAllPermissions = useMemo(
    () => Object.values(permissions).every((p) => p?.granted),
    [permissions],
  );

  const [selectedActivityType, setSelectedActivityType] = useState("running");
  const [currentPage, setCurrentPage] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const connectedCount = connectedDevices?.length ?? 0;

  // Workout pages (metrics)
  const workoutPages = useMemo(
    () => [
      { title: "Duration", value: formatDuration(duration), unit: "time" },
      { title: "Distance", value: "0.0", unit: "km" }, // TODO: add GPS integration
      { title: "Pace", value: "0:00", unit: "/km" }, // TODO: live pace
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

  // Auto-connect when permissions + BT enabled
  const handlePermissionsGranted = useCallback(() => {
    if (isBluetoothEnabled) {
      autoConnectPreferredDevices();
    }
  }, [autoConnectPreferredDevices, isBluetoothEnabled]);

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // Animations
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  // Recording Handlers
  const handleStartRecording = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    AccessibilityInfo.announceForAccessibility?.("Starting workout");

    if (!hasAllPermissions) {
      await requestAllRequiredPermissions();
      return;
    }
    setIsRecording(true);
    setIsPaused(false);
    setDuration(0);
    startWorkoutWithSensors();
  };

  const handlePauseRecording = () => setIsPaused(true);
  const handleResumeRecording = () => setIsPaused(false);

  const handleStopRecording = () => {
    setIsPaused(true);
    Alert.alert(
      "End Workout",
      "Are you sure you want to end this workout? All data will be discarded.",
      [
        { text: "Cancel", style: "cancel", onPress: () => setIsPaused(false) },
        {
          text: "End",
          style: "destructive",
          onPress: () => {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRecording(false);
            clearSensorData();
          },
        },
      ],
      { cancelable: false },
    );
  };

  return (
    <ThemedView style={styles.root} testID="record-screen">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isRecording ? "Recording Workout" : "Ready to Record"}
          </Text>
          <TouchableOpacity style={styles.activityTypeButton}>
            <Ionicons name="walk" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        {/* Bluetooth Status */}
        <TouchableOpacity
          style={styles.bluetoothStatus}
          onPress={() => setBluetoothModalVisible(true)}
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
              hasConnectedDevices && isBluetoothEnabled ? "#10b981" : "#9ca3af"
            }
          />
          <Text
            style={[
              styles.bluetoothStatusText,
              hasConnectedDevices && isBluetoothEnabled
                ? styles.bluetoothConnectedText
                : styles.bluetoothDisconnectedText,
            ]}
          >
            {!isBluetoothEnabled
              ? "Bluetooth Off - Tap to manage"
              : hasConnectedDevices
                ? `${connectedCount} sensor(s) connected`
                : "No sensors - Tap to connect"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>

        {/* Metrics Carousel */}
        <View style={styles.content}>
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
            style={styles.metricsContainer}
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
                <Card style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <Text style={styles.metricTitle}>{page.title}</Text>
                    {page.isLive && (
                      <View style={styles.liveIndicator}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>LIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.metricValue,
                      page.isLive && styles.liveMetricValue,
                    ]}
                  >
                    {page.value}
                  </Text>
                  <Text style={styles.metricUnit}>{page.unit}</Text>
                </Card>
              </View>
            ))}
          </ScrollView>
          <View style={styles.pageIndicators}>
            {workoutPages.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.pageIndicator,
                  {
                    backgroundColor:
                      index === currentPage ? "#111827" : "#d1d5db",
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          {!isRecording ? (
            <View style={styles.footerInitial}>
              <Button
                style={styles.startButton}
                onPress={handleStartRecording}
                disabled={!hasAllPermissions}
              >
                <Text style={styles.startButtonText}>Start</Text>
              </Button>
            </View>
          ) : (
            <View style={styles.footerRecording}>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStopRecording}
              >
                <Ionicons
                  name="stop-circle-outline"
                  size={28}
                  color="#ef4444"
                />
                <Text style={styles.stopButtonText}>Stop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={
                  isPaused ? handleResumeRecording : handlePauseRecording
                }
                style={styles.mainActionButton}
              >
                <Ionicons
                  name={isPaused ? "play-circle" : "pause-circle"}
                  size={80}
                  color="#111827"
                />
              </TouchableOpacity>
              <View style={{ width: 60 }} />
            </View>
          )}
        </View>
      </Animated.View>

      {/* Bluetooth Device Modal */}
      <BluetoothDeviceModal
        visible={bluetoothModalVisible}
        onClose={() => setBluetoothModalVisible(false)}
        onSelectDevice={(e) => console.log(e)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
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
  bluetoothStatusText: { fontSize: 14, fontWeight: "500", marginHorizontal: 4 },
  bluetoothConnectedText: { color: "#059669" },
  bluetoothDisconnectedText: { color: "#6b7280" },
  content: { flex: 1, alignItems: "center", justifyContent: "center" },
  metricsContainer: { width: "100%", overflow: "hidden" },
  metricCard: {
    width: screenWidth - 40,
    height: 260,
    justifyContent: "center",
    alignItems: "center",
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
  pageIndicator: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  footer: {
    paddingTop: 16,
    paddingBottom: 40,
    paddingHorizontal: 20,
    marginTop: "auto",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  footerInitial: { alignItems: "center" },
  startButton: {
    backgroundColor: "#111827",
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 64,
  },
  startButtonText: { color: "white", fontSize: 20, fontWeight: "700" },
  footerRecording: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stopButton: { alignItems: "center", width: 60 },
  stopButtonText: { color: "#ef4444", fontSize: 14, marginTop: 4 },
  mainActionButton: {},
});
