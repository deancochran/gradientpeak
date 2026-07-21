import { describe, expect, it } from "vitest";

import {
  buildCreateFromRecordingSummaryInput,
  finalizeTimerRecordingArtifact,
} from "./finalized-artifact";
import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  pauseTimerOnlyRecording,
  resumeTimerOnlyRecording,
  startTimerOnlyRecording,
} from "./timer-runtime";

function finishedRecording() {
  let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    category: "run",
    eventId: "11111111-1111-4111-8111-111111111111",
    activityPlanId: "22222222-2222-4222-8222-222222222222",
    routeId: "33333333-3333-4333-8333-333333333333",
  }).state;
  state = startTimerOnlyRecording(state, Date.parse("2026-07-20T10:00:00.000Z"), "session-1").state;
  state = pauseTimerOnlyRecording(state, Date.parse("2026-07-20T10:10:00.000Z")).state;
  state = resumeTimerOnlyRecording(state, Date.parse("2026-07-20T10:15:00.000Z")).state;
  return finishTimerOnlyRecording(state, Date.parse("2026-07-20T10:30:00.000Z")).state;
}

describe("web recording finalization", () => {
  it("creates a portable artifact from the locked snapshot and timer evidence", async () => {
    const artifact = await finalizeTimerRecordingArtifact({
      state: finishedRecording(),
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Morning run",
        notes: "Felt smooth",
        perceivedEffort: 5,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "a".repeat(64),
    });

    expect(artifact).toMatchObject({
      recordingSessionId: "session-1",
      elapsedMs: 1_800_000,
      movingMs: 1_500_000,
      snapshot: {
        activity: {
          eventId: "11111111-1111-4111-8111-111111111111",
          activityPlanId: "22222222-2222-4222-8222-222222222222",
          routeId: "33333333-3333-4333-8333-333333333333",
        },
      },
    });
    expect(artifact.fileText).toContain('<Activity Sport="Running">');
  });

  it("builds an idempotent server summary using the recording session identity", async () => {
    const artifact = await finalizeTimerRecordingArtifact({
      state: finishedRecording(),
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Morning run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 1_500,
        calories: 120,
      },
      digest: async () => "b".repeat(64),
    });

    expect(
      buildCreateFromRecordingSummaryInput(artifact, {
        bucket: "activity-files",
        path: "activities/profile-1/uploads/session-1.tcx",
      }),
    ).toMatchObject({
      profileId: "profile-1",
      recordingSessionId: "session-1",
      activityPlanId: "22222222-2222-4222-8222-222222222222",
      summary: { distanceMeters: 1_500, calories: 120 },
      executionManifest: {
        occurrences: [
          {
            segmentId: "44444444-4444-4444-8444-444444444444",
            activeSeconds: 1_500,
            distanceMeters: 1_500,
          },
        ],
      },
    });
  });
});
