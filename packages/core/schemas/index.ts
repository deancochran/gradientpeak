import type { PublicActivityPlansInsert } from "@repo/supabase";
import type { ActivityPlanStructure } from "./activity_plan_structure";

export * from "./activity_plan_structure";

export type RecordingServiceActivityPlan = Omit<
  PublicActivityPlansInsert,
  "id" | "idx" | "profile_id" | "created_at"
> & {
  structure: ActivityPlanStructure;
};
