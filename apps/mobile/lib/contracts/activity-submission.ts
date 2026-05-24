import type { RecordingActivityCategory } from "@repo/core";

export interface PreparedRecordedActivityDraft {
  is_private?: boolean;
  activityPlanId?: string | null;
  calories?: number;
  distanceMeters: number;
  durationSeconds: number;
  finishedAt: Date;
  movingSeconds: number;
  name: string;
  notes?: string | null;
  profileId: string;
  startedAt: Date;
  activityType: RecordingActivityCategory;
}
