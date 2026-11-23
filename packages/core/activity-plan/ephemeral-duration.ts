import {
  type ActivityPlanStep,
  type ActivityPlanStructure,
  activityPlanStructureSchema,
} from "./structure-schema";
import { ACTIVITY_PLAN_LIMITS } from "./structure-validation";

export type EphemeralDurationTransform =
  | { status: "transformed"; structure: ActivityPlanStructure; sourceDurationSeconds: number }
  | { status: "unsupported"; reason: "non_timed_structure" | "target_out_of_range" };

type TimedStep = {
  duration: number;
  multiplier: number;
  step: ActivityPlanStep;
};

type DurationGroup = {
  indices: number[];
  multiplier: number;
};

const MAX_ROUNDING_REPAIR_SECONDS = 49;

function greatestCommonDivisor(left: number, right: number): number {
  let dividend = left;
  let divisor = right;
  while (divisor !== 0) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return dividend;
}

function requiredAt<T>(values: readonly T[], index: number, message: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(message);
  return value;
}

/**
 * Allocates a weighted integer total across repeat-count groups. The work is
 * O(groupCount * target) and the reconstruction storage is O(groupCount *
 * target); target is bounded by the explicit seven-day plan limit.
 */
function allocateWeightedExtras(input: {
  capacities: number[];
  groups: DurationGroup[];
  target: number;
}): number[] | undefined {
  const reachable = new Uint8Array(input.target + 1);
  reachable[0] = 1;
  const selections: Uint16Array[] = [];

  for (const [groupIndex, group] of input.groups.entries()) {
    const capacity = Math.min(
      input.capacities[groupIndex] ?? 0,
      Math.floor(input.target / group.multiplier),
    );
    const next = new Uint8Array(input.target + 1);
    const used = new Int32Array(input.target + 1);
    used.fill(-1);

    for (let total = 0; total <= input.target; total += 1) {
      if (reachable[total]) {
        next[total] = 1;
        used[total] = 0;
      } else if (
        total >= group.multiplier &&
        next[total - group.multiplier] &&
        (used[total - group.multiplier] ?? -1) < capacity
      ) {
        next[total] = 1;
        used[total] = (used[total - group.multiplier] ?? -1) + 1;
      }
    }
    const selection = new Uint16Array(input.target + 1);
    for (let total = 0; total <= input.target; total += 1)
      if (next[total]) selection[total] = used[total] ?? 0;
    selections.push(selection);
    reachable.set(next);
  }

  if (!reachable[input.target]) return undefined;
  const allocations = new Array<number>(input.groups.length).fill(0);
  for (
    let groupIndex = input.groups.length - 1, total = input.target;
    groupIndex >= 0;
    groupIndex -= 1
  ) {
    const selected = selections[groupIndex]?.[total];
    const group = input.groups[groupIndex];
    if (selected === undefined || !group) return undefined;
    allocations[groupIndex] = selected;
    total -= selected * group.multiplier;
  }
  return allocations;
}

function distributeGroupAdjustment(input: {
  amounts: number[];
  durations: number[];
  fractions: number[];
  groups: DurationGroup[];
  direction: "add" | "remove";
}) {
  for (const [groupIndex, group] of input.groups.entries()) {
    let amount = input.amounts[groupIndex] ?? 0;
    const ordered = [...group.indices].sort((left, right) =>
      input.direction === "add"
        ? requiredAt(input.fractions, right, "Timed duration transform lost a fraction") -
            requiredAt(input.fractions, left, "Timed duration transform lost a fraction") ||
          left - right
        : requiredAt(input.fractions, left, "Timed duration transform lost a fraction") -
            requiredAt(input.fractions, right, "Timed duration transform lost a fraction") ||
          left - right,
    );
    for (const index of ordered) {
      if (amount === 0) break;
      const duration = input.durations[index];
      if (duration === undefined) throw new Error("Timed duration transform lost a duration");
      const limit =
        input.direction === "add"
          ? ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds - duration
          : duration - 1;
      const allocation = Math.min(limit, amount);
      input.durations[index] =
        input.direction === "add" ? duration + allocation : duration - allocation;
      amount -= allocation;
    }
    if (amount !== 0) throw new Error("Timed duration transform exceeded step capacity");
  }
}

/**
 * Creates a non-persisted, duration-only variation of an authored all-timed
 * activity plan. Targets, topology, ids, and repeat counts remain unchanged.
 *
 * The allocation objective is lexicographic: preserve an identical source
 * exactly; otherwise use the bounded proportional continuous allocation,
 * round down, then give exact integer seconds to the largest fractional
 * remainders. If repeat weights make that rounding impossible, the smallest
 * local (at most 49 seconds) downward rounding repair is tried before a
 * bounded exact-feasibility fallback. This avoids concentrating a valid
 * proportional allocation in an arbitrary repeat group.
 */
export function withEphemeralTimedDuration(input: {
  structure: ActivityPlanStructure;
  targetDurationSeconds: number;
}): EphemeralDurationTransform {
  if (!Number.isSafeInteger(input.targetDurationSeconds) || input.targetDurationSeconds < 1)
    return { status: "unsupported", reason: "target_out_of_range" };

  const steps: TimedStep[] = input.structure.items.flatMap((item) =>
    (item.type === "step" ? [item] : item.steps).map((step) => ({
      step,
      multiplier: item.type === "repeat" ? item.count : 1,
      duration: step.duration.type === "time" ? step.duration.seconds : 0,
    })),
  );
  if (steps.some(({ step }) => step.duration.type !== "time"))
    return { status: "unsupported", reason: "non_timed_structure" };

  const sourceDurationSeconds = steps.reduce(
    (sum, { duration, multiplier }) => sum + duration * multiplier,
    0,
  );
  const minimumDurationSeconds = steps.reduce((sum, { multiplier }) => sum + multiplier, 0);
  if (
    input.targetDurationSeconds < minimumDurationSeconds ||
    input.targetDurationSeconds > ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds
  )
    return { status: "unsupported", reason: "target_out_of_range" };
  if (input.targetDurationSeconds === sourceDurationSeconds)
    return { status: "transformed", sourceDurationSeconds, structure: input.structure };

  const groups = [...new Set(steps.map(({ multiplier }) => multiplier))]
    .sort((left, right) => left - right)
    .map((multiplier) => ({
      multiplier,
      indices: steps.flatMap(({ multiplier: stepMultiplier }, index) =>
        stepMultiplier === multiplier ? [index] : [],
      ),
    }));
  const multiplierGcd = groups.reduce(
    (gcd, group) => greatestCommonDivisor(gcd, group.multiplier),
    groups[0]?.multiplier ?? 1,
  );
  if ((input.targetDurationSeconds - minimumDurationSeconds) % multiplierGcd !== 0)
    return { status: "unsupported", reason: "target_out_of_range" };

  // Water-fill a proportional allocation while respecting the step bounds.
  const ideal = new Array<number>(steps.length).fill(1);
  const unresolved = new Set(steps.map((_, index) => index));
  let remainingTarget = input.targetDurationSeconds;
  while (unresolved.size > 0) {
    const sourceWeight = [...unresolved].reduce((sum, index) => {
      const step = requiredAt(steps, index, "Timed duration transform lost a step");
      return sum + step.duration * step.multiplier;
    }, 0);
    if (sourceWeight === 0) break;
    const scale = remainingTarget / sourceWeight;
    let clamped = false;
    for (const index of [...unresolved]) {
      const step = requiredAt(steps, index, "Timed duration transform lost a step");
      const proposed = step.duration * scale;
      if (proposed <= 1 || proposed >= ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds) {
        const duration = proposed <= 1 ? 1 : ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds;
        ideal[index] = duration;
        remainingTarget -= duration * step.multiplier;
        unresolved.delete(index);
        clamped = true;
      }
    }
    if (!clamped) {
      for (const index of unresolved)
        ideal[index] =
          requiredAt(steps, index, "Timed duration transform lost a step").duration * scale;
      break;
    }
  }

  const durations = ideal.map((value) => Math.floor(value));
  const fractions = ideal.map((value) => value - Math.floor(value));
  const roundedDuration = durations.reduce(
    (sum, duration, index) =>
      sum + duration * requiredAt(steps, index, "Timed duration transform lost a step").multiplier,
    0,
  );
  const roundingRemainder = input.targetDurationSeconds - roundedDuration;
  const capacities = groups.map((group) =>
    group.indices.reduce(
      (sum, index) =>
        sum +
        ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds -
        requiredAt(durations, index, "Timed duration transform lost a duration"),
      0,
    ),
  );
  let additions = allocateWeightedExtras({ capacities, groups, target: roundingRemainder });

  if (!additions) {
    // A small modular repair keeps the result nearest to proportional rounding
    // for cases such as repeat weights 2 and 3 with a remainder of one.
    for (let repair = 1; repair <= MAX_ROUNDING_REPAIR_SECONDS && !additions; repair += 1) {
      for (const [groupIndex, group] of groups.entries()) {
        const removable = group.indices.reduce(
          (sum, index) =>
            sum + requiredAt(durations, index, "Timed duration transform lost a duration") - 1,
          0,
        );
        if (removable < repair) continue;
        const repairedDurations = [...durations];
        const removals = new Array<number>(groups.length).fill(0);
        removals[groupIndex] = repair;
        distributeGroupAdjustment({
          amounts: removals,
          durations: repairedDurations,
          fractions,
          groups,
          direction: "remove",
        });
        const repairedCapacities = groups.map((candidate) =>
          candidate.indices.reduce(
            (sum, index) =>
              sum +
              ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds -
              requiredAt(repairedDurations, index, "Timed duration transform lost a duration"),
            0,
          ),
        );
        const candidate = allocateWeightedExtras({
          capacities: repairedCapacities,
          groups,
          target: roundingRemainder + repair * group.multiplier,
        });
        if (candidate) {
          durations.splice(0, durations.length, ...repairedDurations);
          additions = candidate;
          break;
        }
      }
    }
  }

  if (!additions) {
    // The local repair is deliberately bounded. This final pass distinguishes
    // genuinely unreachable totals from unusual, but valid, weighted plans.
    durations.splice(0, durations.length, ...steps.map(() => 1));
    additions = allocateWeightedExtras({
      capacities: groups.map(
        (group) => group.indices.length * (ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds - 1),
      ),
      groups,
      target: input.targetDurationSeconds - minimumDurationSeconds,
    });
    if (!additions) return { status: "unsupported", reason: "target_out_of_range" };
  }

  distributeGroupAdjustment({ amounts: additions, durations, fractions, groups, direction: "add" });
  let index = 0;
  const items = input.structure.items.map((item) => {
    const apply = (step: ActivityPlanStep) => {
      const duration = durations[index++];
      if (duration === undefined) throw new Error("Timed duration transform lost a duration");
      return { ...step, duration: { type: "time" as const, seconds: duration } };
    };
    return item.type === "step" ? apply(item) : { ...item, steps: item.steps.map(apply) };
  });
  return {
    status: "transformed",
    sourceDurationSeconds,
    structure: activityPlanStructureSchema.parse({ ...input.structure, items }),
  };
}
