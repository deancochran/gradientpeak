/**
 * Plan Validation Utilities
 *
 * Validates that user profile has required metrics for plan execution
 */

import { GLOBAL_DEFAULTS, type RecordingServiceActivityPlan } from "@repo/core";
import type { PublicProfilesRow } from "@repo/supabase";

export interface PlanValidationResult {
  isValid: boolean;
  missingMetrics: MissingMetric[];
  warnings: string[];
}

export interface MissingMetric {
  name: string;
  description: string;
  settingPath: string; // Where to set it in the app
}

/**
 * Validate that user profile has all required metrics for plan execution
 * Checks all steps in the plan for their target requirements
 */
export function validatePlanRequirements(
  plan: RecordingServiceActivityPlan,
  profile: PublicProfilesRow,
  metrics?: { ftp?: number; thresholdHr?: number; weightKg?: number },
): PlanValidationResult {
  const missingMetrics: MissingMetric[] = [];
  const warnings: string[] = [];

  // Extract all targets from all intervals and steps
  const structure = plan.structure as any;
  if (!structure?.intervals) {
    return { isValid: true, missingMetrics: [], warnings: [] };
  }

  const allTargetTypes = new Set<string>();

  // Collect all unique target types used in the plan
  for (const interval of structure.intervals) {
    for (const step of interval.steps) {
      if (step.targets) {
        for (const target of step.targets) {
          allTargetTypes.add(target.type);
        }
      }
    }
  }

  // Check if FTP is required but missing
  if (allTargetTypes.has("%FTP") && !metrics?.ftp) {
    warnings.push(
      `Using default FTP (${GLOBAL_DEFAULTS.ftp}W). Set your FTP in Settings for more accurate training.`,
    );
  }

  // Check if threshold HR is required but missing
  if (allTargetTypes.has("%ThresholdHR") && !metrics?.thresholdHr) {
    warnings.push(
      `Using default Threshold HR (${GLOBAL_DEFAULTS.thresholdHr} bpm). Set yours in Settings for more accurate training.`,
    );
  }

  // // Check if max HR is required but missing (less critical)
  // if (allTargetTypes.has("%MaxHR") && !profile.max_hr) {
  //   warnings.push(
  //     "This workout references Max HR which is not set. You'll see percentage values instead of absolute BPM.",
  //   );
  // }

  // Generate additional warnings based on activity type and targets
  if (allTargetTypes.has("%FTP") || allTargetTypes.has("watts")) {
    if (!metrics?.ftp && !warnings.length) {
      warnings.push(
        "Consider setting your FTP for more accurate power-based training.",
      );
    }
  }

  return {
    isValid: missingMetrics.length === 0,
    missingMetrics,
    warnings,
  };
}

/**
 * Format validation result as user-friendly message
 */
export function formatValidationMessage(result: PlanValidationResult): {
  title: string;
  message: string;
  actions: Array<{ label: string; action: string }>;
} {
  if (result.isValid) {
    return {
      title: "Ready to Start",
      message: "All required metrics are configured.",
      actions: [],
    };
  }

  const metricsList = result.missingMetrics
    .map((m) => `• ${m.name}: ${m.description}`)
    .join("\n\n");

  return {
    title: "Profile Setup Required",
    message: `This workout requires the following metrics to be set:\n\n${metricsList}\n\nYou can continue without these, but automatic trainer control and accurate target display will not be available.`,
    actions: [
      { label: "Go to Settings", action: "navigate:settings" },
      { label: "Continue Anyway", action: "continue" },
      { label: "Cancel", action: "cancel" },
    ],
  };
}
