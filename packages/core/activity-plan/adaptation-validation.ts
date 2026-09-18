import { resolveActivityPlanStructure } from "./adaptation-resolution";
import {
  type ActivityPlanAdaptation,
  type ActivityPlanAdaptationValues,
  activityPlanAdaptationSchema,
} from "./adaptation-schema";
import { validateActivityPlanIntent } from "./intent-validation";
import type { ActivityPlanStructure } from "./structure-schema";
import type { ActivityPlanIntent } from "./training-intent";

const MAX_ADAPTATION_SURFACE_STATES = 10_000;

export type ActivityPlanAdaptationSurfaceValidation = {
  status: "compatible" | "incompatible" | "indeterminate";
  evaluated_states: number;
  incompatible_states: Array<{
    adaptation_values: ActivityPlanAdaptationValues;
    violations: ReturnType<typeof validateActivityPlanIntent>["violations"];
  }>;
  reason: "surface_too_large" | "invalid_adaptation" | null;
};

function targetFieldKey(target: ActivityPlanAdaptation["controls"][number]["targets"][number]) {
  if (target.type === "rest_segment") return `segment:${target.segmentId}:duration:time`;
  const node = `${target.activitySegmentId}:${target.intervalId}`;
  if (target.type === "interval_repetitions") return `interval:${node}:repetitions`;
  if (target.type === "target_intensity")
    return `step:${node}:${target.stepId}:target:${target.targetType}`;
  return `step:${node}:${target.stepId}:duration:${target.quantityType}`;
}

function cardinality(range: { minimum: number; maximum: number; increment: number }) {
  return Math.floor((range.maximum - range.minimum) / range.increment) + 1;
}

function values(range: { minimum: number; maximum: number; increment: number }) {
  const count = cardinality(range);
  return function* () {
    for (let index = 0; index < count; index += 1) {
      const value = range.minimum + index * range.increment;
      yield Number.isInteger(value) ? value : Number(value.toFixed(9));
    }
  };
}

/** Validates bounded semantic surface states before any allocation or resolution work. */
export function validateActivityPlanAdaptationSurface(input: {
  structure: ActivityPlanStructure;
  adaptation: unknown;
  intent: ActivityPlanIntent;
}): ActivityPlanAdaptationSurfaceValidation {
  const parsed = activityPlanAdaptationSchema.safeParse(input.adaptation);
  if (!parsed.success) {
    return {
      status: "incompatible",
      evaluated_states: 0,
      incompatible_states: [],
      reason: "invalid_adaptation",
    };
  }
  const declared = parsed.data.controls.map((control) => [control.key, control.range] as const);
  const stateCount =
    parsed.data.allowedStates?.length ??
    declared.reduce((total, [, range]) => total * cardinality(range), 1);
  if (!Number.isSafeInteger(stateCount) || stateCount > MAX_ADAPTATION_SURFACE_STATES) {
    return {
      status: "indeterminate",
      evaluated_states: 0,
      incompatible_states: [],
      reason: "surface_too_large",
    };
  }

  const incompatibleStates: ActivityPlanAdaptationSurfaceValidation["incompatible_states"] = [];
  let evaluatedStates = 0;
  let invalidResolution = false;
  const controlsByField = new Map<string, string[]>();
  for (const control of parsed.data.controls) {
    for (const target of control.targets) {
      const field = targetFieldKey(target);
      controlsByField.set(field, [...(controlsByField.get(field) ?? []), control.key]);
    }
  }
  const permittedStates: ActivityPlanAdaptationValues[] = [];
  const visit = (index: number, requested: ActivityPlanAdaptationValues) => {
    const entry = declared[index];
    if (!entry) {
      permittedStates.push({ ...requested });
      return;
    }
    const [controlKey, range] = entry;
    for (const value of values(range)()) {
      requested[controlKey] = value;
      visit(index + 1, requested);
    }
    delete requested[controlKey];
  };
  if (parsed.data.allowedStates) {
    permittedStates.push(...parsed.data.allowedStates.map((state) => ({ ...state.values })));
  } else {
    visit(0, {});
  }
  for (const state of permittedStates) {
    for (const keys of controlsByField.values()) {
      const uniqueKeys = [...new Set(keys)];
      const firstKey = uniqueKeys[0];
      if (
        firstKey !== undefined &&
        uniqueKeys.length > 1 &&
        uniqueKeys.some((key) => state[key] !== state[firstKey])
      ) {
        return {
          status: "incompatible",
          evaluated_states: 0,
          incompatible_states: [],
          reason: "invalid_adaptation",
        };
      }
    }
  }
  for (const requested of permittedStates) {
    const resolution = resolveActivityPlanStructure({
      structure: input.structure,
      adaptation: parsed.data,
      adaptation_values: requested,
    });
    if (resolution.status !== "resolved") {
      invalidResolution = true;
      continue;
    }
    evaluatedStates += 1;
    const validation = validateActivityPlanIntent({
      intent: input.intent,
      structure: resolution.structure,
    });
    if (validation.status === "incompatible") {
      incompatibleStates.push({
        adaptation_values: { ...requested },
        violations: validation.violations,
      });
    }
  }
  if (invalidResolution || evaluatedStates === 0) {
    return {
      status: "incompatible",
      evaluated_states: evaluatedStates,
      incompatible_states: incompatibleStates,
      reason: "invalid_adaptation",
    };
  }
  return {
    status: incompatibleStates.length > 0 ? "incompatible" : "compatible",
    evaluated_states: evaluatedStates,
    incompatible_states: incompatibleStates,
    reason: null,
  };
}
