import { z } from "zod";

export const scheduledTrainingItemSourceSchema = z.enum([
  "training_plan",
  "manual_event",
  "group_event",
]);
export const completedTrainingItemSourceSchema = z.enum(["completed_activity", "activity_effort"]);
export const scheduledTrainingItemStatusSchema = z.enum([
  "planned",
  "tentative",
  "completed",
  "cancelled",
]);
export const trainingTimelineAnnotationToneSchema = z.enum(["info", "warning", "risk"]);

export const scheduledTrainingItemSchema = z
  .object({
    id: z.string(),
    source: scheduledTrainingItemSourceSchema,
    date: z.string(),
    title: z.string(),
    activityCategory: z.string().nullable().optional(),
    plannedLoadTss: z.number().finite().nonnegative().nullable().optional(),
    status: scheduledTrainingItemStatusSchema.default("planned"),
  })
  .strict();

export const completedTrainingItemSchema = z
  .object({
    id: z.string(),
    source: completedTrainingItemSourceSchema,
    date: z.string(),
    title: z.string(),
    activityCategory: z.string().nullable().optional(),
    completedLoadTss: z.number().finite().nonnegative().nullable().optional(),
  })
  .strict();

export const trainingTimelineAnnotationSchema = z
  .object({
    code: z.string(),
    message: z.string().optional(),
    tone: trainingTimelineAnnotationToneSchema.default("info"),
  })
  .strict();

export const trainingTimelineConfidenceSchema = z
  .object({
    score: z.number().min(0).max(100).nullable().optional(),
    reasons: z.array(z.string()).default([]),
  })
  .strict();

export const trainingLoadComparisonSchema = z
  .object({
    plannedTss: z.number().finite().nonnegative(),
    scheduledTss: z.number().finite().nonnegative(),
    tentativeScheduledTss: z.number().finite().nonnegative(),
    completedTss: z.number().finite().nonnegative(),
    remainingTss: z.number().finite(),
    recommendedTss: z.number().finite().nonnegative().nullable(),
    deltaTss: z.number().finite(),
  })
  .strict();

export const trainingDaySummarySchema = z
  .object({
    date: z.string(),
    load: trainingLoadComparisonSchema,
    scheduledItems: z.array(scheduledTrainingItemSchema).default([]),
    completedItems: z.array(completedTrainingItemSchema).default([]),
    annotations: z.array(trainingTimelineAnnotationSchema).default([]),
    confidence: trainingTimelineConfidenceSchema.nullable().optional(),
  })
  .strict();

export const trainingWeekSummarySchema = z
  .object({
    weekStart: z.string(),
    weekEnd: z.string(),
    load: trainingLoadComparisonSchema,
    dayCount: z.number().int().nonnegative(),
    trainingDayCount: z.number().int().nonnegative(),
  })
  .strict();

export const trainingTimelineWindowSchema = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
    today: z.string(),
    days: z.array(trainingDaySummarySchema),
    weeks: z.array(trainingWeekSummarySchema),
  })
  .strict();

export type ScheduledTrainingItem = z.infer<typeof scheduledTrainingItemSchema>;
export type CompletedTrainingItem = z.infer<typeof completedTrainingItemSchema>;
export type TrainingTimelineAnnotation = z.infer<typeof trainingTimelineAnnotationSchema>;
export type TrainingTimelineConfidence = z.infer<typeof trainingTimelineConfidenceSchema>;
export type TrainingLoadComparison = z.infer<typeof trainingLoadComparisonSchema>;
export type TrainingDaySummary = z.infer<typeof trainingDaySummarySchema>;
export type TrainingWeekSummary = z.infer<typeof trainingWeekSummarySchema>;
export type TrainingTimelineWindow = z.infer<typeof trainingTimelineWindowSchema>;
