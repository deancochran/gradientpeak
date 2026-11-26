import type { ActivityDetailSegment } from "@repo/core";

export type RecordingExecutionReview = {
  coverage: "complete" | "partial";
  totalOccurrences: number;
  classifiedOccurrences: number;
  completedOccurrences: number;
  automaticallyCompletedOccurrences: number;
  manuallyCompletedOccurrences: number;
  skippedOccurrences: number;
};

export function summarizeRecordingExecution(
  segments: readonly ActivityDetailSegment[],
): RecordingExecutionReview | null {
  const evidence = segments.flatMap((segment) =>
    segment.status === "available" && segment.summary.recordingExecution
      ? [segment.summary.recordingExecution]
      : [],
  );
  if (evidence.length === 0) return null;

  const occurrences = evidence.flatMap((item) => item.occurrences);
  const completed = occurrences.filter(
    (occurrence) => occurrence.completion.status === "completed",
  );
  return {
    coverage: evidence.every((item) => item.coverage === "complete") ? "complete" : "partial",
    totalOccurrences: evidence.reduce((sum, item) => sum + item.occurrenceCount, 0),
    classifiedOccurrences: occurrences.length,
    completedOccurrences: completed.length,
    automaticallyCompletedOccurrences: completed.filter(
      (occurrence) => occurrence.completion.method === "automatic",
    ).length,
    manuallyCompletedOccurrences: completed.filter(
      (occurrence) => occurrence.completion.method === "manual",
    ).length,
    skippedOccurrences: occurrences.filter(
      (occurrence) => occurrence.completion.status === "skipped",
    ).length,
  };
}
