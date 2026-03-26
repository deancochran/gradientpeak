import type { ActivityDerivedMetrics, ActivityListDerivedSummary } from "@repo/core";
import type { Database } from "@repo/supabase";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type ActivityPlanRow = Database["public"]["Tables"]["activity_plans"]["Row"];

export function mapActivityToDerivedResponse(input: {
  activity: ActivityRow & {
    activity_plans?: ActivityPlanRow | null;
  };
  has_liked: boolean;
  derived: ActivityDerivedMetrics;
}) {
  return {
    activity: input.activity,
    has_liked: input.has_liked,
    derived: input.derived,
  };
}

export function mapActivityToListDerivedResponse(input: {
  activity: ActivityRow;
  has_liked: boolean;
  derived: ActivityListDerivedSummary | null;
}) {
  return {
    ...input.activity,
    has_liked: input.has_liked,
    derived: input.derived,
  };
}
