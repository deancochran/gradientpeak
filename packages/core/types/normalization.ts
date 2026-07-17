import type { ActivityArtifactSemantics, DecodedActivityArtifact } from "../activity-artifacts";

export interface ActivityLap {
  messageIndex?: number;
  sessionMessageIndex?: number;
  startTime: Date;
  totalTime: number;
  totalDistance: number;
  avgSpeed?: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;
}
export interface ActivityLength {
  messageIndex?: number;
  sessionMessageIndex?: number;
  lapMessageIndex?: number;
  startTime?: Date;
  totalElapsedTime?: number;
  totalTimerTime?: number;
  totalStrokes?: number;
  avgSpeed?: number;
  swimStroke?: string;
  avgSwimmingCadence?: number;
  event?: string;
  eventType?: string;
}
export interface ActivityRecord {
  messageIndex?: number;
  sessionMessageIndex?: number;
  lapMessageIndex?: number;
  timestamp: Date;
  positionLat?: number; // degrees
  positionLong?: number; // degrees
  distance?: number; // meters
  altitude?: number; // meters
  speed?: number; // m/s
  heartRate?: number; // bpm
  cadence?: number; // rpm
  power?: number; // watts
  temperature?: number; // celsius
}

export interface ActivitySession {
  messageIndex: number;
  rawSport?: string | number;
  rawSubSport?: string | number;
  startTime: Date;
  endTime: Date;
  totalElapsedTime: number;
  totalTimerTime?: number;
  totalMovingTime?: number;
  totalDistance?: number;
  laps: ActivityLap[];
  records: ActivityRecord[];
}

export interface ActivitySegment {
  sessionMessageIndex: number;
  role: "activity" | "transition" | "rest" | "unknown";
  category?: "run" | "bike" | "swim" | "strength" | "other";
  rawSport?: string | number;
  rawSubSport?: string | number;
  startTime: Date;
  endTime: Date;
}
export interface StandardActivity {
  metadata: {
    activityId?: string;
    name?: string;
    description?: string;
    startTime: Date;
    type: string; // e.g., 'running', 'cycling'
    subType?: string;
    deviceId?: string;
    manufacturer?: string;
    product?: string;
  };
  summary: {
    totalTime: number; // seconds
    totalDistance: number; // meters
    totalAscent?: number; // meters
    totalDescent?: number; // meters
    maxSpeed?: number; // m/s
    avgSpeed?: number; // m/s
    maxHeartRate?: number; // bpm
    avgHeartRate?: number; // bpm
    maxCadence?: number; // rpm
    avgCadence?: number; // rpm
    maxPower?: number; // watts
    avgPower?: number; // watts
    calories?: number; // kcal
    poolLength?: number; // meters or yards
    poolLengthUnit?: string;
    totalStrokes?: number;
    avgStrokeDistance?: number;
  };
  laps?: ActivityLap[];
  lengths?: ActivityLength[];
  /** Ordered FIT sessions. Present for FIT input, including ordinary one-session files. */
  sessions?: ActivitySession[];
  /** Ordered segment projection of FIT sessions. */
  segments?: ActivitySegment[];
  /** Standards-first decoded evidence used for loss-aware ingestion and round-trip checks. */
  decodedArtifact?: DecodedActivityArtifact;
  /** Canonical semantic projection compared with explicit FIT quantization tolerances. */
  semantics?: ActivityArtifactSemantics;
  records: ActivityRecord[];
}
