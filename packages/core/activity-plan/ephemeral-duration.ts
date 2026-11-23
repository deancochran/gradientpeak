import {
  type ActivityPlanStep,
  type ActivityPlanStructure,
  activityPlanStructureSchema,
} from "./structure-schema";

export type EphemeralDurationTransform =
  | { status: "transformed"; structure: ActivityPlanStructure; sourceDurationSeconds: number }
  | { status: "unsupported"; reason: "non_timed_structure" | "target_out_of_range" };

/**
 * Creates a non-persisted, duration-only variation of an authored all-timed
 * activity plan. Targets, topology, ids, and repeat counts remain unchanged.
 */
export function withEphemeralTimedDuration(input: {
  structure: ActivityPlanStructure;
  targetDurationSeconds: number;
}): EphemeralDurationTransform {
  if (!Number.isSafeInteger(input.targetDurationSeconds) || input.targetDurationSeconds < 1)
    return { status: "unsupported", reason: "target_out_of_range" };
  const steps = input.structure.items.flatMap((item) =>
    (item.type === "step" ? [item] : item.steps).map((step) => ({
      step,
      multiplier: item.type === "repeat" ? item.count : 1,
    })),
  );
  if (steps.some(({ step }) => step.duration.type !== "time"))
    return { status: "unsupported", reason: "non_timed_structure" };
  const sourceDurationSeconds = steps.reduce(
    (sum, { step, multiplier }) =>
      sum + (step.duration.type === "time" ? step.duration.seconds * multiplier : 0),
    0,
  );
  if (input.targetDurationSeconds < steps.reduce((sum, { multiplier }) => sum + multiplier, 0))
    return { status: "unsupported", reason: "target_out_of_range" };
  const scaled = steps.map(({ step, multiplier }) => {
    const seconds = step.duration.type === "time" ? step.duration.seconds : 1;
    const raw = (seconds * input.targetDurationSeconds) / sourceDurationSeconds;
    return { seconds: Math.max(1, Math.floor(raw)), fraction: raw % 1, multiplier };
  });
  let remainder =
    input.targetDurationSeconds -
    scaled.reduce((sum, item) => sum + item.seconds * item.multiplier, 0);
  for (const item of [...scaled].sort((a, b) => b.fraction - a.fraction)) {
    if (remainder < item.multiplier) continue;
    item.seconds += 1;
    remainder -= item.multiplier;
  }
  if (remainder !== 0) return { status: "unsupported", reason: "target_out_of_range" };
  let index = 0;
  const items = input.structure.items.map((item) => {
    const apply = (step: ActivityPlanStep) => {
      const replacement = scaled[index++];
      if (!replacement) throw new Error("Timed duration transform lost a step");
      return { ...step, duration: { type: "time" as const, seconds: replacement.seconds } };
    };
    return item.type === "step" ? apply(item) : { ...item, steps: item.steps.map(apply) };
  });
  return {
    status: "transformed",
    sourceDurationSeconds,
    structure: activityPlanStructureSchema.parse({ ...input.structure, items }),
  };
}
