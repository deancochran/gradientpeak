import type { ActivityDetailSegment } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { describe, expect, it } from "vitest";

import { summarizeRecordingExecution } from "./execution-review";

const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

describe("recording execution review", () => {
  it("summarizes completed, automatic, manual, and skipped evidence", () => {
    const segments: ActivityDetailSegment[] = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        ordinal: 0,
        role: "activity",
        activityCategory: "run",
        timingCoverage: "partial",
        status: "available",
        summary: {
          version: 1,
          timing: { timingCoverage: "partial", activeMs: 30_000 },
          normalizedPowerResult: unavailableNormalizedPowerResult,
          recordingExecution: {
            version: 1,
            source: "recording_execution_manifest",
            coverage: "complete",
            occurrenceCount: 3,
            occurrences: [
              {
                occurrenceId: "step-1",
                globalOrdinal: 0,
                completion: { status: "completed", method: "automatic" },
              },
              {
                occurrenceId: "step-2",
                globalOrdinal: 1,
                completion: { status: "completed", method: "manual" },
              },
              {
                occurrenceId: "step-3",
                globalOrdinal: 2,
                completion: { status: "skipped", method: "manual" },
              },
            ],
          },
        },
      },
    ];

    expect(summarizeRecordingExecution(segments)).toEqual({
      coverage: "complete",
      totalOccurrences: 3,
      classifiedOccurrences: 3,
      completedOccurrences: 2,
      automaticallyCompletedOccurrences: 1,
      manuallyCompletedOccurrences: 1,
      skippedOccurrences: 1,
    });
  });

  it("returns partial coverage without inventing missing classifications", () => {
    const segment = {
      id: "44444444-4444-4444-8444-444444444444",
      ordinal: 0,
      role: "activity" as const,
      activityCategory: "run" as const,
      timingCoverage: "partial" as const,
      status: "available" as const,
      summary: {
        version: 1 as const,
        timing: { timingCoverage: "partial" as const, activeMs: 30_000 },
        normalizedPowerResult: unavailableNormalizedPowerResult,
        recordingExecution: {
          version: 1 as const,
          source: "recording_execution_manifest" as const,
          coverage: "partial" as const,
          occurrenceCount: 2,
          occurrences: [
            {
              occurrenceId: "known-step",
              globalOrdinal: 0,
              completion: { status: "completed" as const, method: "manual" as const },
            },
          ],
        },
      },
    };

    expect(summarizeRecordingExecution([segment])).toMatchObject({
      coverage: "partial",
      totalOccurrences: 2,
      classifiedOccurrences: 1,
      completedOccurrences: 1,
      skippedOccurrences: 0,
    });
    expect(summarizeRecordingExecution([])).toBeNull();
  });
});
