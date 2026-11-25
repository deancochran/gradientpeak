import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { ActivityTarget } from "../targets/schema";
import type { ActivityPlanStep } from "./structure-schema";
import { orderActivityPlanTargetsForPresentation } from "./target-presentation";

export type ActivityPlanNamingStep = Pick<ActivityPlanStep, "name" | "targets">;

export const ACTIVITY_PLAN_INTERVAL_LABEL_MAX_COMPOSED_STEPS = 3;
export const ACTIVITY_PLAN_INTERVAL_LABEL_MAX_CODE_POINTS = 48;

type AutomaticStepLabel = { family: string; label: string };

function automaticStepLabel(
  activityCategory: CanonicalActivityCategory,
  targets: readonly ActivityTarget[],
): AutomaticStepLabel {
  const target = orderActivityPlanTargetsForPresentation(targets)[0];
  if (!target) return { family: "Untargeted", label: "Untargeted" };

  switch (target.type) {
    case "rest":
      return { family: "Rest", label: "Rest" };
    case "RPE":
      if (target.intensity <= 3) return { family: "Easy", label: "Easy effort" };
      if (target.intensity <= 6) return { family: "Moderate", label: "Moderate effort" };
      if (target.intensity <= 8) return { family: "Hard", label: "Hard effort" };
      return { family: "Very hard", label: "Very hard effort" };
    case "speed":
      return {
        family: activityCategory === "run" ? "Pace" : "Speed",
        label: activityCategory === "run" ? "Pace effort" : "Speed effort",
      };
    case "watts":
    case "%FTP":
      return { family: "Power", label: "Power effort" };
    case "bpm":
    case "%MaxHR":
    case "%ThresholdHR":
      return { family: "Heart-rate", label: "Heart-rate effort" };
    case "cadence":
      return { family: "Cadence", label: "Cadence effort" };
  }
}

/**
 * Derives a viewer-independent step label from authored targets only.
 *
 * RPE bands are inclusive: 1–3 Easy, >3–6 Moderate, >6–8 Hard, and >8–10
 * Very hard. The input target schema admits RPE from 1 through 10, including
 * fractional values. Multiple targets use the stable presentation precedence:
 * RPE, %FTP, %ThresholdHR, %MaxHR, watts, bpm, speed, cadence.
 */
export function deriveAutomaticActivityPlanStepLabel(input: {
  activityCategory: CanonicalActivityCategory;
  targets: readonly ActivityTarget[];
}): string {
  return automaticStepLabel(input.activityCategory, input.targets).label;
}

/** Returns an explicit, already-validated step name verbatim, or its automatic label. */
export function deriveEffectiveActivityPlanStepLabel(input: {
  activityCategory: CanonicalActivityCategory;
  step: ActivityPlanNamingStep;
}): string {
  return (
    input.step.name ??
    deriveAutomaticActivityPlanStepLabel({
      activityCategory: input.activityCategory,
      targets: input.step.targets,
    })
  );
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function compactAutomaticStepLabel(label: AutomaticStepLabel): string {
  return label.family;
}

function prefixedRepeatLabel(repetitions: number, label: string): string {
  return repetitions > 1 ? `${repetitions} × ${label}` : label;
}

/**
 * Derives a compact interval label without persisting or altering any authored
 * step data. A sequence may compose at most three labels and 48 Unicode code
 * points; longer or more varied content falls back to "Mixed sequence".
 */
export function deriveAutomaticActivityPlanIntervalLabel(input: {
  activityCategory: CanonicalActivityCategory;
  repetitions: number;
  steps: readonly ActivityPlanNamingStep[];
}): string {
  const [onlyStep] = input.steps;
  if (input.steps.length === 1 && onlyStep) {
    const automatic = automaticStepLabel(input.activityCategory, onlyStep.targets);
    const label =
      input.repetitions === 1
        ? deriveEffectiveActivityPlanStepLabel({
            activityCategory: input.activityCategory,
            step: onlyStep,
          })
        : (onlyStep.name ?? compactAutomaticStepLabel(automatic));
    return prefixedRepeatLabel(input.repetitions, label);
  }

  const entries = input.steps.map((step) => ({
    automatic: automaticStepLabel(input.activityCategory, step.targets),
    effective: deriveEffectiveActivityPlanStepLabel({
      activityCategory: input.activityCategory,
      step,
    }),
    isCustom: step.name !== undefined,
  }));
  const first = entries[0];
  const allSameAutomaticLabel =
    first !== undefined &&
    entries.every((entry) => !entry.isCustom && entry.automatic.label === first.automatic.label);
  if (allSameAutomaticLabel && first) {
    return prefixedRepeatLabel(input.repetitions, `${first.automatic.family} sequence`);
  }

  const composed = entries.map((entry) =>
    entry.isCustom ? entry.effective : entry.automatic.family,
  );
  if (
    composed.length > ACTIVITY_PLAN_INTERVAL_LABEL_MAX_COMPOSED_STEPS ||
    codePointLength(composed.join(" / ")) > ACTIVITY_PLAN_INTERVAL_LABEL_MAX_CODE_POINTS
  ) {
    return prefixedRepeatLabel(input.repetitions, "Mixed sequence");
  }
  return prefixedRepeatLabel(input.repetitions, composed.join(" / ") || "Mixed sequence");
}

/**
 * Accepts an optional interval override for presentation while interval-name
 * persistence remains outside the V4 structure contract.
 */
export function deriveEffectiveActivityPlanIntervalLabel(input: {
  activityCategory: CanonicalActivityCategory;
  customName?: string;
  repetitions: number;
  steps: readonly ActivityPlanNamingStep[];
}): string {
  return input.customName ?? deriveAutomaticActivityPlanIntervalLabel(input);
}
