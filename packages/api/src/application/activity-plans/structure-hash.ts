import { createHash } from "node:crypto";
import { getCanonicalActivityPlanStructureHashInput } from "@repo/core/activity-plan";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";

export function activityPlanStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(stringifyCanonicalJson(structure)).digest("hex")}`;
}

/** Strict executable V5 hash used at prescription trust boundaries. */
export function activityPlanCanonicalStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256")
    .update(getCanonicalActivityPlanStructureHashInput(structure))
    .digest("hex")}`;
}
