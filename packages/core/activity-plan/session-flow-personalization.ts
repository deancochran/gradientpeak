import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { ActivityTarget } from "../targets/schema";
import { resolvePerformanceTargetValue } from "../utils/recording-plan-target-resolver";
import type { ActivityPlanStructure } from "./structure-schema";
import { activityPlanStructureSchema } from "./structure-schema";
import {
  type ActivityPlanTargetPresentation,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanTargetPresentation,
} from "./target-presentation";

export type PhysicalActivityPlanTarget = Extract<
  ActivityTarget,
  { type: "watts" | "bpm" | "speed" | "cadence" }
>;

export type ActivityPlanSessionFlowPersonalizationBlocker =
  | "invalid_structure"
  | "abstract_target"
  | "missing_ftp"
  | "missing_heart_rate"
  | "unrepresentable_physical_value";

export type ActivityPlanSessionFlowPersonalizationEligibility =
  | {
      eligible: true;
      blocker: null;
      reason: null;
    }
  | {
      eligible: false;
      blocker: ActivityPlanSessionFlowPersonalizationBlocker;
      reason: string;
    };

export type ActivityPlanSessionFlowTargetResolution = {
  stepId: string;
  targetIndex: number;
  authoredTarget: ActivityTarget;
  physicalTarget: PhysicalActivityPlanTarget | null;
  presentation: ActivityPlanTargetPresentation;
};

export type ActivityPlanSessionFlowResolution = {
  authoredStructure: ActivityPlanStructure | null;
  eligibility: ActivityPlanSessionFlowPersonalizationEligibility;
  mode: "authored" | "personalized";
  structure: ActivityPlanStructure | null;
  targetResolutions: readonly ActivityPlanSessionFlowTargetResolution[];
};

type TargetPhysicalResolution =
  | { physicalTarget: PhysicalActivityPlanTarget }
  | {
      physicalTarget: null;
      blocker: Exclude<ActivityPlanSessionFlowPersonalizationBlocker, "invalid_structure">;
      reason: string;
    };

function withTargetPresentations(input: {
  resolutions: readonly ActivityPlanSessionFlowTargetResolution[];
  activityCategory: ActivityPlanStructure["activity_category"];
  performanceTargets?: AthletePerformanceTargetFacts | null;
  personalized: boolean;
}): ActivityPlanSessionFlowTargetResolution[] {
  return input.resolutions.map((resolution) => ({
    ...resolution,
    presentation: resolveActivityPlanTargetPresentation({
      target: resolution.authoredTarget,
      activityCategory: input.activityCategory,
      ...(input.personalized && input.performanceTargets
        ? { performanceTargets: input.performanceTargets }
        : {}),
      asOf: input.performanceTargets?.asOf ?? "1970-01-01T00:00:00.000Z",
    }),
  }));
}

function resolvePhysicalTarget(input: {
  target: ActivityTarget;
  activityCategory: ActivityPlanStructure["activity_category"];
  performanceTargets?: AthletePerformanceTargetFacts | null;
}): TargetPhysicalResolution {
  switch (input.target.type) {
    case "watts":
    case "bpm":
    case "speed":
    case "cadence":
      return { physicalTarget: input.target };
    case "RPE":
      return {
        physicalTarget: null,
        blocker: "abstract_target",
        reason:
          "Personalization is unavailable because RPE targets cannot be represented as physical values.",
      };
    case "%FTP": {
      const resolved = resolvePerformanceTargetValue({
        target: input.target,
        activityCategory: input.activityCategory,
        ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
      });
      return resolved
        ? { physicalTarget: { type: "watts", intensity: resolved.value } }
        : {
            physicalTarget: null,
            blocker: "missing_ftp",
            reason:
              "Personalization is unavailable until a bike threshold power value is available.",
          };
    }
    case "%ThresholdHR":
    case "%MaxHR": {
      const resolved = resolvePerformanceTargetValue({
        target: input.target,
        activityCategory: input.activityCategory,
        ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
      });
      return resolved
        ? { physicalTarget: { type: "bpm", intensity: resolved.value } }
        : {
            physicalTarget: null,
            blocker: "missing_heart_rate",
            reason:
              "Personalization is unavailable until the matching heart-rate value is available.",
          };
    }
  }
}

/**
 * Resolves the complete session flow as one unit. Personalization is eligible
 * only when every displayed target has a physical representation.
 */
export function resolveActivityPlanSessionFlow(input: {
  structure: unknown;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  personalize: boolean;
}): ActivityPlanSessionFlowResolution {
  const parsed = activityPlanStructureSchema.safeParse(input.structure);
  if (!parsed.success) {
    return {
      authoredStructure: null,
      eligibility: {
        eligible: false,
        blocker: "invalid_structure",
        reason: "Personalization is unavailable because this session flow is not valid.",
      },
      mode: "authored",
      structure: null,
      targetResolutions: [],
    };
  }

  const authoredStructure = parsed.data;
  const physicalTargetsByStep = new Map<string, PhysicalActivityPlanTarget[]>();
  const targetResolutions: ActivityPlanSessionFlowTargetResolution[] = [];
  let firstBlocker: Extract<TargetPhysicalResolution, { physicalTarget: null }> | undefined;

  for (const segment of authoredStructure.segments) {
    if (segment.role !== "activity") continue;
    for (const interval of segment.intervals) {
      for (const step of interval.steps) {
        const physicalTargets: PhysicalActivityPlanTarget[] = [];
        for (const [targetIndex, target] of orderActivityPlanTargetsForPresentation(
          step.targets,
        ).entries()) {
          const resolution = resolvePhysicalTarget({
            target,
            activityCategory: authoredStructure.activity_category,
            ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
          });
          if (resolution.physicalTarget) physicalTargets.push(resolution.physicalTarget);
          else firstBlocker ??= resolution;
          targetResolutions.push({
            stepId: step.id,
            targetIndex,
            authoredTarget: target,
            physicalTarget: resolution.physicalTarget,
            presentation: resolveActivityPlanTargetPresentation({
              target,
              activityCategory: authoredStructure.activity_category,
              asOf: input.performanceTargets?.asOf ?? "1970-01-01T00:00:00.000Z",
            }),
          });
        }
        physicalTargetsByStep.set(step.id, physicalTargets);
      }
    }
  }

  if (firstBlocker) {
    return {
      authoredStructure,
      eligibility: {
        eligible: false,
        blocker: firstBlocker.blocker,
        reason: firstBlocker.reason,
      },
      mode: "authored",
      structure: authoredStructure,
      targetResolutions: withTargetPresentations({
        resolutions: targetResolutions,
        activityCategory: authoredStructure.activity_category,
        ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
        personalized: false,
      }),
    };
  }

  const personalizedCandidate = {
    ...authoredStructure,
    segments: authoredStructure.segments.map((segment) =>
      segment.role === "rest"
        ? segment
        : {
            ...segment,
            intervals: segment.intervals.map((interval) => ({
              ...interval,
              steps: interval.steps.map((step) => ({
                ...step,
                targets: physicalTargetsByStep.get(step.id) ?? [],
              })),
            })),
          },
    ),
  };
  const personalized = activityPlanStructureSchema.safeParse(personalizedCandidate);
  if (!personalized.success) {
    return {
      authoredStructure,
      eligibility: {
        eligible: false,
        blocker: "unrepresentable_physical_value",
        reason:
          "Personalization is unavailable because a resolved physical target is outside the supported range.",
      },
      mode: "authored",
      structure: authoredStructure,
      targetResolutions: withTargetPresentations({
        resolutions: targetResolutions,
        activityCategory: authoredStructure.activity_category,
        ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
        personalized: false,
      }),
    };
  }

  const personalizedEnabled = input.personalize;
  return {
    authoredStructure,
    eligibility: { eligible: true, blocker: null, reason: null },
    mode: personalizedEnabled ? "personalized" : "authored",
    structure: personalizedEnabled ? personalized.data : authoredStructure,
    targetResolutions: withTargetPresentations({
      resolutions: targetResolutions,
      activityCategory: authoredStructure.activity_category,
      ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
      personalized: personalizedEnabled,
    }),
  };
}

export function getActivityPlanSessionFlowTargetPresentations(
  resolution: ActivityPlanSessionFlowResolution,
  stepId: string,
): readonly ActivityPlanTargetPresentation[] {
  return resolution.targetResolutions
    .filter((target) => target.stepId === stepId)
    .sort((left, right) => left.targetIndex - right.targetIndex)
    .map((target) => target.presentation);
}
