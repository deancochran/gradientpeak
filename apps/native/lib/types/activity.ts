import type { Database } from "@repo/supabase";

// Use generated types from database
export type SyncStatus = Database["public"]["Enums"]["sync_status"];
export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type ActivityInsert =
  Database["public"]["Tables"]["activities"]["Insert"];
export type ActivityUpdate =
  Database["public"]["Tables"]["activities"]["Update"];

// Local activity record for SQLite (before sync) - uses timestamps as numbers
export interface LocalActivity {
  id: string;
  profile_id: string;
  local_fit_file_path: string;
  sync_status: SyncStatus;
  json_storage_path?: string;
  cloud_storage_path?: string;
  sync_error_message?: string;
  created_at: number; // SQLite timestamp
  updated_at: number; // SQLite timestamp

  // Cached metadata extracted from activity file (for quick display)
  cached_metadata?: string; // JSON string of ActivityMetadata
}

// Metadata extracted dynamically from FIT file
export interface ActivityMetadata {
  // Always available
  startTime: Date;
  endTime?: Date;
  totalTimerTime?: number; // Duration excluding pauses
  totalElapsedTime?: number; // Duration including pauses

  // File info
  manufacturer?: string;
  product?: string;
  sport?: string;
  subSport?: string;

  // Dynamically extracted metrics (only present if available in FIT file)
  totalDistance?: number;
  totalCalories?: number;
  avgSpeed?: number;
  maxSpeed?: number;

  // Heart rate
  avgHeartRate?: number;
  maxHeartRate?: number;
  minHeartRate?: number;

  // Power
  avgPower?: number;
  maxPower?: number;
  normalizedPower?: number;

  // Cadence
  avgCadence?: number;
  maxCadence?: number;

  // Elevation
  totalAscent?: number;
  totalDescent?: number;
  maxElevation?: number;
  minElevation?: number;

  // GPS
  startPositionLat?: number;
  startPositionLon?: number;
  endPositionLat?: number;
  endPositionLon?: number;

  // Session counts
  numSessions?: number;
  numLaps?: number;

  // Data availability flags
  hasGpsData: boolean;
  hasHeartRateData: boolean;
  hasPowerData: boolean;
  hasCadenceData: boolean;
  hasTemperatureData: boolean;

  // Record counts
  totalRecords?: number;

  // Any additional data found in the FIT file
  customData?: Record<string, any>;
}

// Real-time recording session data
export interface RecordingSession {
  id: string;
  profileId: string;
  startedAt: Date;
  status: "recording" | "paused" | "stopped";

  // Raw data collected during recording
  recordMessages: any[]; // FIT Record messages
  eventMessages: any[]; // FIT Event messages
  hrMessages: any[]; // FIT HR messages (compressed heart rate)
  hrvMessages: any[]; // FIT HRV messages

  // Current live metrics (calculated from raw data)
  liveMetrics: {
    duration: number;
    distance?: number;
    currentPace?: number;
    avgPace?: number;
    currentHeartRate?: number;
    avgHeartRate?: number;
    currentPower?: number;
    avgPower?: number;
    currentCadence?: number;
    avgCadence?: number;
    currentSpeed?: number;
    avgSpeed?: number;
    calories?: number;
    elevation?: number;
    totalAscent?: number;
    totalDescent?: number;
    [key: string]: any; // Allow for any additional metrics
  };
}

// Sensor data point for real-time collection
export interface SensorDataPoint {
  timestamp: Date;
  messageType: string; // 'record', 'hr', 'hrv', 'event', etc.
  data: any; // Raw FIT message data
}

// GPS point specifically
export interface GpsDataPoint {
  timestamp: Date;
  positionLat?: number; // semicircles
  positionLong?: number; // semicircles
  altitude?: number; // meters
  speed?: number; // m/s
  distance?: number; // meters
  enhancedAltitude?: number;
  enhancedSpeed?: number;
  grade?: number;
  gpsAccuracy?: number;
}
