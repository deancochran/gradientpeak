// Re-export relations if you need them

import {
  activityRecordings,
  activityRecordingStreams,
} from "./activity_recordings";

export type SelectActivityRecording = typeof activityRecordings.$inferSelect;
export type InsertActivityRecording = typeof activityRecordings.$inferInsert;
export type SelectRecordingStream =
  typeof activityRecordingStreams.$inferSelect;
export type InsertRecordingStream =
  typeof activityRecordingStreams.$inferInsert;

// Re-export schema tables for type inference
export { activityRecordings, activityRecordingStreams };
