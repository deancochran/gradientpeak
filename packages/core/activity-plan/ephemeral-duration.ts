import {
  type ActivityPlanStep,
  type ActivityPlanStructure,
  activityPlanStructureSchema,
} from "./structure-schema";
import { ACTIVITY_PLAN_LIMITS } from "./structure-validation";

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
  if (
    input.targetDurationSeconds < minimumDurationSeconds ||
    input.targetDurationSeconds > ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds
  )
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
      extraSeconds,
      fraction: rawExtraSeconds % 1,
      multiplier,
    };
  });
  const groups = [...new Set(scaled.map((item) => item.multiplier))]
    .map((multiplier) => ({
      multiplier,
      indices: scaled
        .map((item, index) => ({ ...item, index }))
        .filter((item) => item.multiplier === multiplier),
    }))
    .sort(
      (left, right) =>
        Math.max(...right.indices.map((item) => item.fraction)) -
          Math.max(...left.indices.map((item) => item.fraction)) ||
        left.multiplier - right.multiplier,
    );
  const reachable = new Uint8Array(remainingDurationSeconds + 1);
  const remainingCapacity = new Int32Array(remainingDurationSeconds + 1);
  const previous = new Int32Array(remainingDurationSeconds + 1);
  const multiplierAt = new Int16Array(remainingDurationSeconds + 1);
  previous.fill(-1);
  reachable[0] = 1;
  for (const group of groups) {
    const capacity = Math.min(
      group.indices.length * (ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds - 1),
      remainingDurationSeconds,
    );
    for (let duration = 0; duration <= remainingDurationSeconds; duration += 1) {
      if (reachable[duration]) {
        remainingCapacity[duration] = capacity;
        continue;
      }
      const before = duration - group.multiplier;
      if (before >= 0 && (remainingCapacity[before] ?? 0) > 0) {
        reachable[duration] = 1;
        remainingCapacity[duration] = (remainingCapacity[before] ?? 0) - 1;
        previous[duration] = before;
        multiplierAt[duration] = group.multiplier;
      }
    }
  }
  if (!reachable[remainingDurationSeconds])
    return { status: "unsupported", reason: "target_out_of_range" };
  const increments = new Map<number, number>();
  for (let duration = remainingDurationSeconds; duration > 0; ) {
    const multiplier = multiplierAt[duration];
    const priorDuration = previous[duration];
    if (!multiplier || priorDuration === undefined || priorDuration < 0)
      throw new Error("Timed duration transform lost an allocation");
    increments.set(multiplier, (increments.get(multiplier) ?? 0) + 1);
    duration = priorDuration;
  }
  for (const group of groups) {
    let extraSeconds = increments.get(group.multiplier) ?? 0;
    const ordered = [...group.indices].sort(
      (left, right) =>
        right.fraction - left.fraction ||
        right.extraSeconds - left.extraSeconds ||
        left.index - right.index,
    );
    for (const item of ordered) {
      const allocation = Math.min(item.extraSeconds, extraSeconds);
      const scaledItem = scaled[item.index];
      if (!scaledItem) throw new Error("Timed duration transform lost a scaled step");
      scaledItem.extraSeconds = allocation;
      extraSeconds -= allocation;
    }
    for (const item of ordered) {
      if (extraSeconds === 0) break;
      const scaledItem = scaled[item.index];
      if (!scaledItem) throw new Error("Timed duration transform lost a scaled step");
      const allocation = Math.min(
        ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds - 1 - scaledItem.extraSeconds,
        extraSeconds,
      );
      scaledItem.extraSeconds += allocation;
      extraSeconds -= allocation;
    }
    if (extraSeconds !== 0) throw new Error("Timed duration transform exceeded step capacity");
  }
  let index = 0;
  const items = input.structure.items.map((item) => {
    const apply = (step: ActivityPlanStep) => {
      const replacement = scaled[index++];
      if (!replacement) throw new Error("Timed duration transform lost a step");
      return {
        ...step,
        duration: { type: "time" as const, seconds: replacement.extraSeconds + 1 },
      };
    };
    return item.type === "step" ? apply(item) : { ...item, steps: item.steps.map(apply) };
  });
  return {
    status: "transformed",
    sourceDurationSeconds,
    structure: activityPlanStructureSchema.parse({ ...input.structure, items }),
  };
}
