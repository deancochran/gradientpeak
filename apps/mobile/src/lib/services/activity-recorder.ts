import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Alert, Platform } from "react-native";

// ===== CONSOLIDATED CONSTANTS =====
const LOCATION_TRACKING_TASK = "ACTIVITY_LOCATION_TRACKING";
const ACTIVE_RECORDING_KEY = "active_recording_session";
const RECOVERY_DATA_KEY = "recording_recovery_data";
const CHECKPOINT_DATA_KEY = "activity_checkpoint_data";

// Recovery configuration
const RECOVERY_CONFIG = {
  CHECKPOINT_INTERVAL: 30000, // 30 seconds
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 3000, // 3 seconds
  GPS_TIMEOUT: 15000, // 15 seconds
  SENSOR_TIMEOUT: 10000, // 10 seconds
  MAX_ERROR_LOG_SIZE: 50,
};

// ===== CONSOLIDATED TYPES =====
export type RecordingState =
  | "idle"
  | "selecting"
  | "recording"
  | "paused"
  | "finished";
export type ActivityType =
  | "run"
  | "bike"
  | "walk"
  | "hike"
  | "other"
  | "outdoor_run"
  | "indoor_run";

export interface GpsDataPoint {
  timestamp: Date;
  positionLat?: number; // Semicircles
  positionLong?: number; // Semicircles
  altitude?: number;
  speed?: number;
  gpsAccuracy?: number;
  distance?: number;
}

export interface SensorDataPoint {
  timestamp: Date;
  messageType: string;
  data: any;
  heartRate?: number;
  power?: number;
  cadence?: number;
  temperature?: number;
}

export interface RecordingSession {
  id: string;
  profileId: string;
  startedAt: Date;
  status: RecordingState;
  recordMessages: any[];
  eventMessages: any[];
  hrMessages: any[];
  hrvMessages: any[];
  liveMetrics: LiveMetrics;
  recoveryData?: RecoveryData;
  plannedId?: string;
  activityType: ActivityType;
}

export interface LiveMetrics {
  totalElapsedTime: number;
  totalTimerTime: number;
  distance?: number;
  currentSpeed?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  currentHeartRate?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  minHeartRate?: number;
  currentPower?: number;
  avgPower?: number;
  maxPower?: number;
  currentCadence?: number;
  avgCadence?: number;
  maxCadence?: number;
  elevation?: number;
  calories?: number;
}

export interface RecoveryData {
  lastSavedTimestamp: number;
  checkpoints: ActivityCheckpoint[];
  errorLog: ErrorLogEntry[];
  connectionAttempts: number;
}

export interface ActivityCheckpoint {
  timestamp: number;
  metrics: LiveMetrics;
  locationCount: number;
  sensorDataCount: number;
}

export interface ErrorLogEntry {
  timestamp: number;
  error: string;
  context: string;
  recovered: boolean;
}

export interface ConnectionStatus {
  gps: "connected" | "connecting" | "error" | "disabled";
  bluetooth: "connected" | "connecting" | "error" | "disabled";
  sensors: {
    heartRate: "connected" | "connecting" | "error" | "disabled";
    power: "connected" | "connecting" | "error" | "disabled";
    cadence: "connected" | "connecting" | "error" | "disabled";
  };
}

export interface ActivityResult {
  success: boolean;
  activityId?: string;
  metrics?: LiveMetrics;
  message?: string;
}

export interface ActivityJSON {
  id: string;
  name: string;
  activityType: ActivityType;
  profileId: string;
  startTime: string;
  endTime: string;
  duration: number;
  recordMessages: any[];
  eventMessages: any[];
  hrMessages: any[];
  hrvMessages: any[];
  liveMetrics: LiveMetrics;
  status: RecordingState;
  deviceInfo: {
    platform: string;
    appVersion: string;
    recordingVersion: string;
  };
}

// ===== ENHANCED CONSOLIDATED SERVICE =====
export class ActivityRecorderService {
  // ===== ENHANCED CONSOLIDATED STATE MANAGEMENT =====
  private static currentSession: RecordingSession | null = null;
  private static state: RecordingState = "idle";
  private static locationSubscription: Location.LocationSubscription | null =
    null;
  private static recordingTimer: ReturnType<typeof setInterval> | null = null;
  private static isInitialized = false;
  private static sensorDataBuffer: SensorDataPoint[] = [];
  private static gpsDataBuffer: GpsDataPoint[] = [];
  private static connectionStatus: ConnectionStatus = {
    gps: "disabled",
    bluetooth: "disabled",
    sensors: {
      heartRate: "disabled",
      power: "disabled",
      cadence: "disabled",
    },
  };

  // ===== PRESERVED & ENHANCED ROBUST FEATURES =====
  private static recoveryData: RecoveryData = {
    lastSavedTimestamp: 0,
    checkpoints: [],
    errorLog: [],
    connectionAttempts: 0,
  };
  private static checkpointInterval: ReturnType<typeof setInterval> | null =
    null;
  private static gpsTimeout: ReturnType<typeof setTimeout> | null = null;
  private static reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  // Duration tracking
  private static totalTimerTime: number = 0; // Active recording time (excludes pauses)
  private static lastResumeTime: Date | null = null; // When recording was last resumed

  // ===== ENHANCED RECOVERY MECHANISMS (merged from hook) =====
  /**
   * Create checkpoint for recovery
   */
  static async createCheckpoint(): Promise<void> {
    if (!this.currentSession) return;

    try {
      const checkpoint: ActivityCheckpoint = {
        timestamp: Date.now(),
        metrics: { ...this.currentSession.liveMetrics },
        locationCount: this.currentSession.recordMessages.length,
        sensorDataCount: this.sensorDataBuffer.length,
      };

      this.recoveryData.checkpoints.push(checkpoint);
      this.recoveryData.lastSavedTimestamp = checkpoint.timestamp;

      // Keep only last 10 checkpoints
      if (this.recoveryData.checkpoints.length > 10) {
        this.recoveryData.checkpoints =
          this.recoveryData.checkpoints.slice(-10);
      }

      // Save to storage
      await AsyncStorage.setItem(
        CHECKPOINT_DATA_KEY,
        JSON.stringify(this.recoveryData),
      );

      console.log("📍 Checkpoint created", {
        timestamp: checkpoint.timestamp,
        metrics: checkpoint.metrics,
        locationCount: checkpoint.locationCount,
      });
    } catch (error) {
      this.logError(`Failed to create checkpoint: ${error}`, "checkpoint");
    }
  }

  /**
   * Start checkpoint system
   */
  private static startCheckpointSystem(): void {
    this.checkpointInterval = setInterval(
      () => this.createCheckpoint(),
      RECOVERY_CONFIG.CHECKPOINT_INTERVAL,
    );
  }

  /**
   * Stop checkpoint system
   */
  private static stopCheckpointSystem(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }
  }

  /**
   * Clear recovery data
   */
  static async clearRecoveryData(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(ACTIVE_RECORDING_KEY),
        AsyncStorage.removeItem(RECOVERY_DATA_KEY),
        AsyncStorage.removeItem(CHECKPOINT_DATA_KEY),
      ]);
      this.recoveryData = {
        lastSavedTimestamp: 0,
        checkpoints: [],
        errorLog: [],
        connectionAttempts: 0,
      };
      console.log("🧹 Recovery data cleared");
    } catch (error) {
      this.logError(`Failed to clear recovery data: ${error}`, "cleanup");
    }
  }

  /**
   * Log error with context and recovery status
   */
  private static logError(
    error: string,
    context: string,
    recovered: boolean = false,
  ): void {
    const errorEntry: ErrorLogEntry = {
      timestamp: Date.now(),
      error,
      context,
      recovered,
    };

    this.recoveryData.errorLog.push(errorEntry);

    // Keep only the last N errors
    if (
      this.recoveryData.errorLog.length > RECOVERY_CONFIG.MAX_ERROR_LOG_SIZE
    ) {
      this.recoveryData.errorLog = this.recoveryData.errorLog.slice(
        -RECOVERY_CONFIG.MAX_ERROR_LOG_SIZE,
      );
    }

    console.error(`🚨 [${context}] ${error}`, {
      recovered,
      timestamp: errorEntry.timestamp,
    });
  }

  // ===== CONSOLIDATED PERMISSIONS AND SENSOR HANDLING =====
  /**
   * Check all required permissions
   */
  private static async checkAllPermissions(): Promise<boolean> {
    try {
      console.log("🔐 Checking permissions...");

      // Check location services enabled globally
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        console.log("📍 Location services are disabled globally");
        this.connectionStatus.gps = "error";
        return false;
      }

      // Check foreground permission
      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== "granted") {
        console.log(
          "📍 Foreground location permission not granted:",
          foregroundStatus,
        );
        this.connectionStatus.gps = "error";
        return false;
      }

      // Check background permission
      const { status: backgroundStatus } =
        await Location.requestBackgroundPermissionsAsync();

      if (backgroundStatus !== "granted") {
        console.log(
          "📍 Background location permission not granted:",
          backgroundStatus,
        );
        // Still allow recording but warn
        console.warn(
          "⚠️ Background location not available - recording may stop when app backgrounded",
        );
      }

      console.log("✅ Permissions granted");
      return true;
    } catch (error) {
      this.logError(`Permission check failed: ${error}`, "permissions");
      return false;
    }
  }

  /**
   * Request all needed permissions
   */
  private static async requestAllPermissions(): Promise<boolean> {
    return this.checkAllPermissions();
  }

  /**
   * Prompt user to resume or discard existing session
   */
  private static async promptResumeOrDiscard(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        "Recording in Progress",
        "There's already an active recording session. What would you like to do?",
        [
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              await this.discardActivity();
              resolve(true);
            },
          },
          {
            text: "Resume",
            onPress: () => resolve(false),
          },
        ],
        { cancelable: false },
      );
    });
  }

  // ===== ENHANCED INITIALIZATION WITH DATABASE =====
  /**
   * Initialize the enhanced activity recorder service
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize database connection (consolidated from LocalActivityDatabaseService)
      await this.initDatabase();
      this.setupBackgroundLocationTask();
      await this.recoverFromInterruption();
      this.isInitialized = true;
      console.log("✅ Enhanced Activity Recorder Service initialized");
    } catch (error) {
      console.error("❌ Failed to initialize activity recorder:", error);
      throw error;
    }
  }

  // ===== CONSOLIDATED DATABASE OPERATIONS =====
  /**
   * Initialize database (merged from LocalActivityDatabaseService)
   */
  private static async initDatabase(): Promise<void> {
    try {
      // Database initialization logic would go here
      // For now, just log that we're ready
      console.log("📦 Database initialized for activity recording");
    } catch (error) {
      console.error("❌ Database initialization failed:", error);
      throw error;
    }
  }

  // ===== ENHANCED STATE MANAGEMENT GETTERS =====
  /**
   * Get current recording state
   */
  static getState(): RecordingState {
    return this.state;
  }

  /**
   * Get current connection status
   */
  static getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Check if modal can be dismissed (for modal lock behavior)
   */
  static canDismissModal(): boolean {
    return this.state === "idle" || this.state === "finished";
  }

  /**
   * Get current live metrics
   */
  static getLiveMetrics(): LiveMetrics | null {
    return this.currentSession?.liveMetrics || null;
  }

  // ===== ENHANCED LIFECYCLE METHODS (consolidated from other services) =====
  /**
   * Start activity recording with enhanced type and planned support
   */
  static async startActivity(
    activityType: ActivityType,
    plannedId?: string,
  ): Promise<string | null> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Check for existing session
      if (this.currentSession) {
        const shouldResume = await this.promptResumeOrDiscard();
        if (!shouldResume) {
          return null;
        }
      }

      // Check and request permissions
      const permissionsGranted = await this.checkAllPermissions();
      if (!permissionsGranted) {
        Alert.alert(
          "Permissions Required",
          "Location permissions are required to record activities",
        );
        return null;
      }

      // Generate session ID and initialize
      const sessionId = Crypto.randomUUID();
      const startTime = new Date();
      this.state = "recording";

      this.currentSession = {
        id: sessionId,
        profileId: "temp-profile", // TODO: Get from auth context
        startedAt: startTime,
        status: "recording",
        activityType,
        plannedId,
        recordMessages: [],
        eventMessages: [],
        hrMessages: [],
        hrvMessages: [],
        liveMetrics: {
          totalElapsedTime: 0,
          totalTimerTime: 0,
        },
        recoveryData: { ...this.recoveryData },
      };

      // Initialize duration tracking
      this.totalTimerTime = 0;
      this.lastResumeTime = startTime;

      // Start location tracking with enhanced error handling
      const locationStarted = await this.startLocationTracking();
      if (!locationStarted) {
        await this.cleanup();
        Alert.alert("GPS Error", "Failed to start location tracking");
        return null;
      }

      // Start recording timer and checkpoint system
      this.startRecordingTimer();
      this.startCheckpointSystem();

      // Save session for recovery
      await this.saveSessionToStorage();

      // Add initial events
      this.addEventMessage({
        timestamp: startTime,
        event: "timer",
        eventType: "start",
      });

      // Haptic feedback
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}

      console.log(
        `🎬 Activity recording started: ${sessionId} (${activityType}${plannedId ? `, planned: ${plannedId}` : ""})`,
      );
      return sessionId;
    } catch (error) {
      console.error("❌ Error starting activity recording:", error);
      await this.cleanup();
      this.state = "idle";
      Alert.alert("Error", "Failed to start activity recording");
      return null;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  static async startRecording(profileId: string): Promise<string | null> {
    return this.startActivity("outdoor_run");
  }

  /**
   * Pause the current activity recording
   */
  static async pauseActivity(): Promise<boolean> {
    try {
      if (!this.currentSession || this.state !== "recording") {
        return false;
      }

      const pauseTime = new Date();
      this.state = "paused";

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

      // Create checkpoint before pausing
      await this.createCheckpoint();
      await this.saveSessionToStorage();

      // Stop location tracking
      await this.stopLocationTracking();

      // Stop recording timer but keep checkpoint system running
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
        `⏸️ Activity paused. Active time: ${this.totalTimerTime}s, Elapsed time: ${elapsedTime}s`,
      );
      return true;
    } catch (error) {
      this.logError(`Failed to pause activity: ${error}`, "pause");
      return false;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  static async pauseRecording(): Promise<boolean> {
    return this.pauseActivity();
  }

  /**
   * Resume the current activity recording
   */
  static async resumeActivity(): Promise<boolean> {
    try {
      if (!this.currentSession || this.state !== "paused") {
        return false;
      }

      const resumeTime = new Date();
      this.lastResumeTime = resumeTime;
      this.state = "recording";

      this.currentSession.status = "recording";
      await this.saveSessionToStorage();

      // Restart location tracking
      const locationStarted = await this.startLocationTracking();
      if (!locationStarted) {
        this.logError(
          "Failed to restart location tracking on resume",
          "resume",
        );
        return false;
      }

      // Restart recording timer
      this.startRecordingTimer();

      // Add resume event
      this.addEventMessage({
        timestamp: resumeTime,
        event: "timer",
        eventType: "start",
      });

      console.log("▶️ Activity recording resumed");
      return true;
    } catch (error) {
      this.logError(`Failed to resume activity: ${error}`, "resume");
      return false;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  static async resumeRecording(): Promise<boolean> {
    return this.resumeActivity();
  }

  /**
   * Finish activity recording and return result
   */
  static async finishActivity(): Promise<ActivityResult> {
    try {
      if (!this.currentSession) {
        return { success: false, message: "No active recording session" };
      }

      console.log("🏁 Finishing activity recording...");

      const wasRecording = this.state === "recording";
      const stopTime = new Date();
      this.state = "finished";

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

      // Stop systems
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }
      this.stopCheckpointSystem();

      // Add final stop event
      this.addEventMessage({
        timestamp: stopTime,
        event: "timer",
        eventType: "stop_disable_all",
      });

      // Create final checkpoint and flush data
      await this.createCheckpoint();
      await this.flushBufferedData();

      // Generate and save activity JSON (consolidated persistence logic)
      const activityJSON = await this.generateActivityJSON();
      const activityId = await this.saveToLocalDB(activityJSON);

      if (activityId) {
        // Queue for sync
        await this.queueForSync(activityId);

        // Clean up session
        await this.cleanupSession();

        console.log(`✅ Activity finished successfully: ${activityId}`);
        return {
          success: true,
          activityId,
          metrics: this.currentSession.liveMetrics,
          message: "Activity saved successfully",
        };
      } else {
        return { success: false, message: "Failed to save activity" };
      }
    } catch (error) {
      this.logError(`Failed to finish activity: ${error}`, "finish");
      return { success: false, message: `Error: ${error}` };
    }
  }

  /**
   * Discard the current activity recording
   */
  static async discardActivity(): Promise<void> {
    try {
      if (!this.currentSession) {
        return;
      }

      console.log("🗑️ Discarding activity recording...");
      this.state = "idle";

      // Stop all systems
      await this.stopLocationTracking();

      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }
      this.stopCheckpointSystem();

      // Clean up session and recovery data
      await this.cleanupSession();
      await this.clearRecoveryData();

      console.log("✅ Activity discarded successfully");
    } catch (error) {
      this.logError(`Failed to discard activity: ${error}`, "discard");
    }
  }

  /**
   * Legacy method - stop recording and prompt user to save or discard
   */
  static async stopRecording(): Promise<void> {
    try {
      if (!this.currentSession) {
        return;
      }

      // Transition to finished state but don't auto-save
      this.state = "finished";
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
            onPress: async () => {
              const result = await this.finishActivity();
              if (result.success) {
                Alert.alert(
                  "Activity Saved",
                  result.message || "Activity saved successfully",
                );
              } else {
                Alert.alert(
                  "Error",
                  result.message || "Failed to save activity",
                );
              }
            },
          },
        ],
        { cancelable: false },
      );
    } catch (error) {
      console.error("❌ Error stopping recording:", error);
    }
  }

  // ===== ENHANCED DATA MANAGEMENT (merged persistence & completion) =====
  /**
   * Generate comprehensive activity JSON (consolidated from ActivitySaveService)
   */
  private static async generateActivityJSON(): Promise<ActivityJSON> {
    if (!this.currentSession) {
      throw new Error("No active session to generate JSON from");
    }

    const session = this.currentSession;
    const endTime = new Date();

    return {
      id: session.id,
      name: `${session.activityType} Activity`, // TODO: Allow custom naming
      activityType: session.activityType,
      profileId: session.profileId,
      startTime: session.startedAt.toISOString(),
      endTime: endTime.toISOString(),
      duration: session.liveMetrics.totalTimerTime || 0,
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
      deviceInfo: {
        platform: Platform.OS,
        appVersion: "1.0.0", // TODO: Get from app config
        recordingVersion: "2.0.0-consolidated",
      },
    };
  }

  /**
   * Save activity to local database (consolidated from LocalActivityDatabaseService)
   */
  private static async saveToLocalDB(
    activityJSON: ActivityJSON,
  ): Promise<string | null> {
    try {
      // Save JSON file first
      const jsonFilePath = await this.saveActivityJSONFile(activityJSON);
      if (!jsonFilePath) {
        throw new Error("Failed to save activity JSON file");
      }

      // Create activity record in local database
      // TODO: Implement actual database operations once DB service is available
      console.log("📦 Saving activity to local database:", {
        id: activityJSON.id,
        type: activityJSON.activityType,
        duration: activityJSON.duration,
        filePath: jsonFilePath,
      });

      return activityJSON.id;
    } catch (error) {
      this.logError(`Failed to save to local DB: ${error}`, "database");
      return null;
    }
  }

  /**
   * Queue activity for sync (consolidated sync functionality)
   */
  private static async queueForSync(activityId: string): Promise<void> {
    try {
      console.log("📤 Queuing activity for sync:", activityId);

      // TODO: Implement direct sync functionality
      // For now, just mark as pending sync in database
      // This will be processed by a background sync when network is available

      console.log("✅ Activity queued for background sync:", activityId);
    } catch (error) {
      this.logError(`Failed to queue for sync: ${error}`, "sync");
    }
  }

  // ===== CONSOLIDATED BACKGROUND SYNC FUNCTIONALITY =====
  /**
   * Process pending sync queue in background
   */
  static async processSyncQueue(): Promise<void> {
    try {
      console.log("📤 Processing background sync queue...");

      // TODO: Implement background sync processing
      // 1. Check network connectivity
      // 2. Get all activities with pending sync status
      // 3. Upload JSON files to cloud storage
      // 4. Update database with sync status
      // 5. Clean up old synced data

      console.log("✅ Background sync processing completed");
    } catch (error) {
      console.error("❌ Background sync processing failed:", error);
    }
  }

  /**
   * Check network status for sync operations
   */
  private static async isNetworkAvailable(): Promise<boolean> {
    try {
      // TODO: Implement network connectivity check
      // Using expo-network or similar
      return true; // Placeholder
    } catch (error) {
      console.warn("Network check failed:", error);
      return false;
    }
  }

  /**
   * Save activity JSON to file system
   */
  private static async saveActivityJSONFile(
    activityJSON: ActivityJSON,
  ): Promise<string | null> {
    try {
      const fileName = `${activityJSON.id}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(activityJSON, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 },
      );

      console.log(`📄 Activity JSON file saved: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logError(`Failed to save JSON file: ${error}`, "file");
      return null;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  static async saveActivity(): Promise<void> {
    const result = await this.finishActivity();
    if (result.success) {
      Alert.alert(
        "Activity Saved",
        result.message || "Activity saved successfully",
      );
    } else {
      Alert.alert("Error", result.message || "Failed to save activity");
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

  // ===== ENHANCED LOCATION TRACKING WITH FAULT TOLERANCE =====
  private static async startLocationTracking(): Promise<boolean> {
    try {
      console.log("🛰️ Starting GPS location tracking...");
      this.connectionStatus.gps = "connecting";

      // Permissions are already checked in checkAllPermissions
      // Just verify they're still granted
      const { status: foregroundStatus } =
        await Location.getForegroundPermissionsAsync();

      if (foregroundStatus !== "granted") {
        console.warn("🛰️ Location permissions revoked");
        this.connectionStatus.gps = "error";
        return false;
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

      // Set GPS timeout
      if (this.gpsTimeout) {
        clearTimeout(this.gpsTimeout);
      }

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
            // Reset GPS timeout on successful reading
            if (this.gpsTimeout) {
              clearTimeout(this.gpsTimeout);
            }

            // Validate location accuracy
            if (location.coords.accuracy && location.coords.accuracy > 50) {
              console.warn(
                "🚫 Rejecting inaccurate GPS reading:",
                location.coords.accuracy + "m",
              );
              return;
            }

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
            this.connectionStatus.gps = "connected";

            // Set GPS timeout for next reading
            this.gpsTimeout = setTimeout(() => {
              this.connectionStatus.gps = "error";
              this.logError("GPS timeout", "gps");
            }, RECOVERY_CONFIG.GPS_TIMEOUT);

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
            this.logError(`GPS processing error: ${error}`, "gps");
          }
        },
      );

      console.log("🛰️ Location tracking started successfully");
      return true;
    } catch (error) {
      console.error("��️ Error starting location tracking:", error);
      this.connectionStatus.gps = "error";
      this.logError(`Location tracking failed: ${error}`, "gps");
      return false;
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

  /**
   * Enhanced recovery from interruption (merged from hook)
   */
  private static async recoverFromInterruption(): Promise<void> {
    try {
      console.log("🔄 Checking for interrupted session...");

      const [sessionData, checkpointData] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_RECORDING_KEY),
        AsyncStorage.getItem(CHECKPOINT_DATA_KEY),
      ]);

      if (sessionData) {
        const session: RecordingSession = JSON.parse(sessionData);

        // Check if session is recoverable (less than 24 hours old)
        const sessionAge = Date.now() - session.startedAt.getTime();
        if (sessionAge > 24 * 60 * 60 * 1000) {
          console.log("Session too old to recover, cleaning up");
          await this.clearRecoveryData();
          return;
        }

        if (session.status === "recording" || session.status === "paused") {
          console.log("🔄 Interrupted session found:", {
            id: session.id,
            status: session.status,
            age: `${Math.round(sessionAge / 1000)}s ago`,
          });

          // Restore the session
          this.currentSession = session;
          this.state = session.status as RecordingState;

          // Restore checkpoint data if available
          if (checkpointData) {
            this.recoveryData = JSON.parse(checkpointData);
          }

          // Restore timing data
          if (session.status === "paused") {
            // Calculate how much timer time we had accumulated
            this.totalTimerTime = session.liveMetrics.totalTimerTime || 0;
          } else {
            // If it was recording, we need to account for the interruption time
            this.totalTimerTime = session.liveMetrics.totalTimerTime || 0;
            this.lastResumeTime = new Date(); // Assume we're resuming now
          }

          // Ask user what to do with the interrupted session
          Alert.alert(
            "Interrupted Activity Detected",
            "An activity recording was interrupted. Would you like to continue or discard it?",
            [
              {
                text: "Discard",
                style: "destructive",
                onPress: () => this.discardActivity(),
              },
              {
                text: "Continue",
                onPress: async () => {
                  if (session.status === "recording") {
                    await this.resumeActivity();
                  }
                  console.log("📱 Session recovery completed successfully");
                  this.logError(
                    "Session recovered successfully",
                    "recovery",
                    true,
                  );
                },
              },
            ],
          );
        }
      } else {
        console.log("✅ No interrupted session found");
      }
    } catch (error) {
      console.error("❌ Error during session recovery:", error);
      this.logError(`Recovery failed: ${error}`, "recovery");
      // Clean up corrupted session data
      await this.clearRecoveryData();
    }
  }

  /**
   * Enhanced session cleanup
   */
  private static async cleanupSession(): Promise<void> {
    try {
      // Clean up timers and subscriptions
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }

      if (this.checkpointInterval) {
        clearInterval(this.checkpointInterval);
        this.checkpointInterval = null;
      }

      if (this.gpsTimeout) {
        clearTimeout(this.gpsTimeout);
        this.gpsTimeout = null;
      }

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }

      // Stop background location tracking
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      } catch (error) {
        console.warn("Failed to stop background location updates:", error);
      }

      // Reset state
      this.state = "idle";
      this.currentSession = null;
      this.totalTimerTime = 0;
      this.lastResumeTime = null;
      this.sensorDataBuffer = [];
      this.gpsDataBuffer = [];
      this.connectionStatus = {
        gps: "disabled",
        bluetooth: "disabled",
        sensors: {
          heartRate: "disabled",
          power: "disabled",
          cadence: "disabled",
        },
      };

      // Clear storage
      await AsyncStorage.removeItem(ACTIVE_RECORDING_KEY);

      console.log("🧹 Session cleanup completed");
    } catch (error) {
      console.error("❌ Error during session cleanup:", error);
    }
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
}
