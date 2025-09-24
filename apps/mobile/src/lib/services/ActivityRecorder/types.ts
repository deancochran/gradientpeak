/**
 * Shared types for activity recording functionality
 */
import { PublicActivityType, PublicPlannedActivitiesRow } from "@repo/core";
import { Device } from "react-native-ble-plx";

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

export type ConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "disabled";

export interface LiveMetrics {
  // Activity metrics
  totalTime?: number;
  movingTime?: number;
  distance?: number;
  total_ascent?: number;
  total_descent?: number;
  avgSpeed?: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;

  // live metrics
  speed?: number;
  heartRate?: number;
  cadence?: number;
  power?: number;

  normalizedPower?: number;
  intensityFactor?: number;
  trainingStressScore?: number;
  variabilityIndex?: number;

  grade?: number;

  hrZoneDistribution?: number[]; // seconds in each HR zone
  powerZoneDistribution?: number[]; // if using FTP zones

  aerobicDecoupling?: number;
  efficiencyIndex?: number;
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
