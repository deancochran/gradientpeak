import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { ActivityTarget } from "../targets/schema";
import type { ActivityPlanStructure } from "./structure-schema";
import { activityPlanStructureSchema } from "./structure-schema";
import {
  type ActivityPlanTargetPresentation,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanTargetPresentation,
} from "./target-presentation";

export type ActivityPlanSessionFlowPersonalizationEligibility =
  | { eligible: true; blocker: null; reason: null }
  | { eligible: false; blocker: "invalid_structure"; reason: string };
export type ActivityPlanSessionFlowTargetResolution = {
  stepId: string;
  targetIndex: number;
  authoredTarget: ActivityTarget;
  physicalTarget: null;
  presentation: ActivityPlanTargetPresentation;
};
export type ActivityPlanSessionFlowResolution = {
  authoredStructure: ActivityPlanStructure | null;
  eligibility: ActivityPlanSessionFlowPersonalizationEligibility /** Fixed plans are never rewritten for a session. */;
  mode: "authored";
  structure: ActivityPlanStructure | null;
  targetResolutions: readonly ActivityPlanSessionFlowTargetResolution[];
};
/** Resolves display metadata only. Relative targets retain their authored execution semantics. */
export function resolveActivityPlanSessionFlow(input: {
  structure: unknown;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  personalize?: boolean;
}): ActivityPlanSessionFlowResolution {
  const parsed = activityPlanStructureSchema.safeParse(input.structure);
  if (!parsed.success)
    return {
      authoredStructure: null,
      eligibility: {
        eligible: false,
        blocker: "invalid_structure",
        reason: "This session flow is not valid.",
      },
      mode: "authored",
      structure: null,
      targetResolutions: [],
    };
  const targetResolutions: ActivityPlanSessionFlowTargetResolution[] = [];
  for (const item of parsed.data.items)
    for (const step of item.type === "step" ? [item] : item.steps)
      for (const [targetIndex, target] of orderActivityPlanTargetsForPresentation(
        step.targets,
      ).entries())
        targetResolutions.push({
          stepId: step.id,
          targetIndex,
          authoredTarget: target,
          physicalTarget: null,
          presentation: resolveActivityPlanTargetPresentation({
            target,
            activityCategory: parsed.data.activity_category,
            ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
            asOf: input.performanceTargets?.asOf ?? "1970-01-01T00:00:00.000Z",
          }),
        });
  return {
    authoredStructure: parsed.data,
    eligibility: { eligible: true, blocker: null, reason: null },
    mode: "authored",
    structure: parsed.data,
    targetResolutions,
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
