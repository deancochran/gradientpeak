import { canonicalActivityCategorySchema } from "@repo/core";
import { planningDayIdentitySchema } from "@repo/core/athlete-intelligence";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });

export const trainingEffectDtoSchema = z
  .object({
    activityId: uuidSchema,
    activityAnalysisRevision: z.number().int().positive(),
    effectiveAt: instantSchema,
    planningDate: planningDayIdentitySchema,
    calculationVersion: z.string().trim().min(1).max(64),
    activityCategory: canonicalActivityCategorySchema,
    commonLoad: z.number().finite().nonnegative(),
    evidenceConfidence: z.number().finite().min(0).max(1),
    capabilityObservation: z
      .object({
        distanceMeters: z.number().finite().nonnegative().nullable(),
        durationMinutes: z.number().finite().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const trainingEffectsRequestSchema = z
  .object({
    profileId: uuidSchema,
    fromEffectiveAt: instantSchema,
    limit: z.number().int().min(1).max(100).default(50),
    after: z
      .object({
        effectiveAt: instantSchema,
        activityId: uuidSchema,
        activityAnalysisRevision: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const trainingEffectsPageDtoSchema = z
  .object({ items: z.array(trainingEffectDtoSchema).max(100), hasMore: z.boolean() })
  .strict();

export type TrainingEffectDto = z.infer<typeof trainingEffectDtoSchema>;
