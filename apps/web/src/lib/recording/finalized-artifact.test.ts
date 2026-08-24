import { describe, expect, it } from "vitest";

import {
  buildUploadedRecordingSummaryInput,
  finalizeTimerRecordingArtifact,
  sessionRpeOperationIdForReview,
} from "./finalized-artifact";
import {
  captureTimerOnlyLap,
  completeCurrentPlanStep,
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  createTimerOnlyRecordingDraft,
  finishTimerOnlyRecording,
  pauseTimerOnlyRecording,
  recoverTimerOnlyRecording,
  resumeTimerOnlyRecording,
  skipCurrentPlanStep,
  startTimerOnlyRecording,
} from "./timer-runtime";

function finishedRecording() {
  let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "run",
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
    expect(artifact.fileText).toContain("<Trackpoint>");
    expect(artifact.fileText).not.toContain("<Position>");
    expect(artifact.fileText).not.toContain("<DistanceMeters>");
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
        distanceEnteredManually: true,
        caloriesEnteredManually: true,
      },
      digest: async () => "b".repeat(64),
    });

    expect(
      buildUploadedRecordingSummaryInput(artifact, {
        ingestionId: "55555555-5555-4555-8555-555555555555",
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
            movingSeconds: 0,
            distanceMeters: 1_500,
            timingEvidence: { source: "manual_timer", coverage: "partial" },
          },
        ],
      },
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: 1_800_000,
        activeMs: 1_500_000,
      },
      uploadedArtifact: { ingestionId: "55555555-5555-4555-8555-555555555555" },
    });
    expect(artifact.fileText).toContain("<DistanceMeters>1500</DistanceMeters>");
    expect(artifact.fileText).not.toContain("<Position>");
  });

  it("encodes each manual lap in TCX and the structured persistence payload", async () => {
    let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
    }).state;
    state = startTimerOnlyRecording(
      state,
      Date.parse("2026-07-20T10:00:00.000Z"),
      "lap-session",
    ).state;
    state = captureTimerOnlyLap(state, Date.parse("2026-07-20T10:10:00.000Z")).state;
    state = captureTimerOnlyLap(state, Date.parse("2026-07-20T10:20:00.000Z")).state;
    state = finishTimerOnlyRecording(state, Date.parse("2026-07-20T10:30:00.000Z")).state;
    const artifact = await finalizeTimerRecordingArtifact({
      state,
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Lapped run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "e".repeat(64),
    });
    const input = buildUploadedRecordingSummaryInput(artifact, {
      ingestionId: "55555555-5555-4555-8555-555555555555",
    });

    expect(artifact.fileText.match(/<Lap /g)).toHaveLength(3);
    expect(artifact.fileText.match(/<TriggerMethod>Manual<\/TriggerMethod>/g)).toHaveLength(2);
    expect(artifact.fileText).not.toContain("<Position>");
    expect(input.laps).toMatchObject([
      { lapNumber: 1, durationSeconds: 600, totalTimerTime: 600, timingSource: "manual_timer" },
      { lapNumber: 2, durationSeconds: 600, totalTimerTime: 600, timingSource: "manual_timer" },
    ]);
  });

  it("retains skipped and completed step distinctions in the execution manifest", async () => {
    const structure = {
      version: 3,
      activity_category: "run",
      segments: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Main",
          role: "activity",
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              name: "Set",
              repetitions: 1,
              steps: [
                {
                  id: "30000000-0000-4000-8000-000000000001",
                  name: "First",
                  duration: { type: "distance", meters: 100 },
                  targets: [{ type: "RPE", intensity: 4 }],
                },
                {
                  id: "30000000-0000-4000-8000-000000000002",
                  name: "Second",
                  duration: { type: "repetitions", count: 5 },
                  targets: [{ type: "RPE", intensity: 6 }],
                },
              ],
            },
          ],
        },
      ],
    } as const;
    let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      plan: {
        activityPlanId: "00000000-0000-4000-8000-000000000003",
        scheduledEventId: null,
        name: "Manifest plan",
        description: null,
        activityPlanRevision: 1,
        structureHash: `v1:sha256:${"f".repeat(64)}`,
        structure,
      },
    }).state;
    state = startTimerOnlyRecording(
      state,
      Date.parse("2026-07-20T10:00:00.000Z"),
      "manifest-session",
    ).state;
    state = completeCurrentPlanStep(state, Date.parse("2026-07-20T10:05:00.000Z")).state;
    state = skipCurrentPlanStep(state, Date.parse("2026-07-20T10:06:00.000Z")).state;
    state = finishTimerOnlyRecording(state, Date.parse("2026-07-20T10:07:00.000Z")).state;
    const artifact = await finalizeTimerRecordingArtifact({
      state,
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Manifest run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "f".repeat(64),
    });
    const input = buildUploadedRecordingSummaryInput(artifact, {
      ingestionId: "55555555-5555-4555-8555-555555555555",
    });

    expect(input.executionManifest.occurrences.map((item) => item.completion)).toEqual([
      { status: "completed", method: "manual" },
      { status: "skipped", method: "manual" },
    ]);
    expect(artifact.fileText).toContain("&quot;type&quot;:&quot;skip&quot;");
  });

  it("keeps artifacts completed after recovery indoors-only", async () => {
    let active = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      routeId: "33333333-3333-4333-8333-333333333333",
    }).state;
    active = startTimerOnlyRecording(
      active,
      Date.parse("2026-07-20T10:00:00.000Z"),
      "session-2",
    ).state;
    const draft = createTimerOnlyRecordingDraft(
      active,
      Date.parse("2026-07-20T10:10:00.000Z"),
      "profile-1",
    );
    if (!draft) throw new Error("Expected active draft");
    const recovered = recoverTimerOnlyRecording(draft);
    const finished = finishTimerOnlyRecording(
      resumeTimerOnlyRecording(recovered.state, Date.parse("2026-07-20T10:15:00.000Z")).state,
      Date.parse("2026-07-20T10:30:00.000Z"),
    ).state;
    const artifact = await finalizeTimerRecordingArtifact({
      state: finished,
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Recovered run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "d".repeat(64),
    });

    expect(artifact.snapshot.activity).toMatchObject({
      gpsMode: "off",
      routeId: "33333333-3333-4333-8333-333333333333",
    });
    expect(artifact.snapshot.capabilities.canTrackLocation).toBe(false);
  });

  it("keeps RPE out of activity notes and retains an operation ID only for unchanged RPE", async () => {
    const artifact = await finalizeTimerRecordingArtifact({
      state: finishedRecording(),
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Morning run",
        notes: "User note",
        perceivedEffort: 5,
        distanceMeters: 0,
        calories: null,
      },
      sessionRpeOperationId: "66666666-6666-4666-8666-666666666666",
      digest: async () => "c".repeat(64),
    });
    expect(
      buildUploadedRecordingSummaryInput(artifact, {
        ingestionId: "55555555-5555-4555-8555-555555555555",
      }).notes,
    ).toBe("User note");
    expect(
      sessionRpeOperationIdForReview({
        previous: artifact,
        perceivedEffort: 5,
        createOperationId: () => "77777777-7777-4777-8777-777777777777",
      }),
    ).toBe(artifact.sessionRpeOperationId);
    expect(
      sessionRpeOperationIdForReview({
        previous: artifact,
        perceivedEffort: 6,
        createOperationId: () => "77777777-7777-4777-8777-777777777777",
      }),
    ).toBe("77777777-7777-4777-8777-777777777777");
    expect(
      sessionRpeOperationIdForReview({
        previous: artifact,
        perceivedEffort: null,
        createOperationId: () => "unused",
      }),
    ).toBeNull();
  });
});
