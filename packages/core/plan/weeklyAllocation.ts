import { z } from "zod";
import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import { canonicalSportSchema } from "../schemas/sport";
import {
  type ActivityCategoryPrescription,
  activityCategoryPrescriptionSchema,
  keyExposureSchema,
  prescriptionActivityRoleSchema,
  prescriptionIntensityDistributionSchema,
  prescriptionLoadMethodSchema,
  prescriptionVolumeUnitSchema,
  type TrainingPrescription,
} from "./trainingPrescription";

const orderedRangeSchema = z
  .object({
    minimum_effective: z.number().min(0),
    target: z.number().min(0),
    maximum_recoverable: z.number().min(0),
  })
  .strict()
  .superRefine((range, ctx) => {
    if (range.minimum_effective > range.target) {
      ctx.addIssue({
        code: "custom",
        path: ["minimum_effective"],
        message: "minimum_effective cannot exceed target",
      });
    }
    if (range.target > range.maximum_recoverable) {
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "target cannot exceed maximum_recoverable",
      });
    }
  });

export const weeklyAllocationActivityCategorySchema = z
  .object({
    role: prescriptionActivityRoleSchema,
    volume: orderedRangeSchema.extend({
      unit: prescriptionVolumeUnitSchema,
      duration_minutes: orderedRangeSchema.optional(),
    }),
    sessions: z
      .object({
        min: z.number().int().min(0),
        target: z.number().int().min(0),
        max: z.number().int().min(0),
      })
      .strict()
      .superRefine((sessions, ctx) => {
        if (sessions.min > sessions.target) {
          ctx.addIssue({ code: "custom", path: ["min"], message: "min cannot exceed target" });
        }
        if (sessions.target > sessions.max) {
          ctx.addIssue({ code: "custom", path: ["target"], message: "target cannot exceed max" });
        }
      }),
    key_exposures: z.array(keyExposureSchema),
    intensity_distribution: prescriptionIntensityDistributionSchema,
    load_model: z
      .object({
        load_method: prescriptionLoadMethodSchema,
        fatigue_cost_multiplier: z.number().min(0),
        mechanical_load_multiplier: z.number().min(0),
      })
      .strict(),
  })
  .strict();

export const weeklyAllocationSchema = z
  .object({
    version: z.literal(1),
    activity_categories: z.partialRecord(
      canonicalSportSchema,
      weeklyAllocationActivityCategorySchema,
    ),
    totals: z
      .object({
        target_duration_minutes: z.number().min(0),
        target_sessions: z.number().int().min(0),
        estimated_fatigue_cost: z.number().min(0),
      })
      .strict(),
  })
  .strict()
  .superRefine((allocation, ctx) => {
    if (Object.keys(allocation.activity_categories).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["activity_categories"],
        message: "At least one activity category allocation is required",
      });
    }
  });

export type WeeklyAllocationActivityCategory = z.infer<
  typeof weeklyAllocationActivityCategorySchema
>;
export type WeeklyAllocation = z.infer<typeof weeklyAllocationSchema>;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampScale(value: number, scale: number): number {
  return Math.max(0, round1(value * scale));
}

function resolveDurationMinutes(prescription: ActivityCategoryPrescription): number {
  if (prescription.volume.duration_minutes) return prescription.volume.duration_minutes.target;
  if (prescription.volume.unit === "minutes") return prescription.volume.target;
  if (prescription.volume.unit === "sets") return prescription.volume.target * 6;
  return prescription.volume.target;
}

function scaleVolume(
  prescription: ActivityCategoryPrescription,
  scale: number,
): WeeklyAllocationActivityCategory["volume"] {
  const scaledDuration = prescription.volume.duration_minutes
    ? {
        minimum_effective: clampScale(
          prescription.volume.duration_minutes.minimum_effective,
          scale,
        ),
        target: clampScale(prescription.volume.duration_minutes.target, scale),
        maximum_recoverable: clampScale(
          prescription.volume.duration_minutes.maximum_recoverable,
          scale,
        ),
      }
    : undefined;

  return {
    unit: prescription.volume.unit,
    minimum_effective: clampScale(prescription.volume.minimum_effective, scale),
    target: clampScale(prescription.volume.target, scale),
    maximum_recoverable: clampScale(prescription.volume.maximum_recoverable, scale),
    ...(scaledDuration ? { duration_minutes: scaledDuration } : {}),
  };
}

export function resolveWeeklyAllocation(input: {
  prescription: TrainingPrescription;
  preferences?: AthletePreferenceProfile | null;
}): WeeklyAllocation {
  const maxWeeklyDurationMinutes =
    input.preferences?.dose_limits.max_weekly_duration_minutes ??
    input.prescription.global_constraints.max_weekly_duration_minutes;
  const rawTotalDuration = Object.values(input.prescription.activity_categories).reduce(
    (sum, category) => sum + resolveDurationMinutes(category),
    0,
  );
  const durationScale =
    maxWeeklyDurationMinutes && rawTotalDuration > maxWeeklyDurationMinutes
      ? maxWeeklyDurationMinutes / rawTotalDuration
      : 1;

  const activityCategories = Object.fromEntries(
    Object.entries(input.prescription.activity_categories).map(
      ([activityCategory, prescription]) => [
        activityCategory,
        weeklyAllocationActivityCategorySchema.parse({
          role: prescription.role,
          volume: scaleVolume(prescription, durationScale),
          sessions: {
            min: prescription.sessions.min_per_week,
            target: prescription.sessions.target_per_week,
            max: prescription.sessions.max_per_week,
          },
          key_exposures: prescription.key_exposures,
          intensity_distribution: prescription.intensity_distribution,
          load_model: {
            load_method: prescription.load_model.load_method,
            fatigue_cost_multiplier: prescription.load_model.fatigue_cost_multiplier,
            mechanical_load_multiplier: prescription.load_model.mechanical_load_multiplier,
          },
        }),
      ],
    ),
  );

  const targetDurationMinutes = Object.values(activityCategories).reduce((sum, category) => {
    if (category.volume.duration_minutes) return sum + category.volume.duration_minutes.target;
    if (category.volume.unit === "minutes") return sum + category.volume.target;
    if (category.volume.unit === "sets") return sum + category.volume.target * 6;
    return sum + category.volume.target;
  }, 0);
  const targetSessions = Object.values(activityCategories).reduce(
    (sum, category) => sum + category.sessions.target,
    0,
  );
  const estimatedFatigueCost = Object.values(activityCategories).reduce((sum, category) => {
    const duration =
      category.volume.duration_minutes?.target ??
      (category.volume.unit === "minutes" ? category.volume.target : category.volume.target * 6);
    return sum + duration * category.load_model.fatigue_cost_multiplier;
  }, 0);

  return weeklyAllocationSchema.parse({
    version: 1,
    activity_categories: activityCategories,
    totals: {
      target_duration_minutes: round1(targetDurationMinutes),
      target_sessions: targetSessions,
      estimated_fatigue_cost: round1(estimatedFatigueCost),
    },
  });
}

export function assertWeeklyAllocationCategory(value: unknown): WeeklyAllocationActivityCategory {
  return weeklyAllocationActivityCategorySchema.parse(value);
}
