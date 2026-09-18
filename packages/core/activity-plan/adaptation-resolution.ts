import {
  type ActivityPlanAdaptation,
  type ActivityPlanAdaptationValues,
  type AdaptationControl,
  type AdaptationTarget,
  activityPlanAdaptationSchema,
} from "./adaptation-schema";
import {
  type ActivityPlanStructure,
  activityPlanStructureSchema,
  type EditableActivityPlanStructure,
} from "./structure-schema";

export type ActivityPlanResolutionFailure = {
  status: "unavailable";
  reason: "invalid_adaptation" | "invalid_adaptation_value" | "invalid_resolved_structure";
  issues: string[];
};
export type ActivityPlanResolutionSuccess = {
  status: "resolved";
  mode: "default" | "adjusted";
  structure: ActivityPlanStructure;
  adaptation_values: ActivityPlanAdaptationValues;
};
export type ActivityPlanResolution = ActivityPlanResolutionFailure | ActivityPlanResolutionSuccess;

function aligned(value: number, range: AdaptationControl["range"]) {
  const steps = (value - range.minimum) / range.increment;
  return (
    value >= range.minimum && value <= range.maximum && Math.abs(steps - Math.round(steps)) <= 1e-9
  );
}

function findInterval(
  structure: EditableActivityPlanStructure,
  target: { activitySegmentId: string; intervalId: string },
) {
  const segment = structure.segments.find((item) => item.id === target.activitySegmentId);
  if (!segment || segment.role !== "activity") return null;
  const interval = segment.intervals.find((item) => item.id === target.intervalId);
  return interval ? { segment, interval } : null;
}

function findStep(
  structure: EditableActivityPlanStructure,
  target: { activitySegmentId: string; intervalId: string; stepId: string },
) {
  const found = findInterval(structure, target);
  if (!found) return null;
  const step = found.interval.steps.find((item) => item.id === target.stepId);
  return step ? { ...found, step } : null;
}

function applyTarget(
  structure: EditableActivityPlanStructure,
  target: AdaptationTarget,
  control: AdaptationControl,
  value: number,
  enforceAuthoredDefault = true,
): string | null {
  if (target.type === "interval_repetitions") {
    const found = findInterval(structure, target);
    if (!found) return "Interval-repetition target does not exist.";
    if (enforceAuthoredDefault && found.interval.repetitions !== control.range.default)
      return "Control default differs from authored interval repetitions.";
    found.interval.repetitions = value;
    return null;
  }
  if (target.type === "rest_segment") {
    const segment = structure.segments.find((item) => item.id === target.segmentId);
    if (!segment || segment.role !== "rest")
      return "Recovery target does not identify a rest segment.";
    if (enforceAuthoredDefault && segment.duration.seconds !== control.range.default)
      return "Control default differs from authored rest duration.";
    segment.duration.seconds = value;
    return null;
  }
  const found = findStep(structure, target);
  if (!found) return "Step target does not exist.";
  if (target.type === "target_intensity") {
    const matches = found.step.targets.filter((item) => item.type === target.targetType);
    if (matches.length !== 1)
      return "Intensity target must identify exactly one authored target type.";
    const activityTarget = matches[0];
    if (!activityTarget) return "Intensity target does not exist.";
    if (enforceAuthoredDefault && activityTarget.intensity !== control.range.default)
      return "Control default differs from authored target intensity.";
    activityTarget.intensity = value;
    return null;
  }
  if (target.type === "recovery_step" && found.step.purpose !== "recovery")
    return "Recovery-step target must identify an explicitly authored recovery step.";
  if (found.step.duration.type !== target.quantityType)
    return "Step quantity type does not match the authored duration.";
  const authored =
    found.step.duration.type === "time"
      ? found.step.duration.seconds
      : found.step.duration.type === "distance"
        ? found.step.duration.meters
        : found.step.duration.count;
  if (enforceAuthoredDefault && authored !== control.range.default)
    return "Control default differs from authored step quantity.";
  if (found.step.duration.type === "time") found.step.duration.seconds = value;
  else if (found.step.duration.type === "distance") found.step.duration.meters = value;
  else found.step.duration.count = value;
  return null;
}

function matchesAllowedState(
  adaptation: ActivityPlanAdaptation,
  values: ActivityPlanAdaptationValues,
) {
  if (!adaptation.allowedStates) return true;
  return adaptation.allowedStates.some((state) =>
    adaptation.controls.every((control) => state.values[control.key] === values[control.key]),
  );
}

function targetFieldKey(target: AdaptationTarget) {
  if (target.type === "rest_segment") return `segment:${target.segmentId}:duration:time`;
  const node = `${target.activitySegmentId}:${target.intervalId}`;
  if (target.type === "interval_repetitions") return `interval:${node}:repetitions`;
  if (target.type === "target_intensity")
    return `step:${node}:${target.stepId}:target:${target.targetType}`;
  return `step:${node}:${target.stepId}:duration:${target.quantityType}`;
}

function requiredControlValue(values: ActivityPlanAdaptationValues, key: string): number {
  const value = values[key];
  if (value === undefined) throw new Error(`Missing resolved adaptation value for ${key}.`);
  return value;
}

export function resolveActivityPlanStructure(input: {
  structure: unknown;
  adaptation?: unknown;
  adaptation_values?: Readonly<ActivityPlanAdaptationValues>;
}): ActivityPlanResolution {
  const structure = activityPlanStructureSchema.safeParse(input.structure);
  if (!structure.success)
    return {
      status: "unavailable",
      reason: "invalid_resolved_structure",
      issues: structure.error.issues.map((issue) => issue.message),
    };
  if (input.adaptation === undefined || input.adaptation === null) {
    if (input.adaptation_values && Object.keys(input.adaptation_values).length > 0)
      return {
        status: "unavailable",
        reason: "invalid_adaptation_value",
        issues: ["A plan without adaptation controls cannot accept adaptation values."],
      };
    return {
      status: "resolved",
      mode: "default",
      structure: structure.data,
      adaptation_values: {},
    };
  }
  const parsed = activityPlanAdaptationSchema.safeParse(input.adaptation);
  if (!parsed.success)
    return {
      status: "unavailable",
      reason: "invalid_adaptation",
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  const requested = input.adaptation_values ?? {};
  const controlsByKey = new Map(parsed.data.controls.map((control) => [control.key, control]));
  const unknown = Object.keys(requested).filter((key) => !controlsByKey.has(key));
  if (unknown.length > 0)
    return {
      status: "unavailable",
      reason: "invalid_adaptation_value",
      issues: unknown.map((key) => `Unknown semantic adaptation control ${key}.`),
    };
  const values = Object.fromEntries(
    parsed.data.controls.map((control) => [
      control.key,
      requested[control.key] ?? control.range.default,
    ]),
  );
  for (const control of parsed.data.controls) {
    const value = requiredControlValue(values, control.key);
    if (!Number.isFinite(value) || !aligned(value, control.range))
      return {
        status: "unavailable",
        reason: "invalid_adaptation_value",
        issues: [`${control.key} is outside its declared range or increment.`],
      };
  }
  if (!matchesAllowedState(parsed.data, values))
    return {
      status: "unavailable",
      reason: "invalid_adaptation_value",
      issues: ["Adaptation values do not identify an allowed state."],
    };
  const fieldValues = new Map<string, number>();
  for (const control of parsed.data.controls) {
    for (const target of control.targets) {
      const field = targetFieldKey(target);
      const prior = fieldValues.get(field);
      const next = requiredControlValue(values, control.key);
      if (prior !== undefined && prior !== next)
        return {
          status: "unavailable",
          reason: "invalid_adaptation",
          issues: ["Multiple controls write conflicting values to the same authored field."],
        };
      fieldValues.set(field, next);
    }
  }
  for (const control of parsed.data.controls) {
    for (const target of control.targets) {
      const issue = applyTarget(
        structuredClone(structure.data),
        target,
        control,
        control.range.default,
      );
      if (issue) return { status: "unavailable", reason: "invalid_adaptation", issues: [issue] };
    }
  }
  const editable: EditableActivityPlanStructure = structuredClone(structure.data);
  for (const control of parsed.data.controls) {
    for (const target of control.targets) {
      const issue = applyTarget(
        editable,
        target,
        control,
        requiredControlValue(values, control.key),
        false,
      );
      if (issue) return { status: "unavailable", reason: "invalid_adaptation", issues: [issue] };
    }
  }
  const resolved = activityPlanStructureSchema.safeParse(editable);
  if (!resolved.success)
    return {
      status: "unavailable",
      reason: "invalid_resolved_structure",
      issues: resolved.error.issues.map((issue) => issue.message),
    };
  const isDefault = parsed.data.controls.every(
    (control) => values[control.key] === control.range.default,
  );
  return {
    status: "resolved",
    mode: isDefault ? "default" : "adjusted",
    structure: resolved.data,
    adaptation_values: values,
  };
}
