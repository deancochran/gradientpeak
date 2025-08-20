// apps/native/app/(tabs)/record.tsx
import * as React from "react";
import { StyleSheet, View, Alert, ScrollView } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as Location from "expo-location";
import { useRouter } from "expo-router";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import {
  api,
  formatDistance,
  formatDuration,
  formatPace,
  UserSettings,
} from "@/lib/supabase";

interface WorkoutData {
  startTime: Date | null;
  endTime: Date | null;
  distance: number;
  duration: number;
  calories: number;
  averagePace: number;
  maxSpeed: number;
  elevationGain: number;
  gpsPoints: Location.LocationObject[];
}

interface LocationPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
  speed: number | null;
  accuracy: number | null;
}

export default function RecordScreen() {
  const { user: clerkUser } = useUser();
  const router = useRouter();

  // Activity states
  const [isRecording, setIsRecording] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [activityType, setActivityType] = React.useState<
    "running" | "cycling" | "walking" | "hiking" | "swimming"
  >("running");
  const [activityTitle, setActivityTitle] = React.useState("");
  const [activityDescription, setActivityDescription] = React.useState("");

  // Workout data
  const [workoutData, setWorkoutData] = React.useState<WorkoutData>({
    startTime: null,
    endTime: null,
    distance: 0,
    duration: 0,
    calories: 0,
    averagePace: 0,
    maxSpeed: 0,
    elevationGain: 0,
    gpsPoints: [],
  });

  // User settings
  const [settings, setSettings] = React.useState<UserSettings | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Location tracking
  const [locationSubscription, setLocationSubscription] =
    React.useState<Location.LocationSubscription | null>(null);
  const [hasLocationPermission, setHasLocationPermission] =
    React.useState(false);

  // Timers
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = React.useRef<Date | null>(null);
  const pausedTimeRef = React.useRef<number>(0);

  // Load user settings on mount
  React.useEffect(() => {
    loadUserSettings();
    requestLocationPermission();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const loadUserSettings = async () => {
    if (!clerkUser) return;

    try {
      const dbUser = await api.getUser(clerkUser.id);
      if (dbUser) {
        const userSettings = await api.getUserSettings(dbUser.id);
        setSettings(userSettings);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(status === "granted");

      if (status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Please enable location permissions to track your activities accurately.",
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("Error requesting location permission:", error);
    }
  };

  const startLocationTracking = async () => {
    if (!hasLocationPermission) {
      await requestLocationPermission();
      return;
    }

    try {
      const subscription = await Location.watchPositionAsync(
        {
          accuracy:
            settings?.gps_accuracy === "high"
              ? Location.Accuracy.BestForNavigation
              : settings?.gps_accuracy === "medium"
                ? Location.Accuracy.Balanced
                : Location.Accuracy.Low,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          if (!isPaused && isRecording) {
            updateWorkoutData(location);
          }
        },
      );

      setLocationSubscription(subscription);
    } catch (error) {
      console.error("Error starting location tracking:", error);
      Alert.alert("Error", "Failed to start location tracking");
    }
  };

  const stopLocationTracking = () => {
    if (locationSubscription) {
      locationSubscription.remove();
      setLocationSubscription(null);
    }
  };

  const updateWorkoutData = (location: Location.LocationObject) => {
    setWorkoutData((prev) => {
      const newGpsPoints = [...prev.gpsPoints, location];

      // Calculate distance
      let totalDistance = 0;
      let elevationGain = 0;
      let maxSpeed = prev.maxSpeed;

      if (newGpsPoints.length > 1) {
        for (let i = 1; i < newGpsPoints.length; i++) {
          const prevPoint = newGpsPoints[i - 1];
          const currentPoint = newGpsPoints[i];

          // Calculate distance between points using Haversine formula
          const distance = calculateDistance(
            prevPoint.coords.latitude,
            prevPoint.coords.longitude,
            currentPoint.coords.latitude,
            currentPoint.coords.longitude,
          );

          totalDistance += distance;

          // Calculate elevation gain
          if (prevPoint.coords.altitude && currentPoint.coords.altitude) {
            const elevationDiff =
              currentPoint.coords.altitude - prevPoint.coords.altitude;
            if (elevationDiff > 0) {
              elevationGain += elevationDiff;
            }
          }

          // Track max speed
          if (
            currentPoint.coords.speed &&
            currentPoint.coords.speed > maxSpeed
          ) {
            maxSpeed = currentPoint.coords.speed;
          }
        }
      }

      // Calculate duration (excluding paused time)
      const currentTime = new Date();
      const duration = startTimeRef.current
        ? (currentTime.getTime() - startTimeRef.current.getTime()) / 1000 -
          pausedTimeRef.current
        : 0;

      // Calculate average pace (seconds per km)
      const averagePace =
        totalDistance > 0 ? duration / (totalDistance / 1000) : 0;

      // Estimate calories (basic calculation)
      const calories = calculateCalories(totalDistance, duration, activityType);

      return {
        ...prev,
        gpsPoints: newGpsPoints,
        distance: totalDistance,
        duration,
        averagePace,
        maxSpeed,
        elevationGain: prev.elevationGain + elevationGain,
        calories,
      };
    });
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

  const calculateCalories = (
    distance: number,
    duration: number,
    type: string,
  ): number => {
    // Basic calorie calculation (this would be more sophisticated in a real app)
    const baseCaloriesPerMinute = {
      running: 12,
      cycling: 8,
      walking: 4,
      hiking: 6,
      swimming: 14,
    };

    const minutes = duration / 60;
    return Math.round(
      (baseCaloriesPerMinute[type as keyof typeof baseCaloriesPerMinute] || 8) *
        minutes,
    );
  };

  const startWorkout = async () => {
    if (!activityTitle.trim()) {
      Alert.alert("Error", "Please enter an activity title");
      return;
    }

    setIsRecording(true);
    setIsPaused(false);
    startTimeRef.current = new Date();
    pausedTimeRef.current = 0;

    setWorkoutData({
      startTime: startTimeRef.current,
      endTime: null,
      distance: 0,
      duration: 0,
      calories: 0,
      averagePace: 0,
      maxSpeed: 0,
      elevationGain: 0,
      gpsPoints: [],
    });

    await startLocationTracking();

    // Start timer
    intervalRef.current = setInterval(() => {
      if (!isPaused && startTimeRef.current) {
        const currentTime = new Date();
        const duration =
          (currentTime.getTime() - startTimeRef.current.getTime()) / 1000 -
          pausedTimeRef.current;
        setWorkoutData((prev) => ({ ...prev, duration }));
      }
    }, 1000);
  };

  const pauseWorkout = () => {
    setIsPaused(true);
    // Record pause start time
    const pauseStart = Date.now();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };

  const resumeWorkout = () => {
    setIsPaused(false);

    // Calculate paused duration and add to total
    const pauseEnd = Date.now();
    // This is simplified - in a real app, you'd track pause start time

    // Restart timer
    intervalRef.current = setInterval(() => {
      if (!isPaused && startTimeRef.current) {
        const currentTime = new Date();
        const duration =
          (currentTime.getTime() - startTimeRef.current.getTime()) / 1000 -
          pausedTimeRef.current;
        setWorkoutData((prev) => ({ ...prev, duration }));
      }
    }, 1000);
  };

  const finishWorkout = () => {
    Alert.alert(
      "Finish Workout",
      "Are you sure you want to finish this workout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finish", onPress: saveWorkout },
      ],
    );
  };

  const discardWorkout = () => {
    Alert.alert(
      "Discard Workout",
      "Are you sure you want to discard this workout? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: resetWorkout },
      ],
    );
  };

  const resetWorkout = () => {
    setIsRecording(false);
    setIsPaused(false);
    stopLocationTracking();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setWorkoutData({
      startTime: null,
      endTime: null,
      distance: 0,
      duration: 0,
      calories: 0,
      averagePace: 0,
      maxSpeed: 0,
      elevationGain: 0,
      gpsPoints: [],
    });

    startTimeRef.current = null;
    pausedTimeRef.current = 0;
    setActivityTitle("");
    setActivityDescription("");
  };

  const saveWorkout = async () => {
    if (!clerkUser || !workoutData.startTime) return;

    setSaving(true);

    try {
      const dbUser = await api.getUser(clerkUser.id);
      if (!dbUser) throw new Error("User not found");

      const endTime = new Date();

      // Create FIT file data (simplified - in reality, you'd use a proper FIT SDK)
      const fitFileData = createSimpleFitFile(workoutData, activityType);

      // Prepare GPS data for storage
      const gpsData = workoutData.gpsPoints.map((point) => ({
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
        altitude: point.coords.altitude,
        timestamp: point.timestamp,
        speed: point.coords.speed,
        accuracy: point.coords.accuracy,
      }));

      await api.createActivity({
        user_id: dbUser.id,
        title: activityTitle,
        description: activityDescription || null,
        activity_type: activityType,
        distance: workoutData.distance,
        duration: Math.round(workoutData.duration),
        elevation_gain: workoutData.elevationGain,
        average_pace: workoutData.averagePace,
        max_speed: workoutData.maxSpeed,
        calories_burned: workoutData.calories,
        fit_file_data: fitFileData,
        gps_data: gpsData,
        started_at: workoutData.startTime.toISOString(),
        finished_at: endTime.toISOString(),
      });

      Alert.alert(
        "Workout Saved!",
        "Your activity has been saved successfully.",
        [{ text: "OK", onPress: () => router.push("/") }],
      );

      resetWorkout();
    } catch (error) {
      console.error("Error saving workout:", error);
      Alert.alert("Error", "Failed to save workout. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Simplified FIT file creation (in reality, use proper FIT SDK)
  const createSimpleFitFile = (data: WorkoutData, type: string): Uint8Array => {
    const fitData = {
      activity_type: type,
      start_time: data.startTime?.toISOString(),
      duration: data.duration,
      distance: data.distance,
      calories: data.calories,
      avg_pace: data.averagePace,
      max_speed: data.maxSpeed,
      elevation_gain: data.elevationGain,
      gps_points: data.gpsPoints.length,
    };

    return new TextEncoder().encode(JSON.stringify(fitData));
  };

  const activityTypes = [
    { key: "running", label: "Running", icon: "🏃‍♂️" },
    { key: "cycling", label: "Cycling", icon: "🚴‍♂️" },
    { key: "walking", label: "Walking", icon: "🚶‍♂️" },
    { key: "hiking", label: "Hiking", icon: "🥾" },
    { key: "swimming", label: "Swimming", icon: "🏊‍♂️" },
  ];

  if (!isRecording) {
    return (
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.setupContainer}>
          <Card style={styles.setupCard}>
            <Text variant="title" style={styles.title}>
              Start New Activity
            </Text>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Activity Title</ThemedText>
                <Input
                  value={activityTitle}
                  onChangeText={setActivityTitle}
                  placeholder="Morning Run"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>
                  Description (Optional)
                </ThemedText>
                <Input
                  value={activityDescription}
                  onChangeText={setActivityDescription}
                  placeholder="Beautiful morning run in the park..."
                  multiline
                  numberOfLines={3}
                  style={[styles.input, styles.textArea]}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Activity Type</ThemedText>
                <View style={styles.activityTypes}>
                  {activityTypes.map((type) => (
                    <Button
                      key={type.key}
                      onPress={() => setActivityType(type.key as any)}
                      style={[
                        styles.typeButton,
                        activityType === type.key && styles.selectedTypeButton,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          activityType === type.key &&
                            styles.selectedTypeButtonText,
                        ]}
                      >
                        {type.icon} {type.label}
                      </Text>
                    </Button>
                  ))}
                </View>
              </View>

              <Button
                onPress={startWorkout}
                disabled={!activityTitle.trim() || loading}
                style={styles.startButton}
              >
                <Text style={styles.startButtonText}>
                  {loading ? "Starting..." : "Start Activity"}
                </Text>
              </Button>
            </View>
          </Card>

          {!hasLocationPermission && (
            <Card style={styles.warningCard}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <ThemedText style={styles.warningText}>
                Location permission is required for accurate activity tracking.
                Please enable location services in your device settings.
              </ThemedText>
              <Button
                onPress={requestLocationPermission}
                style={styles.permissionButton}
              >
                Grant Permission
              </Button>
            </Card>
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.recordingContainer}>
        {/* Activity Header */}
        <Card style={styles.headerCard}>
          <View style={styles.activityHeader}>
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>{activityTitle}</Text>
              <ThemedText style={styles.activityType}>
                {activityTypes.find((t) => t.key === activityType)?.icon}
                {activityTypes.find((t) => t.key === activityType)?.label}
              </ThemedText>
            </View>
            <View style={styles.statusIndicator}>
              <View
                style={[
                  styles.statusDot,
                  isPaused ? styles.pausedDot : styles.recordingDot,
                ]}
              />
              <ThemedText style={styles.statusText}>
                {isPaused ? "Paused" : "Recording"}
              </ThemedText>
            </View>
          </View>
        </Card>

        {/* Main Stats */}
        <View style={styles.mainStats}>
          <Card style={styles.primaryStatCard}>
            <Text style={styles.primaryStatValue}>
              {formatDuration(workoutData.duration)}
            </Text>
            <ThemedText style={styles.primaryStatLabel}>Duration</ThemedText>
          </Card>

          <Card style={styles.primaryStatCard}>
            <Text style={styles.primaryStatValue}>
              {formatDistance(workoutData.distance, settings?.units)}
            </Text>
            <ThemedText style={styles.primaryStatLabel}>Distance</ThemedText>
          </Card>
        </View>

        {/* Secondary Stats */}
        <View style={styles.secondaryStats}>
          <Card style={styles.secondaryStatCard}>
            <Text style={styles.secondaryStatValue}>
              {workoutData.averagePace > 0
                ? formatPace(workoutData.averagePace, settings?.units)
                : "--:--"}
            </Text>
            <ThemedText style={styles.secondaryStatLabel}>Avg Pace</ThemedText>
          </Card>

          <Card style={styles.secondaryStatCard}>
            <Text style={styles.secondaryStatValue}>
              {workoutData.calories}
            </Text>
            <ThemedText style={styles.secondaryStatLabel}>Calories</ThemedText>
          </Card>

          <Card style={styles.secondaryStatCard}>
            <Text style={styles.secondaryStatValue}>
              {formatDistance(workoutData.elevationGain, settings?.units)}
            </Text>
            <ThemedText style={styles.secondaryStatLabel}>Elevation</ThemedText>
          </Card>
        </View>

        {/* Control Buttons */}
        <View style={styles.controlsContainer}>
          <View style={styles.mainControls}>
            {isPaused ? (
              <Button onPress={resumeWorkout} style={styles.resumeButton}>
                <Text style={styles.resumeButtonText}>▶️ Resume</Text>
              </Button>
            ) : (
              <Button onPress={pauseWorkout} style={styles.pauseButton}>
                <Text style={styles.pauseButtonText}>⏸️ Pause</Text>
              </Button>
            )}

            <Button
              onPress={finishWorkout}
              disabled={saving}
              style={styles.finishButton}
            >
              <Text style={styles.finishButtonText}>
                {saving ? "Saving..." : "🏁 Finish"}
              </Text>
            </Button>
          </View>

          <Button onPress={discardWorkout} style={styles.discardButton}>
            <Text style={styles.discardButtonText}>🗑️ Discard</Text>
          </Button>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  setupContainer: {
    flexGrow: 1,
    padding: 16,
    justifyContent: "center",
  },
  setupCard: {
    padding: 20,
    borderRadius: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
    textAlign: "center",
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 12,
    padding: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  activityTypes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeButton: {
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  selectedTypeButton: {
    backgroundColor: "#0a84ff",
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  selectedTypeButtonText: {
    color: "white",
  },
  startButton: {
    backgroundColor: "#0a84ff",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  startButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  warningCard: {
    padding: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255,193,7,0.1)",
    alignItems: "center",
  },
  warningIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  warningText: {
    textAlign: "center",
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: "#ff9500",
    paddingHorizontal: 20,
  },
  recordingContainer: {
    flex: 1,
    padding: 16,
  },
  headerCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  activityType: {
    fontSize: 14,
    color: "#666",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingDot: {
    backgroundColor: "#ff3b30",
  },
  pausedDot: {
    backgroundColor: "#ff9500",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  mainStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  primaryStatCard: {
    flex: 1,
    padding: 20,
    alignItems: "center",
    borderRadius: 16,
  },
  primaryStatValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#0a84ff",
    marginBottom: 4,
  },
  primaryStatLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  secondaryStats: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  secondaryStatCard: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    borderRadius: 12,
  },
  secondaryStatValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0a84ff",
    marginBottom: 2,
  },
  secondaryStatLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  controlsContainer: {
    gap: 12,
  },
  mainControls: {
    flexDirection: "row",
    gap: 12,
  },
  pauseButton: {
    flex: 1,
    backgroundColor: "#ff9500",
    paddingVertical: 16,
    borderRadius: 12,
  },
  pauseButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  resumeButton: {
    flex: 1,
    backgroundColor: "#34c759",
    paddingVertical: 16,
    borderRadius: 12,
  },
  resumeButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  finishButton: {
    flex: 1,
    backgroundColor: "#0a84ff",
    paddingVertical: 16,
    borderRadius: 12,
  },
  finishButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  discardButton: {
    backgroundColor: "rgba(255,59,48,0.1)",
    paddingVertical: 12,
    borderRadius: 8,
  },
  discardButtonText: {
    color: "#ff3b30",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
