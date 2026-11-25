import { athletePerformanceTargetFactsSchema } from "@repo/core";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });

export const thresholdHistoryCursorSchema = z
  .object({
    effectiveAt: instantSchema,
    createdAt: instantSchema,
    thresholdId: uuidSchema,
  })
  .strict();

export const thresholdOverviewRequestSchema = z
  .object({
    historyLimit: z.number().int().min(1).max(100).default(20),
    historyCursor: thresholdHistoryCursorSchema.optional(),
  })
  .strict();

const thresholdHistorySourceActivitySchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    finishedAt: instantSchema,
  })
  .strict();

const thresholdHistoryItemFields = {
  thresholdId: uuidSchema,
  value: z.number().finite().positive(),
  confidence: z.number().finite().min(0).max(1),
  effectiveAt: instantSchema,
  policyVersion: z.string().trim().min(1),
  sourceActivities: z.array(thresholdHistorySourceActivitySchema).min(1).max(8),
} as const;

export const calculatedThresholdHistoryItemSchema = z.union([
  z
    .object({
      ...thresholdHistoryItemFields,
      activityCategory: z.literal("bike"),
      metric: z.literal("power"),
      unit: z.literal("watts"),
      method: z.literal("bike_power_30m"),
    })
    .strict(),
  z
    .object({
      ...thresholdHistoryItemFields,
      activityCategory: z.literal("run"),
      metric: z.literal("speed"),
      unit: z.literal("meters_per_second"),
      method: z.literal("run_speed_30m"),
    })
    .strict(),
  z
    .object({
      ...thresholdHistoryItemFields,
      activityCategory: z.literal("swim"),
      metric: z.literal("speed"),
      unit: z.literal("meters_per_second"),
      method: z.literal("swim_speed_15m"),
    })
    .strict(),
  z
    .object({
      ...thresholdHistoryItemFields,
      activityCategory: z.enum(["bike", "run", "swim"]),
      metric: z.literal("lthr"),
      unit: z.literal("bpm"),
      method: z.literal("lthr_30m_final_20m"),
    })
    .strict(),
]);

export const thresholdOverviewResponseSchema = z
  .object({
    current: athletePerformanceTargetFactsSchema,
    history: z
      .object({
        items: z.array(calculatedThresholdHistoryItemSchema).max(100),
        nextCursor: thresholdHistoryCursorSchema.nullable(),
      })
      .strict(),
    publication: z
      .object({
        computedAt: instantSchema.nullable(),
        status: z.enum(["available", "stale", "unavailable"]),
        publishedRevision: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

export type ThresholdOverviewResponse = z.infer<typeof thresholdOverviewResponseSchema>;
export type CalculatedThresholdHistoryItem = z.infer<typeof calculatedThresholdHistoryItemSchema>;
