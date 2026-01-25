/**
 * @file
 * Provides a centralized, single source of truth for calculating activity durations.
 * This ensures consistency across different parts of the application,
 * from live recording to FIT file encoding and backend processing.
 */
import type {
  StandardActivity,
  ActivityLap,
  ActivityRecord,
} from "../types/normalization";
interface DurationSource {
  startTime: Date;
  endTime?: Date;
  totalTime?: number;
  records?: Pick<ActivityRecord, "timestamp">[];
  laps?: Pick<ActivityLap, "startTime" | "totalTime">[];
}
/**
 * Calculates the primary duration of an activity from a source object.
 * This function provides a consistent method for determining duration
 * between live recording, FIT file encoding, and backend processing.
 *
 * Precedence Order:
 * 1. `totalTime` (if provided directly)
 * 2. `endTime` - `startTime`
 * 3. `lastRecord.timestamp` - `startTime`
 * 4. `lastLap.endTime` - `startTime`
 *
 * @param source - The data source for the activity.
 * @returns The calculated duration in seconds.
 * @throws If duration cannot be determined.
 */
export function calculateDuration(source: DurationSource): number {
  // 1. Direct totalTime override
  if (source.totalTime !== undefined && source.totalTime > 0) {
    return source.totalTime;
  }
  const { startTime } = source;
  let endTime: Date | undefined = source.endTime;
  // 2. Determine endTime from records or laps if not provided
  if (!endTime) {
    const lastRecord = source.records?.[source.records.length - 1];
    if (lastRecord) {
      endTime = lastRecord.timestamp;
    } else if (source.laps?.length) {
      const lastLap = source.laps?.[source.laps.length - 1];
      if (lastLap) {
        endTime = new Date(
          lastLap.startTime.getTime() + lastLap.totalTime * 1000,
        );
      }
    }
  }
  // 3. Calculate from startTime and endTime
  if (endTime) {
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    return Math.max(0, duration);
  }
  // 4. Fallback for activities with no records, laps, or end time
  if (source.totalTime === 0) return 0;
  throw new Error(
    "Could not determine activity duration from the provided source.",
  );
}
/**
 * Calculates the end time of an activity.
 *
 * @param activity - The activity data.
 * @returns The end timestamp as a Date object.
 */
export function calculateEndTime(activity: StandardActivity): Date {
  const duration = calculateDuration({
    startTime: activity.metadata.startTime,
    totalTime: activity.summary.totalTime,
    records: activity.records,
    laps: activity.laps,
  });
  return new Date(activity.metadata.startTime.getTime() + duration * 1000);
}
