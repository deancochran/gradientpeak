import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { ActivityRecording } from "../hooks/useEnhancedActivityRecording";
import { LocalActivityDatabaseService } from "./local-activity-database";

const STORAGE_KEYS = {
  ACTIVITY_RECORDS: "@activity_records",
  ACTIVITY_STREAMS: "@activity_streams",
  PENDING_SYNC: "@pending_sync_activities",
  COMPLETION_QUEUE: "@activity_completion_queue",
};

const DEFAULT_OPTIONS: CompletionWorkflowOptions = {
  uploadToCloud: true,
  createStreams: true,
  calculateMetrics: true,
  saveLocalJson: true,
};

class ActivityCompletionService {
  /**
   * Complete activity recording workflow
   * Generates JSON, saves locally, and queues for cloud sync
   */
  static async completeActivity(
    recording: ActivityRecording,
    profileId: string,
    activityName: string,
    activityType: string = "cycling",
    options: CompletionWorkflowOptions = DEFAULT_OPTIONS,
  ): Promise<{
    activityRecord: ActivityRecord;
    activityStreams?: ActivityStreams;
    success: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let activityRecord: ActivityRecord;
    let activityStreams: ActivityStreams | undefined;

    try {
      console.log(
        "🏁 Starting activity completion workflow for:",
        recording.id,
      );

      // Step 1: Generate Activity Record JSON
      activityRecord = await this.generateActivityRecord(
        recording,
        profileId,
        activityName,
        activityType,
        options,
      );

      // Step 2: Generate Activity Streams JSON (if requested)
      if (options.createStreams) {
        try {
          activityStreams = await this.generateActivityStreams(
            recording,
            activityRecord.id,
          );
        } catch (error) {
          errors.push(`Stream generation failed: ${error}`);
          console.warn("⚠️ Stream generation failed:", error);
        }
      }

      // Step 3: Save to local storage
      await this.saveToLocalStorage(activityRecord, activityStreams);

      // Step 4: Save JSON file locally and update database (if requested)
      let jsonFilePath: string | undefined;
      if (options.saveLocalJson) {
        try {
          jsonFilePath = await this.saveJsonToLocalFile(
            recording,
            activityRecord,
            activityStreams,
          );

          // Save to local database with JSON file path
          await LocalActivityDatabaseService.createActivity({
            id: activityRecord.id,
            name: activityRecord.name,
            activityType: activityRecord.activityType,
            startDate: new Date(activityRecord.startTime),
            totalDistance: activityRecord.distance,
            totalTime: activityRecord.totalTime,
            profileId: activityRecord.profileId,
            localStoragePath: jsonFilePath,
            avgHeartRate: activityRecord.averageHeartRate,
            maxHeartRate: activityRecord.maxHeartRate,
            avgPower: activityRecord.averagePower,
            maxPower: activityRecord.maxPower,
            avgCadence: activityRecord.averageCadence,
            elevationGain: activityRecord.elevation?.gain,
            calories: activityRecord.calories,
            tss: activityRecord.trainingStressScore,
            syncStatus: "pending",
            syncAttempts: 0,
          });
        } catch (error) {
          errors.push(`JSON file save failed: ${error}`);
          console.warn("⚠️ JSON file save failed:", error);
        }
      }

      // Step 5: Queue for cloud sync (if requested)
      if (options.uploadToCloud && jsonFilePath) {
        await this.queueForCloudSync(activityRecord.id);
        console.log(`🔄 Activity queued for cloud sync: ${activityRecord.id}`);
      }

      console.log("✅ Activity completion workflow finished successfully");
      return {
        activityRecord,
        activityStreams,
        success: true,
        errors,
      };
    } catch (error) {
      console.error("❌ Activity completion workflow failed:", error);
      errors.push(`Workflow failed: ${error}`);

      // Return partial result if we at least got the activity record
      if (activityRecord!) {
        return {
          activityRecord: activityRecord!,
          activityStreams,
          success: false,
          errors,
        };
      }

      throw new Error(`Activity completion failed: ${errors.join(", ")}`);
    }
  }

  /**
   * Generate comprehensive Activity Record JSON
   */
  private static async generateActivityRecord(
    recording: ActivityRecording,
    profileId: string,
    activityName: string,
    activityType: string,
    options: CompletionWorkflowOptions,
  ): Promise<ActivityRecord> {
    const startTime = new Date(recording.startTime);
    const endTime = new Date(
      recording.startTime + recording.metrics.duration * 1000,
    );

    // Calculate advanced metrics
    const advancedMetrics = options.calculateMetrics
      ? await this.calculateAdvancedMetrics(recording)
      : {};

    // Generate zones if we have heart rate or power data
    const zones = await this.calculateZoneDistribution(recording);

    // Get device info
    const deviceInfo = await this.getDeviceInfo();

    const activityRecord: ActivityRecord = {
      id: recording.id,
      profileId,
      name: activityName,
      activityType,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalTime: recording.metrics.duration,
      movingTime: this.calculateMovingTime(recording),
      distance: recording.metrics.distance,
      elevation: this.calculateElevation(recording),
      calories: recording.metrics.calories || 0,
      averageSpeed: recording.metrics.avgSpeed,
      maxSpeed: this.calculateMaxSpeed(recording),
      averageHeartRate: this.calculateAverageHeartRate(recording),
      maxHeartRate: this.calculateMaxHeartRate(recording),
      averagePower: this.calculateAveragePower(recording),
      normalizedPower: advancedMetrics.normalizedPower,
      maxPower: this.calculateMaxPower(recording),
      averageCadence: this.calculateAverageCadence(recording),
      maxCadence: this.calculateMaxCadence(recording),
      trainingStressScore: advancedMetrics.trainingStressScore,
      intensityFactor: advancedMetrics.intensityFactor,
      zones,
      metadata: {
        deviceInfo,
        appVersion: this.getAppVersion(),
        recordingVersion: "2.0.0",
        createdAt: new Date().toISOString(),
        syncStatus: "pending" as const,
        syncAttempts: 0,
      },
    };

    return activityRecord;
  }

  /**
   * Generate Activity Streams JSON with optimized data structure
   */
  private static async generateActivityStreams(
    recording: ActivityRecording,
    activityId: string,
  ): Promise<ActivityStreams> {
    const resolution = 1; // 1 second resolution
    const streams: ActivityStreams["streams"] = {};
    const streamTypes: string[] = [];

    // Time stream (always present)
    const timePoints = Array.from(
      { length: recording.metrics.duration },
      (_, i) => i,
    );
    streams.time = timePoints;
    streamTypes.push("time");

    // Location streams
    if (recording.locations && recording.locations.length > 0) {
      const locationStream = this.interpolateLocationData(
        recording.locations,
        resolution,
      );
      streams.location = locationStream.map((loc) => ({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude,
      }));
      streamTypes.push("location");

      // Distance stream
      streams.distance = this.calculateDistanceStream(locationStream);
      streamTypes.push("distance");

      // Speed stream
      streams.speed = this.calculateSpeedStream(locationStream);
      streamTypes.push("speed");

      // Altitude stream
      if (locationStream.some((loc) => loc.coords.altitude)) {
        streams.altitude = locationStream.map(
          (loc) => loc.coords.altitude || 0,
        );
        streamTypes.push("altitude");
      }

      // Grade stream
      if (streams.altitude) {
        streams.grade = this.calculateGradeStream(
          streams.distance,
          streams.altitude,
        );
        streamTypes.push("grade");
      }
    }

    // Sensor data streams
    if (recording.sensorData && recording.sensorData.length > 0) {
      const sensorStreams = this.interpolateSensorData(
        recording.sensorData,
        resolution,
      );

      if (sensorStreams.heartRate) {
        streams.heartRate = sensorStreams.heartRate;
        streamTypes.push("heartRate");
      }

      if (sensorStreams.power) {
        streams.power = sensorStreams.power;
        streamTypes.push("power");
      }

      if (sensorStreams.cadence) {
        streams.cadence = sensorStreams.cadence;
        streamTypes.push("cadence");
      }

      if (sensorStreams.temperature) {
        streams.temperature = sensorStreams.temperature;
        streamTypes.push("temperature");
      }
    }

    const totalPoints = Math.max(
      ...Object.values(streams).map((stream) =>
        Array.isArray(stream) ? stream.length : 0,
      ),
    );

    return {
      id: `${activityId}_streams`,
      activityId,
      streams,
      resolution,
      metadata: {
        totalPoints,
        streamTypes,
        createdAt: new Date().toISOString(),
        compressionLevel: 1, // Future: implement compression
      },
    };
  }

  /**
   * Save activity data to local storage with proper indexing
   */
  private static async saveToLocalStorage(
    activityRecord: ActivityRecord,
    activityStreams?: ActivityStreams,
  ): Promise<void> {
    try {
      // Save activity record
      const existingRecords = await this.getStoredActivityRecords();
      existingRecords[activityRecord.id] = activityRecord;
      await AsyncStorage.setItem(
        STORAGE_KEYS.ACTIVITY_RECORDS,
        JSON.stringify(existingRecords),
      );

      // Save activity streams if present
      if (activityStreams) {
        const existingStreams = await this.getStoredActivityStreams();
        existingStreams[activityStreams.id] = activityStreams;
        await AsyncStorage.setItem(
          STORAGE_KEYS.ACTIVITY_STREAMS,
          JSON.stringify(existingStreams),
        );
      }

      console.log(
        "💾 Activity data saved to local storage:",
        activityRecord.id,
      );
    } catch (error) {
      throw new Error(`Failed to save to local storage: ${error}`);
    }
  }

  /**
   * Queue activity for cloud synchronization
   */
  private static async queueForCloudSync(activityId: string): Promise<void> {
    try {
      const pendingSyncData = await AsyncStorage.getItem(
        STORAGE_KEYS.PENDING_SYNC,
      );
      const pendingSync = pendingSyncData ? JSON.parse(pendingSyncData) : {};

      pendingSync[activityId] = {
        id: activityId,
        queuedAt: new Date().toISOString(),
        attempts: 0,
        priority: 1, // Higher priority for recent activities
      };

      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_SYNC,
        JSON.stringify(pendingSync),
      );
      console.log("☁️ Activity queued for cloud sync:", activityId);

      // Trigger sync process (non-blocking)
      this.attemptCloudSync(activityId).catch((error) =>
        console.warn("Cloud sync attempt failed:", error),
      );
    } catch (error) {
      throw new Error(`Failed to queue for sync: ${error}`);
    }
  }

  /**
   * Attempt to sync activity to cloud
   */
  private static async attemptCloudSync(activityId: string): Promise<boolean> {
    try {
      // The actual cloud sync is handled by ActivitySyncService
      // This method just logs the attempt
      console.log(
        "☁️ Cloud sync will be handled by ActivitySyncService:",
        activityId,
      );
      return true;
    } catch (error) {
      console.error("❌ Cloud sync attempt failed:", error);
      return false;
    }
  }

  /**
   * Save JSON file locally (replaces FIT file generation)
   */
  private static async saveJsonToLocalFile(
    recording: ActivityRecording,
    activityRecord: ActivityRecord,
    activityStreams?: ActivityStreams,
  ): Promise<string> {
    try {
      const activityData = {
        activityRecord,
        activityStreams,
        rawRecording: {
          id: recording.id,
          startTime: recording.startTime,
          endTime: new Date().toISOString(),
          sensorData: recording.sensorData,
          gpsData: recording.locations,
          laps: [],
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          appVersion: this.getAppVersion(),
          deviceInfo: await this.getDeviceInfo(),
        },
      };

      // Ensure activities directory exists
      const activitiesDir = `${FileSystem.documentDirectory}activities/`;
      const dirInfo = await FileSystem.getInfoAsync(activitiesDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(activitiesDir, {
          intermediates: true,
        });
      }

      // Use FileSystem to save JSON to app's documents directory
      const fileName = `activity_${activityRecord.id}_${Date.now()}.json`;
      const filePath = `${activitiesDir}${fileName}`;

      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(activityData, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 },
      );

      console.log("📁 JSON file saved locally:", filePath);
      return filePath;
    } catch (error) {
      throw new Error(`Failed to save JSON file locally: ${error}`);
    }
  }

  /**
   * Calculate advanced training metrics
   */
  private static async calculateAdvancedMetrics(
    _recording: ActivityRecording,
  ): Promise<{
    normalizedPower?: number;
    trainingStressScore?: number;
    intensityFactor?: number;
  }> {
    // TODO: Implement advanced metrics calculation
    // This would calculate NP, TSS, IF based on power data
    return {};
  }

  /**
   * Calculate zone distribution for heart rate and power
   */
  private static async calculateZoneDistribution(
    _recording: ActivityRecording,
  ): Promise<{
    heartRate?: ZoneDistribution;
    power?: ZoneDistribution;
  }> {
    // TODO: Implement zone calculation based on user's FTP and max HR
    return {};
  }

  // Helper methods for metric calculations
  private static calculateMovingTime(recording: ActivityRecording): number {
    // Calculate time when speed > 1 m/s
    return recording.locations.filter(
      (loc) => loc.coords.speed && loc.coords.speed > 1,
    ).length;
  }

  private static calculateElevation(recording: ActivityRecording) {
    const altitudes = recording.locations
      .map((loc) => loc.coords.altitude)
      .filter((alt): alt is number => alt !== undefined);

    if (altitudes.length === 0) return undefined;

    let gain = 0;
    let loss = 0;

    for (let i = 1; i < altitudes.length; i++) {
      const diff = altitudes[i] - altitudes[i - 1];
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }

    return {
      gain: Math.round(gain),
      loss: Math.round(loss),
      max: Math.max(...altitudes),
      min: Math.min(...altitudes),
    };
  }

  private static calculateMaxSpeed(recording: ActivityRecording): number {
    const speeds = recording.locations
      .map((loc) => loc.coords.speed)
      .filter((speed): speed is number => speed !== undefined);

    return speeds.length > 0 ? Math.max(...speeds) : 0;
  }

  private static calculateAverageHeartRate(
    recording: ActivityRecording,
  ): number | undefined {
    const hrData = recording.sensorData
      .filter((data) => data.heartRate)
      .map((data) => data.heartRate);

    return hrData.length > 0
      ? hrData.reduce((a, b) => a + b, 0) / hrData.length
      : undefined;
  }

  private static calculateMaxHeartRate(
    recording: ActivityRecording,
  ): number | undefined {
    const hrData = recording.sensorData
      .filter((data) => data.heartRate)
      .map((data) => data.heartRate);

    return hrData.length > 0 ? Math.max(...hrData) : undefined;
  }

  private static calculateAveragePower(
    recording: ActivityRecording,
  ): number | undefined {
    const powerData = recording.sensorData
      .filter((data) => data.power && data.power > 0)
      .map((data) => data.power);

    return powerData.length > 0
      ? powerData.reduce((a, b) => a + b, 0) / powerData.length
      : undefined;
  }

  private static calculateMaxPower(
    recording: ActivityRecording,
  ): number | undefined {
    const powerData = recording.sensorData
      .filter((data) => data.power)
      .map((data) => data.power);

    return powerData.length > 0 ? Math.max(...powerData) : undefined;
  }

  private static calculateAverageCadence(
    recording: ActivityRecording,
  ): number | undefined {
    const cadenceData = recording.sensorData
      .filter((data) => data.cadence && data.cadence > 0)
      .map((data) => data.cadence);

    return cadenceData.length > 0
      ? cadenceData.reduce((a, b) => a + b, 0) / cadenceData.length
      : undefined;
  }

  private static calculateMaxCadence(
    recording: ActivityRecording,
  ): number | undefined {
    const cadenceData = recording.sensorData
      .filter((data) => data.cadence)
      .map((data) => data.cadence);

    return cadenceData.length > 0 ? Math.max(...cadenceData) : undefined;
  }

  // Stream processing helpers
  private static interpolateLocationData(
    locations: any[],
    resolution: number,
  ): any[] {
    // TODO: Implement proper interpolation for consistent time intervals
    return locations;
  }

  private static calculateDistanceStream(_locations: any[]): number[] {
    // TODO: Implement cumulative distance calculation
    return [];
  }

  private static calculateSpeedStream(locations: any[]): number[] {
    // TODO: Implement speed calculation from position changes
    return [];
  }

  private static calculateGradeStream(
    distance: number[],
    altitude: number[],
  ): number[] {
    // TODO: Implement grade calculation
    return [];
  }

  private static interpolateSensorData(
    sensorData: any[],
    resolution: number,
  ): {
    heartRate?: number[];
    power?: number[];
    cadence?: number[];
    temperature?: number[];
  } {
    // TODO: Implement sensor data interpolation
    return {};
  }

  // Storage helpers
  private static async getStoredActivityRecords(): Promise<
    Record<string, ActivityRecord>
  > {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVITY_RECORDS);
    return data ? JSON.parse(data) : {};
  }

  private static async getStoredActivityStreams(): Promise<
    Record<string, ActivityStreams>
  > {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVITY_STREAMS);
    return data ? JSON.parse(data) : {};
  }

  private static async getActivityRecord(
    id: string,
  ): Promise<ActivityRecord | null> {
    const records = await this.getStoredActivityRecords();
    return records[id] || null;
  }

  private static async getActivityStreams(
    id: string,
  ): Promise<ActivityStreams | null> {
    const streams = await this.getStoredActivityStreams();
    return streams[id] || null;
  }

  private static async updateActivityRecord(
    activityRecord: ActivityRecord,
  ): Promise<void> {
    const records = await this.getStoredActivityRecords();
    records[activityRecord.id] = activityRecord;
    await AsyncStorage.setItem(
      STORAGE_KEYS.ACTIVITY_RECORDS,
      JSON.stringify(records),
    );
  }

  private static async removeFromSyncQueue(activityId: string): Promise<void> {
    const pendingSyncData = await AsyncStorage.getItem(
      STORAGE_KEYS.PENDING_SYNC,
    );
    if (!pendingSyncData) return;

    const pendingSync = JSON.parse(pendingSyncData);
    delete pendingSync[activityId];
    await AsyncStorage.setItem(
      STORAGE_KEYS.PENDING_SYNC,
      JSON.stringify(pendingSync),
    );
  }

  // Device/app info helpers
  private static async getDeviceInfo(): Promise<string> {
    // TODO: Get actual device info
    return "iOS/Android Device";
  }

  private static getAppVersion(): string {
    // TODO: Get actual app version
    return "2.0.0";
  }

  /**
   * Get all activity records
   */
  static async getAllActivityRecords(): Promise<ActivityRecord[]> {
    const records = await this.getStoredActivityRecords();
    return Object.values(records).sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }

  /**
   * Get activity record by ID
   */
  static async getActivityRecordById(
    id: string,
  ): Promise<ActivityRecord | null> {
    return this.getActivityRecord(id);
  }

  /**
   * Get activity streams by activity ID
   */
  static async getActivityStreamsById(
    activityId: string,
  ): Promise<ActivityStreams | null> {
    return this.getActivityStreams(`${activityId}_streams`);
  }

  /**
   * Delete activity record and streams
   */
  static async deleteActivity(activityId: string): Promise<void> {
    const records = await this.getStoredActivityRecords();
    const streams = await this.getStoredActivityStreams();

    delete records[activityId];
    delete streams[`${activityId}_streams`];

    await Promise.all([
      AsyncStorage.setItem(
        STORAGE_KEYS.ACTIVITY_RECORDS,
        JSON.stringify(records),
      ),
      AsyncStorage.setItem(
        STORAGE_KEYS.ACTIVITY_STREAMS,
        JSON.stringify(streams),
      ),
    ]);
  }

  /**
   * Process pending sync queue
   */
  static async processPendingSyncs(): Promise<void> {
    const pendingSyncData = await AsyncStorage.getItem(
      STORAGE_KEYS.PENDING_SYNC,
    );
    if (!pendingSyncData) return;

    const pendingSync = JSON.parse(pendingSyncData);
    const activityIds = Object.keys(pendingSync);

    for (const activityId of activityIds) {
      await this.attemptCloudSync(activityId);
      // Add delay between syncs to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export default ActivityCompletionService;
