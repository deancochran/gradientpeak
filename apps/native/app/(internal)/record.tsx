import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Dimensions,
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

// ---------------- MetricCard Component ----------------
const MetricCard = ({ metric }: { metric: any }) => (
  <Card style={styles.metricCard}>
    <View style={styles.metricHeader}>
      <View style={styles.metricTitleContainer}>
        <Ionicons
          name={metric.icon}
          size={16}
          color={metric.isLive ? "#dc2626" : "#6b7280"}
        />
        <Text
          style={[styles.metricTitle, metric.isLive && styles.liveMetricTitle]}
        >
          {metric.title}
        </Text>
      </View>
      {metric.isLive && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
    </View>
    <Text style={[styles.metricValue, metric.isLive && styles.liveMetricValue]}>
      {metric.value}
    </Text>
    <Text style={[styles.metricUnit, metric.isLive && styles.liveMetricUnit]}>
      {metric.unit}
    </Text>
  </Card>
);

// ---------------- MetricsGrid Component ----------------
const MetricsGrid = ({ metrics }: { metrics: any[] }) => (
  <View style={styles.metricsGrid}>
    {metrics.map((metric) => (
      <MetricCard key={metric.id} metric={metric} />
    ))}
  </View>
);

// ---------------- Recording Controls Component ----------------
const RecordingControls = ({
  isRecording,
  isPaused,
  onStart,
  onStop,
  onPause,
  onResume,
  hasPermissions,
}: {
  isRecording: boolean;
  isPaused: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  hasPermissions: boolean;
}) => {
  if (!isRecording) {
    return (
      <View style={styles.footerInitial}>
        <Button
          style={styles.startButton}
          onPress={onStart}
          disabled={!hasPermissions}
        >
          <Text style={styles.startButtonText}>Start</Text>
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.footerRecording}>
      <TouchableOpacity style={styles.stopButton} onPress={onStop}>
        <Ionicons name="stop-circle-outline" size={28} color="#ef4444" />
        <Text style={styles.stopButtonText}>Stop</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.mainActionButton}
        onPress={isPaused ? onResume : onPause}
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

// ---------------- RecordScreen ----------------
export default function RecordScreen() {
  // Debug: Track component lifecycle to identify multiple instances
  const componentIdRef = useRef(Math.random().toString(36).substring(7));

  const bluetooth = useBluetooth();
  const { connectedDevices, isBluetoothEnabled, sensorValues } = bluetooth;

  // Debug: Log exactly what the component receives

  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();
  const hasAllPermissions = useMemo(
    () => Object.values(permissions).every((p) => p?.granted),
    [permissions],
  );

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);

  // Fix timer type - use number instead of NodeJS.Timeout for React Native
  const timerRef = useRef<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const connectedCount = connectedDevices?.length ?? 0;

  // ---------------- Timer ----------------
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(
        () => setDuration((prev) => prev + 1),
        1000,
      ) as unknown as number; // Cast for React Native compatibility
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording, isPaused]);

  // ---------------- Animations ----------------
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // ---------------- Workout Handlers ----------------
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
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setIsRecording(false);
            setDuration(0);
          },
        },
      ],
      { cancelable: false },
    );
  };

  // ---------------- Workout Metrics - Direct calculation (no useMemo) ----------------
  // Simple calculations that don't need memoization - React is fast enough!
  const workoutMetrics = [
    {
      id: "duration",
      title: "Duration",
      value: formatDuration(duration),
      unit: "time",
      icon: "time-outline" as const,
      isLive: false,
    },
    {
      id: "heartRate",
      title: "Heart Rate",
      value: sensorValues?.heartRate?.toString() || "--",
      unit: "bpm",
      icon: "heart-outline" as const,
      isLive: !!sensorValues?.heartRate,
    },
    {
      id: "power",
      title: "Power",
      value: sensorValues?.power?.toString() || "--",
      unit: "watts",
      icon: "flash-outline" as const,
      isLive: !!sensorValues?.power,
    },
    {
      id: "cadence",
      title: "Cadence",
      value: sensorValues?.cadence?.toString() || "--",
      unit: "rpm",
      icon: "refresh-outline" as const,
      isLive: !!sensorValues?.cadence,
    },
    {
      id: "avgHeartRate",
      title: "Avg HR",
      value: sensorValues?.heartRate
        ? Math.floor(sensorValues.heartRate * 0.95).toString()
        : "--",
      unit: "bpm",
      icon: "analytics-outline" as const,
      isLive: false,
    },
    {
      id: "calories",
      title: "Calories",
      value: sensorValues?.heartRate
        ? Math.floor(duration * 0.15 * (sensorValues.heartRate / 100))
        : Math.floor(duration * 0.1),
      unit: "kcal",
      icon: "flame-outline" as const,
      isLive: false,
    },
  ];

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
              connectedCount > 0 && isBluetoothEnabled
                ? "bluetooth"
                : "bluetooth-outline"
            }
            size={20}
            color={
              connectedCount > 0 && isBluetoothEnabled ? "#10b981" : "#9ca3af"
            }
          />
          <Text
            style={[
              styles.bluetoothStatusText,
              connectedCount > 0 && isBluetoothEnabled
                ? styles.bluetoothConnectedText
                : styles.bluetoothDisconnectedText,
            ]}
          >
            {!isBluetoothEnabled
              ? "Bluetooth Off - Tap to manage"
              : connectedCount > 0
                ? `${connectedCount} sensor(s) connected`
                : "No sensors - Tap to connect"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>

        {/* Metrics Grid */}
        <View style={styles.content}>
          <MetricsGrid metrics={workoutMetrics} />
        </View>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          <RecordingControls
            isRecording={isRecording}
            isPaused={isPaused}
            onStart={handleStartRecording}
            onStop={handleStopRecording}
            onPause={handlePauseRecording}
            onResume={handleResumeRecording}
            hasPermissions={hasAllPermissions}
          />
        </View>
      </Animated.View>

      {/* Bluetooth Device Modal */}
      <BluetoothDeviceModal
        visible={bluetoothModalVisible}
        onClose={() => setBluetoothModalVisible(false)}
        onSelectDevice={(deviceId) => {
          console.log("Selected device:", deviceId);
          setBluetoothModalVisible(false);
        }}
      />
    </ThemedView>
  );
}

// ---------------- Styles ----------------
const styles = StyleSheet.create({
  root: { flex: 1 },
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
  content: { flex: 1, justifyContent: "flex-start", paddingTop: 20 },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  metricCard: {
    width: (screenWidth - 56) / 2,
    minHeight: 140,
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    marginBottom: 8,
  },
  metricTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  metricTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  liveMetricTitle: { color: "#dc2626" },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fecaca",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#dc2626",
    marginRight: 4,
  },
  liveText: { fontSize: 10, fontWeight: "700", color: "#dc2626" },
  metricValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 32,
    marginVertical: 4,
  },
  liveMetricValue: { color: "#dc2626" },
  metricUnit: { fontSize: 11, color: "#6b7280", fontWeight: "500" },
  liveMetricUnit: { color: "#dc2626" },
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
  debugContainer: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dee2e6",
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#495057",
    marginBottom: 8,
  },
  debugText: { fontSize: 11, color: "#6c757d", marginBottom: 2 },
});
