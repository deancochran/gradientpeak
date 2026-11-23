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
  const minimumDurationSeconds = steps.reduce((sum, { multiplier }) => sum + multiplier, 0);
  if (input.targetDurationSeconds < minimumDurationSeconds)
    return { status: "unsupported", reason: "target_out_of_range" };
  const remainingDurationSeconds = input.targetDurationSeconds - minimumDurationSeconds;
  const sourceFlexibleDurationSeconds = sourceDurationSeconds - minimumDurationSeconds;
  const weightDurationSeconds =
    sourceFlexibleDurationSeconds === 0 ? minimumDurationSeconds : sourceFlexibleDurationSeconds;
  const scaled = steps.map(({ step, multiplier }) => {
    const sourceSeconds = step.duration.type === "time" ? step.duration.seconds : 1;
    const weight = sourceFlexibleDurationSeconds === 0 ? 1 : sourceSeconds - 1;
    const rawExtraSeconds = (weight * remainingDurationSeconds) / weightDurationSeconds;
    const extraSeconds = Math.floor(rawExtraSeconds);
    return {
      seconds: extraSeconds + 1,
      fraction: rawExtraSeconds % 1,
      multiplier,
    };
  });
  let remainder =
    input.targetDurationSeconds -
    scaled.reduce((sum, item) => sum + item.seconds * item.multiplier, 0);
  const candidates = scaled
    .map((item, index) => ({ ...item, index }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction ||
        left.multiplier - right.multiplier ||
        left.index - right.index,
    );
  const allocation = Array.from<{ previous: number; index: number } | undefined>({
    length: remainder + 1,
  });
  allocation[0] = { previous: 0, index: -1 };
  for (let duration = 1; duration <= remainder; duration += 1) {
    for (const candidate of candidates) {
      const previous = duration - candidate.multiplier;
      if (previous < 0 || !allocation[previous]) continue;
      allocation[duration] = { previous, index: candidate.index };
      break;
    }
  }
  if (!allocation[remainder]) return { status: "unsupported", reason: "target_out_of_range" };
  while (remainder > 0) {
    const item = allocation[remainder];
    if (!item || item.index < 0) throw new Error("Timed duration transform lost an allocation");
    const scaledItem = scaled[item.index];
    if (!scaledItem) throw new Error("Timed duration transform lost a scaled step");
    scaledItem.seconds += 1;
    remainder = item.previous;
  }
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
