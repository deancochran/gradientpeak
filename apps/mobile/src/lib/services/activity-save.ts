import * as FileSystem from "expo-file-system";
import { InsertLocalActivity } from "../db/schemas";
import { ActivityRecording } from "../hooks/useActivityRecording";
import { LocalActivityDatabaseService } from "./local-activity-database";

// Comprehensive activity JSON format for storage
export interface ActivityJSON {
  // Basic metadata
  id: string;
  name: string;
  activityType: "run" | "bike" | "walk" | "hike" | "other";
  startTime: string; // ISO string
  endTime: string; // ISO string
  duration: number; // seconds

  // Location data
  locations: Array<{
    timestamp: number;
    latitude: number;
    longitude: number;
    altitude?: number;
    speed?: number;
    accuracy?: number;
    heading?: number;
  }>;

  // Sensor data streams
  sensorData: Array<{
    timestamp: number;
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
    temperature?: number;
  }>;

  // Summary metrics
  summary: {
    totalDistance: number; // meters
    totalTime: number; // seconds
    movingTime: number; // seconds (excluding pauses)
    avgSpeed: number; // m/s
    maxSpeed: number; // m/s
    elevationGain?: number; // meters
    elevationLoss?: number; // meters
    avgHeartRate?: number;
    maxHeartRate?: number;
    avgPower?: number;
    maxPower?: number;
    avgCadence?: number;
    maxCadence?: number;
    calories?: number;
    tss?: number; // Training Stress Score
  };

  // Device and app info
  deviceInfo: {
    platform: string;
    appVersion: string;
    recordingVersion: string;
  };

  // Privacy and sharing
  privacy: {
    isPublic: boolean;
    shareLocation: boolean;
  };
}

export class ActivitySaveService {
  /**
   * Save activity recording with comprehensive JSON generation
   */
  static async saveActivityRecording(
    recording: ActivityRecording,
    profileId: string,
    activityName?: string,
  ): Promise<string> {
    try {
      console.log("💾 Starting activity save process...");

      // Generate comprehensive activity JSON
      const activityJSON = this.generateActivityJSON(recording, activityName);

      // Calculate advanced metrics
      const summary = this.calculateSummaryMetrics(recording);
      activityJSON.summary = { ...activityJSON.summary, ...summary };

      // Save JSON file locally
      const localFilePath = await this.saveActivityJSONFile(activityJSON);

      // Create local database record
      const localActivity: InsertLocalActivity = {
        id: recording.id,
        name: activityJSON.name,
        activityType: activityJSON.activityType,
        startDate: new Date(recording.startTime),
        totalDistance: summary.totalDistance,
        totalTime: summary.totalTime,
        profileId,
        localStoragePath: localFilePath,
        avgHeartRate: summary.avgHeartRate,
        maxHeartRate: summary.maxHeartRate,
        avgPower: summary.avgPower,
        maxPower: summary.maxPower,
        avgCadence: summary.avgCadence,
        elevationGain: summary.elevationGain,
        calories: summary.calories,
        tss: summary.tss,
        syncStatus: "pending",
        syncAttempts: 0,
      };

      // Save to local database
      const activityId =
        await LocalActivityDatabaseService.createActivity(localActivity);

      console.log("✅ Activity saved successfully:", {
        id: activityId,
        duration: `${Math.floor(summary.totalTime / 60)}:${(summary.totalTime % 60).toString().padStart(2, "0")}`,
        distance: `${(summary.totalDistance / 1000).toFixed(2)} km`,
        avgHeartRate: summary.avgHeartRate,
        localFile: localFilePath,
      });

      return activityId;
    } catch (error) {
      console.error("❌ Failed to save activity:", error);
      throw new Error(
        `Failed to save activity: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Generate comprehensive activity JSON from recording
   */
  private static generateActivityJSON(
    recording: ActivityRecording,
    activityName?: string,
  ): ActivityJSON {
    const startTime = new Date(recording.startTime).toISOString();
    const endTime = new Date(Date.now()).toISOString();
    const duration = Math.floor((Date.now() - recording.startTime) / 1000);

    // Auto-generate activity name if not provided
    const name = activityName || this.generateActivityName(recording);

    // Convert locations to standardized format
    const locations = recording.locations.map((loc) => ({
      timestamp: loc.timestamp,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      altitude: loc.coords.altitude || undefined,
      speed: loc.coords.speed || undefined,
      accuracy: loc.coords.accuracy || undefined,
      heading: loc.coords.heading || undefined,
    }));

    // Determine activity type based on speed patterns
    const activityType = this.detectActivityType(recording);

    return {
      id: recording.id,
      name,
      activityType,
      startTime,
      endTime,
      duration,
      locations,
      sensorData: recording.sensorData,
      summary: {
        totalDistance: recording.metrics.distance,
        totalTime: duration,
        movingTime: duration, // TODO: Calculate actual moving time
        avgSpeed: recording.metrics.avgSpeed,
        maxSpeed: recording.metrics.currentSpeed,
      },
      deviceInfo: {
        platform: "react-native",
        appVersion: "1.0.0",
        recordingVersion: "1.0.0",
      },
      privacy: {
        isPublic: false,
        shareLocation: true,
      },
    };
  }

  /**
   * Calculate comprehensive summary metrics
   */
  private static calculateSummaryMetrics(recording: ActivityRecording) {
    const { locations, sensorData, metrics } = recording;

    // Heart rate analysis
    const heartRateValues = sensorData
      .map((d) => d.heartRate)
      .filter((hr): hr is number => typeof hr === "number" && hr > 0);

    const avgHeartRate =
      heartRateValues.length > 0
        ? Math.round(
            heartRateValues.reduce((a, b) => a + b, 0) / heartRateValues.length,
          )
        : undefined;

    const maxHeartRate =
      heartRateValues.length > 0 ? Math.max(...heartRateValues) : undefined;

    // Power analysis
    const powerValues = sensorData
      .map((d) => d.power)
      .filter((p): p is number => typeof p === "number" && p > 0);

    const avgPower =
      powerValues.length > 0
        ? Math.round(
            powerValues.reduce((a, b) => a + b, 0) / powerValues.length,
          )
        : undefined;

    const maxPower =
      powerValues.length > 0 ? Math.max(...powerValues) : undefined;

    // Cadence analysis
    const cadenceValues = sensorData
      .map((d) => d.cadence)
      .filter((c): c is number => typeof c === "number" && c > 0);

    const avgCadence =
      cadenceValues.length > 0
        ? Math.round(
            cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length,
          )
        : undefined;

    const maxCadence =
      cadenceValues.length > 0 ? Math.max(...cadenceValues) : undefined;

    // Elevation analysis
    const altitudes = locations
      .map((l) => l.coords.altitude)
      .filter((alt): alt is number => typeof alt === "number");

    let elevationGain = 0;
    let elevationLoss = 0;

    if (altitudes.length > 1) {
      for (let i = 1; i < altitudes.length; i++) {
        const diff = altitudes[i] - altitudes[i - 1];
        if (diff > 0) {
          elevationGain += diff;
        } else {
          elevationLoss += Math.abs(diff);
        }
      }
    }

    // Speed analysis
    const speeds = locations
      .map((l) => l.coords.speed)
      .filter((s): s is number => typeof s === "number" && s > 0);

    const maxSpeed =
      speeds.length > 0 ? Math.max(...speeds) : metrics.currentSpeed;

    // Calories estimation (improved)
    const calories = this.calculateCalories(
      metrics.duration,
      metrics.distance,
      avgHeartRate,
      avgPower,
    );

    // Training Stress Score (basic estimation)
    const tss =
      avgPower && metrics.duration > 600 // Only if we have power and >10 min
        ? this.calculateTSS(avgPower, metrics.duration)
        : undefined;

    return {
      totalDistance: metrics.distance,
      totalTime: metrics.duration,
      movingTime: metrics.duration, // TODO: Calculate actual moving time
      avgSpeed: metrics.avgSpeed,
      maxSpeed,
      elevationGain: elevationGain > 5 ? Math.round(elevationGain) : undefined,
      elevationLoss: elevationLoss > 5 ? Math.round(elevationLoss) : undefined,
      avgHeartRate,
      maxHeartRate,
      avgPower,
      maxPower,
      avgCadence,
      maxCadence,
      calories,
      tss,
    };
  }

  /**
   * Save activity JSON to local file system
   */
  private static async saveActivityJSONFile(
    activityJSON: ActivityJSON,
  ): Promise<string> {
    const fileName = `activity_${activityJSON.id}.json`;
    const filePath = `${FileSystem.documentDirectory}activities/${fileName}`;

    // Ensure activities directory exists
    const activityDir = `${FileSystem.documentDirectory}activities/`;
    const dirInfo = await FileSystem.getInfoAsync(activityDir);

    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(activityDir, { intermediates: true });
    }

    // Write JSON file
    await FileSystem.writeAsStringAsync(
      filePath,
      JSON.stringify(activityJSON, null, 2),
    );

    console.log("📄 Activity JSON saved to:", filePath);
    return filePath;
  }

  /**
   * Generate activity name based on date and type
   */
  private static generateActivityName(recording: ActivityRecording): string {
    const date = new Date(recording.startTime);
    const timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const activityType = this.detectActivityType(recording);

    const typeNames = {
      run: "Morning Run",
      bike: "Bike Ride",
      walk: "Walk",
      hike: "Hike",
      other: "Activity",
    };

    return `${typeNames[activityType]} - ${timeStr}`;
  }

  /**
   * Detect activity type based on speed patterns
   */
  private static detectActivityType(
    recording: ActivityRecording,
  ): "run" | "bike" | "walk" | "hike" | "other" {
    const avgSpeedKmh = recording.metrics.avgSpeed * 3.6;

    if (avgSpeedKmh > 15) {
      return "bike"; // >15 km/h likely cycling
    } else if (avgSpeedKmh > 7) {
      return "run"; // 7-15 km/h likely running
    } else if (avgSpeedKmh > 3) {
      return "walk"; // 3-7 km/h likely walking
    } else if (recording.metrics.distance > 1000) {
      return "hike"; // Slow but long distance
    } else {
      return "other";
    }
  }

  /**
   * Enhanced calorie calculation
   */
  private static calculateCalories(
    duration: number,
    distance: number,
    avgHeartRate?: number,
    avgPower?: number,
  ): number {
    if (duration === 0) return 0;

    const hours = duration / 3600;
    const km = distance / 1000;

    if (avgPower) {
      // Power-based calculation (most accurate)
      return Math.round(hours * avgPower * 3.6); // ~3.6 cal per watt-hour
    } else if (avgHeartRate) {
      // Heart rate-based calculation
      const baseRate = 70;
      const intensity = Math.max(1, avgHeartRate / baseRate);
      return Math.round(hours * 400 * intensity);
    } else {
      // Distance and time-based fallback
      return Math.round(hours * 350 + km * 60);
    }
  }

  /**
   * Calculate Training Stress Score (TSS)
   */
  private static calculateTSS(avgPower: number, duration: number): number {
    // Basic TSS calculation: (seconds * NP * IF) / (FTP * 3600) * 100
    // Using avgPower as NP approximation and assuming FTP of 250W
    const assumedFTP = 250;
    const intensityFactor = avgPower / assumedFTP;
    const hours = duration / 3600;

    return Math.round(hours * intensityFactor * intensityFactor * 100);
  }
}
