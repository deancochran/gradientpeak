import type { ActivityPlanStructureV3 } from "../activity-plan";
import type { CanonicalSport } from "../schemas/sport";

export interface SystemActivityPlanTemplate {
  activity_category: CanonicalSport;
  description?: string | null;
  gps_recording_enabled?: boolean;
  id?: string;
  import_external_id?: string | null;
  import_provider?: string | null;
  is_system_template?: boolean;
  name: string;
  notes?: string | null;
  structure: ActivityPlanStructureV3;
  version: "3.0";
}
