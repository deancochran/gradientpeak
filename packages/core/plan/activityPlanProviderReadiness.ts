import {
  type ActivityPlanStructure,
  type ActivityPlanTarget,
  type CompiledActivityPlanOccurrence,
  compileActivityPlan,
} from "../activity-plan";
import {
  type ExecutableIntegrationProviderId,
  getProviderCapabilityDefinition,
  getProviderPlannedActivityCapability,
  providerHasCapability,
} from "../integrations/provider-capabilities";
import {
  type ActivityTargetCategory,
  isTargetTypePermittedForActivity,
} from "../schemas/activity_target_capabilities";

export type ActivityPlanProvider = "native" | ExecutableIntegrationProviderId;

export type ActivityPlanTargetAnchors = {
  ftpWatts?: number | null;
  maxHeartRateBpm?: number | null;
  thresholdHeartRateBpm?: number | null;
};

export type ProviderProjectionDisposition = "compatible" | "degraded" | "unsupported";
export type ProviderProjectionSemantic =
  | "provider"
  | "occurrence_role"
  | "activity_category"
  | "duration"
  | "target";

export type ProviderProjectionFinding = {
  disposition: ProviderProjectionDisposition;
  message: string;
  path: (string | number)[];
  reasonCode: string;
  semantic: ProviderProjectionSemantic;
  targetProjection?: "retained" | "dropped";
  targetType?: ActivityPlanTarget["type"];
};

export type ActivityPlanProviderProjection = {
  disposition: ProviderProjectionDisposition;
  findings: ProviderProjectionFinding[];
  provider: ActivityPlanProvider;
};

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasTargetAnchor(
  targetType: ActivityPlanTarget["type"],
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

function getMissingAnchorMessage(targetType: ActivityPlanTarget["type"]): string {
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

function occurrencePath(occurrence: CompiledActivityPlanOccurrence): (string | number)[] {
  return ["structure", "segments", occurrence.segmentIndex];
}

function stepPath(occurrence: CompiledActivityPlanOccurrence): (string | number)[] {
  return [
    ...occurrencePath(occurrence),
    "intervals",
    occurrence.intervalIndex ?? 0,
    "steps",
    occurrence.stepIndex ?? 0,
  ];
}

function dispositionFor(
  findings: readonly ProviderProjectionFinding[],
): ProviderProjectionDisposition {
  if (findings.some((finding) => finding.disposition === "unsupported")) return "unsupported";
  if (findings.some((finding) => finding.disposition === "degraded")) return "degraded";
  return "compatible";
}

/** Selects a conservative composer target without inventing a relative metric anchor. */
export function getActivityPlanDefaultTarget(input: {
  activityCategory: ActivityTargetCategory;
  anchors?: ActivityPlanTargetAnchors;
}): ActivityPlanTarget {
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

/** One deterministic target-selection policy shared by readiness and provider conversion. */
export function selectActivityPlanProviderTarget(input: {
  activityCategory: ActivityTargetCategory;
  provider: ActivityPlanProvider;
  targets: readonly ActivityPlanTarget[];
}): { index: number; target: ActivityPlanTarget } | null {
  if (input.targets.length === 0) return null;
  if (input.provider !== "wahoo") {
    const target = input.targets[0];
    return target ? { index: 0, target } : null;
  }
  const precedence: readonly ActivityPlanTarget["type"][] =
    input.activityCategory === "run"
      ? ["speed", "bpm", "%ThresholdHR", "%MaxHR", "cadence", "RPE", "%FTP", "watts"]
      : input.activityCategory === "bike"
        ? ["%FTP", "watts", "cadence", "%ThresholdHR", "bpm", "%MaxHR", "RPE", "speed"]
        : input.targets.map((target) => target.type);
  const selected = input.targets
    .map((target, index) => ({ index, target }))
    .sort(
      (left, right) => precedence.indexOf(left.target.type) - precedence.indexOf(right.target.type),
    )[0];
  return selected ?? null;
}

/**
 * Inventories every compiled occurrence semantic once. Findings include successful
 * classifications so compatible, degraded, and unsupported projections are exhaustive.
 */
export function getActivityPlanProviderProjection(input: {
  anchors?: ActivityPlanTargetAnchors;
  nativeDefaultsAvailable?: boolean;
  provider: ActivityPlanProvider;
  structure: ActivityPlanStructure;
}): ActivityPlanProviderProjection {
  const findings: ProviderProjectionFinding[] = [];
  const anchors = input.anchors ?? {};
  const providerLabel =
    input.provider === "native"
      ? "GradientPeak"
      : getProviderCapabilityDefinition(input.provider).label;

  if (input.provider !== "native") {
    const definition = getProviderCapabilityDefinition(input.provider);
    const capability = getProviderPlannedActivityCapability(input.provider);
    if (
      !providerHasCapability(input.provider, "planned_activity_push") ||
      capability.maturity !== "available"
    ) {
      findings.push({
        disposition: "unsupported",
        message: `${definition.label} planned-activity delivery is not available in the current integration.`,
        path: ["provider"],
        reasonCode: "provider_delivery_evidence_missing",
        semantic: "provider",
      });
    }
  }

  const compiled = compileActivityPlan(input.structure);
  const capability =
    input.provider === "native" ? null : getProviderPlannedActivityCapability(input.provider);

  for (const occurrence of compiled.occurrences) {
    const basePath = occurrencePath(occurrence);
    if (occurrence.role !== "activity") {
      const supported = input.provider === "native" || capability?.supportsBoundaries === true;
      findings.push({
        disposition: supported ? "compatible" : "unsupported",
        message: supported
          ? `${occurrence.role} occurrence is preserved.`
          : `${providerLabel} cannot preserve ${occurrence.role} boundaries.`,
        path: [...basePath, "role"],
        reasonCode: supported ? "boundary_preserved" : "unsupported_boundary",
        semantic: "occurrence_role",
      });
      findings.push({
        disposition: "compatible",
        message: "Timed boundary duration is explicit.",
        path: [...basePath, "duration"],
        reasonCode: "duration_preserved",
        semantic: "duration",
      });
      continue;
    }

    findings.push({
      disposition: "compatible",
      message: "Activity occurrence role is preserved.",
      path: [...basePath, "role"],
      reasonCode: "activity_occurrence_preserved",
      semantic: "occurrence_role",
    });

    const activityCategorySupported =
      input.provider === "native" ||
      capability?.supportedActivityCategories.includes(occurrence.activity_category);
    findings.push({
      disposition: activityCategorySupported ? "compatible" : "unsupported",
      message: activityCategorySupported
        ? `${occurrence.activity_category} is supported.`
        : `${occurrence.activity_category} planned activities are not supported by ${input.provider}.`,
      path: [...basePath, "activity_category"],
      reasonCode: activityCategorySupported
        ? "activity_category_supported"
        : "unsupported_activity_category",
      semantic: "activity_category",
    });

    const durationSupported =
      input.provider === "native" ||
      capability?.supportedDurations.includes(occurrence.duration.type);
    findings.push({
      disposition: durationSupported ? "compatible" : "unsupported",
      message: durationSupported
        ? `${occurrence.duration.type} completion is preserved.`
        : `${occurrence.duration.type} completion cannot be converted without changing activity semantics.`,
      path: [...stepPath(occurrence), "duration"],
      reasonCode: durationSupported ? "duration_preserved" : "unsupported_duration",
      semantic: "duration",
    });

    const selectedTargetIndex = selectActivityPlanProviderTarget({
      activityCategory: occurrence.activity_category,
      provider: input.provider,
      targets: occurrence.targets,
    })?.index;
    occurrence.targets.forEach((target, targetIndex) => {
      const targetSupported =
        isTargetTypePermittedForActivity({
          activityCategory: occurrence.activity_category,
          targetType: target.type,
        }) &&
        (input.provider === "native" || capability?.supportedTargets.includes(target.type));
      const anchorAvailable = hasTargetAnchor(target.type, anchors) !== false;
      const usesNativeDefault =
        input.provider === "native" && !anchorAvailable && input.nativeDefaultsAvailable !== false;
      const isDroppedTarget =
        capability?.supportsMultipleTargets === false && targetIndex !== selectedTargetIndex;
      const missingRequiredAnchor = !isDroppedTarget && !anchorAvailable && !usesNativeDefault;
      const disposition: ProviderProjectionDisposition =
        !targetSupported || missingRequiredAnchor
          ? "unsupported"
          : isDroppedTarget || usesNativeDefault
            ? "degraded"
            : "compatible";
      findings.push({
        disposition,
        message: !targetSupported
          ? `${target.type} targets are not supported for ${occurrence.activity_category} on ${input.provider}.`
          : isDroppedTarget
            ? `${target.type} remains in GradientPeak but ${providerLabel} displays only the selected preferred target.`
            : missingRequiredAnchor
              ? getMissingAnchorMessage(target.type)
              : usesNativeDefault
                ? `${target.type} uses the native recorder default because its profile anchor is unavailable.`
                : `${target.type} is the selected target retained by ${input.provider}.`,
        path: [...stepPath(occurrence), "targets", targetIndex],
        reasonCode: !targetSupported
          ? "unsupported_target"
          : isDroppedTarget
            ? "secondary_target_not_displayed"
            : missingRequiredAnchor
              ? "missing_target_anchor"
              : usesNativeDefault
                ? "native_target_default_used"
                : "selected_target_retained",
        semantic: "target",
        ...(!targetSupported || missingRequiredAnchor
          ? {}
          : { targetProjection: isDroppedTarget ? ("dropped" as const) : ("retained" as const) }),
        targetType: target.type,
      });
    });
  }

  return { disposition: dispositionFor(findings), findings, provider: input.provider };
}
