import { z } from "zod";

const finiteNumberSchema = z.number().finite();
const timestampLikeSchema = z.union([finiteNumberSchema, z.string()]);

export const activityStreamRecordSchema = z
  .object({
    heartRate: finiteNumberSchema.optional(),
    heart_rate: finiteNumberSchema.optional(),
    heart_rate_bpm: finiteNumberSchema.optional(),
    startTime: timestampLikeSchema.optional(),
    time: timestampLikeSchema.optional(),
    timestamp: timestampLikeSchema.optional(),
  })
  .passthrough();

export const activityLapRecordSchema = z
  .object({
    averageSpeed: finiteNumberSchema.optional(),
    avgSpeed: finiteNumberSchema.optional(),
    avg_speed: finiteNumberSchema.optional(),
    distance: finiteNumberSchema.optional(),
    distanceMeters: finiteNumberSchema.optional(),
    distance_meters: finiteNumberSchema.optional(),
    duration: finiteNumberSchema.optional(),
    durationSeconds: finiteNumberSchema.optional(),
    totalDistance: finiteNumberSchema.optional(),
    totalElapsedTime: finiteNumberSchema.optional(),
    totalTime: finiteNumberSchema.optional(),
    totalTimerTime: finiteNumberSchema.optional(),
  })
  .passthrough();

export const activityStreamRecordListSchema = z.array(activityStreamRecordSchema);
export const activityLapRecordListSchema = z.array(activityLapRecordSchema);

export type ActivityStreamRecord = z.infer<typeof activityStreamRecordSchema>;
export type ActivityLapRecord = z.infer<typeof activityLapRecordSchema>;

export function parseActivityStreamRecords(input: unknown): ActivityStreamRecord[] {
  const result = activityStreamRecordListSchema.safeParse(input);
  return result.success ? result.data : [];
}

export function parseActivityLapRecords(input: unknown): ActivityLapRecord[] {
  const result = activityLapRecordListSchema.safeParse(input);
  return result.success ? result.data : [];
}
