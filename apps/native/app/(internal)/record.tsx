import { Ionicons } from "@expo/vector-icons";
import { Encoder, Profile } from "@garmin/fitsdk";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";

import { workoutService } from "@/lib/database/workout.service";

const LOCATION_TRACKING_TASK = "LOCATION_TRACKING_TASK";
const ACTIVE_WORKOUT_ID_KEY = "active_workout_id";

TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location error:", error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    try {
      const activeWorkoutId = await AsyncStorage.getItem(ACTIVE_WORKOUT_ID_KEY);

      if (activeWorkoutId) {
        for (const location of locations) {
          // The service expects our GpsLocation type, so we map it here.
          const gpsLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            altitude: location.coords.altitude,
            timestamp: location.timestamp,
            speed: location.coords.speed,
            accuracy: location.coords.accuracy,
          };
          await workoutService.addLocationPoint(activeWorkoutId, gpsLocation);
        }
      }
    } catch (e) {
      console.error("Failed to save background location:", e);
    }
  }
});

const screenWidth = Dimensions.get("window").width;

// Types
interface GpsLocation {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  timestamp: number;
  speed?: number | null;
  accuracy?: number | null;
}

// Utility Functions
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

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatPace = (speedMs: number): string => {
  if (speedMs <= 0) return "--:--";
  const paceSeconds = 1000 / speedMs; // seconds per kilometer
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Custom Hooks
const useGPSTracking = (isActive: boolean) => {
  const [locations, setLocations] = useState<GpsLocation[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null,
  );

  // Reset data when starting new session
  useEffect(() => {
    if (isActive) {
      setLocations([]);
      setTotalDistance(0);
      setCurrentSpeed(0);
    }
  }, [isActive]);

  // Handle location tracking
  useEffect(() => {
    if (!isActive) {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      setIsTracking(false);
      return;
    }

    const startTracking = async () => {
      try {
        // Check if location services are enabled
        const isEnabled = await Location.hasServicesEnabledAsync();
        if (!isEnabled) {
          Alert.alert(
            "GPS Disabled",
            "Please enable location services to track your workout with GPS.",
          );
          return;
        }

        // Request foreground and background permissions
        const { status: foregroundStatus } =
          await Location.requestForegroundPermissionsAsync();
        const { status: backgroundStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (foregroundStatus !== "granted" || backgroundStatus !== "granted") {
          Alert.alert(
            "Permission Required",
            "Location permission (foreground and background) is required for GPS tracking during workouts.",
          );
          return;
        }

        // Start background location updates
        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 2,
          showsBackgroundLocationIndicator: true,
        });

        // Start foreground location updates
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 2,
          },
          (location) => {
            const newLocation: GpsLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              altitude: location.coords.altitude,
              timestamp: location.timestamp,
              speed: location.coords.speed,
              accuracy: location.coords.accuracy,
            };
            setLocations((prev) => {
              const updated = [...prev, newLocation];
              if (updated.length >= 2) {
                const last = updated[updated.length - 1];
                const secondLast = updated[updated.length - 2];
                const segmentDistance = calculateDistance(
                  secondLast.latitude,
                  secondLast.longitude,
                  last.latitude,
                  last.longitude,
                );
                setTotalDistance(
                  (prevDistance) => prevDistance + segmentDistance,
                );
                const gpsSpeed = last.speed || 0;
                setCurrentSpeed(gpsSpeed > 0 ? gpsSpeed : 0);
              }
              return updated;
            });
          },
        );
        setIsTracking(true);
      } catch (error) {
        console.error("GPS tracking error:", error);
        Alert.alert(
          "GPS Error",
          "Failed to start GPS tracking. Workout will continue without GPS data.",
        );
      }
    };

    startTracking();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    };
  }, [isActive]);

  return {
    locations,
    totalDistance,
    currentSpeed,
    isTracking,
  };
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

// ---------------- RecordingControls Component ----------------
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
          <Text style={styles.startButtonText}>Start Workout</Text>
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
  const bluetooth = useBluetooth();
  const { connectedDevices, isBluetoothEnabled, sensorValues } = bluetooth;

  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();
  const hasAllPermissions = useMemo(
    () => Object.values(permissions).every((p) => p?.granted),
    [permissions],
  );

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [fitRecords, setFitRecords] = useState<any[]>([]);
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);

  // GPS tracking hook
  const { locations, totalDistance, currentSpeed, isTracking } = useGPSTracking(
    isRecording && !isPaused,
  );

  const timerRef = useRef<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const connectedCount = connectedDevices?.length ?? 0;

  // ---------------- Timer ----------------
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);

        // Record FIT point with GPS data
        setFitRecords((prev) => [
          ...prev,
          {
            timestamp: new Date(),
            heartRate: sensorValues?.heartRate,
            power: sensorValues?.power,
            cadence: sensorValues?.cadence,
            speed: currentSpeed,
            // Add GPS data to FIT records
            latitude: locations[locations.length - 1]?.latitude,
            longitude: locations[locations.length - 1]?.longitude,
            altitude: locations[locations.length - 1]?.altitude,
            distance: totalDistance,
          },
        ]);
      }, 1000) as unknown as number;
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
  }, [
    isRecording,
    isPaused,
    sensorValues,
    currentSpeed,
    locations,
    totalDistance,
  ]);

  // ---------------- Animations ----------------
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // ---------------- FIT Recording ----------------
  const saveFitFile = async () => {
    if (fitRecords.length === 0) return;

    try {
      const encoder = new Encoder();

      // File ID message
      const fileId = new Profile.FileIdMessage();
      fileId.type = Profile.FileType.ACTIVITY;
      fileId.manufacturer = Profile.Manufacturer.GARMIN;
      fileId.product = 12345;
      fileId.serialNumber = Date.now();
      fileId.timeCreated = new Date();

      encoder.addMessage(fileId);

      // Add activity/session data
      fitRecords.forEach((rec, index) => {
        const record = new Profile.RecordMessage();
        record.timestamp = rec.timestamp;

        // Sensor data
        if (rec.heartRate) record.heartRate = rec.heartRate;
        if (rec.power) record.power = rec.power;
        if (rec.cadence) record.cadence = rec.cadence;
        if (rec.speed) record.speed = rec.speed;

        // GPS data
        if (rec.latitude && rec.longitude) {
          record.positionLat = Math.round(rec.latitude * 11930464.7111); // Convert to semicircles
          record.positionLong = Math.round(rec.longitude * 11930464.7111);
        }
        if (rec.altitude) record.altitude = rec.altitude;
        if (rec.distance) record.distance = rec.distance;

        encoder.addMessage(record);
      });

      const data = encoder.encode();
      const fileName = `workout-${new Date().toISOString().split("T")[0]}-${Date.now()}.fit`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      // Convert Uint8Array to base64
      const base64Data = btoa(String.fromCharCode(...data));

      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Alert.alert(
        "Success",
        `Workout saved as ${fileName}\n\nTotal Distance: ${(totalDistance / 1000).toFixed(2)}km\nGPS Points: ${locations.length}`,
      );
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", "Failed to save workout data.");
    } finally {
      setFitRecords([]);
    }
  };

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
    setFitRecords([]);
  };

  const handlePauseRecording = () => setIsPaused(true);
  const handleResumeRecording = () => setIsPaused(false);

  const handleStopRecording = () => {
    setIsPaused(true);
    Alert.alert(
      "End Workout",
      `Are you sure you want to end this workout?\n\nDuration: ${formatDuration(duration)}\nDistance: ${(totalDistance / 1000).toFixed(2)}km\n\nYour data will be saved.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => setIsPaused(false) },
        {
          text: "End",
          style: "destructive",
          onPress: async () => {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setIsRecording(false);
            setDuration(0);
            await saveFitFile();
          },
        },
      ],
      { cancelable: false },
    );
  };

  // Calculate average pace for the workout
  const averagePace = useMemo(() => {
    if (totalDistance > 0 && duration > 0) {
      const avgSpeedMs = totalDistance / duration;
      return formatPace(avgSpeedMs);
    }
    return "--:--";
  }, [totalDistance, duration]);

  // Calculate estimated calories
  const estimatedCalories = useMemo(() => {
    const baseCaloriesPerSecond = 0.1;
    const heartRateMultiplier = sensorValues?.heartRate
      ? sensorValues.heartRate / 100
      : 1;
    const distanceMultiplier =
      totalDistance > 0 ? 1 + totalDistance / 10000 : 1;

    return Math.floor(
      duration *
        baseCaloriesPerSecond *
        heartRateMultiplier *
        distanceMultiplier,
    );
  }, [duration, sensorValues?.heartRate, totalDistance]);

  // ---------------- Workout Metrics ----------------
  const workoutMetrics = [
    {
      id: "duration",
      title: "Duration",
      value: formatDuration(duration),
      unit: "time",
      icon: "time-outline" as const,
      isLive: isRecording && !isPaused,
    },
    {
      id: "distance",
      title: "Distance",
      value: (totalDistance / 1000).toFixed(2),
      unit: "km",
      icon: "navigate-outline" as const,
      isLive: isTracking,
    },

    {
      id: "pace",
      title: "Current Pace",
      value: formatPace(currentSpeed),
      unit: "/km",
      icon: "speedometer-outline",
      isLive: isTracking && currentSpeed > 0,
    },
    {
      id: "avgPace",
      title: "Avg Pace",
      value: averagePace,
      unit: "/km",
      icon: "analytics-outline",
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
      id: "calories",
      title: "Calories",
      value: estimatedCalories.toString(),
      unit: "kcal",
      icon: "flame-outline" as const,
      isLive: isRecording,
    },
    {
      id: "altitude",
      title: "Altitude",
      value: locations[locations.length - 1]?.altitude?.toFixed(0) || "--",
      unit: "m",
      icon: "altitude-outline",
      isLive: isTracking,
    },
    {
      id: "accuracy",
      title: "GPS Accuracy",
      value: locations[locations.length - 1]?.accuracy?.toFixed(0) || "--",
      unit: "m",
      icon: "gps-fixed",
      isLive: isTracking,
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

        {/* Status Row - Bluetooth and GPS */}
        <View style={styles.statusContainer}>
          {/* Bluetooth Status */}
          <TouchableOpacity
            style={styles.statusButton}
            onPress={() => setBluetoothModalVisible(true)}
            testID="bluetooth-status-button"
          >
            <Ionicons
              name={
                connectedCount > 0 && isBluetoothEnabled
                  ? "bluetooth"
                  : "bluetooth-outline"
              }
              size={16}
              color={
                connectedCount > 0 && isBluetoothEnabled ? "#10b981" : "#9ca3af"
              }
            />
            <Text
              style={[
                styles.statusText,
                connectedCount > 0 &&
                  isBluetoothEnabled &&
                  styles.statusActiveText,
              ]}
            >
              {!isBluetoothEnabled
                ? "BT Off"
                : connectedCount > 0
                  ? `${connectedCount} sensor(s)`
                  : "No sensors"}
            </Text>
          </TouchableOpacity>

          {/* GPS Status */}
          <View style={styles.statusButton}>
            <Ionicons
              name={isTracking ? "locate" : "locate-outline"}
              size={16}
              color={isTracking ? "#10b981" : "#9ca3af"}
            />
            <Text
              style={[styles.statusText, isTracking && styles.statusActiveText]}
            >
              GPS {isTracking ? "Active" : "Inactive"}
            </Text>
            {isTracking && locations.length > 0 && (
              <Text style={styles.statusDetailText}>
                {locations.length} points
              </Text>
            )}
          </View>
        </View>

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
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111827",
  },
  activityTypeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  statusContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  statusButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statusText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 4,
    fontWeight: "500",
  },
  statusActiveText: {
    color: "#10b981",
  },
  statusDetailText: {
    fontSize: 10,
    color: "#9ca3af",
    marginLeft: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  metricCard: {
    width: (screenWidth - 48) / 2,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  metricTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginLeft: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  liveMetricTitle: {
    color: "#dc2626",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#dc2626",
    marginRight: 4,
  },
  liveText: {
    fontSize: 8,
    fontWeight: "600",
    color: "#dc2626",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  liveMetricValue: {
    color: "#dc2626",
  },
  metricUnit: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  liveMetricUnit: {
    color: "#dc2626",
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  footerInitial: {
    alignItems: "center",
  },
  startButton: {
    backgroundColor: "#111827",
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 60,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  footerRecording: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stopButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
  },
  stopButtonText: {
    fontSize: 12,
    color: "#ef4444",
    fontWeight: "500",
    marginTop: 4,
  },
  mainActionButton: {
    alignItems: "center",
    justifyContent: "center",
  },
});
