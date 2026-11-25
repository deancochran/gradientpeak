import type { ActivityDerivedMetrics, ActivityObservationQuantificationBundle } from "@repo/core";
import type { ActivityPlanRow, ActivityRow } from "@repo/db";
import type { ActivityQuantifiedDerivedSummary, SegmentDerivedSummary } from "./derived";

function toPublicSegmentLoad(summary: SegmentDerivedSummary) {
  return {
    segment_id: summary.segment_id,
    activity_category: summary.activity_category,
    common_load: summary.common_load,
    observationQuantification: summary.observationQuantification,
    computed_as_of: summary.computed_as_of,
  };
}

function toPublicDerivedSummary(summary: ActivityQuantifiedDerivedSummary | null) {
  return summary;
}

type ActivityPlanReference = Omit<ActivityPlanRow, "created_at" | "updated_at"> & {
  created_at: string | Date;
  updated_at: string | Date;
};

type InternalAthleteStateFields =
  | "performance_target_snapshot"
  | "athlete_state_common_load"
  | "athlete_state_activity_category"
  | "athlete_state_evidence_confidence"
  | "athlete_state_capability_distance_meters"
  | "athlete_state_capability_duration_minutes"
  | "athlete_state_input_version"
  | "athlete_state_computed_at"
  | "canonical_evidence_tier";

type PublicActivityRow = Omit<ActivityRow, InternalAthleteStateFields>;

export function mapActivityToDerivedResponse(input: {
  activity: PublicActivityRow & { likes_count: number } & {
    activity_plans?: ActivityPlanReference | null;
  };
  has_liked: boolean;
  derived: ActivityDerivedMetrics & {
    observationQuantification: ActivityObservationQuantificationBundle;
  };
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
  activity: PublicActivityRow & { likes_count: number };
  has_liked: boolean;
  derived: ActivityQuantifiedDerivedSummary | null;
  segment_loads: SegmentDerivedSummary[];
}) {
  return {
    ...input.activity,
    has_liked: input.has_liked,
    derived: toPublicDerivedSummary(input.derived),
    segment_loads: input.segment_loads.map(toPublicSegmentLoad),
  };
}
