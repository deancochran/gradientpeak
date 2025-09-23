import { z } from "zod";
//==============================
// Controls
//==============================
export const controlSchema = z.object({
  type: z.enum(["grade", "resistance", "powerTarget"]).optional(), // expand as needed
  value: z.number(),
  unit: z.string().optional(), // e.g., %, watts, etc.
});
export type Control = z.infer<typeof controlSchema>;

//==============================
// Duration
//==============================
export const durationSchema = z.object({
  type: z.enum(["time", "distance", "repetitions"]),
  value: z.number().nonnegative(),
  unit: z.string().optional(), // e.g., "seconds", "meters", "reps"
});
export type Duration = z.infer<typeof durationSchema>;

//==============================
// Intensity Target
//==============================
export const intensityTargetSchema = z.object({
  type: z.enum([
    "%FTP",
    "%MaxHR",
    "%ThresholdHR",
    "watts",
    "bpm",
    "speed",
    "cadence",
    "RPE",
  ]),
  min: z.number().optional(),
  max: z.number().optional(),
  target: z.number().optional(),
  compound_target: z.number().optional(),
});
export type IntensityTarget = z.infer<typeof intensityTargetSchema>;

//==============================
// Step
//==============================
export const stepSchema: z.ZodType<any> = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  intensityClass: z.enum(["WarmUp", "Active", "Rest", "CoolDown"]).optional(),
  duration: durationSchema.optional(),
  target: intensityTargetSchema.optional(),
  controls: z.array(controlSchema).optional(),
  notes: z.string().optional(),
});
export type Step = z.infer<typeof stepSchema>;

//==============================
// Repetition
//==============================
export const repetitionSchema = z.object({
  repeat: z.number().min(1),
  steps: z.array(stepSchema),
});
export type Repetition = z.infer<typeof repetitionSchema>;

//==============================
// Planned Activity
//==============================
export const plannedActivityStructureSchema = z.object({
  version: z.string().default("1.0"),
  name: z.string(),
  description: z.string().optional(),
  modality: z.enum([
    "endurance", // run, ride, row, ski, etc.
    "strength", // lifting, HIIT, bodyweight
    "swim", // pool/open water
    "other", // yoga, mobility, misc
  ]),
  loadType: z
    .enum(["tss", "hr", "power", "speed", "rpe", "weightRepsSets"])
    .optional(),
  environment: z.enum(["indoor", "outdoor"]).optional(), // treadmill, trainer, pool
  steps: z.array(z.union([stepSchema, repetitionSchema])),
  notes: z.string().optional(), // catch-all (strength sets, swim details, etc.)
});
export type PlannedActivityStructure = z.infer<
  typeof plannedActivityStructureSchema
>;

//==============================
// Weekly Schedule
//==============================
export const weeklyActivitySchema = z.object({
  day: z.number().min(0).max(6), // 0-6 (Sunday-Saturday)
  activityTemplate: plannedActivityStructureSchema,
  key: z.string().optional(),
  notes: z.string().optional(),
  completed: z.boolean().optional(),
  scheduledDate: z.date().optional(),
});
export type WeeklyActivity = z.infer<typeof weeklyActivitySchema>;

export const weeklyScheduleSchema = z.object({
  week: z.number().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  activities: z.array(weeklyActivitySchema),
  notes: z.string().optional(),
});
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;
