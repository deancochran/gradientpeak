import type { ActivityDerivedMetrics, ActivityListDerivedSummary } from "@repo/core";
import type { ActivityRow, PublicActivityPlansRow } from "@repo/db";

type ActivityPlanRow = PublicActivityPlansRow;

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
