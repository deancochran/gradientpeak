import type { ActivityDerivedMetrics, ActivityListDerivedSummary } from "@repo/core";
import type { ActivityPlanRow, ActivityRow } from "@repo/db";
import type { SegmentDerivedSummary } from "./derived";

function toPublicSegmentLoad(summary: SegmentDerivedSummary) {
  return {
    segment_id: summary.segment_id,
    category: summary.category,
    tss: summary.tss,
    tss_identity: summary.tss_identity,
    intensity_factor: summary.intensity_factor,
    method: summary.method,
    unavailable_reason: summary.unavailable_reason,
    calibration_quality: summary.calibration_quality,
    computed_as_of: summary.computed_as_of,
  };
}

type ActivityPlanReference = Omit<ActivityPlanRow, "created_at" | "updated_at"> & {
  created_at: string | Date;
  updated_at: string | Date;
};

export function mapActivityToDerivedResponse(input: {
  activity: ActivityRow & { likes_count: number } & {
    activity_plans?: ActivityPlanReference | null;
  };
  has_liked: boolean;
  derived: ActivityDerivedMetrics;
  segment_loads: SegmentDerivedSummary[];
}) {
  return {
    activity: input.activity,
    has_liked: input.has_liked,
    derived: input.derived,
    segment_loads: input.segment_loads.map(toPublicSegmentLoad),
  };
}

export function mapActivityToListDerivedResponse(input: {
  activity: ActivityRow & { likes_count: number };
  has_liked: boolean;
  derived: ActivityListDerivedSummary | null;
  segment_loads: SegmentDerivedSummary[];
}) {
  return {
    ...input.activity,
    has_liked: input.has_liked,
    derived: input.derived,
    segment_loads: input.segment_loads.map(toPublicSegmentLoad),
  };
}
