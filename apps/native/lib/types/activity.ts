// Activity recording types
export interface GpsDataPoint {
  timestamp: Date;
  positionLat?: number; // Semicircles (multiply degrees by 11930464.7111)
  positionLong?: number; // Semicircles (multiply degrees by 11930464.7111)
  altitude?: number; // Meters
  speed?: number; // m/s
  gpsAccuracy?: number; // Meters
  distance?: number; // Cumulative distance in meters
}

export interface SensorDataPoint {
  timestamp: Date;
  messageType: "record" | "hr" | "hrv" | "event";
  data: Record<string, any>;
  // Common sensor data fields
  heartRate?: number;
  power?: number;
  cadence?: number;
  temperature?: number;
  speed?: number;
  distance?: number;
}

export interface RecordMessage {
  timestamp: Date;
  // GPS fields
  positionLat?: number;
  positionLong?: number;
  altitude?: number;
  speed?: number;
  gpsAccuracy?: number;
  distance?: number;

  // Sensor fields
  heartRate?: number;
  power?: number;
  cadence?: number;
  temperature?: number;

  // Additional data
  [key: string]: any;
}

export interface EventMessage {
  timestamp: Date;
  event: string;
  eventType: string;
  data?: Record<string, any>;
}

export interface HrMessage {
  timestamp: Date;
  heartRate: number;
  rrInterval?: number;
  [key: string]: any;
}

export interface HrvMessage {
  timestamp: Date;
  rmssd?: number;
  pnn50?: number;
  hrv?: number;
  [key: string]: any;
}

export interface LiveMetrics {
  // Time metrics
  totalElapsedTime?: number; // Total wall clock time in seconds
  totalTimerTime?: number; // Active recording time in seconds (excludes pauses)

  // Distance & Speed
  distance?: number; // Total distance in meters
  currentSpeed?: number; // Current speed in m/s
  avgSpeed?: number; // Average speed in m/s
  maxSpeed?: number; // Maximum speed in m/s

  // Heart Rate
  currentHeartRate?: number; // Current HR in BPM
  avgHeartRate?: number; // Average HR in BPM
  maxHeartRate?: number; // Maximum HR in BPM
  minHeartRate?: number; // Minimum HR in BPM

  // Power
  currentPower?: number; // Current power in watts
  avgPower?: number; // Average power in watts
  maxPower?: number; // Maximum power in watts
  normalizedPower?: number; // Normalized power in watts

  // Cadence
  currentCadence?: number; // Current cadence in RPM
  avgCadence?: number; // Average cadence in RPM
  maxCadence?: number; // Maximum cadence in RPM

  // Derived metrics
  calories?: number; // Estimated calories burned
  elevation?: number; // Total elevation gain in meters
  grade?: number; // Current grade percentage

  // Additional metrics
  [key: string]: any;
}

export type RecordingStatus = "recording" | "paused" | "stopped";

export interface RecordingSession {
  id: string;
  profileId: string;
  startedAt: Date;
  endedAt?: Date;
  status: RecordingStatus;

  // Message arrays
  recordMessages: RecordMessage[];
  eventMessages: EventMessage[];
  hrMessages: HrMessage[];
  hrvMessages: HrvMessage[];

  // Live metrics that update during recording
  liveMetrics: LiveMetrics;

  // Session metadata
  activityType?: string;
  name?: string;
  description?: string;
}

// Activity processing types
export interface ActivityData {
  id: string;
  profileId: string;
  startedAt: string; // ISO string
  endedAt: string; // ISO string
  recordMessages: Array<RecordMessage & { timestamp: string }>;
  eventMessages: Array<EventMessage & { timestamp: string }>;
  hrMessages: Array<HrMessage & { timestamp: string }>;
  hrvMessages: Array<HrvMessage & { timestamp: string }>;
  liveMetrics: LiveMetrics;
  status: RecordingStatus;
}

// UI/Display types
export interface ActivityMetric {
  id: string;
  title: string;
  value: string;
  unit: string;
  icon: string;
  isLive: boolean;
}

export interface GpsLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  timestamp: Date;
}

// Export utility types
export type ActivityMetrics = LiveMetrics;
