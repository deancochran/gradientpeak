import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Alert } from "react-native";
import type {
  GpsDataPoint,
  RecordingSession,
  SensorDataPoint,
} from "../types/activity";
import { ActivitySyncService } from "./activity-sync-service";
import { LocalActivityDatabaseService } from "./local-activity-database";

const LOCATION_TRACKING_TASK = "ACTIVITY_LOCATION_TRACKING";
const ACTIVE_RECORDING_KEY = "active_recording_session";
const RECOVERY_DATA_KEY = "recording_recovery_data";

export class ActivityRecorderService {
  private static currentSession: RecordingSession | null = null;
  private static locationSubscription: Location.LocationSubscription | null =
    null;
  private static recordingTimer: ReturnType<typeof setInterval> | null = null;
  private static isInitialized = false;
  private static sensorDataBuffer: SensorDataPoint[] = [];
  private static gpsDataBuffer: GpsDataPoint[] = [];

  // Duration tracking
  private static totalTimerTime: number = 0; // Active recording time (excludes pauses)
  private static lastResumeTime: Date | null = null; // When recording was last resumed

  /**
   * Initialize the activity recorder service
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await LocalActivityDatabaseService.initDatabase();
      this.setupBackgroundLocationTask();
      await this.recoverFromInterruption();
      this.isInitialized = true;
      console.log("Activity recorder service initialized");
    } catch (error) {
      console.error("Failed to initialize activity recorder:", error);
      throw error;
    }
  }

  /**
   * Start recording a new activity
   */
  static async startRecording(profileId: string): Promise<string | null> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.currentSession) {
        throw new Error("Recording session already in progress");
      }

      // Generate a proper UUID for the activity ID
      const sessionId = Crypto.randomUUID();
      const startTime = new Date();

      this.currentSession = {
        id: sessionId,
        profileId,
        startedAt: startTime,
        status: "recording",
        recordMessages: [],
        eventMessages: [],
        hrMessages: [],
        hrvMessages: [],
        liveMetrics: {
          totalElapsedTime: 0, // Wall clock time
          totalTimerTime: 0, // Active recording time
        },
      };

      // Initialize duration tracking
      this.totalTimerTime = 0;
      this.lastResumeTime = startTime;

      // Save session to storage for recovery
      await this.saveSessionToStorage();

      // Start location tracking
      await this.startLocationTracking();

      // Start recording timer for live metrics
      this.startRecordingTimer();

      // Add initial timer start event
      this.addEventMessage({
        timestamp: startTime,
        event: "timer",
        eventType: "start",
      });

      // Haptic feedback
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}

      console.log(`Activity recording started: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error("Error starting activity recording:", error);
      // Clean up any timers or subscriptions
      await this.cleanup();
      Alert.alert("Error", "Failed to start activity recording");
      return null;
    }
  }

  /**
   * Pause the current recording
   */
  static async pauseRecording(): Promise<boolean> {
    try {
      if (!this.currentSession || this.currentSession.status !== "recording") {
        return false;
      }

      const pauseTime = new Date();

      // Update total timer time with the time since last resume
      if (this.lastResumeTime) {
        const activeTimeThisSession =
          (pauseTime.getTime() - this.lastResumeTime.getTime()) / 1000;
        this.totalTimerTime += activeTimeThisSession;
        this.lastResumeTime = null;
      }

      this.currentSession.status = "paused";

      // Update live metrics with both duration types
      const elapsedTime =
        (pauseTime.getTime() - this.currentSession.startedAt.getTime()) / 1000;
      this.currentSession.liveMetrics.totalElapsedTime = elapsedTime;
      this.currentSession.liveMetrics.totalTimerTime = this.totalTimerTime;

      await this.saveSessionToStorage();

      // Stop location tracking
      await this.stopLocationTracking();

      // Stop recording timer
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }

      // Add pause event
      this.addEventMessage({
        timestamp: pauseTime,
        event: "timer",
        eventType: "stop",
      });

      console.log(
        `Activity recording paused. Active time: ${this.totalTimerTime}s, Elapsed time: ${elapsedTime}s`,
      );
      return true;
    } catch (error) {
      console.error("Error pausing recording:", error);
      return false;
    }
  }

  /**
   * Resume the current recording
   */
  static async resumeRecording(): Promise<boolean> {
    try {
      if (!this.currentSession || this.currentSession.status !== "paused") {
        return false;
      }

      const resumeTime = new Date();
      this.lastResumeTime = resumeTime;

      this.currentSession.status = "recording";
      await this.saveSessionToStorage();

      // Restart location tracking
      await this.startLocationTracking();

      // Restart recording timer
      this.startRecordingTimer();

      // Add resume event
      this.addEventMessage({
        timestamp: resumeTime,
        event: "timer",
        eventType: "start",
      });

      console.log("Activity recording resumed");
      return true;
    } catch (error) {
      console.error("Error resuming recording:", error);
      return false;
    }
  }

  /**
   * Stop the current recording and prompt user to save or discard
   */
  static async stopRecording(): Promise<void> {
    try {
      if (!this.currentSession) {
        return;
      }

      const wasRecording = this.currentSession.status === "recording";
      const stopTime = new Date();

      // Finalize timer time if we were recording when stopped
      if (wasRecording && this.lastResumeTime) {
        const activeTimeThisSession =
          (stopTime.getTime() - this.lastResumeTime.getTime()) / 1000;
        this.totalTimerTime += activeTimeThisSession;
        this.lastResumeTime = null;
      }

      this.currentSession.status = "stopped";

      // Calculate final metrics
      const totalElapsedTime =
        (stopTime.getTime() - this.currentSession.startedAt.getTime()) / 1000;
      this.currentSession.liveMetrics.totalElapsedTime = totalElapsedTime;
      this.currentSession.liveMetrics.totalTimerTime = this.totalTimerTime;

      // Stop all tracking
      if (wasRecording) {
        await this.stopLocationTracking();
      }

      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }

      // Add final stop event
      this.addEventMessage({
        timestamp: new Date(),
        event: "timer",
        eventType: "stop_disable_all",
      });

      // Flush any remaining buffered data
      await this.flushBufferedData();

      const session = this.currentSession;
      const duration = Math.floor(
        (new Date().getTime() - session.startedAt.getTime()) / 1000,
      );

      // Show save/discard dialog
      Alert.alert(
        "Save Activity?",
        `Duration: ${this.formatDuration(duration)}\nDistance: ${
          session.liveMetrics.distance
            ? `${(session.liveMetrics.distance / 1000).toFixed(2)}km`
            : "N/A"
        }`,
        [
          {
            text: "Discard",
            style: "destructive",
            onPress: () => this.discardActivity(),
          },
          {
            text: "Save",
            onPress: () => this.saveActivity(),
          },
        ],
        { cancelable: false },
      );
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  }

  /**
   * Save the current activity
   */
  static async saveActivity(): Promise<void> {
    try {
      if (!this.currentSession) {
        return;
      }

      const session = this.currentSession;

      // Save activity as JSON file for backend processing
      const jsonFilePath = await this.saveActivityJson(session);
      if (!jsonFilePath) {
        throw new Error("Failed to save activity JSON file");
      }

      // Create basic metadata from session data
      const metadata = {
        startTime: session.startedAt,
        endTime: new Date(),
        totalTimerTime: session.liveMetrics.totalTimerTime || 0,
        totalDistance: session.liveMetrics.distance,
        avgHeartRate: session.liveMetrics.avgHeartRate,
        avgPower: session.liveMetrics.avgPower,
        hasGpsData: session.recordMessages.some(
          (r) => r.positionLat !== undefined,
        ),
        hasHeartRateData: session.recordMessages.some(
          (r) => r.heartRate !== undefined,
        ),
        hasPowerData: session.recordMessages.some((r) => r.power !== undefined),
        hasCadenceData: session.recordMessages.some(
          (r) => r.cadence !== undefined,
        ),
        hasTemperatureData: session.recordMessages.some(
          (r) => r.temperature !== undefined,
        ),
      };

      // Save activity to local database
      const activityId = await LocalActivityDatabaseService.createActivity({
        id: session.id,
        profileId: session.profileId,
        localStoragePath: jsonFilePath, // Points to local JSON file
        syncStatus: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Clean up
      await this.cleanupSession();

      Alert.alert(
        "Activity Saved",
        `Your activity has been saved locally as JSON and will be processed on sync.`,
        [{ text: "OK" }],
      );

      console.log(`Activity saved: ${activityId}`);

      // Automatically trigger a sync for the new activity
      try {
        console.log(`Triggering sync for new activity: ${activityId}`);
        // Use a dynamic require here to break the circular dependency cycle
        ActivitySyncService.syncActivity(activityId);
      } catch (syncError) {
        console.error("Failed to trigger automatic sync:", syncError);
      }
    } catch (error) {
      console.error("Error saving activity:", error);
      Alert.alert("Error", "Failed to save activity. Please try again.");
    }
  }

  /**
   * Discard the current activity
   */
  static async discardActivity(): Promise<void> {
    try {
      await this.cleanupSession();
      Alert.alert("Activity Discarded", "Your activity has been discarded.");
      console.log("Activity discarded");
    } catch (error) {
      console.error("Error discarding activity:", error);
    }
  }

  /**
   * Add sensor data to the current recording
   */
  static addSensorData(sensorData: Partial<SensorDataPoint>): void {
    if (!this.currentSession || this.currentSession.status !== "recording") {
      return;
    }

    const dataPoint: SensorDataPoint = {
      timestamp: new Date(),
      messageType: sensorData.messageType || "record",
      data: sensorData.data || {},
      ...sensorData,
    };

    this.sensorDataBuffer.push(dataPoint);

    // Process the data based on type
    if (dataPoint.messageType === "record") {
      this.addRecordMessage(dataPoint.data);
    } else if (dataPoint.messageType === "hr") {
      this.currentSession.hrMessages.push({
        timestamp: dataPoint.timestamp,
        ...dataPoint.data,
      });
    } else if (dataPoint.messageType === "hrv") {
      this.currentSession.hrvMessages.push({
        timestamp: dataPoint.timestamp,
        ...dataPoint.data,
      });
    }

    // Update live metrics
    this.updateLiveMetrics(dataPoint);

    // Prevent buffer overflow
    if (this.sensorDataBuffer.length > 1000) {
      this.flushBufferedData();
    }

    // Flush buffer periodically
    if (this.sensorDataBuffer.length >= 10) {
      this.flushBufferedData();
    }
  }

  /**
   * Get current session status
   */
  static getCurrentSession(): RecordingSession | null {
    return this.currentSession;
  }

  /**
   * Check if currently recording
   */
  static isRecording(): boolean {
    return this.currentSession?.status === "recording" || false;
  }

  /**
   * Check if currently paused
   */
  static isPaused(): boolean {
    return this.currentSession?.status === "paused" || false;
  }

  // Private methods

  private static async cleanup(): Promise<void> {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
  }

  private static setupBackgroundLocationTask(): void {
    TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
      if (error) {
        console.error("Background location error:", error);
        return;
      }

      if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };

        try {
          const sessionData = await AsyncStorage.getItem(ACTIVE_RECORDING_KEY);
          if (!sessionData) return;

          for (const location of locations) {
            const gpsPoint: GpsDataPoint = {
              timestamp: new Date(location.timestamp),
              positionLat: location.coords.latitude * 11930464.7111, // Convert to semicircles
              positionLong: location.coords.longitude * 11930464.7111,
              altitude: location.coords.altitude || undefined,
              speed: location.coords.speed || undefined,
              gpsAccuracy: location.coords.accuracy || undefined,
            };

            // Add to buffer or directly to session if available
            if (this.currentSession) {
              this.addRecordMessage(gpsPoint);
            } else {
              // Store for recovery
              this.gpsDataBuffer.push(gpsPoint);
            }
          }
        } catch (e) {
          console.error("Failed to process background location:", e);
        }
      }
    });
  }

  private static async startLocationTracking(): Promise<void> {
    try {
      console.log("🛰️ Starting GPS location tracking...");

      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();
      const { status: backgroundStatus } =
        await Location.requestBackgroundPermissionsAsync();

      if (foregroundStatus !== "granted" || backgroundStatus !== "granted") {
        console.warn("🛰️ Location permissions not granted:", {
          foregroundStatus,
          backgroundStatus,
        });
        throw new Error("Location permissions not granted");
      }

      // Start background location updates with optimized settings
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000, // 1 second intervals
        distanceInterval: 1, // Track every 1 meter
        deferredUpdatesInterval: 2000, // Defer updates for 2 seconds max
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Recording Activity",
          notificationBody: "TurboFit is tracking your activity",
          notificationColor: "#10b981",
          killServiceOnDestroy: false,
        },
      });

      // Start foreground location tracking for immediate updates
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
          mayShowUserSettingsDialog: false,
        },
        (location) => {
          try {
            const gpsPoint: GpsDataPoint = {
              timestamp: new Date(location.timestamp),
              positionLat: location.coords.latitude * 11930464.7111, // Convert to semicircles
              positionLong: location.coords.longitude * 11930464.7111, // Convert to semicircles
              altitude: location.coords.altitude || undefined,
              speed: location.coords.speed
                ? Math.max(0, location.coords.speed)
                : undefined, // Ensure non-negative
              gpsAccuracy: location.coords.accuracy || undefined,
            };

            // Calculate distance from previous point if available
            if (
              this.currentSession &&
              this.currentSession.recordMessages.length > 0
            ) {
              const lastMessage =
                this.currentSession.recordMessages[
                  this.currentSession.recordMessages.length - 1
                ];
              if (lastMessage.positionLat && lastMessage.positionLong) {
                const distance = this.calculateDistance(
                  lastMessage.positionLat / 11930464.7111,
                  lastMessage.positionLong / 11930464.7111,
                  location.coords.latitude,
                  location.coords.longitude,
                );

                // Add cumulative distance
                const currentDistance =
                  this.currentSession.liveMetrics.distance || 0;
                gpsPoint.distance = currentDistance + distance;
              }
            }

            this.addRecordMessage(gpsPoint);

            // Log GPS quality periodically
            if (
              this.currentSession &&
              this.currentSession.recordMessages.length % 10 === 0
            ) {
              console.log(
                `🛰️ GPS Update: accuracy=${location.coords.accuracy}m, speed=${location.coords.speed}m/s`,
              );
            }
          } catch (error) {
            console.error("🛰️ Error processing GPS location:", error);
          }
        },
      );

      console.log("🛰️ Location tracking started successfully");
    } catch (error) {
      console.error("🛰️ Error starting location tracking:", error);
      throw error;
    }
  }

  private static async stopLocationTracking(): Promise<void> {
    try {
      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }

      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      console.log("Location tracking stopped");
    } catch (error) {
      console.error("Error stopping location tracking:", error);
    }
  }

  private static startRecordingTimer(): void {
    this.recordingTimer = setInterval(() => {
      if (this.currentSession && this.currentSession.status === "recording") {
        const now = new Date();

        // Calculate total elapsed time (wall clock)
        const totalElapsedTime = Math.floor(
          (now.getTime() - this.currentSession.startedAt.getTime()) / 1000,
        );

        // Calculate total timer time (active recording time)
        let currentTimerTime = this.totalTimerTime;
        if (this.lastResumeTime) {
          const activeTimeThisSession =
            (now.getTime() - this.lastResumeTime.getTime()) / 1000;
          currentTimerTime += activeTimeThisSession;
        }

        // Update live metrics

        this.currentSession.liveMetrics.totalElapsedTime = totalElapsedTime;
        this.currentSession.liveMetrics.totalTimerTime =
          Math.floor(currentTimerTime);

        // Save session periodically for recovery
        this.saveSessionToStorage();
      }
    }, 1000);
  }

  private static addRecordMessage(data: any): void {
    if (!this.currentSession) return;

    const recordMessage = {
      timestamp: new Date(),
      ...data,
    };

    this.currentSession.recordMessages.push(recordMessage);
  }

  private static addEventMessage(data: any): void {
    if (!this.currentSession) return;

    const eventMessage = {
      timestamp: new Date(),
      ...data,
    };

    this.currentSession.eventMessages.push(eventMessage);
  }

  private static updateLiveMetrics(dataPoint: SensorDataPoint): void {
    if (!this.currentSession) return;

    const { data } = dataPoint;
    const metrics = this.currentSession.liveMetrics;
    const records = this.currentSession.recordMessages;

    // Update distance (from GPS data)
    if (
      data.distance !== undefined &&
      data.distance > (metrics.distance || 0)
    ) {
      metrics.distance = data.distance;
    }

    // Update current instantaneous values
    if (data.speed !== undefined) {
      metrics.currentSpeed = data.speed;
      metrics.maxSpeed = Math.max(metrics.maxSpeed || 0, data.speed);
    }
    if (data.heartRate !== undefined) {
      metrics.currentHeartRate = data.heartRate;
      metrics.maxHeartRate = Math.max(
        metrics.maxHeartRate || 0,
        data.heartRate,
      );
      metrics.minHeartRate = Math.min(
        metrics.minHeartRate || 999,
        data.heartRate,
      );
    }
    if (data.power !== undefined) {
      metrics.currentPower = data.power;
      metrics.maxPower = Math.max(metrics.maxPower || 0, data.power);
    }
    if (data.cadence !== undefined) {
      metrics.currentCadence = data.cadence;
      metrics.maxCadence = Math.max(metrics.maxCadence || 0, data.cadence);
    }
    if (data.altitude !== undefined) {
      // Simple elevation gain calculation
      if (metrics.elevation === undefined) {
        metrics.elevation = 0;
      }
      const lastAltitude =
        records.length > 0 ? records[records.length - 1]?.altitude : undefined;
      if (lastAltitude && data.altitude > lastAltitude) {
        metrics.elevation += data.altitude - lastAltitude;
      }
    }

    // Calculate running averages (more efficient than recalculating all)
    if (records.length > 0) {
      // Heart Rate Average
      const heartRateRecords = records
        .filter((r) => r.heartRate)
        .map((r) => r.heartRate as number);
      if (heartRateRecords.length > 0) {
        metrics.avgHeartRate = Math.round(
          heartRateRecords.reduce((a, b) => a + b, 0) / heartRateRecords.length,
        );
      }

      // Power Average
      const powerRecords = records
        .filter((r) => r.power)
        .map((r) => r.power as number);
      if (powerRecords.length > 0) {
        metrics.avgPower = Math.round(
          powerRecords.reduce((a, b) => a + b, 0) / powerRecords.length,
        );
      }

      // Speed Average
      const speedRecords = records
        .filter((r) => r.speed && r.speed > 0)
        .map((r) => r.speed as number);
      if (speedRecords.length > 0) {
        metrics.avgSpeed =
          speedRecords.reduce((a, b) => a + b, 0) / speedRecords.length;
      }

      // Cadence Average
      const cadenceRecords = records
        .filter((r) => r.cadence)
        .map((r) => r.cadence as number);
      if (cadenceRecords.length > 0) {
        metrics.avgCadence = Math.round(
          cadenceRecords.reduce((a, b) => a + b, 0) / cadenceRecords.length,
        );
      }

      // Estimate calories burned (rough calculation)
      if (metrics.totalTimerTime && metrics.totalTimerTime > 0) {
        const timeHours = metrics.totalTimerTime / 3600;
        let caloriesPerHour = 300; // Base metabolic rate

        // Adjust based on heart rate if available
        if (metrics.avgHeartRate) {
          caloriesPerHour = Math.max(300, (metrics.avgHeartRate - 50) * 8);
        }

        // Adjust based on power if available
        if (metrics.avgPower) {
          caloriesPerHour = Math.max(caloriesPerHour, metrics.avgPower * 3.6);
        }

        metrics.calories = Math.round(caloriesPerHour * timeHours);
      }
    }

    // Log metrics update occasionally for debugging
    if (records.length % 20 === 0 && records.length > 0) {
      console.log("📊 Live Metrics Update:", {
        distance: metrics.distance
          ? `${(metrics.distance / 1000).toFixed(2)}km`
          : "0km",
        speed: metrics.currentSpeed
          ? `${metrics.currentSpeed.toFixed(1)}m/s`
          : "0m/s",
        hr: metrics.currentHeartRate || "N/A",
        power: metrics.currentPower || "N/A",
        duration: metrics.totalTimerTime || 0,
      });
    }
  }

  private static async saveSessionToStorage(): Promise<void> {
    if (!this.currentSession) return;

    try {
      await AsyncStorage.setItem(
        ACTIVE_RECORDING_KEY,
        JSON.stringify(this.currentSession),
      );
    } catch (error) {
      console.error("Error saving session to storage:", error);
    }
  }

  private static async flushBufferedData(): Promise<void> {
    if (this.sensorDataBuffer.length === 0 && this.gpsDataBuffer.length === 0) {
      return;
    }

    try {
      // Save buffered data for recovery
      const recoveryData = {
        sensorData: this.sensorDataBuffer,
        gpsData: this.gpsDataBuffer,
        timestamp: Date.now(),
      };

      await AsyncStorage.setItem(
        RECOVERY_DATA_KEY,
        JSON.stringify(recoveryData),
      );

      // Clear buffers
      this.sensorDataBuffer = [];
      this.gpsDataBuffer = [];
    } catch (error) {
      console.error("Error flushing buffered data:", error);
    }
  }

  private static async recoverFromInterruption(): Promise<void> {
    try {
      const sessionData = await AsyncStorage.getItem(ACTIVE_RECORDING_KEY);
      const recoveryData = await AsyncStorage.getItem(RECOVERY_DATA_KEY);

      if (sessionData) {
        const session: RecordingSession = JSON.parse(sessionData);

        if (session.status === "recording" || session.status === "paused") {
          console.log("Recovering interrupted session:", session.id);

          // Restore the session
          this.currentSession = session;

          // Restore buffered data if available
          if (recoveryData) {
            const recovery = JSON.parse(recoveryData);
            this.sensorDataBuffer = recovery.sensorData || [];
            this.gpsDataBuffer = recovery.gpsData || [];

            // Process recovered GPS data
            for (const gpsPoint of this.gpsDataBuffer) {
              this.addRecordMessage(gpsPoint);
            }
          }

          // Ask user what to do with the interrupted session
          Alert.alert(
            "Interrupted Activity Detected",
            "An activity recording was interrupted. Would you like to continue or discard it?",
            [
              {
                text: "Discard",
                style: "destructive",
                onPress: () => this.cleanupSession(),
              },
              {
                text: "Continue",
                onPress: () => {
                  if (session.status === "recording") {
                    this.resumeRecording();
                  }
                },
              },
            ],
          );
        }
      }
    } catch (error) {
      console.error("Error recovering from interruption:", error);
      // Clean up corrupted session data
      await this.cleanupSession();
    }
  }

  private static async cleanupSession(): Promise<void> {
    this.currentSession = null;
    this.totalTimerTime = 0;
    this.lastResumeTime = null;
    await AsyncStorage.removeItem(ACTIVE_RECORDING_KEY);
    await AsyncStorage.removeItem(RECOVERY_DATA_KEY);
    this.sensorDataBuffer = [];
    this.gpsDataBuffer = [];
  }

  private static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Calculate distance between two GPS points using Haversine formula
   */
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in meters
    return distance;
  }

  private static async saveActivityJson(
    session: RecordingSession,
  ): Promise<string | null> {
    try {
      const endTime = new Date();
      const activityData = {
        id: session.id,
        profileId: session.profileId,
        startedAt: session.startedAt.toISOString(),
        endedAt: endTime.toISOString(),
        recordMessages: session.recordMessages.map((msg) => ({
          ...msg,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp.toISOString()
              : msg.timestamp,
        })),
        eventMessages: session.eventMessages.map((msg) => ({
          ...msg,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp.toISOString()
              : msg.timestamp,
        })),
        hrMessages: session.hrMessages.map((msg) => ({
          ...msg,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp.toISOString()
              : msg.timestamp,
        })),
        hrvMessages:
          session.hrvMessages?.map((msg) => ({
            ...msg,
            timestamp:
              msg.timestamp instanceof Date
                ? msg.timestamp.toISOString()
                : msg.timestamp,
          })) || [],
        liveMetrics: session.liveMetrics,
        status: session.status,
      };

      // Use a consistent naming scheme
      const fileName = `${session.id}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(activityData, null, 2),
        {
          encoding: FileSystem.EncodingType.UTF8,
        },
      );

      console.log(`Activity JSON file created: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error saving activity JSON file:", error);
      return null;
    }
  }
}
