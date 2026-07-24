import { type PortableTimerRecordingDraft, portableWebRecordingArtifactSchema } from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  canDiscardSubmissionJob,
  canStoreSubmissionArtifact,
  checkpointTimerDraft,
  claimSubmissionJobEnvelope,
  finalizeClaimedSubmissionJobEnvelope,
  isTimerDraftLeaseAvailable,
  loadTimerDraft,
  parseStoredSubmissionJobEnvelope,
  type TimerDraftStorage,
} from "./draft-storage";
import { createQueuedSubmissionJob } from "./submission-queue";
import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  getTimerOnlyRecordingTimes,
  pauseTimerOnlyRecording,
  recoverTimerOnlyRecording,
  startTimerOnlyRecording,
} from "./timer-runtime";

class FakeTimerDraftStorage implements TimerDraftStorage {
  value: unknown = null;
  removeCount = 0;

  async load(): Promise<unknown> {
    return this.value;
  }

  async save(draft: PortableTimerRecordingDraft): Promise<void> {
    this.value = structuredClone(draft);
  }

  async remove(): Promise<void> {
    this.value = null;
    this.removeCount += 1;
  }
}

function startedRecording() {
  const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    category: "run",
    eventId: "00000000-0000-4000-8000-000000000001",
    activityPlanId: "00000000-0000-4000-8000-000000000003",
  }).state;
  return startTimerOnlyRecording(configured, 2_000, "web-session-1").state;
}

const submissionArtifact = portableWebRecordingArtifactSchema.parse({
  schemaVersion: 1,
  ownerId: "profile-1",
  recordingSessionId: "session-1",
  segmentId: "55555555-5555-4555-8555-555555555555",
  snapshot: {
    identity: { sessionId: "session-1", revision: 0, startedAt: "2026-07-20T10:00:00.000Z" },
    activity: {
      category: "run",
      mode: "free",
      gpsMode: "off",
      eventId: null,
      activityPlanId: null,
      routeId: null,
    },
    profileSnapshot: { defaultsApplied: [] },
    devices: { connected: [], controllableTrainer: null, selectedSources: [] },
    capabilities: {
      canTrackLocation: false,
      canTrackPower: false,
      canTrackHeartRate: false,
      canTrackCadence: false,
      shouldShowMap: false,
      shouldShowSteps: false,
      shouldShowRouteOverlay: false,
      shouldShowTurnByTurn: false,
      shouldShowFollowAlong: false,
      shouldShowTrainerControl: false,
      canAutoAdvanceSteps: false,
      shouldAutoFollowTargets: false,
      autoFollowPriority: "none",
      autoFollowConflict: false,
      autoFollowConflictReason: null,
      primaryMetric: "time",
      isValid: true,
      errors: [],
      warnings: [],
    },
    policies: {
      sourcePolicy: {
        preferUserSelection: true,
        allowDerivedSpeed: false,
        allowDerivedDistance: false,
      },
      controlPolicy: { trainerMode: "manual", autoAdvanceSteps: false },
      degradedModePolicy: {
        allowWithoutGps: true,
        allowWithoutSensors: true,
        exposeSourceWarnings: true,
      },
    },
  },
  startedAt: "2026-07-20T10:00:00.000Z",
  finishedAt: "2026-07-20T10:30:00.000Z",
  elapsedMs: 1_800_000,
  movingMs: 1_500_000,
  fileName: "recording.tcx",
  fileText: "<TrainingCenterDatabase />",
  sha256: "a".repeat(64),
  review: { name: "Run", notes: null, perceivedEffort: null, distanceMeters: 0, calories: null },
});

function queuedSubmissionEnvelope() {
  return {
    job: createQueuedSubmissionJob(submissionArtifact, "2026-07-20T10:31:00.000Z"),
    claimOwner: null,
    claimExpiresAtMs: 0,
    revision: 0,
  };
}

describe("web timer draft persistence", () => {
  it("allows the owning or an expired lease and rejects a live foreign lease", () => {
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20_000,
        instanceId: "tab-a",
        nowMs: 10_000,
      }),
    ).toBe(true);
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20_000,
        instanceId: "tab-b",
        nowMs: 10_000,
      }),
    ).toBe(false);
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20_000,
        instanceId: "tab-b",
        nowMs: 20_000,
      }),
    ).toBe(true);
  });

  it("round-trips an active timer draft through the storage boundary", async () => {
    const storage = new FakeTimerDraftStorage();
    const paused = pauseTimerOnlyRecording(startedRecording(), 8_000).state;

    await checkpointTimerDraft(storage, paused, 12_000, "profile-1");
    const loaded = await loadTimerDraft(storage, "profile-1");

    expect(loaded.status).toBe("valid");
    expect(loaded.draft).toMatchObject({
      lifecycle: "paused",
      timing: { elapsedMs: 10_000, movingMs: 6_000 },
    });
  });

  it("recovers saved values into paused state without auto-resuming", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7_500, "profile-1");
    const loaded = await loadTimerDraft(storage, "profile-1");
    if (!loaded.draft) throw new Error("Expected a valid draft.");

    const recovered = recoverTimerOnlyRecording(loaded.draft, 100_000);

    expect(recovered.rejectedReason).toBeNull();
    expect(recovered.state.reducer.lifecycle).toBe("paused");
    expect(recovered.state.configuration).toMatchObject({
      category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
    });
    expect(getTimerOnlyRecordingTimes(recovered.state, 100_000)).toEqual({
      elapsedSeconds: 5,
      movingSeconds: 5,
    });
  });

  it("discards corrupt untrusted storage data", async () => {
    const storage = new FakeTimerDraftStorage();
    storage.value = { schemaVersion: 1, timing: { movingMs: -1 } };

    await expect(loadTimerDraft(storage, "profile-1")).resolves.toEqual({
      status: "discarded-invalid",
      draft: null,
    });
    expect(storage.value).toBeNull();
    expect(storage.removeCount).toBe(1);
  });

  it("discards a valid draft owned by another profile", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7_500, "profile-1");

    await expect(loadTimerDraft(storage, "profile-2")).resolves.toEqual({
      status: "discarded-invalid",
      draft: null,
    });
    expect(storage.value).toBeNull();
  });

  it("clears the stored draft after finish", async () => {
    const storage = new FakeTimerDraftStorage();
    const recording = startedRecording();
    await checkpointTimerDraft(storage, recording, 7_000, "profile-1");
    expect(storage.value).not.toBeNull();

    const finished = finishTimerOnlyRecording(recording, 8_000).state;
    await checkpointTimerDraft(storage, finished, 8_000, "profile-1");

    expect(storage.value).toBeNull();
    expect(storage.removeCount).toBe(1);
  });

  it("allows only one simultaneous instance to claim a queued submission", () => {
    const shared = queuedSubmissionEnvelope();
    const first = claimSubmissionJobEnvelope({
      envelope: shared,
      instanceId: "tab-a",
      nowMs: 1_000,
    });
    const second = claimSubmissionJobEnvelope({
      envelope: first ?? shared,
      instanceId: "tab-b",
      nowMs: 1_000,
    });

    expect(first).toMatchObject({
      claimOwner: "tab-a",
      revision: 1,
      job: { status: "submitting" },
    });
    expect(second).toBeNull();
  });

  it("accepts reviewed artifact edits until a submission job exists", () => {
    const reviewedArtifact = {
      ...submissionArtifact,
      review: { ...submissionArtifact.review, perceivedEffort: 7 },
    };

    expect(
      canStoreSubmissionArtifact({
        existingArtifact: submissionArtifact,
        existingJob: null,
        artifact: reviewedArtifact,
      }),
    ).toBe(true);
    expect(
      canStoreSubmissionArtifact({
        existingArtifact: submissionArtifact,
        existingJob: queuedSubmissionEnvelope(),
        artifact: reviewedArtifact,
      }),
    ).toBe(false);
  });

  it("safely rejects malformed primitive storage and repairs non-finite lease metadata", () => {
    expect(parseStoredSubmissionJobEnvelope("corrupt", "profile-1")).toBeNull();

    expect(
      parseStoredSubmissionJobEnvelope(
        {
          job: createQueuedSubmissionJob(submissionArtifact, "2026-07-20T10:31:00.000Z"),
          claimOwner: "tab-a",
          claimExpiresAtMs: Number.NaN,
          revision: Number.POSITIVE_INFINITY,
        },
        "profile-1",
      ),
    ).toMatchObject({ claimExpiresAtMs: 0, revision: 0 });
  });

  it("recovers a legacy raw submitting job after normalizing its missing lease", () => {
    const legacy = parseStoredSubmissionJobEnvelope(
      {
        ...createQueuedSubmissionJob(submissionArtifact, "2026-07-20T10:31:00.000Z"),
        status: "submitting",
      },
      "profile-1",
    );
    if (!legacy) throw new Error("Expected a legacy job.");

    expect(
      claimSubmissionJobEnvelope({ envelope: legacy, instanceId: "tab-b", nowMs: 1_000 }),
    ).toMatchObject({ claimOwner: "tab-b", revision: 1, job: { status: "submitting" } });
  });

  it("rejects a reordered terminal write after an expired lease is taken over", () => {
    const first = claimSubmissionJobEnvelope({
      envelope: queuedSubmissionEnvelope(),
      instanceId: "tab-a",
      nowMs: 1_000,
    });
    if (!first) throw new Error("Expected first claim.");
    const second = claimSubmissionJobEnvelope({
      envelope: first,
      instanceId: "tab-b",
      nowMs: 46_000,
    });
    if (!second) throw new Error("Expected lease takeover.");
    const reviewed = finalizeClaimedSubmissionJobEnvelope({
      envelope: second,
      claim: { owner: "tab-b", revision: second.revision },
      nowMs: 46_001,
      update: (job) => ({
        ...job,
        status: "review_required",
        activityId: "activity-1",
        lastError: "needs_review",
      }),
    });
    const staleSubmitted = finalizeClaimedSubmissionJobEnvelope({
      envelope: reviewed ?? second,
      claim: { owner: "tab-a", revision: first.revision },
      nowMs: 46_002,
      update: (job) => ({ ...job, status: "submitted", activityId: "activity-2" }),
    });

    expect(reviewed?.job.status).toBe("review_required");
    expect(staleSubmitted).toBeNull();
  });

  it("accepts a long-running terminal write when no other tab took over the claim", () => {
    const claimed = claimSubmissionJobEnvelope({
      envelope: queuedSubmissionEnvelope(),
      instanceId: "tab-a",
      nowMs: 1_000,
    });
    if (!claimed) throw new Error("Expected a claim.");

    const submitted = finalizeClaimedSubmissionJobEnvelope({
      envelope: claimed,
      claim: { owner: "tab-a", revision: claimed.revision },
      nowMs: 46_001,
      update: (job) => ({ ...job, status: "submitted", activityId: "activity-1" }),
    });

    expect(submitted?.job).toMatchObject({ status: "submitted", activityId: "activity-1" });
  });

  it("does not discard a submitting artifact or replace it with a distinct artifact", () => {
    const claimed = claimSubmissionJobEnvelope({
      envelope: queuedSubmissionEnvelope(),
      instanceId: "tab-a",
      nowMs: 1_000,
    });
    const distinctArtifact = { ...submissionArtifact, sha256: "b".repeat(64) };

    expect(canDiscardSubmissionJob(claimed)).toBe(false);
    expect(
      canStoreSubmissionArtifact({
        existingArtifact: submissionArtifact,
        existingJob: claimed,
        artifact: distinctArtifact,
      }),
    ).toBe(false);
  });
});
