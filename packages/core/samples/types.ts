import type { ActivityPlanStructureV3 } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas/activity-category";

export interface SystemActivityPlanTemplate {
  description?: string | null;
  gps_recording_enabled?: boolean;
  id?: string;
  import_external_id?: string | null;
  import_provider?: string | null;
  is_system_template?: boolean;
  name: string;
  notes?: string | null;
  structure: ActivityPlanStructureV3;
}

/** Derives the sole activity_category from a validated canonical ActivityPlan structure. */
export function deriveSystemActivityTemplateActivityCategory(
  structure: ActivityPlanStructureV3,
): CanonicalActivityCategory {
  const activitySegment = structure.segments.find((segment) => segment.role === "activity");
  if (!activitySegment) {
    throw new Error("System activity template structure must contain an activity segment.");
  }
  return activitySegment.activity_category;
}
