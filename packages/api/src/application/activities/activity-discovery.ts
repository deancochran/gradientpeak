import { segmentSummarySchemaV1 } from "@repo/core";
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
type ActivityCategory = NonNullable<ActivitySegmentReadRow["category"]>;

export type MatchedCategorySummary = {
  segment_count: number;
  distance_meters: number | null;
  active_ms: number | null;
  moving_ms: number | null;
  tss: number | null;
  tss_identity: SegmentDerivedSummary["tss_identity"];
};

export function describeActivityComposition(segments: readonly ActivitySegmentReadRow[]) {
  const activitySegments = segments
    .filter((segment) => segment.role === "activity")
    .sort((left, right) => left.ordinal - right.ordinal);
  const activity_categories = activitySegments.flatMap((segment) =>
    segment.category === null ? [] : [segment.category],
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
  category?: ActivityCategory;
  mode?: ActivityCompositionMode;
}): SQL | undefined {
  const categoryCondition = input.category
    ? sql<boolean>`exists (
        select 1 from ${activitySegments}
        where ${activitySegments.activity_id} = ${input.activityId}
          and ${activitySegments.role} = 'activity'
          and ${activitySegments.category} = ${input.category}
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

function completeTotal(values: readonly (number | null)[]): number | null {
  return values.every((value): value is number => value !== null)
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

export function summarizeMatchedCategory(input: {
  segments: readonly ActivitySegmentReadRow[];
  category: ActivityCategory;
  derivedSegments?: readonly SegmentDerivedSummary[];
}): MatchedCategorySummary {
  const matching = input.segments.filter(
    (segment) => segment.role === "activity" && segment.category === input.category,
  );
  const distanceMeters = matching.map((segment) => {
    const parsed = segmentSummarySchemaV1.safeParse(segment.summary);
    return parsed.success ? (parsed.data.distanceMeters ?? null) : null;
  });
  const activeMs = matching.map((segment) =>
    segment.timing_coverage === "unavailable" ? null : segment.active_ms,
  );
  const movingMs = matching.map((segment) =>
    segment.timing_coverage === "unavailable" ? null : segment.moving_ms,
  );
  const bySegmentId = new Map(
    (input.derivedSegments ?? []).map((summary) => [summary.segment_id, summary]),
  );
  const derived = matching.map((segment) => bySegmentId.get(segment.id));
  const loadStreamKeys = new Set(derived.map((summary) => summary?.load_stream_key ?? null));
  const hasCompatibleCompleteLoad =
    matching.length > 0 &&
    derived.length === matching.length &&
    derived.every(
      (summary) =>
        summary !== undefined &&
        summary.tss !== null &&
        summary.tss_identity !== null &&
        summary.load_stream_key !== null,
    ) &&
    loadStreamKeys.size === 1;
  const firstDerived = hasCompatibleCompleteLoad ? derived[0] : undefined;

  return {
    segment_count: matching.length,
    distance_meters: completeTotal(distanceMeters),
    active_ms: completeTotal(activeMs),
    moving_ms: completeTotal(movingMs),
    tss: hasCompatibleCompleteLoad
      ? derived.reduce((total, summary) => total + (summary?.tss ?? 0), 0)
      : null,
    tss_identity: firstDerived?.tss_identity ?? null,
  };
}

export function matchedCategorySortValue(
  summary: MatchedCategorySummary,
  sortBy: "distance" | "duration" | "tss",
) {
  return sortBy === "distance"
    ? summary.distance_meters
    : sortBy === "duration"
      ? summary.active_ms
      : summary.tss;
}
