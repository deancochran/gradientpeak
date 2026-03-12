import { z } from "zod";
import { profileGoalTargetSchema } from "../goals/profile_goals";
import { canonicalSportSchema, planningSportSchema } from "../sport";

const nonNegativeFiniteNumberSchema = z.number().finite().min(0);

export const trajectoryModeSchema = z.enum([
  "target_seeking",
  "capacity_bounded",
]);

export const trajectoryPhaseSchema = z.enum([
  "build",
  "deload",
  "taper",
  "event",
  "recovery",
  "maintenance",
]);

export const calculatedParameterModifierOperationSchema = z.enum([
  "scale",
  "clamp",
  "add",
  "replace",
]);

export const calculatedParameterSchema = z
  .object({
    key: z.string().min(1),
    unit: z.string().min(1),
    baseline: z.number().finite(),
    modifiers: z
      .array(
        z
          .object({
            source: z.string().min(1),
            operation: calculatedParameterModifierOperationSchema,
            value: z.number().finite(),
          })
          .strict(),
      )
      .default([]),
    effective: z.number().finite(),
    min_bound: z.number().finite().optional(),
    max_bound: z.number().finite().optional(),
    clamped: z.boolean(),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const feasibilityAssessmentStatusSchema = z.enum([
  "feasible",
  "infeasible_ramp",
  "infeasible_availability",
  "infeasible_multigoal",
  "infeasible_recovery",
  "unsupported_goal_mapping",
]);

export const feasibilityAssessmentSchema = z
  .object({
    status: feasibilityAssessmentStatusSchema,
    limiting_constraints: z.array(z.string().min(1)).default([]),
    required_peak_ctl: nonNegativeFiniteNumberSchema.optional(),
    achievable_peak_ctl: nonNegativeFiniteNumberSchema.optional(),
    readiness_gap_ctl: nonNegativeFiniteNumberSchema.optional(),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const referenceTrajectoryPointSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    target_ctl: nonNegativeFiniteNumberSchema,
    target_tss: nonNegativeFiniteNumberSchema,
    target_atl_ceiling: nonNegativeFiniteNumberSchema.optional(),
    phase: trajectoryPhaseSchema,
    goal_ids_in_effect: z.array(z.string().uuid()).default([]),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const referenceTrajectorySchema = z
  .object({
    mode: trajectoryModeSchema,
    sport: planningSportSchema,
    points: z.array(referenceTrajectoryPointSchema),
    feasibility: feasibilityAssessmentSchema,
    calculated_parameters: z.record(z.string(), calculatedParameterSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (let index = 1; index < value.points.length; index += 1) {
      const previous = value.points[index - 1];
      const current = value.points[index];

      if (previous && current && current.date < previous.date) {
        ctx.addIssue({
          code: "custom",
          path: ["points", index, "date"],
          message: "ReferenceTrajectory points must be date-ordered",
        });
      }
    }
  });

export const planningGoalPriorityClassSchema = z.enum(["A", "B", "C"]);

export const normalizedPlanningGoalSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    priority: z.number().int().min(0).max(10),
    priority_class: planningGoalPriorityClassSchema,
    activity_category: canonicalSportSchema,
    targets: z.array(profileGoalTargetSchema).min(1),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const eventDemandFamilySchema = z.enum([
  "race_performance",
  "threshold_pace",
  "threshold_power",
  "threshold_hr",
]);

export const eventDemandTargetContributionSchema = z
  .object({
    target_type: z.enum([
      "race_performance",
      "pace_threshold",
      "power_threshold",
      "hr_threshold",
    ]),
    weight: z.number().positive().finite(),
    weight_share: z.number().min(0).max(1),
    required_peak_ctl: nonNegativeFiniteNumberSchema,
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const eventDemandSchema = z
  .object({
    goal_id: z.string().uuid(),
    sport: canonicalSportSchema,
    demand_family: eventDemandFamilySchema,
    demand_duration_minutes: nonNegativeFiniteNumberSchema,
    required_peak_ctl: nonNegativeFiniteNumberSchema,
    required_weekly_load_floor: nonNegativeFiniteNumberSchema,
    target_contributions: z.array(eventDemandTargetContributionSchema).min(1),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type TrajectoryMode = z.infer<typeof trajectoryModeSchema>;
export type TrajectoryPhase = z.infer<typeof trajectoryPhaseSchema>;
export type CalculatedParameter = z.infer<typeof calculatedParameterSchema>;
export type FeasibilityAssessment = z.infer<typeof feasibilityAssessmentSchema>;
export type FeasibilityAssessmentStatus = z.infer<
  typeof feasibilityAssessmentStatusSchema
>;
export type ReferenceTrajectoryPoint = z.infer<
  typeof referenceTrajectoryPointSchema
>;
export type ReferenceTrajectory = z.infer<typeof referenceTrajectorySchema>;
export type PlanningGoalPriorityClass = z.infer<
  typeof planningGoalPriorityClassSchema
>;
export type NormalizedPlanningGoal = z.infer<
  typeof normalizedPlanningGoalSchema
>;
export type EventDemandFamily = z.infer<typeof eventDemandFamilySchema>;
export type EventDemand = z.infer<typeof eventDemandSchema>;
