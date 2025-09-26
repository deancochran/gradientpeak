// import { PublicActivityType, PublicPlannedActivitiesRow, SensorReading } from "@repo/core";
// import { Device } from "react-native-ble-plx";

// // Re-export types from other modules
// export type { RecordingState } from "./index";
// export type { PermissionState, PermissionType } from "./permissions";
// export type { ConnectedSensor, ConnectionState } from "./sensors";

// // Connection status for UI display
// export type ConnectionStatus =
//   | "disabled"     // Permission not granted
//   | "disconnected" // Permission granted but not connected
//   | "connected"    // Active connection
//   | "connecting"   // Attempting to connect
//   | "failed";      // Connection failed

// // Live metrics interface for real-time UI updates
// export interface LiveMetrics {
//   totalElapsedTime: number;    // Total time since start (includes pauses)
//   totalTimerTime: number;      // Active recording time (excludes pauses)
//   distance?: number;           // Distance in meters
//   currentSpeed?: number;       // Current speed in km/h
//   avgSpeed?: number;          // Average speed in km/h
//   currentHeartRate?: number;  // Current HR in bpm
//   currentPower?: number;      // Current power in watts
//   currentCadence?: number;    // Current cadence in rpm
//   calories?: number;          // Estimated calories burned
// }

// // Recording session interface
// export interface RecordingSession {
//   id: string;
//   profileId: string;
//   activityType: PublicActivityType;
//   plannedActivityId?: string;
//   plannedActivity?: PublicPlannedActivitiesRow;
//   state: RecordingState;
//   startedAt?: Date;
//   currentMetrics: LiveMetrics;
//   totalElapsedTime: number;
//   movingTime: number;
// }

// // Activity metrics interface for hook
// export interface ActivityMetrics extends LiveMetrics {
//   duration: number;           // Display duration (usually movingTime)
//   heartRate?: number;         // Current heart rate
//   power?: number;             // Current power
//   cadence?: number;           // Current cadence
// }

// // Sensor data callback type
// export type SensorDataCallback = (reading: SensorReading) => void;

// // Available device interface for scanning
// export interface AvailableDevice {
//   id: string;
//   name: string;
//   rssi?: number;
//   device: Device;
// }

// // Upload status
// export type UploadStatus = "idle" | "uploading" | "success" | "failed";
