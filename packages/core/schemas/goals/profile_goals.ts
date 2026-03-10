import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const targetActivityCategoryEnum = z.enum(["run", "bike", "swim", "other"]);
const targetWeightSchema = z.number().positive().finite().optional();

export const profileGoalTargetSchema = z.discriminatedUnion("target_type", [
  z.object({
    target_type: z.literal("race_performance"),
    distance_m: z.number().positive(),
    target_time_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
    weight: targetWeightSchema,
  }),
  z.object({
    target_type: z.literal("pace_threshold"),
    target_speed_mps: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
    weight: targetWeightSchema,
  }),
  z.object({
    target_type: z.literal("power_threshold"),
    target_watts: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
    weight: targetWeightSchema,
  }),
  z.object({
    target_type: z.literal("hr_threshold"),
    target_lthr_bpm: z.number().int().positive(),
    weight: targetWeightSchema,
  }),
]);

/**
 * Legacy goal payload shape retained for compatibility conversion paths.
 */
export const profileGoalLegacySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  target_date: dateOnlySchema,
  priority: z.number().int().min(0).max(10).default(5),
  targets: z.array(profileGoalTargetSchema).min(1),
  target_performance: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Canonical profile-goal record schema used by the new profile_goals domain.
 *
 * This remains additive and compatibility-safe by preserving mappings from the
 * legacy training-plan goal target model.
 */
export const profileGoalSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  training_plan_id: z.string().uuid().nullable().optional(),
  milestone_event_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(100),
  goal_type: z.string().min(1).max(80),
  target_metric: z.string().min(1).max(80).nullable().optional(),
  target_value: z.number().finite().nullable().optional(),
  importance: z.number().int().min(0).max(10).default(5),
  notes: z.string().max(1000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  target_date: dateOnlySchema.optional(),
});

export const profileGoalCreateSchema = profileGoalSchema.omit({
  id: true,
});

export type ProfileGoal = z.infer<typeof profileGoalSchema>;
export type ProfileGoalCreate = z.infer<typeof profileGoalCreateSchema>;
export type ProfileGoalTarget = z.infer<typeof profileGoalTargetSchema>;
export type ProfileGoalLegacy = z.infer<typeof profileGoalLegacySchema>;
