import {
  type CompletedActivitySegmentSetV1,
  segmentSummarySchemaV1,
} from "@repo/core/activity-segments";

type SegmentProjectionRow = {
  role: string;
  summary: unknown;
};

/**
 * The parent compatibility column is a read/write projection only. Segment
 * summaries remain the provenance-bearing authority for normalized power.
 * Its integer representation rounds a finite positive segment value to the
 * nearest whole watt; canonical segment consumers retain full precision.
 */
export function deriveNormalizedPowerCompatibilityProjection(
  segmentSet: CompletedActivitySegmentSetV1,
): number | null {
  return deriveNormalizedPowerCompatibilityProjectionFromSegments(segmentSet.segments);
}

/** Returns null for multisport, malformed, or non-positive historical segment values. */
export function deriveNormalizedPowerCompatibilityProjectionFromSegments(
  segments: readonly SegmentProjectionRow[],
): number | null {
  const activitySegments = segments.filter((segment) => segment.role === "activity");
  if (activitySegments.length !== 1) return null;
  const summary = segmentSummarySchemaV1.safeParse(activitySegments[0]?.summary);
  const normalizedPower = summary.success ? (summary.data.normalizedPowerWatts ?? null) : null;
  return normalizedPower !== null && Number.isFinite(normalizedPower) && normalizedPower > 0
    ? Math.round(normalizedPower)
    : null;
}
