import { type ActivityPlanStep, type ActivityPlanStructure, compileActivityPlan } from "@repo/core";
import {
  GARMIN_TRAINING_MAX_WORKOUT_STEPS,
  GarminTrainingValidationError,
  type GarminWorkout,
  type GarminWorkoutStep,
  garminWorkoutSchema,
} from "./training-types";

export class GarminTrainingProjectionError extends Error {
  constructor(
    readonly code:
      | "unsupported_sport"
      | "unsupported_duration"
      | "unsupported_target"
      | "too_many_steps"
      | "invalid_plan",
  ) {
    super("Garmin Training activityPlan cannot preserve this prescription");
    this.name = "GarminTrainingProjectionError";
  }
}
type Source = { name: string; description: string | null; structure: ActivityPlanStructure };
const unsupported = (code: GarminTrainingProjectionError["code"]): never => {
  throw new GarminTrainingProjectionError(code);
};

/** Pure, immutable projection of the frozen V5 prescription. Swim is intentionally excluded: Core has no pool/stroke contract. */
export function projectGarminTrainingActivityPlan(source: Source): GarminWorkout {
  const compiled = compileActivityPlan(source.structure);
  if (compiled.activity_category !== "run" && compiled.activity_category !== "bike")
    unsupported("unsupported_sport");
  if (compiled.occurrences.length > GARMIN_TRAINING_MAX_WORKOUT_STEPS)
    unsupported("too_many_steps");
  if (source.description !== null && Array.from(source.description).length > 1024)
    unsupported("invalid_plan");
  let order = 0;
  const convertStep = (step: ActivityPlanStep): GarminWorkoutStep => {
    order += 1;
    if (step.duration.type === "repetitions" || step.duration.type === "untilFinished")
      unsupported("unsupported_duration");
    if (step.targets.length > 1) unsupported("unsupported_target");
    const target = step.targets[0];
    const durationValue =
      step.duration.type === "distance"
        ? step.duration.meters
        : step.duration.type === "time"
          ? step.duration.seconds
          : unsupported("unsupported_duration");
    const base = {
      type: "WorkoutStep" as const,
      stepOrder: order,
      intensity: target?.type === "rest" ? ("REST" as const) : ("ACTIVE" as const),
      description: step.instructions ?? step.name ?? null,
      durationType:
        step.duration.type === "distance"
          ? ("DISTANCE" as const)
          : target?.type === "rest"
            ? ("FIXED_REST" as const)
            : ("TIME" as const),
      durationValue,
      durationValueType:
        step.duration.type === "distance" ? ("METER" as const) : ("SECOND" as const),
      targetType: "OPEN" as const,
      targetValue: null,
      targetValueLow: null,
      targetValueHigh: null,
      targetValueType: null,
      secondaryTargetType: null,
      secondaryTargetValue: null,
      secondaryTargetValueLow: null,
      secondaryTargetValueHigh: null,
      secondaryTargetValueType: null,
      strokeType: null,
      drillType: null,
      equipmentType: null,
      exerciseCategory: null,
      exerciseName: null,
      weightValue: null,
      weightDisplayUnit: null,
    };
    if (!target || target.type === "rest") return base;
    const type =
      target.type === "speed"
        ? "SPEED"
        : target.type === "bpm"
          ? "HEART_RATE"
          : target.type === "cadence"
            ? "CADENCE"
            : target.type === "watts"
              ? "POWER"
              : null;
    if (!type) return unsupported("unsupported_target");
    const value = target.type === "speed" ? target.intensity / 3.6 : target.intensity;
    return { ...base, targetType: type, targetValueLow: value, targetValueHigh: value };
  };
  const steps: GarminWorkoutStep[] = source.structure.items.map((item) =>
    item.type === "step"
      ? convertStep(item)
      : (() => {
          order += 1;
          return {
            type: "WorkoutRepeatStep" as const,
            stepOrder: order,
            repeatType: "REPEAT_UNTIL_STEPS_CMPLT" as const,
            repeatValue: item.count,
            steps: item.steps.map(convertStep),
          };
        })(),
  );
  const garminSport =
    compiled.activity_category === "run" ? ("RUNNING" as const) : ("CYCLING" as const);
  const activityPlan = {
    workoutName: source.name,
    description: source.description ?? "",
    sport: garminSport,
    poolLength: null,
    poolLengthUnit: null,
    workoutProvider: "GradientPeak",
    workoutSourceId: "GradientPeak",
    isSessionTransitionEnabled: false as const,
    segments: [
      {
        segmentOrder: 1 as const,
        sport: garminSport,
        poolLength: null,
        poolLengthUnit: null,
        estimatedDurationInSecs: null,
        estimatedDistanceInMeters: null,
        steps,
      },
    ],
  };
  const parsed = garminWorkoutSchema.safeParse(activityPlan);
  if (!parsed.success) throw new GarminTrainingValidationError("invalid_payload");
  return parsed.data;
}
