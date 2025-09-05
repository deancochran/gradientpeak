import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Alert } from "react-native";

import type {
  GpsDataPoint,
  RecordingSession,
  SensorDataPoint,
} from "../types/activity";
import { FitFileService } from "./fit-file-service";
import { LocalActivityDatabaseService } from "./local-activity-database";

const LOCATION_TRACKING_TASK = "ACTIVITY_LOCATION_TRACKING";
const ACTIVE_RECORDING_KEY = "active_recording_session";
const RECOVERY_DATA_KEY = "recording_recovery_data";

export class ActivityRecorderService {
  private static currentSession: RecordingSession | null = null;
  private static locationSubscription: Location.LocationSubscription | null =
    null;
  private static recordingTimer: NodeJS.Timeout | null = null;
  private static isInitialized = false;
  private static sensorDataBuffer: SensorDataPoint[] = [];
  private static gpsDataBuffer: GpsDataPoint[] = [];

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

      const sessionId = `session_${Date.now()}`;
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
          duration: 0,
        },
      };

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

      this.currentSession.status = "paused";
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
        timestamp: new Date(),
        event: "timer",
        eventType: "stop",
      });

      console.log("Activity recording paused");
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

      this.currentSession.status = "recording";
      await this.saveSessionToStorage();

      // Restart location tracking
      await this.startLocationTracking();

      // Restart recording timer
      this.startRecordingTimer();

      // Add resume event
      this.addEventMessage({
        timestamp: new Date(),
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
      this.currentSession.status = "stopped";

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

      // Generate FIT file
      const fitFilePath = await FitFileService.generateActivityFile(session);
      if (!fitFilePath) {
        throw new Error("Failed to generate FIT file");
      }

      // Parse the generated FIT file to extract metadata
      const metadata = await FitFileService.parseActivityFile(fitFilePath);

      // Save activity to local database
      const activityId = await LocalActivityDatabaseService.createActivity({
        id: session.id,
        profile_id: session.profileId,
        local_fit_file_path: fitFilePath,
        sync_status: "local_only",
        created_at: Date.now(),
        updated_at: Date.now(),
        cached_metadata: metadata ? JSON.stringify(metadata) : undefined,
      });

      // Clean up
      await this.cleanupSession();

      Alert.alert(
        "Activity Saved",
        `Your activity has been saved locally and will sync when connected.`,
        [{ text: "OK" }],
      );

      console.log(`Activity saved: ${activityId}`);
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
      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();
      const { status: backgroundStatus } =
        await Location.requestBackgroundPermissionsAsync();

      if (foregroundStatus !== "granted" || backgroundStatus !== "granted") {
        console.warn("Location permissions not granted");
        return;
      }

      // Start background location updates
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 2,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Recording Activity",
          notificationBody: "TurboFit is tracking your activity",
          notificationColor: "#ff6600",
        },
      });

      // Start foreground location tracking for immediate updates
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 2,
        },
        (location) => {
          const gpsPoint: GpsDataPoint = {
            timestamp: new Date(location.timestamp),
            positionLat: location.coords.latitude * 11930464.7111,
            positionLong: location.coords.longitude * 11930464.7111,
            altitude: location.coords.altitude || undefined,
            speed: location.coords.speed || undefined,
            gpsAccuracy: location.coords.accuracy || undefined,
          };

          this.addRecordMessage(gpsPoint);
        },
      );

      console.log("Location tracking started");
    } catch (error) {
      console.error("Error starting location tracking:", error);
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
        const duration = Math.floor(
          (new Date().getTime() - this.currentSession.startedAt.getTime()) /
            1000,
        );
        this.currentSession.liveMetrics.duration = duration;

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

    // Update distance
    if (
      data.distance !== undefined &&
      data.distance > (metrics.distance || 0)
    ) {
      metrics.distance = data.distance;
    }

    // Update current values
    if (data.speed !== undefined) {
      metrics.currentSpeed = data.speed;
    }
    if (data.heartRate !== undefined) {
      metrics.currentHeartRate = data.heartRate;
    }
    if (data.power !== undefined) {
      metrics.currentPower = data.power;
    }
    if (data.cadence !== undefined) {
      metrics.currentCadence = data.cadence;
    }

    // Calculate averages (simplified)
    const records = this.currentSession.recordMessages;
    if (records.length > 0) {
      const heartRates = records
        .filter((r) => r.heartRate)
        .map((r) => r.heartRate);
      if (heartRates.length > 0) {
        metrics.avgHeartRate = Math.round(
          heartRates.reduce((a, b) => a + b, 0) / heartRates.length,
        );
      }

      const powers = records.filter((r) => r.power).map((r) => r.power);
      if (powers.length > 0) {
        metrics.avgPower = Math.round(
          powers.reduce((a, b) => a + b, 0) / powers.length,
        );
      }
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
}
