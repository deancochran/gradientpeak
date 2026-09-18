import type {
  ActivityPlanAdaptation,
  ActivityPlanStructure,
  ActivityPlanTrainingIntent,
} from "../activity-plan";
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
  structure: ActivityPlanStructure;
  adaptation?: ActivityPlanAdaptation | null;
  training_intent?: ActivityPlanTrainingIntent;
}

/** Reads the sole root activity_category from a validated canonical ActivityPlan structure. */
export function deriveSystemActivityTemplateActivityCategory(
  structure: ActivityPlanStructure,
): CanonicalActivityCategory {
  return structure.activity_category;
}
