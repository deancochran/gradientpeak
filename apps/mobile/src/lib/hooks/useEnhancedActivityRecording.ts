import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus } from "react-native";

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
  status: "recording" | "paused" | "stopped";
  recoveryData?: RecoveryData;
}

interface RecoveryData {
  lastSavedTimestamp: number;
  checkpoints: ActivityCheckpoint[];
  errorLog: ErrorLogEntry[];
  connectionAttempts: number;
}

interface ActivityCheckpoint {
  timestamp: number;
  metrics: ActivityMetrics;
  locationCount: number;
  sensorDataCount: number;
}

interface ErrorLogEntry {
  timestamp: number;
  error: string;
  context: string;
  recovered: boolean;
}

interface ConnectionStatus {
  gps: "connected" | "connecting" | "error" | "disabled";
  bluetooth: "connected" | "connecting" | "error" | "disabled";
  sensors: {
    heartRate: "connected" | "connecting" | "error" | "disabled";
    power: "connected" | "connecting" | "error" | "disabled";
    cadence: "connected" | "connecting" | "error" | "disabled";
  };
}

const STORAGE_KEYS = {
  ACTIVE_RECORDING: "@activity_recording_session",
  RECOVERY_DATA: "@activity_recovery_data",
  CHECKPOINT_DATA: "@activity_checkpoint_data",
};

const RECOVERY_CONFIG = {
  CHECKPOINT_INTERVAL: 30000, // 30 seconds
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 3000, // 3 seconds
  GPS_TIMEOUT: 15000, // 15 seconds
  SENSOR_TIMEOUT: 10000, // 10 seconds
  MAX_ERROR_LOG_SIZE: 50,
};

export const useEnhancedActivityRecording = () => {
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    gps: "disabled",
    bluetooth: "disabled",
    sensors: {
      heartRate: "disabled",
      power: "disabled",
      cadence: "disabled",
    },
  });
  const [isRecovering, setIsRecovering] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs for tracking state
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null,
  );
  const startTime = useRef<number>(0);
  const pausedDuration = useRef<number>(0);
  const pauseStart = useRef<number | null>(null);
  const locationsRef = useRef<Location.LocationObject[]>([]);
  const sensorDataRef = useRef<any[]>([]);
  const recoveryDataRef = useRef<RecoveryData>({
    lastSavedTimestamp: 0,
    checkpoints: [],
    errorLog: [],
    connectionAttempts: 0,
  });

  // Sensor refs
  const currentHeartRate = useRef<number | undefined>(undefined);
  const currentPower = useRef<number | undefined>(undefined);
  const currentCadence = useRef<number | undefined>(undefined);

  // Timers and intervals
  const checkpointInterval = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const gpsTimeout = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number>();

  // Error logging utility
  const logError = useCallback(
    (error: string, context: string, recovered: boolean = false) => {
      const errorEntry: ErrorLogEntry = {
        timestamp: Date.now(),
        error,
        context,
        recovered,
      };

      recoveryDataRef.current.errorLog.push(errorEntry);

      // Keep only the last N errors
      if (
        recoveryDataRef.current.errorLog.length >
        RECOVERY_CONFIG.MAX_ERROR_LOG_SIZE
      ) {
        recoveryDataRef.current.errorLog =
          recoveryDataRef.current.errorLog.slice(
            -RECOVERY_CONFIG.MAX_ERROR_LOG_SIZE,
          );
      }

      setLastError(error);
      console.error(`🚨 [${context}] ${error}`, {
        recovered,
        timestamp: errorEntry.timestamp,
      });
    },
    [],
  );

  // Create checkpoint for recovery
  const createCheckpoint = useCallback(() => {
    if (!currentRecording) return;

    const checkpoint: ActivityCheckpoint = {
      timestamp: Date.now(),
      metrics: { ...metrics },
      locationCount: locationsRef.current.length,
      sensorDataCount: sensorDataRef.current.length,
    };

    recoveryDataRef.current.checkpoints.push(checkpoint);
    recoveryDataRef.current.lastSavedTimestamp = checkpoint.timestamp;

    // Keep only last 10 checkpoints
    if (recoveryDataRef.current.checkpoints.length > 10) {
      recoveryDataRef.current.checkpoints =
        recoveryDataRef.current.checkpoints.slice(-10);
    }

    // Save to storage
    AsyncStorage.setItem(
      STORAGE_KEYS.CHECKPOINT_DATA,
      JSON.stringify(recoveryDataRef.current),
    ).catch((error) =>
      logError(`Failed to save checkpoint: ${error}`, "checkpoint"),
    );

    console.log("📍 Checkpoint created", {
      timestamp: checkpoint.timestamp,
      metrics: checkpoint.metrics,
      locationCount: checkpoint.locationCount,
    });
  }, [currentRecording, metrics, logError]);

  // Save recording session to storage for recovery
  const saveRecordingSession = useCallback(
    async (recording: ActivityRecording) => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEYS.ACTIVE_RECORDING,
          JSON.stringify({
            ...recording,
            locations: locationsRef.current,
            sensorData: sensorDataRef.current,
          }),
        );
      } catch (error) {
        logError(`Failed to save session: ${error}`, "storage");
      }
    },
    [logError],
  );

  // Clear recovery data
  const clearRecoveryData = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_RECORDING),
        AsyncStorage.removeItem(STORAGE_KEYS.RECOVERY_DATA),
        AsyncStorage.removeItem(STORAGE_KEYS.CHECKPOINT_DATA),
      ]);
      recoveryDataRef.current = {
        lastSavedTimestamp: 0,
        checkpoints: [],
        errorLog: [],
        connectionAttempts: 0,
      };
    } catch (error) {
      logError(`Failed to clear recovery data: ${error}`, "cleanup");
    }
  }, [logError]);

  // Attempt to recover from previous session
  const attemptRecovery = useCallback(async (): Promise<boolean> => {
    setIsRecovering(true);

    try {
      const [sessionData, recoveryData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_RECORDING),
        AsyncStorage.getItem(STORAGE_KEYS.CHECKPOINT_DATA),
      ]);

      if (!sessionData) {
        setIsRecovering(false);
        return false;
      }

      const session: ActivityRecording = JSON.parse(sessionData);
      const recovery: RecoveryData | null = recoveryData
        ? JSON.parse(recoveryData)
        : null;

      // Check if session is recoverable (less than 24 hours old)
      const sessionAge = Date.now() - session.startTime;
      if (sessionAge > 24 * 60 * 60 * 1000) {
        logError("Session too old to recover", "recovery");
        await clearRecoveryData();
        setIsRecovering(false);
        return false;
      }

      console.log("🔄 Attempting to recover session:", {
        id: session.id,
        startTime: new Date(session.startTime).toISOString(),
        status: session.status,
        age: `${Math.round(sessionAge / 1000)}s`,
      });

      // Restore session state
      setCurrentRecording(session);
      setIsRecording(session.status === "recording");
      setIsPaused(session.status === "paused");
      setMetrics(session.metrics);

      // Restore refs
      locationsRef.current = session.locations || [];
      sensorDataRef.current = session.sensorData || [];
      if (recovery) {
        recoveryDataRef.current = recovery;
      }

      // Calculate timing
      startTime.current = session.startTime;
      if (session.status === "paused") {
        pauseStart.current = Date.now();
      }

      setIsRecovering(false);
      logError("Session recovered successfully", "recovery", true);
      return true;
    } catch (error) {
      logError(`Recovery failed: ${error}`, "recovery");
      await clearRecoveryData();
      setIsRecovering(false);
      return false;
    }
  }, [logError, clearRecoveryData]);

  // Enhanced GPS connection with retry logic and comprehensive debugging
  const connectGPS = useCallback(async (): Promise<boolean> => {
    console.log("📍 [GPS DEBUG] Starting GPS connection test...");
    setConnectionStatus((prev) => ({ ...prev, gps: "connecting" }));

    try {
      // Check location services enabled globally
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      console.log(
        "📍 [GPS DEBUG] Location services enabled:",
        isLocationEnabled,
      );

      if (!isLocationEnabled) {
        console.log("📍 [GPS DEBUG] Location services are disabled globally");
        setConnectionStatus((prev) => ({ ...prev, gps: "error" }));
        logError("Location services are disabled on this device", "gps");
        return false;
      }

      // Check app permissions
      const { status, canAskAgain } =
        await Location.requestForegroundPermissionsAsync();
      console.log("📍 [GPS DEBUG] Permission status:", { status, canAskAgain });

      if (status !== "granted") {
        console.log("📍 [GPS DEBUG] Location permission not granted:", status);
        setConnectionStatus((prev) => ({ ...prev, gps: "error" }));
        logError(`Location permission denied: ${status}`, "gps");
        return false;
      }

      console.log("📍 [GPS DEBUG] Attempting to get current position...");

      // Test GPS availability with timeout and detailed error handling
      const testLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: 10000, // Accept location up to 10 seconds old
        timeout: 15000, // 15 second timeout
      });

      console.log("📍 [GPS DEBUG] GPS test location received:", {
        latitude: testLocation.coords.latitude,
        longitude: testLocation.coords.longitude,
        accuracy: testLocation.coords.accuracy,
        timestamp: new Date(testLocation.timestamp).toISOString(),
      });

      if (!testLocation || !testLocation.coords) {
        throw new Error("GPS signal unavailable - no coordinates received");
      }

      if (testLocation.coords.accuracy > 100) {
        console.log(
          "📍 [GPS DEBUG] WARNING: Poor GPS accuracy:",
          testLocation.coords.accuracy,
          "meters",
        );
      }

      console.log("📍 [GPS DEBUG] GPS connection successful!");
      setConnectionStatus((prev) => ({ ...prev, gps: "connected" }));
      return true;
    } catch (error) {
      console.log("📍 [GPS DEBUG] GPS connection failed:", error);
      console.log("📍 [GPS DEBUG] Error details:", {
        message: error.message,
        code: error.code,
        name: error.name,
      });

      setConnectionStatus((prev) => ({ ...prev, gps: "error" }));
      logError(`GPS connection failed: ${error.message || error}`, "gps");
      return false;
    }
  }, [logError]);

  // Start location tracking with fault tolerance
  const startLocationTracking = useCallback(async (): Promise<boolean> => {
    try {
      if (gpsTimeout.current) {
        clearTimeout(gpsTimeout.current);
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 2,
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          if (!isPaused && isRecording) {
            // Reset GPS timeout on successful reading
            if (gpsTimeout.current) {
              clearTimeout(gpsTimeout.current);
            }

            // Validate location accuracy
            if (location.coords.accuracy && location.coords.accuracy > 50) {
              console.warn(
                "🚫 Rejecting inaccurate GPS reading:",
                location.coords.accuracy + "m",
              );
              return;
            }

            locationsRef.current = [...locationsRef.current, location];
            setConnectionStatus((prev) => ({ ...prev, gps: "connected" }));

            // Set GPS timeout for next reading
            gpsTimeout.current = setTimeout(() => {
              setConnectionStatus((prev) => ({ ...prev, gps: "error" }));
              logError("GPS timeout", "gps");
            }, RECOVERY_CONFIG.GPS_TIMEOUT);
          }
        },
      );

      return true;
    } catch (error) {
      logError(`Location tracking failed: ${error}`, "gps");
      return false;
    }
  }, [isRecording, isPaused, logError]);

  // Calculate distance between two points
  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371e3;
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

  // Calculate calories with enhanced estimation
  const calculateCalories = useCallback(
    (duration: number, distance: number, heartRate?: number): number => {
      if (duration === 0) return 0;

      const hours = duration / 3600;
      const km = distance / 1000;

      if (heartRate) {
        const baseRate = 70;
        const intensity = Math.max(1, heartRate / baseRate);
        return Math.round(hours * 400 * intensity);
      } else {
        return Math.round(hours * 300 + km * 50);
      }
    },
    [],
  );

  // Calculate comprehensive metrics
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

  // Duration tracking with fault tolerance
  useEffect(() => {
    if (!isRecording) return;

    if (startTime.current === 0) {
      startTime.current = Date.now();
    }

    const updateDuration = () => {
      try {
        if (!isPaused) {
          const now = Date.now();
          const elapsed = now - startTime.current - pausedDuration.current;
          const duration = Math.max(0, Math.floor(elapsed / 1000));

          const newMetrics = calculateMetrics(duration);
          setMetrics(newMetrics);

          // Update current recording
          setCurrentRecording((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              metrics: newMetrics,
              locations: [...locationsRef.current],
              sensorData: [...sensorDataRef.current],
            };
            saveRecordingSession(updated);
            return updated;
          });
        }
      } catch (error) {
        logError(`Metrics calculation failed: ${error}`, "metrics");
      }
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, calculateMetrics, saveRecordingSession, logError]);

  // Checkpoint creation interval
  useEffect(() => {
    if (!isRecording) return;

    checkpointInterval.current = setInterval(
      createCheckpoint,
      RECOVERY_CONFIG.CHECKPOINT_INTERVAL,
    );

    return () => {
      if (checkpointInterval.current) {
        clearInterval(checkpointInterval.current);
      }
    };
  }, [isRecording, createCheckpoint]);

  // App state handling
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (isRecording) {
        if (nextAppState === "background" || nextAppState === "inactive") {
          console.log(
            "📱 App going to background - creating emergency checkpoint",
          );
          createCheckpoint();
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, [isRecording, createCheckpoint]);

  // Start recording with enhanced error handling
  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      console.log("🎬 Starting enhanced activity recording...");

      // Check for existing session
      const hasActiveSession = await attemptRecovery();
      if (hasActiveSession) {
        Alert.alert(
          "Resume Recording?",
          "A previous recording session was found. Would you like to resume it?",
          [
            {
              text: "Start New",
              style: "destructive",
              onPress: async () => {
                await clearRecoveryData();
                startRecording();
              },
            },
            { text: "Resume", onPress: () => console.log("Session resumed") },
          ],
        );
        return true;
      }

      // Connect GPS
      const gpsConnected = await connectGPS();
      if (!gpsConnected) {
        Alert.alert(
          "GPS Error",
          "Unable to connect to GPS. Please check your location settings.",
        );
        return false;
      }

      const recordingId = `activity_${Date.now()}`;
      const now = Date.now();

      // Reset all refs
      startTime.current = now;
      pausedDuration.current = 0;
      pauseStart.current = null;
      locationsRef.current = [];
      sensorDataRef.current = [];
      recoveryDataRef.current = {
        lastSavedTimestamp: now,
        checkpoints: [],
        errorLog: [],
        connectionAttempts: 0,
      };

      const newRecording: ActivityRecording = {
        id: recordingId,
        startTime: now,
        locations: [],
        metrics: { duration: 0, distance: 0, currentSpeed: 0, avgSpeed: 0 },
        sensorData: [],
        status: "recording",
        recoveryData: recoveryDataRef.current,
      };

      setCurrentRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);

      // Start location tracking
      await startLocationTracking();

      // Save initial session
      await saveRecordingSession(newRecording);

      console.log("✅ Enhanced recording started:", recordingId);
      return true;
    } catch (error) {
      logError(`Failed to start recording: ${error}`, "start");
      return false;
    }
  }, [
    attemptRecovery,
    clearRecoveryData,
    connectGPS,
    startLocationTracking,
    saveRecordingSession,
    logError,
  ]);

  // Pause recording
  const pauseRecording = useCallback((): boolean => {
    if (!isRecording || isPaused) return false;

    setIsPaused(true);
    setCurrentRecording((prev) =>
      prev ? { ...prev, status: "paused" } : prev,
    );
    createCheckpoint();
    console.log("⏸️ Recording paused");
    return true;
  }, [isRecording, isPaused, createCheckpoint]);

  // Resume recording
  const resumeRecording = useCallback((): boolean => {
    if (!isRecording || !isPaused) return false;

    setIsPaused(false);
    setCurrentRecording((prev) =>
      prev ? { ...prev, status: "recording" } : prev,
    );
    console.log("▶️ Recording resumed");
    return true;
  }, [isRecording, isPaused]);

  // Stop recording with cleanup
  const stopRecording =
    useCallback(async (): Promise<ActivityRecording | null> => {
      if (!isRecording || !currentRecording) return null;

      try {
        console.log("⏹️ Stopping enhanced recording...");

        // Stop location tracking
        if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        }

        // Clear timeouts
        if (gpsTimeout.current) clearTimeout(gpsTimeout.current);
        if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
        if (checkpointInterval.current)
          clearInterval(checkpointInterval.current);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        // Final metrics calculation
        const now = Date.now();
        const elapsed = now - startTime.current - pausedDuration.current;
        const finalDuration = Math.max(0, Math.floor(elapsed / 1000));
        const finalMetrics = calculateMetrics(finalDuration);

        const finalRecording: ActivityRecording = {
          ...currentRecording,
          locations: [...locationsRef.current],
          sensorData: [...sensorDataRef.current],
          metrics: finalMetrics,
          status: "stopped",
        };

        // Create final checkpoint
        createCheckpoint();

        // Reset state
        setIsRecording(false);
        setIsPaused(false);
        setCurrentRecording(null);
        setMetrics({ duration: 0, distance: 0, currentSpeed: 0, avgSpeed: 0 });
        setConnectionStatus({
          gps: "disabled",
          bluetooth: "disabled",
          sensors: {
            heartRate: "disabled",
            power: "disabled",
            cadence: "disabled",
          },
        });

        // Clear recovery data
        await clearRecoveryData();

        console.log("✅ Enhanced recording stopped successfully");
        return finalRecording;
      } catch (error) {
        logError(`Failed to stop recording: ${error}`, "stop");
        return currentRecording;
      }
    }, [
      isRecording,
      currentRecording,
      calculateMetrics,
      createCheckpoint,
      clearRecoveryData,
      logError,
    ]);

  // Add sensor data with validation
  const addSensorData = useCallback(
    (data: any) => {
      if (!isRecording) return;

      try {
        // Validate sensor data
        const timestamp = data.timestamp || Date.now();
        const validatedData = {
          ...data,
          timestamp,
        };

        // Update sensor refs
        if (data.heartRate && typeof data.heartRate === "number") {
          currentHeartRate.current = data.heartRate;
          setConnectionStatus((prev) => ({
            ...prev,
            sensors: { ...prev.sensors, heartRate: "connected" },
          }));
        }

        if (data.power && typeof data.power === "number") {
          currentPower.current = data.power;
          setConnectionStatus((prev) => ({
            ...prev,
            sensors: { ...prev.sensors, power: "connected" },
          }));
        }

        if (data.cadence && typeof data.cadence === "number") {
          currentCadence.current = data.cadence;
          setConnectionStatus((prev) => ({
            ...prev,
            sensors: { ...prev.sensors, cadence: "connected" },
          }));
        }

        sensorDataRef.current = [...sensorDataRef.current, validatedData];
      } catch (error) {
        logError(`Sensor data processing failed: ${error}`, "sensor");
      }
    },
    [isRecording, logError],
  );

  // Initialize recovery check on mount
  useEffect(() => {
    attemptRecovery();
  }, [attemptRecovery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (gpsTimeout.current) clearTimeout(gpsTimeout.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (checkpointInterval.current) clearInterval(checkpointInterval.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    // State
    isRecording,
    isPaused,
    metrics,
    currentRecording,
    connectionStatus,
    isRecovering,
    lastError,

    // Actions
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    addSensorData,

    // Recovery
    attemptRecovery,
    clearRecoveryData,
    createCheckpoint,

    // Status
    errorLog: recoveryDataRef.current.errorLog,
    checkpoints: recoveryDataRef.current.checkpoints,
  };
};
