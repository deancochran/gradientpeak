import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.string().uuid();
const positiveNumberSchema = z.number().positive().finite();
const positiveIntegerSchema = z.number().int().positive();
const boundedDemandSchema = z.number().min(0).max(1);
const tolerancePctSchema = z.number().min(0).max(1).optional();

export const canonicalGoalActivityCategorySchema = z.enum(["run", "bike", "swim", "other"]);

export const canonicalGoalThresholdMetricSchema = z.enum(["pace", "power", "hr"]);

const eventPerformanceObjectiveSchema = z
  .object({
    type: z.literal("event_performance"),
    activity_category: canonicalGoalActivityCategorySchema,
    distance_m: positiveNumberSchema.optional(),
    target_time_s: positiveIntegerSchema.optional(),
    target_speed_mps: positiveNumberSchema.optional(),
    environment: z.string().trim().min(1).max(80).optional(),
    tolerance_pct: tolerancePctSchema,
  })
  .strict()
  .superRefine((objective, ctx) => {
    if (objective.distance_m === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["distance_m"],
        message: "event_performance objectives must include distance_m in canonical meters",
      });
    }

    if (objective.target_time_s === undefined && objective.target_speed_mps === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["target_time_s"],
        message: "event_performance objectives require target_time_s or target_speed_mps",
      });
    }
  });

const thresholdObjectiveSchema = z
  .object({
    type: z.literal("threshold"),
    metric: canonicalGoalThresholdMetricSchema,
    activity_category: canonicalGoalActivityCategorySchema.optional(),
    value: positiveNumberSchema,
    test_duration_s: positiveIntegerSchema.optional(),
    tolerance_pct: tolerancePctSchema,
  })
  .strict();

const completionObjectiveSchema = z
  .object({
    type: z.literal("completion"),
    activity_category: canonicalGoalActivityCategorySchema.optional(),
    distance_m: positiveNumberSchema.optional(),
    duration_s: positiveIntegerSchema.optional(),
  })
  .strict()
  .superRefine((objective, ctx) => {
    if (objective.distance_m === undefined && objective.duration_s === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["distance_m"],
        message: "completion objectives require distance_m, duration_s, or both",
      });
    }
  });

const consistencyObjectiveSchema = z
  .object({
    type: z.literal("consistency"),
    target_sessions_per_week: positiveIntegerSchema.optional(),
    target_weeks: positiveIntegerSchema.optional(),
  })
  .strict()
  .superRefine((objective, ctx) => {
    if (objective.target_sessions_per_week === undefined && objective.target_weeks === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["target_sessions_per_week"],
        message: "consistency objectives require target_sessions_per_week, target_weeks, or both",
      });
    }
  });

export const canonicalGoalObjectiveSchema = z.discriminatedUnion("type", [
  eventPerformanceObjectiveSchema,
  thresholdObjectiveSchema,
  completionObjectiveSchema,
  consistencyObjectiveSchema,
]);

export const goalDemandProfileSchema = z
  .object({
    endurance_demand: boundedDemandSchema,
    threshold_demand: boundedDemandSchema,
    high_intensity_demand: boundedDemandSchema,
    durability_demand: boundedDemandSchema,
    technical_demand: boundedDemandSchema,
    specificity_demand: boundedDemandSchema,
  })
  .strict();

const profileGoalHeaderSchema = z
  .object({
    id: uuidSchema,
    profile_id: uuidSchema,
    target_date: dateOnlySchema,
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
  })
  .strict();

const profileGoalRecordInputBaseSchema = profileGoalHeaderSchema.extend({
  target_payload: z.unknown(),
});

const profileGoalDomainInputBaseSchema = profileGoalHeaderSchema.extend({
  objective: z.unknown(),
});

export const profileGoalTargetSchema = z.discriminatedUnion("target_type", [
  z.object({
    target_type: z.literal("race_performance"),
    distance_m: z.number().positive(),
    target_time_s: z.number().int().positive(),
    activity_category: canonicalGoalActivityCategorySchema,
    weight: z.number().positive().finite().optional(),
  }),
  z.object({
    target_type: z.literal("pace_threshold"),
    target_speed_mps: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: canonicalGoalActivityCategorySchema,
    weight: z.number().positive().finite().optional(),
  }),
  z.object({
    target_type: z.literal("power_threshold"),
    target_watts: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: canonicalGoalActivityCategorySchema,
    weight: z.number().positive().finite().optional(),
  }),
  z.object({
    target_type: z.literal("hr_threshold"),
    target_lthr_bpm: z.number().int().positive(),
    weight: z.number().positive().finite().optional(),
  }),
]);

/**
 * Legacy goal payload shape retained for compatibility conversion paths.
 */
export const profileGoalLegacySchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(100),
  target_date: dateOnlySchema,
  priority: z.number().int().min(0).max(10).default(5),
  targets: z.array(profileGoalTargetSchema).min(1),
  target_performance: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function prependIssuePath(path: PropertyKey[], issues: z.ZodIssue[], ctx: z.RefinementCtx): void {
  for (const issue of issues) {
    ctx.addIssue({
      ...issue,
      path: [...path, ...issue.path],
    });
  }
}

function safeParseCanonicalGoalObjective(
  activityCategory: CanonicalGoalActivityCategory,
  input: unknown,
) {
  const parsed = canonicalGoalObjectiveSchema.safeParse(input);
  if (!parsed.success) {
    return parsed;
  }

  const objective = parsed.data;

  if (
    "activity_category" in objective &&
    objective.activity_category !== undefined &&
    objective.activity_category !== activityCategory
  ) {
    return {
      success: false as const,
      error: new z.ZodError([
        {
          code: "custom",
          path: ["activity_category"],
          message: "objective.activity_category must match profile_goals.activity_category",
        },
      ]),
    };
  }

  return parsed;
}

function parseCanonicalGoalObjective(
  activityCategory: CanonicalGoalActivityCategory,
  input: unknown,
): CanonicalGoalObjective {
  const parsed = safeParseCanonicalGoalObjective(activityCategory, input);

  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
}

export const profileGoalRecordSchema = profileGoalRecordInputBaseSchema
  .superRefine((record, ctx) => {
    const parsedObjective = safeParseCanonicalGoalObjective(
      record.activity_category,
      record.target_payload,
    );

    if (!parsedObjective.success) {
      prependIssuePath(["target_payload"], parsedObjective.error.issues, ctx);
    }
  })
  .transform((record) => ({
    ...record,
    target_payload: parseCanonicalGoalObjective(record.activity_category, record.target_payload),
  }));

export const profileGoalCreateSchema = profileGoalRecordInputBaseSchema
  .omit({
    id: true,
  })
  .superRefine((record, ctx) => {
    const parsedObjective = safeParseCanonicalGoalObjective(
      record.activity_category,
      record.target_payload,
    );

    if (!parsedObjective.success) {
      prependIssuePath(["target_payload"], parsedObjective.error.issues, ctx);
    }
  })
  .transform((record) => ({
    ...record,
    target_payload: parseCanonicalGoalObjective(record.activity_category, record.target_payload),
  }));

export const profileGoalSchema = profileGoalDomainInputBaseSchema
  .superRefine((goal, ctx) => {
    const parsedObjective = safeParseCanonicalGoalObjective(goal.activity_category, goal.objective);

    if (!parsedObjective.success) {
      prependIssuePath(["objective"], parsedObjective.error.issues, ctx);
    }
  })
  .transform((goal) => ({
    ...goal,
    objective: parseCanonicalGoalObjective(goal.activity_category, goal.objective),
  }));

export const canonicalGoalSchema = profileGoalSchema;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundDemand(value: number): number {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function getTechnicalDemand(activityCategory: CanonicalGoalActivityCategory): number {
  switch (activityCategory) {
    case "swim":
      return 0.65;
    case "bike":
      return 0.25;
    case "run":
      return 0.2;
    default:
      return 0.35;
  }
}

/**
 * Parses a persisted `profile_goals` record into the canonical goal domain shape.
 *
 * Validation happens in `@repo/core` so malformed payloads fail immediately instead
 * of being repaired later by API or UI heuristics.
 *
 * @param record - Raw persisted goal record with `target_payload`
 * @returns Canonical goal with typed `objective`
 */
export function parseProfileGoalRecord(record: unknown): ProfileGoal {
  const parsedRecord = profileGoalRecordSchema.parse(record);

  return profileGoalSchema.parse({
    id: parsedRecord.id,
    profile_id: parsedRecord.profile_id,
    target_date: parsedRecord.target_date,
    title: parsedRecord.title,
    priority: parsedRecord.priority,
    activity_category: parsedRecord.activity_category,
    objective: parsedRecord.target_payload,
  });
}

/**
 * Derives a deterministic continuous demand profile from a canonical goal.
 *
 * The profile emits bounded independent demand dimensions so projection logic can
 * compare goals without collapsing them into a single tier.
 *
 * @param goal - Canonical goal with typed objective
 * @returns Goal demand profile with bounded `0..1` dimensions
 */
export function deriveGoalDemandProfile(goal: ProfileGoal): GoalDemandProfile {
  const technicalDemand = getTechnicalDemand(goal.activity_category);

  switch (goal.objective.type) {
    case "event_performance": {
      const distanceKm = (goal.objective.distance_m ?? 5000) / 1000;
      const distancePressure = clamp01((distanceKm - 5) / 37.195);
      const performanceBias =
        goal.objective.target_time_s !== undefined || goal.objective.target_speed_mps !== undefined
          ? 0.08
          : 0;

      return goalDemandProfileSchema.parse({
        endurance_demand: roundDemand(0.5 + distancePressure * 0.4),
        threshold_demand: roundDemand(0.82 - distancePressure * 0.28 + performanceBias),
        high_intensity_demand: roundDemand(0.7 - distancePressure * 0.4 + performanceBias / 2),
        durability_demand: roundDemand(0.35 + distancePressure * 0.55),
        technical_demand: roundDemand(technicalDemand),
        specificity_demand: roundDemand(0.72 + distancePressure * 0.14 + performanceBias),
      });
    }

    case "threshold": {
      const thresholdBaseByMetric = {
        pace: {
          endurance_demand: 0.68,
          threshold_demand: 0.92,
          high_intensity_demand: 0.52,
          durability_demand: 0.5,
          specificity_demand: 0.86,
        },
        power: {
          endurance_demand: 0.62,
          threshold_demand: 0.95,
          high_intensity_demand: 0.55,
          durability_demand: 0.48,
          specificity_demand: 0.88,
        },
        hr: {
          endurance_demand: 0.55,
          threshold_demand: 0.7,
          high_intensity_demand: 0.35,
          durability_demand: 0.42,
          specificity_demand: 0.6,
        },
      } as const;

      return goalDemandProfileSchema.parse({
        ...thresholdBaseByMetric[goal.objective.metric],
        technical_demand: roundDemand(technicalDemand),
      });
    }

    case "completion": {
      const distancePressure = clamp01(((goal.objective.distance_m ?? 5000) / 1000 - 5) / 37.195);
      const durationPressure = clamp01(((goal.objective.duration_s ?? 3600) / 3600 - 1) / 4);
      const workloadPressure = Math.max(distancePressure, durationPressure);

      return goalDemandProfileSchema.parse({
        endurance_demand: roundDemand(0.45 + workloadPressure * 0.45),
        threshold_demand: roundDemand(0.25 + workloadPressure * 0.15),
        high_intensity_demand: roundDemand(0.12 + workloadPressure * 0.08),
        durability_demand: roundDemand(0.5 + workloadPressure * 0.45),
        technical_demand: roundDemand(technicalDemand),
        specificity_demand: roundDemand(0.58 + workloadPressure * 0.22),
      });
    }

    case "consistency": {
      const sessionPressure = clamp01(((goal.objective.target_sessions_per_week ?? 3) - 3) / 4);
      const durationPressure = clamp01(((goal.objective.target_weeks ?? 8) - 8) / 8);

      return goalDemandProfileSchema.parse({
        endurance_demand: roundDemand(0.4 + sessionPressure * 0.2 + durationPressure * 0.1),
        threshold_demand: 0.2,
        high_intensity_demand: 0.12,
        durability_demand: roundDemand(0.55 + sessionPressure * 0.2 + durationPressure * 0.15),
        technical_demand: roundDemand(technicalDemand * 0.75),
        specificity_demand: roundDemand(0.35 + sessionPressure * 0.15 + durationPressure * 0.1),
      });
    }
  }
}

export type CanonicalGoalActivityCategory = z.infer<typeof canonicalGoalActivityCategorySchema>;
export type CanonicalGoalThresholdMetric = z.infer<typeof canonicalGoalThresholdMetricSchema>;
export type CanonicalGoalObjective = z.infer<typeof canonicalGoalObjectiveSchema>;
export type GoalDemandProfile = z.infer<typeof goalDemandProfileSchema>;
export type ProfileGoalRecord = z.output<typeof profileGoalRecordSchema>;
export type ProfileGoalRecordInput = z.input<typeof profileGoalRecordSchema>;
export type ProfileGoalCreate = z.output<typeof profileGoalCreateSchema>;
export type ProfileGoalCreateInput = z.input<typeof profileGoalCreateSchema>;
export type ProfileGoal = z.output<typeof profileGoalSchema>;
export type CanonicalGoal = ProfileGoal;
export type ProfileGoalTarget = z.infer<typeof profileGoalTargetSchema>;
export type ProfileGoalLegacy = z.infer<typeof profileGoalLegacySchema>;
