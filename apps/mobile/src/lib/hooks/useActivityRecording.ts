import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ActivityMetrics {
  duration: number;
  distance: number;
  currentSpeed: number;
  avgSpeed: number;
  heartRate?: number;
  calories?: number;
  power?: number;
  cadence?: number;
}

export interface ActivityRecording {
  id: string;
  startTime: number;
  locations: Location.LocationObject[];
  metrics: ActivityMetrics;
  sensorData: any[];
}

export const useActivityRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentRecording, setCurrentRecording] =
    useState<ActivityRecording | null>(null);
  const [metrics, setMetrics] = useState<ActivityMetrics>({
    duration: 0,
    distance: 0,
    currentSpeed: 0,
    avgSpeed: 0,
  });

  // Location and timing refs
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null,
  );
  const startTime = useRef<number>(0);
  const pausedDuration = useRef<number>(0);
  const pauseStart = useRef<number | null>(null);
  const locationsRef = useRef<Location.LocationObject[]>([]);

  // Sensor data refs for smooth updates
  const currentHeartRate = useRef<number | undefined>(undefined);
  const currentPower = useRef<number | undefined>(undefined);
  const currentCadence = useRef<number | undefined>(undefined);
  const rafRef = useRef<number>();

  // Calculate distance between two points
  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371e3; // Earth's radius in meters
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    },
    [],
  );

  // Calculate calories estimate
  const calculateCalories = useCallback(
    (duration: number, distance: number, heartRate?: number): number => {
      if (duration === 0) return 0;

      const hours = duration / 3600;
      const km = distance / 1000;

      if (heartRate) {
        // More accurate with heart rate (rough estimation)
        const baseRate = 70; // average resting heart rate
        const intensity = Math.max(1, heartRate / baseRate);
        return Math.round(hours * 400 * intensity); // 400 cal/hour base * intensity
      } else {
        // Basic estimation: ~300 calories per hour + distance bonus
        return Math.round(hours * 300 + km * 50);
      }
    },
    [],
  );

  // Calculate comprehensive metrics from current data
  const calculateMetrics = useCallback(
    (duration: number) => {
      const locations = locationsRef.current;

      let totalDistance = 0;
      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i - 1];
        const curr = locations[i];
        totalDistance += calculateDistance(
          prev.coords.latitude,
          prev.coords.longitude,
          curr.coords.latitude,
          curr.coords.longitude,
        );
      }

      const currentSpeed = locations[locations.length - 1]?.coords?.speed || 0;
      const avgSpeed = duration > 0 ? totalDistance / duration : 0;
      const calories = calculateCalories(
        duration,
        totalDistance,
        currentHeartRate.current,
      );

      return {
        duration,
        distance: totalDistance,
        currentSpeed: Math.max(0, currentSpeed),
        avgSpeed,
        heartRate: currentHeartRate.current,
        calories,
        power: currentPower.current,
        cadence: currentCadence.current,
      };
    },
    [calculateDistance, calculateCalories],
  );

  // ---------- ⏱ Duration tracking (every 1s, wall clock) ----------
  useEffect(() => {
    if (!isRecording) return;

    if (startTime.current === 0) {
      startTime.current = Date.now();
    }

    const updateDuration = () => {
      if (!isPaused) {
        const now = Date.now();
        const elapsed = now - startTime.current - pausedDuration.current;
        const duration = Math.max(0, Math.floor(elapsed / 1000));

        // Calculate and update all metrics based on wall-clock duration
        const newMetrics = calculateMetrics(duration);
        setMetrics(newMetrics);

        // Update current recording
        setCurrentRecording((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            metrics: newMetrics,
            locations: [...locationsRef.current],
          };
        });

        console.log("📊 Duration update:", {
          duration: duration,
          distance: (newMetrics.distance / 1000).toFixed(2) + "km",
          heartRate: newMetrics.heartRate,
          calories: newMetrics.calories,
        });
      }
    };

    // Update immediately and every second
    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, calculateMetrics]);

  // ---------- 🎛 Live metrics (smooth sensor updates via RAF) ----------
  const updateLiveMetrics = useCallback(() => {
    // Update metrics with latest sensor values for smooth UI
    setMetrics((prev) => ({
      ...prev,
      heartRate: currentHeartRate.current,
      power: currentPower.current,
      cadence: currentCadence.current,
    }));

    if (isRecording && !isPaused) {
      rafRef.current = requestAnimationFrame(updateLiveMetrics);
    }
  }, [isRecording, isPaused]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      rafRef.current = requestAnimationFrame(updateLiveMetrics);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRecording, isPaused, updateLiveMetrics]);

  // ---------- ⏸ Pause tracking ----------
  useEffect(() => {
    if (!isRecording) return;

    if (isPaused && pauseStart.current === null) {
      pauseStart.current = Date.now();
      console.log("⏸️ Recording paused");
    } else if (!isPaused && pauseStart.current !== null) {
      pausedDuration.current += Date.now() - pauseStart.current;
      pauseStart.current = null;
      console.log("▶️ Recording resumed");
    }
  }, [isPaused, isRecording]);

  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Location permission denied");
      }

      const recordingId = `activity_${Date.now()}`;
      const now = Date.now();

      // Reset all timing refs
      startTime.current = now;
      pausedDuration.current = 0;
      pauseStart.current = null;
      locationsRef.current = [];

      // Reset sensor refs
      currentHeartRate.current = undefined;
      currentPower.current = undefined;
      currentCadence.current = undefined;

      const newRecording: ActivityRecording = {
        id: recordingId,
        startTime: now,
        locations: [],
        metrics: { duration: 0, distance: 0, currentSpeed: 0, avgSpeed: 0 },
        sensorData: [],
      };

      setCurrentRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);

      // Start location tracking with high accuracy
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000, // Update every second
          distanceInterval: 2, // Update every 2 meters to reduce noise
          mayShowUserSettingsDialog: true, // Allow user to improve location settings
        },
        (location) => {
          if (!isPaused) {
            // Log detailed location info for debugging
            console.log("📍 GPS Update:", {
              lat: location.coords.latitude.toFixed(6),
              lng: location.coords.longitude.toFixed(6),
              speed: location.coords.speed
                ? (location.coords.speed * 3.6).toFixed(1) + " km/h"
                : "N/A",
              accuracy: location.coords.accuracy
                ? location.coords.accuracy.toFixed(1) + "m"
                : "N/A",
              altitude: location.coords.altitude
                ? location.coords.altitude.toFixed(1) + "m"
                : "N/A",
              timestamp: new Date(location.timestamp).toLocaleTimeString(),
            });

            // Only add location if accuracy is reasonable (less than 50m)
            if (!location.coords.accuracy || location.coords.accuracy < 50) {
              locationsRef.current = [...locationsRef.current, location];
            } else {
              console.warn(
                "🚫 Rejecting inaccurate GPS reading:",
                location.coords.accuracy + "m",
              );
            }
          }
        },
      );

      console.log("🎬 Recording started:", recordingId);
      return true;
    } catch (error) {
      console.error("Failed to start recording:", error);
      return false;
    }
  }, []);

  // Pause recording
  const pauseRecording = useCallback((): boolean => {
    if (!isRecording || isPaused) return false;
    setIsPaused(true);
    return true;
  }, [isRecording, isPaused]);

  // Resume recording
  const resumeRecording = useCallback((): boolean => {
    if (!isRecording || !isPaused) return false;
    setIsPaused(false);
    return true;
  }, [isRecording, isPaused]);

  // Stop recording
  const stopRecording =
    useCallback(async (): Promise<ActivityRecording | null> => {
      if (!isRecording || !currentRecording) return null;

      // Stop location tracking
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      // Cancel any pending animation frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      // Final metrics calculation
      const now = Date.now();
      const elapsed = now - startTime.current - pausedDuration.current;
      const finalDuration = Math.max(0, Math.floor(elapsed / 1000));
      const finalMetrics = calculateMetrics(finalDuration);

      const finalRecording = {
        ...currentRecording,
        locations: [...locationsRef.current],
        metrics: finalMetrics,
      };

      setIsRecording(false);
      setIsPaused(false);
      setCurrentRecording(null);
      setMetrics({ duration: 0, distance: 0, currentSpeed: 0, avgSpeed: 0 });

      // Reset all refs
      startTime.current = 0;
      pausedDuration.current = 0;
      pauseStart.current = null;
      locationsRef.current = [];
      currentHeartRate.current = undefined;
      currentPower.current = undefined;
      currentCadence.current = undefined;

      console.log("⏹️ Recording stopped, final metrics:", finalMetrics);
      return finalRecording;
    }, [isRecording, currentRecording, calculateMetrics]);

  // Add sensor data - updates sensor refs for smooth display
  const addSensorData = useCallback(
    (data: any) => {
      if (!isRecording) return;

      console.log("📡 Sensor data received:", data);

      // Update sensor refs immediately for smooth RAF updates
      if (data.heartRate && typeof data.heartRate === "number") {
        currentHeartRate.current = data.heartRate;
      }
      if (data.power && typeof data.power === "number") {
        currentPower.current = data.power;
      }
      if (data.cadence && typeof data.cadence === "number") {
        currentCadence.current = data.cadence;
      }

      // Add to recording sensor data
      setCurrentRecording((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sensorData: [...prev.sensorData, { ...data, timestamp: Date.now() }],
        };
      });
    },
    [isRecording],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    metrics,
    currentRecording,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    addSensorData,
  };
};
