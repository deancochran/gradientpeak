import type { ActivityPlanStructure } from "@repo/core/activity-plan";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import { prescriptionResolutionManifestSchema, type SessionDemand } from "@repo/core/plan";
import { sha256Hex } from "@repo/core/utils";

export function createResolutionManifestFixture(input: {
  activityPlanId: string;
  structure: ActivityPlanStructure;
  demand: SessionDemand;
  activityPlanRevision?: number;
}) {
  return prescriptionResolutionManifestSchema.parse({
    resolver_version: "prescription-resolver-v1",
    policy_version: "training-plan-policy-v1",
    training_plan_id: null,
    training_plan_revision: null,
    training_plan_hash: null,
    athlete_context_revision: null,
    activity_plan_id: input.activityPlanId,
    activity_plan_revision: input.activityPlanRevision ?? 1,
    activity_plan_semantic_hash: `v1:sha256:${"a".repeat(64)}`,
    effective_target_duration_minutes: null,
    effective_target_common_load: null,
    evidence_facts: [],
    session_demand: input.demand,
    adaptation_values: {},
    fallback_level: "system_default_no_context",
    reason_codes: [],
    resolved_structure: input.structure,
    resolved_structure_hash: `v1:sha256:${sha256Hex(stringifyCanonicalJson(input.structure))}`,
    prescription_estimate: {
      duration: { status: "exact", value_seconds: 1_800 },
      common_load: { status: "unavailable", value: null },
      rest_seconds: 0,
      has_open_completion: false,
      warnings: [],
      factors: ["canonical prescription fixture"],
    },
    fingerprint: `v1:sha256:${"b".repeat(64)}`,
  });
}
