export interface ActivityLap {
  startTime: Date;
  totalTime: number;
  totalDistance: number;
  avgSpeed?: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;
}
export interface ActivityRecord {
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
  };
  laps?: ActivityLap[];
  records: ActivityRecord[];
}
