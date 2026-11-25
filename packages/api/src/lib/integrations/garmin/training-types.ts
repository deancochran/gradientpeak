import { z } from "zod";

export const GARMIN_TRAINING_MAX_WORKOUT_STEPS = 100;
export const GARMIN_TRAINING_MAX_RESPONSE_BYTES = 64 * 1024;

const idSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const finite = z.number().finite();
const optionalFinite = finite.nullable();
const nullableText = z.string().max(512).nullable();

export const garminWorkoutStepSchema: z.ZodType<GarminWorkoutStep> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("WorkoutStep"),
        stepId: idSchema.optional(),
        stepOrder: z.number().int().positive(),
        intensity: z.enum(["REST", "WARMUP", "COOLDOWN", "RECOVERY", "ACTIVE", "INTERVAL", "MAIN"]),
        description: nullableText,
        durationType: z.enum(["TIME", "DISTANCE", "FIXED_REST"]),
        durationValue: finite.positive(),
        durationValueType: z.enum(["SECOND", "METER"]).nullable(),
        targetType: z.enum(["SPEED", "HEART_RATE", "CADENCE", "POWER", "OPEN"]),
        targetValue: optionalFinite,
        targetValueLow: optionalFinite,
        targetValueHigh: optionalFinite,
        targetValueType: z.literal("PERCENT").nullable(),
        secondaryTargetType: z.null(),
        secondaryTargetValue: z.null(),
        secondaryTargetValueLow: z.null(),
        secondaryTargetValueHigh: z.null(),
        secondaryTargetValueType: z.null(),
        strokeType: z.null(),
        drillType: z.null(),
        equipmentType: z.null(),
        exerciseCategory: z.null(),
        exerciseName: z.null(),
        weightValue: z.null(),
        weightDisplayUnit: z.null(),
      })
      .strict(),
    z
      .object({
        type: z.literal("WorkoutRepeatStep"),
        stepId: idSchema.optional(),
        stepOrder: z.number().int().positive(),
        repeatType: z.literal("REPEAT_UNTIL_STEPS_CMPLT"),
        repeatValue: z.number().int().min(2).max(50),
        steps: z.array(garminWorkoutStepSchema).min(1).max(GARMIN_TRAINING_MAX_WORKOUT_STEPS),
      })
      .strict(),
  ]),
);

export type GarminWorkoutStep =
  | {
      type: "WorkoutStep";
      // Zod's optional output retains `undefined` when the key is present.
      stepId?: number | undefined;
      stepOrder: number;
      intensity: "REST" | "WARMUP" | "COOLDOWN" | "RECOVERY" | "ACTIVE" | "INTERVAL" | "MAIN";
      description: string | null;
      durationType: "TIME" | "DISTANCE" | "FIXED_REST";
      durationValue: number;
      durationValueType: "SECOND" | "METER" | null;
      targetType: "SPEED" | "HEART_RATE" | "CADENCE" | "POWER" | "OPEN";
      targetValue: number | null;
      targetValueLow: number | null;
      targetValueHigh: number | null;
      targetValueType: "PERCENT" | null;
      secondaryTargetType: null;
      secondaryTargetValue: null;
      secondaryTargetValueLow: null;
      secondaryTargetValueHigh: null;
      secondaryTargetValueType: null;
      strokeType: null;
      drillType: null;
      equipmentType: null;
      exerciseCategory: null;
      exerciseName: null;
      weightValue: null;
      weightDisplayUnit: null;
    }
  | {
      type: "WorkoutRepeatStep";
      // Keep the recursive schema's generated optional-output contract explicit.
      stepId?: number | undefined;
      stepOrder: number;
      repeatType: "REPEAT_UNTIL_STEPS_CMPLT";
      repeatValue: number;
      steps: GarminWorkoutStep[];
    };

export const garminWorkoutSchema = z
  .object({
    workoutId: idSchema.optional(),
    ownerId: idSchema.optional(),
    workoutName: z.string().min(1).max(1024),
    description: z.string().max(1024),
    sport: z.enum(["RUNNING", "CYCLING"]),
    updatedDate: z.string().max(64).optional(),
    createdDate: z.string().max(64).optional(),
    estimatedDurationInSecs: z.number().int().nonnegative().nullable().optional(),
    estimatedDistanceInMeters: finite.nonnegative().nullable().optional(),
    poolLength: z.null(),
    poolLengthUnit: z.null(),
    workoutProvider: z.string().min(1).max(20),
    workoutSourceId: z.string().min(1).max(20),
    isSessionTransitionEnabled: z.literal(false),
    segments: z
      .array(
        z
          .object({
            segmentOrder: z.literal(1),
            sport: z.enum(["RUNNING", "CYCLING"]),
            poolLength: z.null(),
            poolLengthUnit: z.null(),
            estimatedDurationInSecs: z.number().int().nonnegative().nullable(),
            estimatedDistanceInMeters: finite.nonnegative().nullable(),
            steps: z.array(garminWorkoutStepSchema).min(1).max(GARMIN_TRAINING_MAX_WORKOUT_STEPS),
          })
          .strict(),
      )
      .length(1),
  })
  .strict();
export type GarminWorkout = z.infer<typeof garminWorkoutSchema>;

export const garminWorkoutScheduleSchema = z
  .object({
    scheduleId: idSchema.optional(),
    workoutId: idSchema,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return false;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        return (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month - 1 &&
          date.getUTCDate() === day
        );
      }, "invalid calendar date"),
  })
  .strict();
export type GarminWorkoutSchedule = z.infer<typeof garminWorkoutScheduleSchema>;

export function assertGarminTrainingDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new GarminTrainingValidationError("invalid_date");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new GarminTrainingValidationError("invalid_date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new GarminTrainingValidationError("invalid_date");
  return value;
}

export class GarminTrainingValidationError extends Error {
  constructor(readonly reason: "invalid_date" | "invalid_id" | "invalid_payload") {
    super("Garmin Training input is invalid");
    this.name = "GarminTrainingValidationError";
  }
}
export function assertGarminTrainingId(value: unknown): number {
  const parsed = idSchema.safeParse(
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  );
  if (!parsed.success || !Number.isSafeInteger(parsed.data))
    throw new GarminTrainingValidationError("invalid_id");
  return parsed.data;
}
