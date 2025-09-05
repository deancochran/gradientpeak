import type { SyncStatus } from "./activity";

export interface Workout {
  id: string;
  user_id: string;
  started_at: number;
  ended_at: number | null;
  duration: number;
  status: SyncStatus;
  fit_file_path: string | null;
  total_distance: number;
}

export interface GpsLocation {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  timestamp: number;
  speed?: number | null;
  accuracy?: number | null;
}

export interface WorkoutMetric {
  id: string;
  title: string;
  value: string;
  unit: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  isLive: boolean;
}

export interface SensorValues {
  heartRate?: number;
  power?: number;
  cadence?: number;
}
