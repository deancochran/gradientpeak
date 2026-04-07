import type { ActivityDerivedMetrics, ActivityListDerivedSummary } from "@repo/core";
import type { ActivityPlanRow, ActivityRow } from "@repo/db";

type ActivityPlanReference = Omit<ActivityPlanRow, "created_at" | "updated_at"> & {
  created_at: string | Date;
  updated_at: string | Date;
};

export function mapActivityToDerivedResponse(input: {
  activity: ActivityRow & {
    activity_plans?: ActivityPlanReference | null;
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
