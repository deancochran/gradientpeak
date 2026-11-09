import {
  thresholdActivityCategorySchema,
  thresholdMethodSchema,
  thresholdMetricSchema,
  thresholdUnitSchema,
} from "@repo/core/performance-calibration";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });

export const thresholdEvidenceExplanationDtoSchema = z
  .object({
    evidenceId: uuidSchema,
    activityId: uuidSchema,
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    method: thresholdMethodSchema,
    value: z.number().finite().positive(),
    observedAt: instantSchema,
    confidence: z.number().finite().min(0).max(1),
    calculationVersion: z.string().trim().min(1).max(64),
    policyVersion: z.string().trim().min(1),
  })
  .strict();

export const thresholdEvidenceRequestSchema = z
  .object({
    profileId: uuidSchema,
    fromObservedAt: instantSchema,
    limit: z.number().int().min(1).max(100).default(50),
    after: z.object({ observedAt: instantSchema, evidenceId: uuidSchema }).strict().optional(),
  })
  .strict();

export const thresholdEvidencePageDtoSchema = z
  .object({ items: z.array(thresholdEvidenceExplanationDtoSchema).max(100), hasMore: z.boolean() })
  .strict();

export type ThresholdEvidenceExplanationDto = z.infer<typeof thresholdEvidenceExplanationDtoSchema>;
