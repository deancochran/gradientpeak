import * as GarminFitSDK from "@garmin/fitsdk";
import * as FileSystem from "expo-file-system";
import { toByteArray } from "react-native-quick-base64";

import type { ActivityMetadata, RecordingSession } from "../types/activity";

export class FitFileService {
  /**
   * Save recording session as JSON file for backend processing
   */
  static async saveActivityJson(
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

      const fileName = `activity-${session.id}.json`;
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

  /**
   * Parse any FIT file and extract metadata dynamically using Garmin SDK
   */
  static async parseActivityFile(
    filePath: string,
  ): Promise<ActivityMetadata | null> {
    try {
      const fileExists = await FileSystem.getInfoAsync(filePath);
      if (!fileExists.exists) {
        console.error("FIT file does not exist:", filePath);
        return null;
      }

      const base64Data = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const binaryData = toByteArray(base64Data);
      const stream = GarminFitSDK.Stream.fromByteArray(Array.from(binaryData));

      // Check if it's a valid FIT file
      if (!GarminFitSDK.Decoder.isFIT(stream)) {
        console.error("File is not a valid FIT file");
        return null;
      }

      const decoder = new GarminFitSDK.Decoder(stream);

      // Verify integrity if needed
      if (!decoder.checkIntegrity()) {
        console.warn(
          "FIT file integrity check failed, but attempting to decode anyway",
        );
      }

      // Decode with all options enabled for maximum data extraction
      const { messages, errors } = decoder.read({
        applyScaleAndOffset: true,
        expandSubFields: true,
        expandComponents: true,
        convertTypesToStrings: true,
        convertDateTimesToDates: true,
        includeUnknownData: true,
        mergeHeartRates: true,
      });

      if (errors.length > 0) {
        console.warn("Errors during FIT file decoding:", errors);
      }

      // Initialize metadata
      const metadata: ActivityMetadata = {
        startTime: new Date(),
        hasGpsData: false,
        hasHeartRateData: false,
        hasPowerData: false,
        hasCadenceData: false,
        hasTemperatureData: false,
      };

      // Extract File ID information
      if (messages.fileId && messages.fileId.length > 0) {
        const fileId = messages.fileId[0];
        if (fileId.timeCreated) {
          metadata.startTime = fileId.timeCreated;
        }
        if (fileId.manufacturer) {
          metadata.manufacturer = fileId.manufacturer;
        }
        if (fileId.product) {
          metadata.product = String(fileId.product);
        }
      }

      // Extract Activity information
      if (messages.activity && messages.activity.length > 0) {
        const activity = messages.activity[0];
        if (activity.timestamp) {
          metadata.endTime = activity.timestamp;
        }
        if (activity.totalTimerTime !== undefined) {
          metadata.totalTimerTime = activity.totalTimerTime;
        }
        if (activity.numSessions !== undefined) {
          metadata.numSessions = activity.numSessions;
        }
      }

      // Extract Session information (most comprehensive)
      if (messages.session && messages.session.length > 0) {
        const session = messages.session[0];

        if (session.startTime) {
          metadata.startTime = session.startTime;
        }
        if (session.timestamp) {
          metadata.endTime = session.timestamp;
        }
        if (session.sport) {
          metadata.sport = session.sport;
        }
        if (session.subSport) {
          metadata.subSport = session.subSport;
        }

        // Distance and speed
        if (session.totalDistance !== undefined) {
          metadata.totalDistance = session.totalDistance;
        }
        if (session.avgSpeed !== undefined) {
          metadata.avgSpeed = session.avgSpeed;
        }
        if (session.maxSpeed !== undefined) {
          metadata.maxSpeed = session.maxSpeed;
        }

        // Heart rate
        if (session.avgHeartRate !== undefined) {
          metadata.avgHeartRate = session.avgHeartRate;
          metadata.hasHeartRateData = true;
        }
        if (session.maxHeartRate !== undefined) {
          metadata.maxHeartRate = session.maxHeartRate;
        }

        // Power
        if (session.avgPower !== undefined) {
          metadata.avgPower = session.avgPower;
          metadata.hasPowerData = true;
        }
        if (session.maxPower !== undefined) {
          metadata.maxPower = session.maxPower;
        }
        if (session.normalizedPower !== undefined) {
          metadata.normalizedPower = session.normalizedPower;
        }

        // Cadence
        if (session.avgCadence !== undefined) {
          metadata.avgCadence = session.avgCadence;
          metadata.hasCadenceData = true;
        }
        if (session.maxCadence !== undefined) {
          metadata.maxCadence = session.maxCadence;
        }

        // Calories
        if (session.totalCalories !== undefined) {
          metadata.totalCalories = session.totalCalories;
        }

        // Elevation
        if (session.totalAscent !== undefined) {
          metadata.totalAscent = session.totalAscent;
        }
        if (session.totalDescent !== undefined) {
          metadata.totalDescent = session.totalDescent;
        }

        // Timers
        if (session.totalTimerTime !== undefined) {
          metadata.totalTimerTime = session.totalTimerTime;
        }
        if (session.totalElapsedTime !== undefined) {
          metadata.totalElapsedTime = session.totalElapsedTime;
        }

        // Position
        if (session.startPositionLat !== undefined) {
          metadata.startPositionLat = session.startPositionLat;
        }
        if (session.startPositionLong !== undefined) {
          metadata.startPositionLon = session.startPositionLong;
        }
      }

      // Analyze Record messages for data availability and additional metrics
      if (messages.record && messages.record.length > 0) {
        metadata.totalRecords = messages.record.length;

        const records = messages.record;
        let hasGps = false;
        let hasHr = false;
        let hasPower = false;
        let hasCadence = false;
        let hasTemp = false;

        const elevations: number[] = [];

        for (const record of records) {
          // Check for GPS data
          if (
            record.positionLat !== undefined &&
            record.positionLong !== undefined
          ) {
            hasGps = true;
          }

          // Check for heart rate data
          if (record.heartRate !== undefined) {
            hasHr = true;
          }

          // Check for power data
          if (record.power !== undefined) {
            hasPower = true;
          }

          // Check for cadence data
          if (record.cadence !== undefined) {
            hasCadence = true;
          }

          // Check for temperature data
          if (record.temperature !== undefined) {
            hasTemp = true;
          }

          // Collect elevation data
          if (record.altitude !== undefined) {
            elevations.push(record.altitude);
          } else if (record.enhancedAltitude !== undefined) {
            elevations.push(record.enhancedAltitude);
          }
        }

        metadata.hasGpsData = hasGps;
        metadata.hasHeartRateData = hasHr;
        metadata.hasPowerData = hasPower;
        metadata.hasCadenceData = hasCadence;
        metadata.hasTemperatureData = hasTemp;

        // Calculate elevation metrics
        if (elevations.length > 0) {
          metadata.maxElevation = Math.max(...elevations);
          metadata.minElevation = Math.min(...elevations);
        }
      }

      // Count laps
      if (messages.lap && messages.lap.length > 0) {
        metadata.numLaps = messages.lap.length;
      }

      // Store any additional/unknown data
      const additionalData: Record<string, any> = {};
      Object.keys(messages).forEach((messageType) => {
        if (
          !["fileId", "activity", "session", "lap", "record", "event"].includes(
            messageType,
          )
        ) {
          additionalData[messageType] = messages[messageType];
        }
      });

      if (Object.keys(additionalData).length > 0) {
        metadata.customData = additionalData;
      }

      return metadata;
    } catch (error) {
      console.error("Error parsing FIT file:", error);
      return null;
    }
  }

  /**
   * Check if a file is a valid FIT file
   */
  static async isValidFitFile(filePath: string): Promise<boolean> {
    try {
      const fileExists = await FileSystem.getInfoAsync(filePath);
      if (!fileExists.exists) return false;

      const base64Data = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const binaryData = toByteArray(base64Data);
      const stream = GarminFitSDK.Stream.fromByteArray(Array.from(binaryData));

      return GarminFitSDK.Decoder.isFIT(stream);
    } catch (error) {
      console.error("Error checking FIT file validity:", error);
      return false;
    }
  }

  /**
   * Delete a FIT file
   */
  static async deleteFitFile(filePath: string): Promise<boolean> {
    try {
      const fileExists = await FileSystem.getInfoAsync(filePath);
      if (!fileExists.exists) return true;

      await FileSystem.deleteAsync(filePath);
      console.log(`FIT file deleted: ${filePath}`);
      return true;
    } catch (error) {
      console.error("Error deleting FIT file:", error);
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  static async getFitFileSize(filePath: string): Promise<number | null> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      return fileInfo.exists ? fileInfo.size || 0 : null;
    } catch (error) {
      console.error("Error getting FIT file size:", error);
      return null;
    }
  }

  /**
   * Delete a JSON activity file
   */
  static async deleteJsonFile(filePath: string): Promise<boolean> {
    try {
      const fileExists = await FileSystem.getInfoAsync(filePath);
      if (!fileExists.exists) return true;

      await FileSystem.deleteAsync(filePath);
      console.log(`JSON file deleted: ${filePath}`);
      return true;
    } catch (error) {
      console.error("Error deleting JSON file:", error);
      return false;
    }
  }

  /**
   * Get JSON file size in bytes
   */
  static async getJsonFileSize(filePath: string): Promise<number | null> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      return fileInfo.exists ? fileInfo.size || 0 : null;
    } catch (error) {
      console.error("Error getting JSON file size:", error);
      return null;
    }
  }
}
