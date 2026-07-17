import type { ActivityPlanStructureV3 } from "../activity-plan";
import type { IntegrationProviderId } from "../integrations/provider-capabilities";
import {
  getActivityPlanProviderProjection,
  type ProviderProjectionFinding,
} from "./activityPlanProviderReadiness";

export type PlannedWorkoutExportCompatibility = {
  compatible: boolean;
  disposition: "compatible" | "degraded" | "unsupported";
  findings: ProviderProjectionFinding[];
  issues: ProviderProjectionFinding[];
};

/** Uses the provider registry and compiled occurrence inventory for one projection decision. */
export function getPlannedWorkoutExportCompatibility(input: {
  provider?: IntegrationProviderId;
  structure: ActivityPlanStructureV3;
}): PlannedWorkoutExportCompatibility {
  const projection = getActivityPlanProviderProjection({
    provider: input.provider ?? "wahoo",
    structure: input.structure,
  });
  const issues = projection.findings.filter((finding) => finding.disposition === "unsupported");
  return {
    compatible: issues.length === 0,
    disposition: projection.disposition,
    findings: projection.findings,
    issues,
  };
}
