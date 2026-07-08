import { z } from "zod";
import type { ProfileGoal, ProfileGoalTarget } from "../schemas/goals/profile_goals";
import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import { type CanonicalSport, canonicalSportSchema } from "../schemas/sport";
import type { TrainingPlanCreationConfig } from "../schemas/training-plan-structure/creation-config-schemas";

const bounded01Schema = z.number().min(0).max(1);

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

export const goalPrescriptionTypeSchema = z.enum([
  "event_performance",
  "threshold",
  "completion",
  "consistency",
  "body_composition",
  "general_fitness",
  "strength",
  "hybrid",
]);

export const prescriptionSpecificityModeSchema = z.enum([
  "single_activity_category",
  "multi_activity_category",
  "hybrid_endurance_strength",
  "general",
]);

export const prescriptionActivityRoleSchema = z.enum([
  "primary",
  "secondary",
  "support",
  "recovery",
  "optional",
]);

export const prescriptionVolumeUnitSchema = z.enum([
  "minutes",
  "tss",
  "sets",
  "reps",
  "distance_m",
]);

export const prescriptionLoadMethodSchema = z.enum([
  "bike_power",
  "run_pace",
  "swim_threshold_speed",
  "heart_rate",
  "strength_volume",
  "rpe_duration",
  "manual_estimate",
]);

export const prescriptionIntensityBucketSchema = z.enum([
  "aerobic_recovery",
  "aerobic_endurance",
  "tempo",
  "threshold",
  "vo2",
  "anaerobic",
  "sprint",
  "strength_endurance",
  "hypertrophy",
  "max_strength",
  "power",
  "mobility",
]);

export const prescriptionIntensityDistributionSchema = z
  .partialRecord(prescriptionIntensityBucketSchema, bounded01Schema)
  .superRefine((distribution, ctx) => {
    const values = Object.values(distribution);
    if (values.length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one intensity bucket is required" });
      return;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > 0.01) {
      ctx.addIssue({ code: "custom", message: "Intensity bucket values must sum to 1.0" });
    }
  });

export const keyExposureTypeSchema = z.enum([
  "long_session",
  "threshold_interval",
  "vo2_interval",
  "anaerobic_interval",
  "race_specific",
  "strength_heavy",
  "strength_hypertrophy",
  "strength_power",
  "durability",
  "mobility",
  "technique",
  "recovery",
]);

export const keyExposureSchema = z
  .object({
    type: keyExposureTypeSchema,
    activity_category: canonicalSportSchema,
    min_frequency_per_week: z.number().min(0),
    target_frequency_per_week: z.number().min(0),
    max_frequency_per_week: z.number().min(0),
    min_duration_minutes: z.number().min(0).optional(),
    target_duration_minutes: z.number().min(0).optional(),
  })
  .strict()
  .superRefine((exposure, ctx) => {
    if (exposure.min_frequency_per_week > exposure.target_frequency_per_week) {
      ctx.addIssue({
        code: "custom",
        path: ["min_frequency_per_week"],
        message: "Minimum frequency cannot exceed target frequency",
      });
    }
    if (exposure.target_frequency_per_week > exposure.max_frequency_per_week) {
      ctx.addIssue({
        code: "custom",
        path: ["target_frequency_per_week"],
        message: "Target frequency cannot exceed maximum frequency",
      });
    }
  });

export const goalPrescriptionDemandSchema = z
  .object({
    endurance: bounded01Schema,
    threshold: bounded01Schema,
    high_intensity: bounded01Schema,
    durability: bounded01Schema,
    strength: bounded01Schema,
    power: bounded01Schema,
    mobility: bounded01Schema,
    technical: bounded01Schema,
    specificity: bounded01Schema,
  })
  .strict();

export const goalPrescriptionProfileSchema = z
  .object({
    primary_goal_type: goalPrescriptionTypeSchema,
    specificity_mode: prescriptionSpecificityModeSchema,
    primary_activity_categories: z.array(canonicalSportSchema).min(1),
    demand: goalPrescriptionDemandSchema,
  })
  .strict();

export const activityCategoryPrescriptionSchema = z
  .object({
    role: prescriptionActivityRoleSchema,
    priority_weight: bounded01Schema,
    volume: orderedRangeSchema.extend({
      unit: prescriptionVolumeUnitSchema,
      duration_minutes: orderedRangeSchema.optional(),
    }),
    sessions: z
      .object({
        min_per_week: z.number().int().min(0),
        target_per_week: z.number().int().min(0),
        max_per_week: z.number().int().min(0),
      })
      .strict()
      .superRefine((sessions, ctx) => {
        if (sessions.min_per_week > sessions.target_per_week) {
          ctx.addIssue({
            code: "custom",
            path: ["min_per_week"],
            message: "Minimum sessions cannot exceed target sessions",
          });
        }
        if (sessions.target_per_week > sessions.max_per_week) {
          ctx.addIssue({
            code: "custom",
            path: ["target_per_week"],
            message: "Target sessions cannot exceed maximum sessions",
          });
        }
      }),
    intensity_distribution: prescriptionIntensityDistributionSchema,
    key_exposures: z.array(keyExposureSchema),
    load_model: z
      .object({
        load_method: prescriptionLoadMethodSchema,
        fatigue_cost_multiplier: z.number().min(0),
        mechanical_load_multiplier: z.number().min(0),
        progression_sensitivity: z.number().min(0).max(2),
      })
      .strict(),
  })
  .strict();

export const trainingPrescriptionSchema = z
  .object({
    version: z.literal(1),
    goal_profile: goalPrescriptionProfileSchema,
    activity_categories: z.partialRecord(canonicalSportSchema, activityCategoryPrescriptionSchema),
    global_constraints: z
      .object({
        max_weekly_duration_minutes: z.number().int().min(30).max(10080).optional(),
        max_single_session_duration_minutes: z.number().int().min(20).max(600).optional(),
        hard_rest_days: z.array(z.string()).max(7).default([]),
      })
      .strict(),
    adaptation: z
      .object({
        progression_bias: z.number().min(-1).max(1),
        recovery_bias: bounded01Schema,
        fatigue_tolerance: bounded01Schema,
        key_session_density: bounded01Schema,
        strength_integration_priority: bounded01Schema,
      })
      .strict(),
    confidence: z
      .object({ score: bounded01Schema, rationale_codes: z.array(z.string().min(1)) })
      .strict(),
  })
  .strict()
  .superRefine((prescription, ctx) => {
    if (Object.keys(prescription.activity_categories).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["activity_categories"],
        message: "At least one activity-category prescription is required",
      });
    }
  });

export type GoalPrescriptionType = z.infer<typeof goalPrescriptionTypeSchema>;
export type PrescriptionActivityRole = z.infer<typeof prescriptionActivityRoleSchema>;
export type PrescriptionLoadMethod = z.infer<typeof prescriptionLoadMethodSchema>;
export type KeyExposure = z.infer<typeof keyExposureSchema>;
export type GoalPrescriptionDemand = z.infer<typeof goalPrescriptionDemandSchema>;
export type ActivityCategoryPrescription = z.infer<typeof activityCategoryPrescriptionSchema>;
export type TrainingPrescription = z.infer<typeof trainingPrescriptionSchema>;

export interface TrainingPrescriptionGoalInput {
  id?: string;
  name?: string;
  title?: string;
  target_date: string;
  priority?: number;
  targets?: ProfileGoalTarget[];
}

type PrescriptionGoal = TrainingPrescriptionGoalInput | ProfileGoal;

interface GoalSignal {
  goalType: GoalPrescriptionType;
  activityCategory: CanonicalSport;
  priority: number;
  demand: GoalPrescriptionDemand;
  distanceKm?: number;
  thresholdMetric?: "pace" | "power" | "hr";
  hasPerformanceTarget: boolean;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizePriority(priority?: number): number {
  return clamp01((priority ?? 5) / 10);
}

function isProfileGoal(goal: PrescriptionGoal): goal is ProfileGoal {
  return "objective" in goal && "activity_category" in goal;
}

function toActivityCategory(value: string | undefined): CanonicalSport {
  const parsed = canonicalSportSchema.safeParse(value);
  return parsed.success ? parsed.data : "other";
}

function demandForEvent(
  distanceKm: number,
  category: CanonicalSport,
  hasPerformanceTarget: boolean,
): GoalPrescriptionDemand {
  const endurancePressure = clamp01((distanceKm - 5) / 37.195);
  const shortRacePressure = 1 - endurancePressure;
  const performanceBias = hasPerformanceTarget ? 0.08 : 0;
  return {
    endurance: round3(0.52 + endurancePressure * 0.42),
    threshold: round3(0.42 + shortRacePressure * 0.3 + performanceBias),
    high_intensity: round3(0.18 + shortRacePressure * 0.4 + performanceBias / 2),
    durability: round3(0.38 + endurancePressure * 0.58),
    strength: category === "strength" ? 0.88 : 0.22,
    power: round3(category === "bike" ? 0.38 + performanceBias : 0.18 + shortRacePressure * 0.18),
    mobility: 0.28,
    technical: category === "swim" ? 0.68 : category === "bike" ? 0.24 : 0.2,
    specificity: round3(0.72 + endurancePressure * 0.1 + performanceBias),
  };
}

function demandForThreshold(
  metric: "pace" | "power" | "hr",
  category: CanonicalSport,
): GoalPrescriptionDemand {
  return {
    endurance: metric === "hr" ? 0.55 : 0.64,
    threshold: metric === "hr" ? 0.7 : 0.94,
    high_intensity: metric === "hr" ? 0.35 : 0.56,
    durability: 0.48,
    strength: category === "strength" ? 0.82 : 0.22,
    power: metric === "power" ? 0.72 : 0.26,
    mobility: 0.24,
    technical: category === "swim" ? 0.62 : 0.26,
    specificity: metric === "hr" ? 0.6 : 0.88,
  };
}

function demandForCompletion(
  distanceKm: number,
  durationHours: number,
  category: CanonicalSport,
): GoalPrescriptionDemand {
  const workload = Math.max(clamp01((distanceKm - 5) / 37.195), clamp01((durationHours - 1) / 4));
  return {
    endurance: round3(0.45 + workload * 0.45),
    threshold: round3(0.25 + workload * 0.15),
    high_intensity: round3(0.12 + workload * 0.08),
    durability: round3(0.5 + workload * 0.45),
    strength: category === "strength" ? 0.78 : 0.22,
    power: 0.12,
    mobility: 0.34,
    technical: category === "swim" ? 0.58 : 0.22,
    specificity: round3(0.58 + workload * 0.22),
  };
}

function strengthDemand(): GoalPrescriptionDemand {
  return {
    endurance: 0.18,
    threshold: 0.12,
    high_intensity: 0.18,
    durability: 0.58,
    strength: 0.94,
    power: 0.62,
    mobility: 0.42,
    technical: 0.44,
    specificity: 0.86,
  };
}

function signalFromProfileGoal(goal: ProfileGoal): GoalSignal {
  const priority = normalizePriority(goal.priority);
  const category = toActivityCategory(goal.activity_category);
  if (category === "strength") {
    return {
      goalType: "strength",
      activityCategory: "strength",
      priority,
      demand: strengthDemand(),
      hasPerformanceTarget: true,
    };
  }
  switch (goal.objective.type) {
    case "event_performance": {
      const distanceKm = (goal.objective.distance_m ?? 5000) / 1000;
      const hasPerformanceTarget =
        goal.objective.target_time_s !== undefined || goal.objective.target_speed_mps !== undefined;
      return {
        goalType: "event_performance",
        activityCategory: category,
        priority,
        demand: demandForEvent(distanceKm, category, hasPerformanceTarget),
        distanceKm,
        hasPerformanceTarget,
      };
    }
    case "threshold": {
      const thresholdCategory = toActivityCategory(goal.objective.activity_category ?? category);
      return {
        goalType: thresholdCategory === "strength" ? "strength" : "threshold",
        activityCategory: thresholdCategory,
        priority,
        demand:
          thresholdCategory === "strength"
            ? strengthDemand()
            : demandForThreshold(goal.objective.metric, thresholdCategory),
        thresholdMetric: goal.objective.metric,
        hasPerformanceTarget: true,
      };
    }
    case "completion": {
      const completionCategory = toActivityCategory(goal.objective.activity_category ?? category);
      const distanceKm = (goal.objective.distance_m ?? 0) / 1000;
      const durationHours = (goal.objective.duration_s ?? 0) / 3600;
      return {
        goalType: completionCategory === "strength" ? "strength" : "completion",
        activityCategory: completionCategory,
        priority,
        demand:
          completionCategory === "strength"
            ? strengthDemand()
            : demandForCompletion(distanceKm, durationHours, completionCategory),
        distanceKm,
        hasPerformanceTarget: false,
      };
    }
    case "consistency":
      return {
        goalType: "consistency",
        activityCategory: category,
        priority,
        demand: demandForCompletion(5, 1, category),
        hasPerformanceTarget: false,
      };
  }
}

function signalFromLegacyTarget(
  goal: TrainingPrescriptionGoalInput,
  target: ProfileGoalTarget,
): GoalSignal {
  const priority = normalizePriority(goal.priority);
  if (target.target_type === "race_performance") {
    const category = toActivityCategory(target.activity_category);
    const distanceKm = target.distance_m / 1000;
    return {
      goalType: category === "strength" ? "strength" : "event_performance",
      activityCategory: category,
      priority,
      demand:
        category === "strength"
          ? strengthDemand()
          : demandForEvent(distanceKm, category, target.target_time_s !== undefined),
      distanceKm,
      hasPerformanceTarget: target.target_time_s !== undefined,
    };
  }
  if (target.target_type === "pace_threshold") {
    const category = toActivityCategory(target.activity_category);
    return {
      goalType: "threshold",
      activityCategory: category,
      priority,
      demand: demandForThreshold("pace", category),
      thresholdMetric: "pace",
      hasPerformanceTarget: true,
    };
  }
  if (target.target_type === "power_threshold") {
    const category = toActivityCategory(target.activity_category);
    return {
      goalType: category === "strength" ? "strength" : "threshold",
      activityCategory: category,
      priority,
      demand: category === "strength" ? strengthDemand() : demandForThreshold("power", category),
      thresholdMetric: "power",
      hasPerformanceTarget: true,
    };
  }
  return {
    goalType: "threshold",
    activityCategory: "other",
    priority,
    demand: demandForThreshold("hr", "other"),
    thresholdMetric: "hr",
    hasPerformanceTarget: true,
  };
}

function deriveGoalSignals(goals: PrescriptionGoal[]): GoalSignal[] {
  return goals.flatMap((goal) =>
    isProfileGoal(goal)
      ? [signalFromProfileGoal(goal)]
      : (goal.targets ?? []).map((target) => signalFromLegacyTarget(goal, target)),
  );
}

function mergeDemand(signals: GoalSignal[]): GoalPrescriptionDemand {
  if (signals.length === 0) return demandForCompletion(5, 1, "other");
  const totalWeight = signals.reduce((sum, signal) => sum + signal.priority, 0) || 1;
  const demand = Object.fromEntries(
    Object.keys(signals[0]!.demand).map((key) => [key, 0]),
  ) as GoalPrescriptionDemand;
  for (const signal of signals) {
    const weight = signal.priority / totalWeight;
    for (const key of Object.keys(demand) as Array<keyof GoalPrescriptionDemand>)
      demand[key] += signal.demand[key] * weight;
  }
  return Object.fromEntries(
    Object.entries(demand).map(([key, value]) => [key, round3(clamp01(value))]),
  ) as GoalPrescriptionDemand;
}

function choosePrimaryGoalType(signals: GoalSignal[]): GoalPrescriptionType {
  if (signals.length === 0) return "general_fitness";
  const categories = new Set(signals.map((signal) => signal.activityCategory));
  if (categories.size > 1) return "hybrid";
  return [...signals].sort((a, b) => b.priority - a.priority)[0]?.goalType ?? "general_fitness";
}

function resolveSpecificityMode(signals: GoalSignal[]) {
  const categories = new Set(signals.map((signal) => signal.activityCategory));
  const enduranceCategories = [...categories].filter((category) =>
    ["run", "bike", "swim"].includes(category),
  );
  if (categories.size === 0) return "general";
  if (categories.has("strength") && enduranceCategories.length > 0)
    return "hybrid_endurance_strength";
  if (categories.size > 1) return "multi_activity_category";
  return "single_activity_category";
}

function enduranceIntensity(signal?: GoalSignal) {
  const distanceKm = signal?.distanceKm ?? 10;
  if (signal?.goalType === "threshold")
    return {
      aerobic_recovery: 0.06,
      aerobic_endurance: 0.42,
      tempo: 0.16,
      threshold: 0.26,
      vo2: 0.08,
      anaerobic: 0.02,
    };
  if (distanceKm <= 6.5)
    return {
      aerobic_recovery: 0.07,
      aerobic_endurance: 0.5,
      tempo: 0.12,
      threshold: 0.16,
      vo2: 0.12,
      anaerobic: 0.03,
    };
  if (distanceKm >= 30)
    return {
      aerobic_recovery: 0.08,
      aerobic_endurance: 0.72,
      tempo: 0.1,
      threshold: 0.07,
      vo2: 0.02,
      anaerobic: 0.01,
    };
  return {
    aerobic_recovery: 0.07,
    aerobic_endurance: 0.62,
    tempo: 0.13,
    threshold: 0.12,
    vo2: 0.05,
    anaerobic: 0.01,
  };
}

function strengthIntensity() {
  return {
    strength_endurance: 0.26,
    hypertrophy: 0.32,
    max_strength: 0.26,
    power: 0.1,
    mobility: 0.06,
  };
}

function loadMethodFor(category: CanonicalSport, signal?: GoalSignal) {
  if (category === "bike" && signal?.thresholdMetric === "power") return "bike_power";
  if (category === "bike") return "heart_rate";
  if (category === "run") return "run_pace";
  if (category === "swim") return "swim_threshold_speed";
  if (category === "strength") return "strength_volume";
  return "manual_estimate";
}

function keyExposuresFor(input: {
  category: CanonicalSport;
  role: z.infer<typeof prescriptionActivityRoleSchema>;
  signal?: GoalSignal;
  demand: GoalPrescriptionDemand;
}): KeyExposure[] {
  const exposures: KeyExposure[] = [];
  if (["run", "bike", "swim"].includes(input.category)) {
    if ((input.signal?.distanceKm ?? 0) >= 15 || input.demand.durability > 0.72)
      exposures.push({
        type: "long_session",
        activity_category: input.category,
        min_frequency_per_week: 0.5,
        target_frequency_per_week: 1,
        max_frequency_per_week: 1,
        min_duration_minutes: input.category === "swim" ? 35 : 55,
        target_duration_minutes:
          input.category === "bike" ? 120 : input.category === "run" ? 90 : 50,
      });
    if (input.demand.threshold > 0.55)
      exposures.push({
        type: "threshold_interval",
        activity_category: input.category,
        min_frequency_per_week: input.role === "primary" ? 0.5 : 0,
        target_frequency_per_week: input.role === "primary" ? 1 : 0.5,
        max_frequency_per_week: 2,
      });
    if (input.demand.high_intensity > 0.5)
      exposures.push({
        type: "vo2_interval",
        activity_category: input.category,
        min_frequency_per_week: 0,
        target_frequency_per_week: input.role === "primary" ? 0.75 : 0.25,
        max_frequency_per_week: 1.5,
      });
    if (input.demand.specificity > 0.7)
      exposures.push({
        type: "race_specific",
        activity_category: input.category,
        min_frequency_per_week: 0.25,
        target_frequency_per_week: input.role === "primary" ? 1 : 0.5,
        max_frequency_per_week: 2,
      });
  }
  if (input.category === "strength")
    exposures.push(
      {
        type: "strength_heavy",
        activity_category: "strength",
        min_frequency_per_week: input.role === "primary" ? 1 : 0,
        target_frequency_per_week: input.role === "primary" ? 2 : 0.75,
        max_frequency_per_week: input.role === "primary" ? 4 : 2,
      },
      {
        type: "strength_hypertrophy",
        activity_category: "strength",
        min_frequency_per_week: input.role === "primary" ? 1 : 0,
        target_frequency_per_week: input.role === "primary" ? 2 : 0.75,
        max_frequency_per_week: input.role === "primary" ? 4 : 2,
      },
    );
  if (input.demand.mobility > 0.35)
    exposures.push({
      type: "mobility",
      activity_category: input.category,
      min_frequency_per_week: 0,
      target_frequency_per_week: 1,
      max_frequency_per_week: 7,
      target_duration_minutes: 15,
    });
  return exposures;
}

function buildActivityCategoryPrescription(input: {
  category: CanonicalSport;
  weight: number;
  role: z.infer<typeof prescriptionActivityRoleSchema>;
  signal?: GoalSignal;
  demand: GoalPrescriptionDemand;
  preferences?: AthletePreferenceProfile | null;
  maxWeeklyDurationMinutes?: number;
}): ActivityCategoryPrescription {
  const strengthPriority = input.preferences?.training_style.strength_integration_priority ?? 0.5;
  const recoveryPriority = input.preferences?.recovery_preferences.recovery_priority ?? 0.5;
  const fatigueTolerance =
    input.preferences?.recovery_preferences.systemic_fatigue_tolerance ?? 0.5;
  const isStrength = input.category === "strength";
  const isEndurance = ["run", "bike", "swim"].includes(input.category);
  const roleMultiplier = input.role === "primary" ? 1 : input.role === "secondary" ? 0.72 : 0.38;
  const baseMinutes = isStrength
    ? 70 + strengthPriority * 60
    : input.category === "bike"
      ? 210
      : input.category === "swim"
        ? 120
        : input.category === "run"
          ? 180
          : 90;
  const targetMinutes = Math.max(
    30,
    Math.round(
      baseMinutes *
        input.weight *
        roleMultiplier *
        (0.72 +
          input.demand.endurance * 0.34 +
          input.demand.durability * 0.2 +
          input.demand.strength * (isStrength ? 0.42 : 0.04)) *
        (1 - recoveryPriority * 0.18 + fatigueTolerance * 0.12),
    ),
  );
  const cappedTargetMinutes = input.maxWeeklyDurationMinutes
    ? Math.min(
        targetMinutes,
        Math.max(20, Math.round(input.maxWeeklyDurationMinutes * input.weight)),
      )
    : targetMinutes;
  const maxMinutes = Math.max(
    cappedTargetMinutes,
    Math.round(cappedTargetMinutes * (1.22 + fatigueTolerance * 0.28 - recoveryPriority * 0.12)),
  );
  const minMinutes = Math.round(cappedTargetMinutes * 0.55);
  const targetSessions = Math.max(
    1,
    Math.round(
      (input.role === "primary" ? 3 : input.role === "secondary" ? 2 : 1) +
        (isStrength ? strengthPriority : input.demand.threshold) * 1.2,
    ),
  );
  const unit = isStrength ? "sets" : "minutes";
  const mechanical =
    input.category === "run"
      ? 0.34
      : input.category === "strength"
        ? 0.42
        : input.category === "bike"
          ? 0.08
          : input.category === "swim"
            ? 0.05
            : 0.16;
  return activityCategoryPrescriptionSchema.parse({
    role: input.role,
    priority_weight: round3(input.weight),
    volume: {
      unit,
      minimum_effective: isStrength ? Math.round(minMinutes / 6) : minMinutes,
      target: isStrength ? Math.round(cappedTargetMinutes / 6) : cappedTargetMinutes,
      maximum_recoverable: isStrength ? Math.round(maxMinutes / 6) : maxMinutes,
      duration_minutes:
        unit === "minutes"
          ? undefined
          : {
              minimum_effective: minMinutes,
              target: cappedTargetMinutes,
              maximum_recoverable: maxMinutes,
            },
    },
    sessions: {
      min_per_week: input.role === "primary" ? 2 : 0,
      target_per_week: targetSessions,
      max_per_week: Math.max(targetSessions, targetSessions + (input.role === "primary" ? 3 : 2)),
    },
    intensity_distribution: isStrength
      ? strengthIntensity()
      : isEndurance
        ? enduranceIntensity(input.signal)
        : { aerobic_recovery: 0.2, aerobic_endurance: 0.6, tempo: 0.12, threshold: 0.08 },
    key_exposures: keyExposuresFor(input),
    load_model: {
      load_method: loadMethodFor(input.category, input.signal),
      fatigue_cost_multiplier: round3(
        (isStrength ? 1.12 : 1) * (1 + input.demand.high_intensity * 0.25),
      ),
      mechanical_load_multiplier: mechanical,
      progression_sensitivity: round3(
        input.category === "run" ? 1.15 : isStrength ? 1.05 : input.category === "bike" ? 0.92 : 1,
      ),
    },
  });
}

export function resolveTrainingPrescription(input: {
  goals: PrescriptionGoal[];
  preferences?: AthletePreferenceProfile | null;
  creationConfig?: TrainingPlanCreationConfig | null;
}): TrainingPrescription {
  const signals = deriveGoalSignals(input.goals);
  const demand = mergeDemand(signals);
  const maxWeeklyDurationMinutes =
    input.preferences?.dose_limits.max_weekly_duration_minutes ??
    input.creationConfig?.constraints?.max_weekly_duration_minutes;
  const strengthPriority = input.preferences?.training_style.strength_integration_priority ?? 0.5;
  const recoveryPriority = input.preferences?.recovery_preferences.recovery_priority ?? 0.5;
  const fatigueTolerance =
    input.preferences?.recovery_preferences.systemic_fatigue_tolerance ?? 0.5;
  const categoryWeights = new Map<CanonicalSport, number>();
  for (const signal of signals)
    categoryWeights.set(
      signal.activityCategory,
      (categoryWeights.get(signal.activityCategory) ?? 0) + signal.priority,
    );
  if (categoryWeights.size === 0) {
    categoryWeights.set("other", 0.45);
    categoryWeights.set("strength", 0.3);
  } else if (strengthPriority >= 0.35 && !categoryWeights.has("strength")) {
    categoryWeights.set("strength", 0.12 + strengthPriority * 0.22);
  }
  const totalWeight = [...categoryWeights.values()].reduce((sum, weight) => sum + weight, 0) || 1;
  const order: CanonicalSport[] = ["run", "bike", "swim", "strength", "other"];
  const normalized = [...categoryWeights.entries()]
    .map(([category, weight]) => [category, weight / totalWeight] as const)
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
  const activity_categories: Partial<Record<CanonicalSport, ActivityCategoryPrescription>> = {};
  for (const [index, [category, weight]] of normalized.entries()) {
    const signal = signals
      .filter((candidate) => candidate.activityCategory === category)
      .sort((a, b) => b.priority - a.priority)[0];
    const role = index === 0 ? "primary" : weight >= 0.25 ? "secondary" : "support";
    activity_categories[category] = buildActivityCategoryPrescription({
      category,
      weight,
      role,
      signal,
      demand,
      preferences: input.preferences,
      maxWeeklyDurationMinutes,
    });
  }
  const primaryActivityCategories = normalized
    .filter(([, weight], index) => index === 0 || weight >= 0.25)
    .map(([category]) => category);
  const goalType = choosePrimaryGoalType(signals);
  const specificityMode = resolveSpecificityMode(signals);
  return trainingPrescriptionSchema.parse({
    version: 1,
    goal_profile: {
      primary_goal_type: goalType,
      specificity_mode: specificityMode,
      primary_activity_categories: primaryActivityCategories.length
        ? primaryActivityCategories
        : ["other"],
      demand,
    },
    activity_categories,
    global_constraints: {
      max_weekly_duration_minutes: maxWeeklyDurationMinutes,
      max_single_session_duration_minutes:
        input.preferences?.dose_limits.max_single_session_duration_minutes ??
        input.creationConfig?.constraints?.max_single_session_duration_minutes,
      hard_rest_days:
        input.preferences?.availability.hard_rest_days ??
        input.creationConfig?.constraints?.hard_rest_days ??
        [],
    },
    adaptation: {
      progression_bias: round3(
        ((input.preferences?.training_style.progression_pace ?? 0.5) - 0.5) * 2,
      ),
      recovery_bias: recoveryPriority,
      fatigue_tolerance: fatigueTolerance,
      key_session_density: input.preferences?.training_style.key_session_density_preference ?? 0.5,
      strength_integration_priority: strengthPriority,
    },
    confidence: {
      score: round3(clamp01(0.46 + signals.length * 0.08 + input.goals.length * 0.04)),
      rationale_codes: [
        "training_prescription_v1",
        `goal_type_${goalType}`,
        `specificity_${specificityMode}`,
      ],
    },
  });
}
