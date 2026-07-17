import type { ContentVisibility, RecordingActivityCategory } from "@repo/core";

export interface PreparedRecordedActivityDraft {
  content_visibility?: ContentVisibility;
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
