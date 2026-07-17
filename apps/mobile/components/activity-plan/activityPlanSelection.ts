import type { ActivityPlanActivitySegment } from "@repo/core";

export function findActivitySegmentForInterval(
  segments: readonly ActivityPlanActivitySegment[],
  intervalId: string,
): ActivityPlanActivitySegment | undefined {
  return segments.find((segment) =>
    segment.intervals.some((interval) => interval.id === intervalId),
  );
}
