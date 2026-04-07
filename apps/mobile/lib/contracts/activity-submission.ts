import type { RecordingActivityCategory } from "@repo/core";

export interface PreparedRecordedActivityDraft {
  is_private?: boolean;
  activityPlanId?: string | null;
  avgCadence?: number;
  avgHeartRate?: number;
  avgPower?: number;
  avgSpeedMps?: number;
  calories?: number;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  finishedAt: Date;
  maxCadence?: number;
  maxHeartRate?: number;
  maxPower?: number;
  maxSpeedMps?: number;
  movingSeconds: number;
  name: string;
  normalizedPower?: number;
  notes?: string | null;
  profileId: string;
  startedAt: Date;
  activityType: RecordingActivityCategory;
}
