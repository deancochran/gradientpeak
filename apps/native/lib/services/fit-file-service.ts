import * as GarminFitSDK from "@garmin/fitsdk";
import * as FileSystem from "expo-file-system";
import { fromByteArray, toByteArray } from "react-native-quick-base64";

import type { ActivityMetadata, RecordingSession } from "../types/activity";

export class FitFileService {
  /**
   * Generate a FIT file from a recording session using the Garmin SDK
   */
  static async generateActivityFile(
    session: RecordingSession,
  ): Promise<string | null> {
    try {
      const encoder = new GarminFitSDK.Encoder();
      const startTime = session.startedAt;
      const endTime = new Date();

      // Create File ID message (required)
      const fileId = new GarminFitSDK.Profile.FileIdMessage();
      fileId.type = GarminFitSDK.Profile.FileType.ACTIVITY;
      fileId.manufacturer = GarminFitSDK.Profile.Manufacturer.DEVELOPMENT;
      fileId.product = 1;
      fileId.serialNumber = Date.now();
      fileId.timeCreated = startTime;
      encoder.addMessage(fileId);

      // Add Device Info message (recommended)
      const deviceInfo = new GarminFitSDK.Profile.DeviceInfoMessage();
      deviceInfo.timestamp = startTime;
      deviceInfo.deviceIndex = 0; // Creator device
      deviceInfo.manufacturer = GarminFitSDK.Profile.Manufacturer.DEVELOPMENT;
      deviceInfo.product = 1;
      deviceInfo.softwareVersion = 100; // Version 1.00
      encoder.addMessage(deviceInfo);

      // Process all collected data to calculate session summary
      const sessionSummary = this.calculateSessionSummary(
        session.recordMessages,
        session.eventMessages,
        startTime,
        endTime,
      );

      // Create Session message (required)
      const sessionMsg = new GarminFitSDK.Profile.SessionMessage();
      sessionMsg.timestamp = endTime;
      sessionMsg.startTime = startTime;
      sessionMsg.sport =
        sessionSummary.sport || GarminFitSDK.Profile.Sport.GENERIC;
      sessionMsg.subSport =
        sessionSummary.subSport || GarminFitSDK.Profile.SubSport.GENERIC;

      // Add session summary data dynamically
      if (sessionSummary.totalDistance !== undefined) {
        sessionMsg.totalDistance = sessionSummary.totalDistance;
      }
      if (sessionSummary.totalTimerTime !== undefined) {
        sessionMsg.totalTimerTime = sessionSummary.totalTimerTime;
      }
      if (sessionSummary.totalElapsedTime !== undefined) {
        sessionMsg.totalElapsedTime = sessionSummary.totalElapsedTime;
      }
      if (sessionSummary.totalCalories !== undefined) {
        sessionMsg.totalCalories = sessionSummary.totalCalories;
      }
      if (sessionSummary.avgHeartRate !== undefined) {
        sessionMsg.avgHeartRate = sessionSummary.avgHeartRate;
      }
      if (sessionSummary.maxHeartRate !== undefined) {
        sessionMsg.maxHeartRate = sessionSummary.maxHeartRate;
      }
      if (sessionSummary.avgPower !== undefined) {
        sessionMsg.avgPower = sessionSummary.avgPower;
      }
      if (sessionSummary.maxPower !== undefined) {
        sessionMsg.maxPower = sessionSummary.maxPower;
      }
      if (sessionSummary.avgSpeed !== undefined) {
        sessionMsg.avgSpeed = sessionSummary.avgSpeed;
      }
      if (sessionSummary.maxSpeed !== undefined) {
        sessionMsg.maxSpeed = sessionSummary.maxSpeed;
      }
      if (sessionSummary.totalAscent !== undefined) {
        sessionMsg.totalAscent = sessionSummary.totalAscent;
      }
      if (sessionSummary.totalDescent !== undefined) {
        sessionMsg.totalDescent = sessionSummary.totalDescent;
      }

      encoder.addMessage(sessionMsg);

      // Create default Lap message (required)
      const lapMsg = new GarminFitSDK.Profile.LapMessage();
      lapMsg.timestamp = endTime;
      lapMsg.startTime = startTime;
      lapMsg.totalTimerTime = sessionSummary.totalTimerTime;
      lapMsg.totalElapsedTime = sessionSummary.totalElapsedTime;
      if (sessionSummary.totalDistance !== undefined) {
        lapMsg.totalDistance = sessionSummary.totalDistance;
      }
      encoder.addMessage(lapMsg);

      // Add Timer Start event
      const startEvent = new GarminFitSDK.Profile.EventMessage();
      startEvent.timestamp = startTime;
      startEvent.event = GarminFitSDK.Profile.Event.TIMER;
      startEvent.eventType = GarminFitSDK.Profile.EventType.START;
      encoder.addMessage(startEvent);

      // Add all Record messages in chronological order
      const sortedRecords = [...session.recordMessages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      for (const record of sortedRecords) {
        const recordMsg = new GarminFitSDK.Profile.RecordMessage();

        // Copy all available fields from the collected data
        Object.keys(record).forEach((key) => {
          if (key === "timestamp") {
            recordMsg.timestamp = new Date(record[key]);
          } else if (record[key] !== undefined && record[key] !== null) {
            (recordMsg as any)[key] = record[key];
          }
        });

        encoder.addMessage(recordMsg);
      }

      // Add all Event messages
      const sortedEvents = [...session.eventMessages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      for (const event of sortedEvents) {
        const eventMsg = new GarminFitSDK.Profile.EventMessage();
        Object.keys(event).forEach((key) => {
          if (key === "timestamp") {
            eventMsg.timestamp = new Date(event[key]);
          } else if (event[key] !== undefined && event[key] !== null) {
            (eventMsg as any)[key] = event[key];
          }
        });
        encoder.addMessage(eventMsg);
      }

      // Add compressed HR messages if available
      if (GarminFitSDK.Profile.HrMessage) {
        for (const hrMsg of session.hrMessages) {
          const hrMessage = new GarminFitSDK.Profile.HrMessage();
          Object.keys(hrMsg).forEach((key) => {
            if (key === "timestamp") {
              hrMessage.timestamp = new Date(hrMsg[key]);
            } else if (hrMsg[key] !== undefined && hrMsg[key] !== null) {
              (hrMessage as any)[key] = hrMsg[key];
            }
          });
          encoder.addMessage(hrMessage);
        }
      } else {
        console.warn(
          "Profile.HrMessage is not available in the FIT SDK. Skipping HR data.",
        );
      }

      // Add Timer Stop event
      const stopEvent = new GarminFitSDK.Profile.EventMessage();
      stopEvent.timestamp = endTime;
      stopEvent.event = GarminFitSDK.Profile.Event.TIMER;
      stopEvent.eventType = GarminFitSDK.Profile.EventType.STOP_DISABLE_ALL;
      encoder.addMessage(stopEvent);

      // Create Activity message (required)
      const activityMsg = new GarminFitSDK.Profile.ActivityMessage();
      activityMsg.timestamp = endTime;
      activityMsg.totalTimerTime = sessionSummary.totalTimerTime;
      activityMsg.numSessions = 1;
      activityMsg.type = GarminFitSDK.Profile.Activity.MANUAL;
      encoder.addMessage(activityMsg);

      // Encode the FIT file
      const data = encoder.encode();
      const fileName = `activity-${session.id}.fit`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      const base64Data = fromByteArray(new Uint8Array(data));

      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log(`FIT activity file created: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error generating FIT activity file:", error);
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
   * Calculate session summary from raw messages
   */
  private static calculateSessionSummary(
    recordMessages: any[],
    eventMessages: any[],
    startTime: Date,
    endTime: Date,
  ) {
    const summary: any = {
      totalTimerTime: (endTime.getTime() - startTime.getTime()) / 1000,
      totalElapsedTime: (endTime.getTime() - startTime.getTime()) / 1000,
    };

    if (recordMessages.length === 0) {
      return summary;
    }

    // Calculate metrics from record messages
    const distances = recordMessages
      .filter((r) => r.distance !== undefined)
      .map((r) => r.distance);
    const speeds = recordMessages
      .filter((r) => r.speed !== undefined)
      .map((r) => r.speed);
    const heartRates = recordMessages
      .filter((r) => r.heartRate !== undefined)
      .map((r) => r.heartRate);
    const powers = recordMessages
      .filter((r) => r.power !== undefined)
      .map((r) => r.power);
    const cadences = recordMessages
      .filter((r) => r.cadence !== undefined)
      .map((r) => r.cadence);
    const elevations = recordMessages
      .filter((r) => r.altitude !== undefined)
      .map((r) => r.altitude);

    // Distance
    if (distances.length > 0) {
      summary.totalDistance = Math.max(...distances);
    }

    // Speed
    if (speeds.length > 0) {
      summary.avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      summary.maxSpeed = Math.max(...speeds);
    }

    // Heart Rate
    if (heartRates.length > 0) {
      summary.avgHeartRate = Math.round(
        heartRates.reduce((a, b) => a + b, 0) / heartRates.length,
      );
      summary.maxHeartRate = Math.max(...heartRates);
    }

    // Power
    if (powers.length > 0) {
      summary.avgPower = Math.round(
        powers.reduce((a, b) => a + b, 0) / powers.length,
      );
      summary.maxPower = Math.max(...powers);
    }

    // Cadence
    if (cadences.length > 0) {
      summary.avgCadence = Math.round(
        cadences.reduce((a, b) => a + b, 0) / cadences.length,
      );
      summary.maxCadence = Math.max(...cadences);
    }

    // Elevation
    if (elevations.length > 0) {
      let ascent = 0;
      let descent = 0;
      for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) ascent += diff;
        else descent += Math.abs(diff);
      }
      summary.totalAscent = ascent;
      summary.totalDescent = descent;
    }

    return summary;
  }
}
