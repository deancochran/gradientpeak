import {
  type ActivityObservationQuantificationBundle,
  createObservationQuantificationBundle,
} from "@repo/core";
import { activitySegments } from "@repo/db";
import { and, eq, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { z } from "zod";
import type { ActivitySegmentReadRow, SegmentDerivedSummary } from "../../lib/activity-analysis";

export const activityCompositionModeSchema = z.enum([
  "single_only",
  "include_multisport",
  "multisport_only",
]);

export type ActivityCompositionMode = z.infer<typeof activityCompositionModeSchema>;
type ActivityCategory = NonNullable<ActivitySegmentReadRow["activity_category"]>;

export type MatchedCategorySummary = {
  segment_count: number;
  distance_meters: number | null;
  active_ms: number | null;
  moving_ms: number | null;
  common_load: SegmentDerivedSummary["common_load"] | null;
  observationQuantification: ActivityObservationQuantificationBundle | null;
};

export function describeActivityComposition(segments: readonly ActivitySegmentReadRow[]) {
  const activitySegments = segments
    .filter((segment) => segment.role === "activity")
    .sort((left, right) => left.ordinal - right.ordinal);
  const activity_categories = activitySegments.flatMap((segment) =>
    segment.activity_category === null ? [] : [segment.activity_category],
  );
  const activity_segment_count = activitySegments.length;

  return {
    activity_categories,
    activity_segment_count,
    activity_kind:
      activity_segment_count === 0
        ? ("unknown" as const)
        : activity_segment_count === 1
          ? ("single" as const)
          : ("multisport" as const),
  };
}

export function buildActivityCompositionCondition(input: {
  activityId: SQLWrapper;
  activity_category?: ActivityCategory;
  mode?: ActivityCompositionMode;
}): SQL | undefined {
  const categoryCondition = input.activity_category
    ? sql<boolean>`exists (
        select 1 from ${activitySegments}
        where ${activitySegments.activity_id} = ${input.activityId}
          and ${activitySegments.role} = 'activity'
          and ${activitySegments.activity_category} = ${input.activity_category}
      )`
    : undefined;
  const activitySegmentCount = sql<number>`(
    select count(*) from ${activitySegments}
    where ${activitySegments.activity_id} = ${input.activityId}
      and ${activitySegments.role} = 'activity'
  )`;
  const modeCondition =
    input.mode === "single_only"
      ? eq(activitySegmentCount, 1)
      : input.mode === "multisport_only"
        ? sql`${activitySegmentCount} > 1`
        : undefined;

  return and(modeCondition, categoryCondition);
}

export function summarizeMatchedCategory(input: {
  segments: readonly ActivitySegmentReadRow[];
  activity_category: ActivityCategory;
  derivedSegments?: readonly SegmentDerivedSummary[];
}): MatchedCategorySummary {
  const matching = input.segments.filter(
    (segment) =>
      segment.role === "activity" && segment.activity_category === input.activity_category,
  );
  const matchingIds = new Set(matching.map((segment) => segment.id));
  const derived = (input.derivedSegments ?? []).filter((summary) =>
    matchingIds.has(summary.segment_id),
  );
  const quantification =
    matching.length > 0 &&
    matching.every((segment) => derived.some((item) => item.segment_id === segment.id))
      ? createObservationQuantificationBundle({
          members: derived.flatMap((summary) => summary.observationQuantification.members),
        })
      : null;
  const distance = quantification?.summary.distance.value ?? null;
  const activeSeconds = quantification?.summary.duration.active.value ?? null;
  const movingSeconds = quantification?.summary.duration.moving.value ?? null;

  return {
    segment_count: matching.length,
    distance_meters: distance,
    active_ms: activeSeconds === null ? null : activeSeconds * 1_000,
    moving_ms: movingSeconds === null ? null : movingSeconds * 1_000,
    common_load: quantification?.summary.commonLoad ?? null,
    observationQuantification: quantification,
  };
}

export function matchedCategorySortValue(
  summary: MatchedCategorySummary,
  sortBy: "distance" | "duration" | "common_load",
) {
  return sortBy === "distance"
    ? summary.distance_meters
    : sortBy === "duration"
      ? summary.active_ms
      : summary.common_load && "load" in summary.common_load
        ? summary.common_load.load
        : null;
}
