/**
 * Shared types for activity recording functionality
 */
import {
  PublicActivityMetric,
  PublicActivityType,
  PublicPlannedActivitiesRow,
} from "@repo/core";
import { Device } from "react-native-ble-plx";

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

export type PermissionType = "bluetooth" | "location" | "location-background";

export type ConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "disabled";

export interface LiveMetrics {
  // Existing
  totalTime?: number;
  movingTime?: number;
  distance?: number;
  total_ascent?: number;
  total_descent?: number;

  speed?: number;
  heartRate?: number;
  cadence?: number;
  power?: number;

  avgChunkSpeed?: number;
  avgChunkHeartRate?: number;
  avgChunkCadence?: number;
  avgChunkPower?: number;

  avgSpeed?: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;

  // Extended metrics
  normalizedPower?: number;
  intensityFactor?: number;
  trainingStressScore?: number;
  variabilityIndex?: number;

  grade?: number;
  vAM?: number;

  hrZoneDistribution?: number[]; // seconds in each HR zone
  powerZoneDistribution?: number[]; // if using FTP zones

  aerobicDecoupling?: number;
  efficiencyIndex?: number;

  intervalIndex?: number;
  intervalProgress?: number;
  targetCompliance?: number;
}

/** Permission state for UI display */
export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  loading: boolean;
  name: string;
  description: string;
  required?: boolean;
}

/** Connected BLE sensor information */
export interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  device?: Device;
  rssi?: number;
  battery?: number;
  connectionTime: Date;
  characteristics: Map<string, string>;
}

/** Sensor reading from any source */
export interface SensorReading {
  metric: PublicActivityMetric;
  value: number | boolean | [number, number];
  timestamp: number;
  deviceId?: string;
  quality?: "good" | "poor" | "unknown";
}

/** GPS reading from location services */
export interface GPSReading {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp: number;
}

/** Buffered sensor data awaiting chunk processing */
interface SensorDataBuffer {
  [key: string]: Array<{ value: number | [number, number]; timestamp: number }>;
}

/** Active recording session */
export interface RecordingSession {
  id: string;
  profileId: string;
  startedAt: Date;
  finishedAt?: Date;
  state: RecordingState;
  activityType: PublicActivityType;
  plannedActivity?: PublicPlannedActivitiesRow;
  currentMetrics: LiveMetrics;
  sensorDataBuffer: SensorDataBuffer;
  chunkIndex: number;
  totalElapsedTime: number;
  movingTime: number;
  lastResumeTime: Date | null;
  lastCheckpointAt: Date;
  dataPointsRecorded: number;
  allValues: Map<string, number[]>;
  allCoordinates: [number, number][];
}
