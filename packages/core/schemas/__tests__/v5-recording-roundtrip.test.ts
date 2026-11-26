import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema, compileActivityPlan } from "../../activity-plan";
import { createUnavailableAthletePerformanceTargetFacts } from "../../index";
import {
  recordingCheckpointSchema,
  recordingExecutionManifestSchema,
  recordingPlanExecutionSnapshotSchema,
} from "../recording-session";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const step = (value: number) => ({
  type: "step",
  id: id(value),
  duration: { type: "time", seconds: 60 },
  targets: [],
});
const now = "2026-10-11T10:00:00.000Z";

describe("V5 compiled recording evidence", () => {
  it("round-trips actual standalone and repeated occurrences through snapshots, checkpoints and manifests", () => {
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "run",
      items: [step(1), { type: "repeat", id: id(2), count: 2, steps: [step(3)] }],
    });
    const compiled = compileActivityPlan(structure);
    const results = compiled.occurrences.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      stepId: occurrence.stepId,
      ...(occurrence.repeatId ? { repeatId: occurrence.repeatId } : {}),
      repeatIteration: occurrence.repeatIteration,
      globalOrdinal: occurrence.ordinal,
      role: occurrence.role,
      activity_category: occurrence.activity_category,
      startedAt: now,
      completedAt: now,
      activeSeconds: 60,
      movingSeconds: 60,
      distanceMeters: 0,
      completion: { status: "completed", method: "automatic" },
    }));
    const snapshot = recordingPlanExecutionSnapshotSchema.parse({
      manifestVersion: 2,
      compilerVersion: compiled.compilerVersion,
      activityPlanId: id(9),
      scheduledEventId: null,
      name: "V5 run",
      description: null,
      activityPlanRevision: 1,
      structureHash: `v1:sha256:${"a".repeat(64)}`,
      structure,
      personalizationEnabled: false,
      targetPresentations: [],
    });
    expect(snapshot.structure).toEqual(structure);
    const checkpoint = recordingCheckpointSchema.parse({
      schemaVersion: 2,
      compilerVersion: compiled.compilerVersion,
      sessionId: "session-v5",
      profileId: id(10),
      lifecycle: "paused",
      planSnapshot: structure,
      planHash: "a".repeat(64),
      currentOccurrenceId: null,
      occurrenceProgress: { startedAt: now, startMovingSeconds: 0, startDistanceMeters: 0 },
      completedOccurrences: results,
      boundaryJournal: [],
      eventJournal: [],
      timing: {
        startedAt: now,
        updatedAt: now,
        elapsedSeconds: 180,
        movingSeconds: 180,
        pausedAt: now,
        accumulatedPauseSeconds: 0,
      },
      policy: {
        activity_category: "run",
        gpsMode: "off",
        activityGpsMode: "off",
        selectedSources: [],
        trainerMode: "manual",
      },
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(now),
      streamArtifactPaths: [],
      revision: 1,
    });
    expect(checkpoint.completedOccurrences).toEqual(results);
    const manifest = recordingExecutionManifestSchema.parse({
      version: 1,
      compilerVersion: compiled.compilerVersion,
      planHash: "a".repeat(64),
      occurrences: results.map((result) => ({ ...result, timerEvents: [], laps: [] })),
    });
    expect(manifest.occurrences.map((result) => result.occurrenceId)).toEqual(
      compiled.occurrences.map((result) => result.occurrenceId),
    );
    expect(manifest.occurrences[0]).not.toHaveProperty("repeatId");
    expect(manifest.occurrences[1]).toMatchObject({ repeatId: id(2), repeatIteration: 0 });
    expect(
      recordingPlanExecutionSnapshotSchema.safeParse({ ...snapshot, compilerVersion: 2 }).success,
    ).toBe(false);
    expect(recordingCheckpointSchema.safeParse({ ...checkpoint, compilerVersion: 2 }).success).toBe(
      false,
    );
    expect(
      recordingExecutionManifestSchema.safeParse({ ...manifest, compilerVersion: 2 }).success,
    ).toBe(false);
  });
});
