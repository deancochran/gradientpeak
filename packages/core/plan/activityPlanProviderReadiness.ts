import {
  getProviderCapabilityDefinition,
  type IntegrationProviderId,
  isProviderRuntimeEnabled,
  providerHasCapability,
} from "../integrations/provider-capabilities";
import type { ActivityPlanStructureV2, IntensityTargetV2 } from "../schemas/activity_plan_v2";
import {
  type ActivityTargetCategory,
  isTargetTypePermittedForActivity,
} from "../schemas/activity_target_capabilities";

export type ActivityPlanProvider = "native" | IntegrationProviderId;

export type ActivityPlanTargetAnchors = {
  ftpWatts?: number | null;
  maxHeartRateBpm?: number | null;
  thresholdHeartRateBpm?: number | null;
};

export type ActivityPlanProviderReadinessStatus =
  | "ready"
  | "uses_defaults"
  | "missing_anchor"
  | "unsupported_target"
  | "unsupported_sport"
  | "unsupported_provider";

export type ActivityPlanProviderReadinessIssue = {
  blockedBy?: "external";
  code: Exclude<ActivityPlanProviderReadinessStatus, "ready" | "uses_defaults">;
  message: string;
  path?: (string | number)[];
  targetType?: IntensityTargetV2["type"];
};

export type ActivityPlanProviderReadinessResult = {
  issues: ActivityPlanProviderReadinessIssue[];
  provider: ActivityPlanProvider;
  status: ActivityPlanProviderReadinessStatus;
  defaultedTargetTypes: IntensityTargetV2["type"][];
};

const wahooTargetTypes = new Set<IntensityTargetV2["type"]>([
  "%FTP",
  "%MaxHR",
  "%ThresholdHR",
  "watts",
  "bpm",
  "speed",
  "cadence",
]);

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasTargetAnchor(
  targetType: IntensityTargetV2["type"],
  anchors: ActivityPlanTargetAnchors,
): boolean | null {
  switch (targetType) {
    case "%FTP":
      return isPositiveFinite(anchors.ftpWatts);
    case "%MaxHR":
      return isPositiveFinite(anchors.maxHeartRateBpm);
    case "%ThresholdHR":
      return isPositiveFinite(anchors.thresholdHeartRateBpm);
    default:
      return null;
  }
}

function getMissingAnchorMessage(targetType: IntensityTargetV2["type"]): string {
  switch (targetType) {
    case "%FTP":
      return "%FTP targets require an FTP anchor.";
    case "%MaxHR":
      return "%MaxHR targets require a maximum heart-rate anchor.";
    case "%ThresholdHR":
      return "%ThresholdHR targets require a threshold heart-rate anchor.";
    default:
      return `${targetType} does not require a profile anchor.`;
  }
}

/** Selects a conservative composer target without inventing a relative metric anchor. */
export function getActivityPlanDefaultTarget(input: {
  activityCategory: ActivityTargetCategory;
  anchors?: ActivityPlanTargetAnchors;
}): IntensityTargetV2 {
  const anchors = input.anchors ?? {};

  if (input.activityCategory === "bike" && isPositiveFinite(anchors.ftpWatts)) {
    return { type: "%FTP", intensity: 75 };
  }

  if (input.activityCategory === "run") {
    if (isPositiveFinite(anchors.thresholdHeartRateBpm)) {
      return { type: "%ThresholdHR", intensity: 75 };
    }
    if (isPositiveFinite(anchors.maxHeartRateBpm)) {
      return { type: "%MaxHR", intensity: 75 };
    }
  }

  return { type: "RPE", intensity: 5 };
}

/**
 * Pure device-export preflight. Every explicit target is evaluated so an
 * incompatible secondary target cannot be hidden by a supported primary one.
 */
export function getActivityPlanProviderReadiness(input: {
  activityCategory: ActivityTargetCategory;
  anchors?: ActivityPlanTargetAnchors;
  nativeDefaultsAvailable?: boolean;
  provider: ActivityPlanProvider;
  structure: ActivityPlanStructureV2;
}): ActivityPlanProviderReadinessResult {
  const issues: ActivityPlanProviderReadinessIssue[] = [];
  const defaultedTargetTypes = new Set<IntensityTargetV2["type"]>();
  const anchors = input.anchors ?? {};

  if (input.provider !== "native" && !isProviderRuntimeEnabled(input.provider)) {
    const definition = getProviderCapabilityDefinition(input.provider);
    return {
      provider: input.provider,
      status: "unsupported_provider",
      defaultedTargetTypes: [],
      issues: [
        {
          blockedBy: "external",
          code: "unsupported_provider",
          message:
            input.provider === "garmin"
              ? "Garmin planned-workout export is unsupported pending external capability access."
              : `${definition.label} planned-workout export is unsupported because its provider runtime is not enabled.`,
        },
      ],
    };
  }

  if (
    input.provider !== "native" &&
    !providerHasCapability(input.provider, "planned_activity_push")
  ) {
    const definition = getProviderCapabilityDefinition(input.provider);
    return {
      provider: input.provider,
      status: "unsupported_provider",
      defaultedTargetTypes: [],
      issues: [
        {
          code: "unsupported_provider",
          message: `${definition.label} does not support planned-workout export.`,
        },
      ],
    };
  }

  if (
    input.provider === "wahoo" &&
    input.activityCategory !== "run" &&
    input.activityCategory !== "bike"
  ) {
    return {
      provider: input.provider,
      status: "unsupported_sport",
      defaultedTargetTypes: [],
      issues: [
        {
          code: "unsupported_sport",
          message: `Wahoo planned workouts do not support ${input.activityCategory}.`,
        },
      ],
    };
  }

  input.structure.intervals.forEach((interval, intervalIndex) => {
    interval.steps.forEach((step, stepIndex) => {
      const targets = step.targets ?? [];
      if (targets.length === 0) {
        issues.push({
          code: "unsupported_target",
          message: `Step "${step.name}" needs an intensity target.`,
          path: ["intervals", intervalIndex, "steps", stepIndex, "targets"],
        });
      }

      targets.forEach((target, targetIndex) => {
        const path = ["intervals", intervalIndex, "steps", stepIndex, "targets", targetIndex];
        const categoryPermitsTarget = isTargetTypePermittedForActivity({
          activityCategory: input.activityCategory,
          targetType: target.type,
        });
        const providerPermitsTarget =
          input.provider === "native" || wahooTargetTypes.has(target.type);

        if (!categoryPermitsTarget || !providerPermitsTarget) {
          issues.push({
            code: "unsupported_target",
            message: `${target.type} targets are not supported for ${input.activityCategory} on ${input.provider}.`,
            path: [...path, "type"],
            targetType: target.type,
          });
          return;
        }

        if (hasTargetAnchor(target.type, anchors) === false) {
          if (input.provider === "native" && input.nativeDefaultsAvailable !== false) {
            defaultedTargetTypes.add(target.type);
            return;
          }

          issues.push({
            code: "missing_anchor",
            message: getMissingAnchorMessage(target.type),
            path: [...path, "intensity"],
            targetType: target.type,
          });
        }
      });
    });
  });

  const status = issues.some((issue) => issue.code === "unsupported_target")
    ? "unsupported_target"
    : issues.some((issue) => issue.code === "missing_anchor")
      ? "missing_anchor"
      : defaultedTargetTypes.size > 0
        ? "uses_defaults"
        : "ready";

  return {
    provider: input.provider,
    status,
    issues,
    defaultedTargetTypes: [...defaultedTargetTypes],
  };
}
