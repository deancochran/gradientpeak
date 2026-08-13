import { z } from "zod";

import { dateOnlySchema } from "../schemas/date-only";

export const planningLedgerPeriodSchema = z.enum(["day", "week", "month"]);
export type PlanningLedgerPeriod = z.infer<typeof planningLedgerPeriodSchema>;

export const planningLedgerRequestSchema = z
  .object({
    period: planningLedgerPeriodSchema,
    anchorDate: dateOnlySchema,
  })
  .strict();
export type PlanningLedgerRequest = z.infer<typeof planningLedgerRequestSchema>;

export const planningLedgerLoadStatusSchema = z.enum([
  "complete",
  "partial",
  "known_zero",
  "unavailable",
]);

export const planningLedgerMetricValueSchema = z
  .object({
    status: planningLedgerLoadStatusSchema,
    value: z.number().finite().nonnegative().nullable(),
  })
  .strict();

const ledgerTrainingStateValueSchema = z
  .object({
    status: z.enum(["available", "unavailable"]),
    value: z.number().finite().nullable(),
    observedOn: dateOnlySchema.nullable(),
    source: z.enum(["actual", "scheduled_projection"]).nullable(),
  })
  .strict();

const ledgerDailyBreakdownSchema = z
  .object({
    date: dateOnlySchema,
    completed: planningLedgerMetricValueSchema,
    planned: planningLedgerMetricValueSchema,
    remaining: planningLedgerMetricValueSchema,
    effective: planningLedgerMetricValueSchema,
    intensity: planningLedgerMetricValueSchema,
    contributingDurationSeconds: planningLedgerMetricValueSchema,
  })
  .strict();

const ledgerEntrySchema = z
  .object({
    id: z.string().min(1),
    date: dateOnlySchema,
    startsAt: z.string().datetime({ offset: true }).nullable(),
    kind: z.enum(["completed", "planned", "event", "group_event", "goal"]),
    title: z.string().min(1).max(500),
    status: z.string().min(1).max(80),
    load: planningLedgerMetricValueSchema,
    intensity: planningLedgerMetricValueSchema,
    contributingDurationSeconds: planningLedgerMetricValueSchema,
    navigation: z
      .object({
        target: z.enum(["activity", "event", "group_event", "goal"]),
        id: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

const ledgerMilestoneSchema = z
  .object({
    id: z.string().min(1),
    date: dateOnlySchema,
    label: z.string().min(1).max(500),
    activityCategory: z.string().nullable(),
  })
  .strict();

const ledgerSourceRangeSchema = z
  .object({
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    status: z.enum(["complete", "partial"]),
  })
  .strict();

export const planningLedgerSchema = z
  .object({
    contractVersion: z.literal("planning-ledger-v3"),
    period: planningLedgerPeriodSchema,
    anchorDate: dateOnlySchema,
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
    planningTimezone: z.string().min(1).nullable(),
    asOf: z.string().datetime({ offset: true }),
    load: z
      .object({
        completed: planningLedgerMetricValueSchema,
        planned: planningLedgerMetricValueSchema,
        remaining: planningLedgerMetricValueSchema,
        effective: planningLedgerMetricValueSchema,
      })
      .strict(),
    intensity: planningLedgerMetricValueSchema,
    contributingDurationSeconds: planningLedgerMetricValueSchema,
    trainingState: z
      .object({
        actual: z
          .object({
            fitness: ledgerTrainingStateValueSchema,
            fatigue: ledgerTrainingStateValueSchema,
          })
          .strict(),
        planned: z
          .object({
            fitness: ledgerTrainingStateValueSchema,
            fatigue: ledgerTrainingStateValueSchema,
          })
          .strict(),
      })
      .strict(),
    dailyBreakdown: z.array(ledgerDailyBreakdownSchema).max(31),
    entries: z.array(ledgerEntrySchema).max(500),
    entriesTruncated: z.boolean(),
    milestones: z.array(ledgerMilestoneSchema).max(100),
    sourceCoverage: z
      .object({
        activities: ledgerSourceRangeSchema.nullable(),
        scheduledItems: ledgerSourceRangeSchema.nullable(),
        calendarEvents: ledgerSourceRangeSchema.nullable(),
        groupEvents: ledgerSourceRangeSchema.nullable(),
      })
      .strict(),
    modelContext: z
      .object({
        commonLoadModel: z.literal("gradientpeak_relative_load"),
        commonLoadVersion: z.string().min(1),
        publishedRevision: z.number().int().nonnegative().nullable(),
        algorithmVersion: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict();
export type PlanningLedger = z.infer<typeof planningLedgerSchema>;
