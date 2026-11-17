import { type CompiledActivityPlan, compileActivityPlan } from "../activity-plan";
import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { RecordingServiceActivityPlan } from "../schemas";
import { resolvePerformanceTargetValue } from "../utils/recording-plan-target-resolver";

export interface PlanValidationMetrics {
  performanceTargets?: AthletePerformanceTargetFacts;
}

export interface MissingMetric {
  name: string;
  description: string;
}

export interface PlanValidationResult {
  isValid: boolean;
  missingMetrics: MissingMetric[];
  warnings: string[];
}

export interface PlanValidationMessageAction {
  action: string;
  label: string;
}

export interface PlanValidationMessage {
  title: string;
  message: string;
  actions: PlanValidationMessageAction[];
}

export function validatePlanRequirements(
  plan: RecordingServiceActivityPlan,
  metrics?: PlanValidationMetrics,
): PlanValidationResult {
  let compiled: CompiledActivityPlan;
  try {
    compiled = compileActivityPlan(plan.structure);
  } catch {
    return {
      isValid: false,
      missingMetrics: [],
      warnings: ["Recording requires a valid activity-plan structure."],
    };
  }

  const missingMetrics = new Map<string, MissingMetric>();
  for (const occurrence of compiled.occurrences) {
    for (const target of occurrence.targets) {
      if (
        (target.type === "%FTP" || target.type === "%ThresholdHR" || target.type === "%MaxHR") &&
        !resolvePerformanceTargetValue({
          target,
          activityCategory: occurrence.activity_category,
          ...(metrics?.performanceTargets !== undefined
            ? { performanceTargets: metrics.performanceTargets }
            : {}),
        })
      ) {
        const activityCategoryLabel =
          occurrence.activity_category.charAt(0).toUpperCase() +
          occurrence.activity_category.slice(1);
        const name =
          target.type === "%FTP"
            ? "planning threshold power"
            : target.type === "%ThresholdHR"
              ? `${activityCategoryLabel} LTHR`
              : `${activityCategoryLabel} max HR`;
        missingMetrics.set(`${occurrence.activity_category}:${target.type}`, {
          name,
          description: `A current ${name} performance-model fact is required for ${target.type} targets.`,
        });
      }
    }
  }

  const missing = [...missingMetrics.values()];

  return {
    isValid: missing.length === 0,
    missingMetrics: missing,
    warnings: [],
  };
}

export function formatValidationMessage(result: PlanValidationResult): PlanValidationMessage {
  if (result.isValid) {
    return {
      title: "Ready to Start",
      message: "All required metrics are configured.",
      actions: [],
    };
  }

  const metricsList = result.missingMetrics
    .map((metric) => `- ${metric.name}: ${metric.description}`)
    .join("\n\n");

  return {
    title: "Profile Setup Required",
    message:
      `This activity requires the following metrics to be set:\n\n${metricsList}\n\n` +
      "You can continue without these, but automatic trainer control and accurate target display will not be available.",
    actions: [
      { action: "navigate:settings", label: "Go to Settings" },
      { action: "continue", label: "Continue Anyway" },
      { action: "cancel", label: "Cancel" },
    ],
  };
}
