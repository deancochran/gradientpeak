import { activityPlanStructureSchemaV3, type CanonicalActivityCategory } from "@repo/core";
import type { RecordingActivityPlanV3Input } from "./plan";

export type MobileRecordingPlanSupport =
  | {
      supported: true;
      activity_category: CanonicalActivityCategory;
    }
  | {
      supported: false;
      reason: "invalid_structure";
      message: string;
    };

const INVALID_PLAN_MESSAGE = "This plan can't be recorded on mobile. Check the plan and try again.";

/** Checks whether a canonical V3 plan can be executed by the native recorder. */
export function getMobileRecordingPlanSupport(
  plan: Pick<RecordingActivityPlanV3Input, "name" | "structure"> | null | undefined,
): MobileRecordingPlanSupport {
  if (!plan) {
    return { supported: false, reason: "invalid_structure", message: INVALID_PLAN_MESSAGE };
  }

  try {
    const parsed = activityPlanStructureSchemaV3.safeParse(plan.structure);
    if (!parsed.success) {
      return { supported: false, reason: "invalid_structure", message: INVALID_PLAN_MESSAGE };
    }
    const activity = parsed.data.segments.find((segment) => segment.role === "activity");
    if (!activity)
      return { supported: false, reason: "invalid_structure", message: INVALID_PLAN_MESSAGE };
    return {
      supported: true,
      activity_category: activity.activity_category,
    };
  } catch {
    return { supported: false, reason: "invalid_structure", message: INVALID_PLAN_MESSAGE };
  }
}
