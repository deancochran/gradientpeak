import { GLOBAL_DEFAULTS } from "../calculations/defaults";
import type { RecordingServiceActivityPlan } from "../schemas";

export interface PlanValidationMetrics {
  ftp?: number;
  thresholdHr?: number;
  weightKg?: number;
}

export interface MissingMetric {
  name: string;
  description: string;
  settingPath: string;
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
  const structure = plan.structure as {
    intervals?: Array<{
      steps?: Array<{
        targets?: Array<{ type?: string }>;
      }>;
    }>;
  };

  if (!structure?.intervals) {
    return { isValid: true, missingMetrics: [], warnings: [] };
  }

  const allTargetTypes = new Set<string>();

  for (const interval of structure.intervals) {
    for (const step of interval.steps || []) {
      for (const target of step.targets || []) {
        if (typeof target.type === "string") {
          allTargetTypes.add(target.type);
        }
      }
    }
  }

  const warnings: string[] = [];

  if (allTargetTypes.has("%FTP") && !metrics?.ftp) {
    warnings.push(
      `Using default FTP (${GLOBAL_DEFAULTS.ftp}W). Set your FTP in Settings for more accurate training.`,
    );
  }

  if (allTargetTypes.has("%ThresholdHR") && !metrics?.thresholdHr) {
    warnings.push(
      `Using default Threshold HR (${GLOBAL_DEFAULTS.thresholdHr} bpm). Set yours in Settings for more accurate training.`,
    );
  }

  if ((allTargetTypes.has("%FTP") || allTargetTypes.has("watts")) && !metrics?.ftp) {
    const fallbackWarning = "Consider setting your FTP for more accurate power-based training.";
    if (!warnings.includes(fallbackWarning)) {
      warnings.push(fallbackWarning);
    }
  }

  return {
    isValid: true,
    missingMetrics: [],
    warnings,
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
      `This workout requires the following metrics to be set:\n\n${metricsList}\n\n` +
      "You can continue without these, but automatic trainer control and accurate target display will not be available.",
    actions: [
      { action: "navigate:settings", label: "Go to Settings" },
      { action: "continue", label: "Continue Anyway" },
      { action: "cancel", label: "Cancel" },
    ],
  };
}
