import { z } from "zod";
import { trainingLoadValueStatusSchema } from "../plan/trainingLoadTimeline";

export const scheduledTrainingItemSourceSchema = z.enum([
  "training_plan",
  "manual_event",
  "group_event",
]);
export const completedTrainingItemSourceSchema = z.enum(["completed_activity", "activity_effort"]);
export const scheduledTrainingItemStatusSchema = z.enum(["planned", "completed", "cancelled"]);
export const trainingTimelineAnnotationToneSchema = z.enum(["info", "warning", "risk"]);

const scheduledTrainingItemInputSchema = z
  .object({
    id: z.string(),
    source: scheduledTrainingItemSourceSchema,
    date: z.string(),
    title: z.string(),
    activityCategory: z.string().nullable().optional(),
    plannedLoad: z.number().finite().nonnegative().nullable().optional(),
    plannedLoadStatus: trainingLoadValueStatusSchema.optional(),
    status: scheduledTrainingItemStatusSchema.default("planned"),
  })
  .strict();
const scheduledTrainingItemOutputSchema = z
  .object({
    id: z.string(),
    source: scheduledTrainingItemSourceSchema,
    date: z.string(),
    title: z.string(),
    activityCategory: z.string().nullable().optional(),
    plannedLoad: z.number().finite().nonnegative().nullable(),
    plannedLoadStatus: trainingLoadValueStatusSchema,
    status: scheduledTrainingItemStatusSchema,
  })
  .strict()
  .superRefine((item, context) => {
    const valid =
      item.plannedLoadStatus === "unavailable"
        ? item.plannedLoad === null
        : item.plannedLoadStatus === "known_zero"
          ? item.plannedLoad === 0
          : item.plannedLoad !== null;
    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["plannedLoad"],
        message: `Planned Load does not match ${item.plannedLoadStatus} status`,
      });
    }
  });
export const scheduledTrainingItemSchema = scheduledTrainingItemInputSchema
  .transform((item) => {
    const plannedLoad = item.plannedLoad ?? null;
    const plannedLoadStatus =
      item.plannedLoadStatus ??
      (plannedLoad === null ? "unavailable" : plannedLoad === 0 ? "known_zero" : "complete");
    return { ...item, plannedLoad, plannedLoadStatus };
  })
  .pipe(scheduledTrainingItemOutputSchema);

const completedTrainingItemInputSchema = z
  .object({
    id: z.string(),
    source: completedTrainingItemSourceSchema,
    date: z.string(),
    title: z.string(),
    activityCategory: z.string().nullable().optional(),
    completedLoad: z.number().finite().nonnegative().nullable().optional(),
    completedLoadStatus: trainingLoadValueStatusSchema.optional(),
  })
  .strict();
const completedTrainingItemOutputSchema = z
  .object({
    id: z.string(),
    source: completedTrainingItemSourceSchema,
    date: z.string(),
    title: z.string(),
    activityCategory: z.string().nullable().optional(),
    completedLoad: z.number().finite().nonnegative().nullable(),
    completedLoadStatus: trainingLoadValueStatusSchema,
  })
  .strict()
  .superRefine((item, context) => {
    const valid =
      item.completedLoadStatus === "unavailable"
        ? item.completedLoad === null
        : item.completedLoadStatus === "known_zero"
          ? item.completedLoad === 0
          : item.completedLoad !== null;
    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["completedLoad"],
        message: `Completed Load does not match ${item.completedLoadStatus} status`,
      });
    }
  });
export const completedTrainingItemSchema = completedTrainingItemInputSchema
  .transform((item) => {
    const completedLoad = item.completedLoad ?? null;
    const completedLoadStatus =
      item.completedLoadStatus ??
      (completedLoad === null ? "unavailable" : completedLoad === 0 ? "known_zero" : "complete");
    return { ...item, completedLoad, completedLoadStatus };
  })
  .pipe(completedTrainingItemOutputSchema);

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
    plannedLoad: z.number().finite().nonnegative().nullable(),
    plannedLoadStatus: trainingLoadValueStatusSchema,
    scheduledLoad: z.number().finite().nonnegative().nullable(),
    scheduledLoadStatus: trainingLoadValueStatusSchema,
    completedLoad: z.number().finite().nonnegative().nullable(),
    completedLoadStatus: trainingLoadValueStatusSchema,
    remainingLoad: z.number().finite().nonnegative().nullable(),
    remainingLoadStatus: trainingLoadValueStatusSchema,
    recommendedLoad: z.number().finite().nonnegative().nullable(),
    recommendedLoadStatus: trainingLoadValueStatusSchema,
    deltaLoad: z.number().finite().nullable(),
  })
  .strict()
  .superRefine((load, context) => {
    const validate = (
      value: number | null,
      status: z.infer<typeof trainingLoadValueStatusSchema>,
      path: string,
    ) => {
      const valid =
        status === "unavailable"
          ? value === null
          : status === "known_zero"
            ? value === 0
            : value !== null;
      if (!valid) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: `Load value does not match ${status} status`,
        });
      }
    };
    validate(load.plannedLoad, load.plannedLoadStatus, "plannedLoad");
    validate(load.scheduledLoad, load.scheduledLoadStatus, "scheduledLoad");
    validate(load.completedLoad, load.completedLoadStatus, "completedLoad");
    validate(load.remainingLoad, load.remainingLoadStatus, "remainingLoad");
    validate(load.recommendedLoad, load.recommendedLoadStatus, "recommendedLoad");
  });

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

export type ScheduledTrainingItem = z.input<typeof scheduledTrainingItemSchema>;
export type ParsedScheduledTrainingItem = z.output<typeof scheduledTrainingItemSchema>;
export type CompletedTrainingItem = z.input<typeof completedTrainingItemSchema>;
export type ParsedCompletedTrainingItem = z.output<typeof completedTrainingItemSchema>;
export type TrainingTimelineAnnotation = z.infer<typeof trainingTimelineAnnotationSchema>;
export type TrainingTimelineConfidence = z.infer<typeof trainingTimelineConfidenceSchema>;
export type TrainingLoadComparison = z.infer<typeof trainingLoadComparisonSchema>;
export type TrainingDaySummary = z.infer<typeof trainingDaySummarySchema>;
export type TrainingWeekSummary = z.infer<typeof trainingWeekSummarySchema>;
export type TrainingTimelineWindow = z.infer<typeof trainingTimelineWindowSchema>;
