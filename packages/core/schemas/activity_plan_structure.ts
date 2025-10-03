import { z } from "zod";

// ==============================
// ENUMS
// ==============================

export const intensityTypeEnum = z.enum([
  "%FTP",
  "%MaxHR",
  "%ThresholdHR",
  "watts",
  "bpm",
  "speed",
  "cadence",
  "RPE",
]);

export const controlTypeEnum = z.enum(["grade", "resistance", "powerTarget"]);
export const controlUnitEnum = z.enum(["%", "watts", "rpm", "kg", "reps"]);
export const durationUnitEnum = z.enum([
  "seconds",
  "minutes",
  "meters",
  "km",
  "reps",
]);

// ==============================
// CONTROL
// ==============================
export const controlSchema = z.object({
  type: controlTypeEnum.optional(),
  value: z.number(),
  unit: controlUnitEnum.optional(),
});
export type Control = z.infer<typeof controlSchema>;

// ==============================
// FLEXIBLE DURATION
// ==============================
export const durationSchema = z.union([
  z.object({
    type: z.enum(["time", "distance", "repetitions"]),
    value: z.number().nonnegative(),
    unit: durationUnitEnum.optional(),
  }),
  z.literal("untilFinished"), // user manually ends this step (warm-up, cool-down, rest)
]);
export type Duration = z.infer<typeof durationSchema>;

// ==============================
// INTENSITY TARGET
// ==============================
export const intensityTargetSchema = z
  .object({
    type: intensityTypeEnum,
    min: z.number().optional(),
    max: z.number().optional(),
    target: z.number().optional(),
  })
  .refine(
    (data) =>
      data.min !== undefined ||
      data.max !== undefined ||
      data.target !== undefined,
    { message: "At least one of min, max, or target must be defined." },
  );
export type IntensityTarget = z.infer<typeof intensityTargetSchema>;

// ==============================
// STEP
// ==============================
export const stepSchema = z.object({
  type: z.literal("step"), // constant
  name: z.string().optional(),
  description: z.string().optional(),
  duration: durationSchema.optional(), // supports "untilFinished"
  targets: z.array(intensityTargetSchema).optional(),
  controls: z.array(controlSchema).optional(),
  notes: z.string().optional(),
});
export type Step = z.infer<typeof stepSchema>;

// ==============================
// REPETITION
// ==============================
export const repetitionSchema = z.object({
  type: z.literal("repetition"), // constant
  repeat: z.number().min(1),
  steps: z.array(stepSchema),
});
export type Repetition = z.infer<typeof repetitionSchema>;

// ==============================
// STEP OR REPETITION UNION
// ==============================
export const stepOrRepetitionSchema = z.union([stepSchema, repetitionSchema]);
export type StepOrRepetition = z.infer<typeof stepOrRepetitionSchema>;

// ==============================
// STRUCTURED WORKOUT PLAN
// ==============================
export const activityPlanStructureSchema = z.object({
  steps: z.array(stepOrRepetitionSchema),
});
export type ActivityPlanStructure = z.infer<typeof activityPlanStructureSchema>;
