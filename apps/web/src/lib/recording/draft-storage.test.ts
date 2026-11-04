import {
  createUnavailableAthletePerformanceTargetFacts,
  type PortableTimerRecordingDraft,
  portableTimerRecordingDraftSchema,
  portableWebRecordingArtifactSchema,
} from "@repo/core";
import { measuredNotificationSchema } from "@repo/core/recording/measured-journal";
import { describe, expect, it, vi } from "vitest";
import {
  canDiscardSubmissionJob,
  canStoreSubmissionArtifact,
  checkpointClaimedSubmissionJobEnvelope,
  checkpointTimerDraft,
  claimSubmissionJobEnvelope,
  finalizeClaimedSubmissionJobEnvelope,
  IndexedDbTimerDraftStorage,
  isTimerDraftLeaseAvailable,
  loadTimerDraft,
  parseStoredSubmissionJobEnvelope,
  type TimerDraftStorage,
} from "./draft-storage";
import { nextMeasuredCursor } from "./measured-commit";
import { createQueuedSubmissionJob } from "./submission-queue";
import {
  captureTimerOnlyLap,
  completeCurrentPlanStep,
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  getTimerOnlyPlanStatus,
  getTimerOnlyRecordingTimes,
  pauseTimerOnlyRecording,
  recoverTimerOnlyRecording,
  resumeTimerOnlyRecording,
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

function installIndexedDbLoadHarness({
  draftRecord,
  chunks = [],
}: {
  draftRecord: unknown;
  chunks?: unknown[];
}) {
  let puts = 0;
  let closed = 0;
  const database = {
    close: () => {
      closed += 1;
    },
    transaction: (_storeName: string | string[]) => {
      let aborted = false;
      const transaction = {
        error: null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        abort: () => {
          aborted = true;
          queueMicrotask(() => transaction.onabort?.(new Event("abort")));
        },
        objectStore: (name: string) => ({
          get: () => fakeRequest(name === "timer-drafts" ? draftRecord : undefined),
          getAll: () => fakeRequest(name === "measured-chunks" ? chunks : []),
          put: () => {
            puts += 1;
          },
        }),
      };
      // IDB completion follows the request microtasks and the caller's continuation.
      setTimeout(() => {
        if (!aborted) transaction.oncomplete?.(new Event("complete"));
      }, 0);
      return transaction as unknown as IDBTransaction;
    },
  } as unknown as IDBDatabase;
  const fakeRequest = <T>(result: T) => {
    const request = {} as IDBRequest<T>;
    queueMicrotask(() => {
      Object.assign(request, { result });
      request.onsuccess?.(new Event("success"));
    });
    return request;
  };
  vi.stubGlobal("indexedDB", {
    open: () => fakeRequest(database),
  });
  vi.stubGlobal("IDBKeyRange", { bound: (...range: unknown[]) => range });
  return {
    get puts() {
      return puts;
    },
    get closed() {
      return closed;
    },
    restore: () => vi.unstubAllGlobals(),
  };
}

function measuredEntry(recordedAt: string) {
  return {
    sequenceNumber: 1,
    windowIndex: 0,
    notification: measuredNotificationSchema.parse({
      origin: "bluetooth_notification",
      sourceId: "sensor",
      recordedAt,
      sequenceNumber: 1,
      samples: [
        {
          metricFamily: "power",
          unit: "watts",
          value: 200,
          recordedAt,
          sequenceNumber: 1,
          source: {
            sourceId: "sensor",
            sourceType: "trainer_power",
            provenance: "actual",
            adapterId: "web-bluetooth",
          },
        },
      ],
    }),
  };
}
it("retains malformed measured evidence instead of silently deleting a recorded journal", async () => {
  const storage = new FakeTimerDraftStorage();
  await checkpointTimerDraft(storage, startedRecording(), 3000, "profile-1");
  const stored = storage.value;
  if (typeof stored !== "object" || !stored) throw new Error("Expected draft");
  storage.value = { ...stored, measuredJournal: { provenance: "synthetic" } };
  await expect(loadTimerDraft(storage, "profile-1")).rejects.toThrow("retained for recovery");
  expect(storage.removeCount).toBe(0);
  expect(storage.value).not.toBeNull();
});
function startedRecording() {
  const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "run",
    eventId: "00000000-0000-4000-8000-000000000001",
    activityPlanId: "00000000-0000-4000-8000-000000000003",
  }).state;
  return startTimerOnlyRecording(configured, 2000, "web-session-1").state;
}
function startedPlannedRecording() {
  const structure = {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "30000000-0000-4000-8000-000000000001",
        name: "Distance",
        duration: { type: "distance", meters: 100 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        id: "30000000-0000-4000-8000-000000000002",
        name: "Reps",
        duration: { type: "repetitions", count: 5 },
        targets: [{ type: "RPE", intensity: 6 }],
      },
    ],
  } as const;
  const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "run",
    eventId: "00000000-0000-4000-8000-000000000001",
    activityPlanId: "00000000-0000-4000-8000-000000000003",
    plan: {
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      scheduledEventId: "00000000-0000-4000-8000-000000000001",
      name: "Structured run",
      description: null,
      activityPlanRevision: 1,
      structureHash: `v1:sha256:${"b".repeat(64)}`,
      structure,
    },
  }).state;
  return startTimerOnlyRecording(configured, 2000, "planned-web-session").state;
}
const submissionArtifact = portableWebRecordingArtifactSchema.parse({
  schemaVersion: 1,
  ownerId: "profile-1",
  sessionRpeOperationId: null,
  recordingSessionId: "session-1",
  segmentId: "55555555-5555-4555-8555-555555555555",
  snapshot: {
    identity: { sessionId: "session-1", revision: 0, startedAt: "2026-07-20T10:00:00.000Z" },
    activity: {
      activity_category: "run",
      mode: "free",
      gpsMode: "off",
      eventId: null,
      activityPlanId: null,
      routeId: null,
    },
    profileSnapshot: {},
    performanceTargets: createUnavailableAthletePerformanceTargetFacts("2026-07-20T10:00:00.000Z"),
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
  elapsedMs: 1800000,
  movingMs: 1500000,
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
        leaseExpiresAtMs: 20000,
        instanceId: "tab-a",
        nowMs: 10000,
      }),
    ).toBe(true);
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20000,
        instanceId: "tab-b",
        nowMs: 10000,
      }),
    ).toBe(false);
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20000,
        instanceId: "tab-b",
        nowMs: 20000,
      }),
    ).toBe(true);
  });
  it("round-trips an active timer draft through the storage boundary", async () => {
    const storage = new FakeTimerDraftStorage();
    const paused = pauseTimerOnlyRecording(startedRecording(), 8000).state;
    await checkpointTimerDraft(storage, paused, 12000, "profile-1");
    const loaded = await loadTimerDraft(storage, "profile-1");
    expect(loaded.status).toBe("valid");
    expect(loaded.draft).toMatchObject({
      lifecycle: "paused",
      timing: { elapsedMs: 10000, movingMs: 6000 },
    });
  });
  it("reconstructs a valid measured prefix through the IndexedDB boundary", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7500, "profile-1");
    const draft = portableTimerRecordingDraftSchema.parse(storage.value);
    const entry = measuredEntry(draft.timing.updatedAt);
    const header = {
      version: 1 as const,
      provenance: "measured" as const,
      windows: [{ startedAt: draft.timing.startedAt, endedAt: draft.timing.updatedAt }],
    };
    const measured = nextMeasuredCursor(
      null,
      { header, expectedCursor: 0, entries: [entry] },
      draft.timing.startedAt,
      draft.timing.updatedAt,
    );
    const harness = installIndexedDbLoadHarness({
      draftRecord: {
        ownerId: "profile-1",
        draft,
        leaseOwner: null,
        leaseExpiresAtMs: 0,
        measured,
      },
      chunks: [[entry]],
    });
    try {
      const loaded = await new IndexedDbTimerDraftStorage("profile-1", "tab-a", () => 8000).load();
      expect(portableTimerRecordingDraftSchema.parse(loaded)).toMatchObject({
        measuredJournal: { provenance: "measured", entries: [entry] },
      });
      expect(harness.puts).toBe(1);
    } finally {
      harness.restore();
    }
  });
  it("quarantines an owned unsupported IndexedDB draft before leasing or reading chunks", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7500, "profile-1");
    const draft = portableTimerRecordingDraftSchema.parse(storage.value);
    const rawRecord = {
      ownerId: "profile-1",
      draft: {
        ...draft,
        sessionSnapshot: {
          ...draft.sessionSnapshot,
          identity: { ...draft.sessionSnapshot.identity, revision: -1 },
        },
      },
      leaseOwner: null,
      leaseExpiresAtMs: 0,
      measured: { retained: true },
    };
    const chunks = [[{ retained: true }]];
    const harness = installIndexedDbLoadHarness({ draftRecord: rawRecord, chunks });
    try {
      await expect(
        new IndexedDbTimerDraftStorage("profile-1", "tab-a", () => 8000).load(),
      ).rejects.toThrow("previous app version to export");
      expect(harness.puts).toBe(0);
      expect(chunks).toEqual([[{ retained: true }]]);
    } finally {
      harness.restore();
    }
  });
  it("does not inspect or overwrite a foreign IndexedDB draft", async () => {
    const harness = installIndexedDbLoadHarness({
      draftRecord: {
        ownerId: "profile-2",
        draft: { sessionSnapshot: { private: "other profile" } },
        leaseOwner: "other-tab",
        leaseExpiresAtMs: Number.MAX_SAFE_INTEGER,
      },
    });
    try {
      await expect(
        new IndexedDbTimerDraftStorage("profile-1", "tab-a", () => 8000).load(),
      ).resolves.toBeNull();
      expect(harness.puts).toBe(0);
    } finally {
      harness.restore();
    }
  });
  it("round-trips the current plan step, manual transition, lap, and checkpoint", async () => {
    const storage = new FakeTimerDraftStorage();
    let state = startedPlannedRecording();
    state = completeCurrentPlanStep(state, 5000).state;
    state = captureTimerOnlyLap(state, 6000).state;
    state = pauseTimerOnlyRecording(state, 7000).state;
    await checkpointTimerDraft(storage, state, 8000, "profile-1");
    const loaded = await loadTimerDraft(storage, "profile-1");
    if (!loaded.draft) throw new Error("Expected a structured draft.");
    const recovered = recoverTimerOnlyRecording(loaded.draft);
    expect(recovered.state.planExecution).toMatchObject({
      currentOccurrenceIndex: 1,
      completedOccurrenceIds: [expect.stringContaining("30000000-0000-4000-8000-000000000001")],
      skippedOccurrenceIds: [],
      laps: [{ lapNumber: 1, occurrenceIndex: 1, elapsedMs: 4000 }],
    });
    expect(recovered.state.planExecution?.checkpoints.length).toBeGreaterThanOrEqual(3);
    expect(getTimerOnlyRecordingTimes(recovered.state, 100000)).toMatchObject({
      elapsedSeconds: 6,
      activeSeconds: 5,
    });
    expect(getTimerOnlyPlanStatus(recovered.state, 100000)).toMatchObject({
      currentOccurrenceIndex: 1,
      currentStepElapsedSeconds: 2,
      currentLapElapsedSeconds: 2,
    });
    const resumed = resumeTimerOnlyRecording(recovered.state, 100000).state;
    expect(getTimerOnlyRecordingTimes(resumed, 101000)).toMatchObject({
      elapsedSeconds: 7,
      activeSeconds: 6,
    });
  });
  it("recovers saved values into paused state without auto-resuming", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7500, "profile-1");
    const loaded = await loadTimerDraft(storage, "profile-1");
    if (!loaded.draft) throw new Error("Expected a valid draft.");
    const recovered = recoverTimerOnlyRecording(loaded.draft);
    expect(recovered.rejectedReason).toBeNull();
    expect(recovered.state.reducer.lifecycle).toBe("paused");
    expect(recovered.state.configuration).toMatchObject({
      activity_category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
    });
    expect(recovered.state.timer.startedAtMs).toBe(Date.parse(loaded.draft.timing.startedAt));
    expect(getTimerOnlyRecordingTimes(recovered.state, 100000)).toEqual({
      elapsedSeconds: 5,
      activeSeconds: 5,
      movingSeconds: 5,
    });
  });
  it("recovers an older timer-only draft that has no structured execution state", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7500, "profile-1");
    const legacy = structuredClone(storage.value) as Record<string, unknown>;
    delete legacy.planExecution;
    storage.value = legacy;
    const loaded = await loadTimerDraft(storage, "profile-1");
    expect(loaded.status).toBe("valid");
    if (!loaded.draft) throw new Error("Expected a legacy draft.");
    const recovered = recoverTimerOnlyRecording(loaded.draft);
    expect(recovered.rejectedReason).toBeNull();
    expect(recovered.state.planExecution).toMatchObject({
      currentOccurrenceIndex: null,
      laps: [],
    });
  });
  it("retains malformed structured execution state instead of guessing or deleting evidence", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7500, "profile-1");
    const malformed = structuredClone(storage.value) as Record<string, unknown>;
    malformed.planExecution = { currentOccurrenceIndex: -1 };
    storage.value = malformed;
    await expect(loadTimerDraft(storage, "profile-1")).rejects.toThrow("retained for recovery");
    expect(storage.value).toEqual(malformed);
    expect(storage.removeCount).toBe(0);
  });
  it("fences a prior compiler snapshot across repeated loads without clearing its evidence", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedPlannedRecording(), 7500, "profile-1");
    const draft = portableTimerRecordingDraftSchema.parse(storage.value);
    const plan = draft.sessionSnapshot.planExecution;
    if (!plan) throw new Error("Expected locked plan fixture");
    const prior = {
      ...draft,
      sessionSnapshot: { ...draft.sessionSnapshot, planExecution: { ...plan, compilerVersion: 2 } },
    };
    storage.value = prior;
    await expect(loadTimerDraft(storage, "profile-1")).rejects.toThrow(
      "previous app version to export",
    );
    await expect(loadTimerDraft(storage, "profile-1")).rejects.toThrow("retained for recovery");
    expect(storage.value).toEqual(prior);
    expect(storage.removeCount).toBe(0);
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
  it("hard-rejects a legacy target snapshot instead of migrating the checkpoint", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7500, "profile-1");
    const legacyDraft = structuredClone(storage.value) as {
      sessionSnapshot: {
        performanceTargets: unknown;
      };
    };
    legacyDraft.sessionSnapshot.performanceTargets = {
      cycling: { planningThresholdPower: { status: "unavailable" } },
    };
    storage.value = legacyDraft;
    await expect(loadTimerDraft(storage, "profile-1")).rejects.toThrow("retained for recovery");
    expect(storage.value).toEqual(legacyDraft);
    expect(storage.removeCount).toBe(0);
  });
  it("discards a valid draft owned by another profile", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7500, "profile-1");
    await expect(loadTimerDraft(storage, "profile-2")).resolves.toEqual({
      status: "discarded-invalid",
      draft: null,
    });
    expect(storage.value).toBeNull();
  });
  it("clears the stored draft after finish", async () => {
    const storage = new FakeTimerDraftStorage();
    const recording = startedRecording();
    await checkpointTimerDraft(storage, recording, 7000, "profile-1");
    expect(storage.value).not.toBeNull();
    const finished = finishTimerOnlyRecording(recording, 8000).state;
    await checkpointTimerDraft(storage, finished, 8000, "profile-1");
    expect(storage.value).toBeNull();
    expect(storage.removeCount).toBe(1);
  });
  it("allows only one simultaneous instance to claim a queued submission", () => {
    const shared = queuedSubmissionEnvelope();
    const first = claimSubmissionJobEnvelope({
      envelope: shared,
      instanceId: "tab-a",
      nowMs: 1000,
    });
    const second = claimSubmissionJobEnvelope({
      envelope: first ?? shared,
      instanceId: "tab-b",
      nowMs: 1000,
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
  it("accepts only a strict current submission-job envelope", () => {
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
    ).toBeNull();
    expect(
      parseStoredSubmissionJobEnvelope(
        createQueuedSubmissionJob(submissionArtifact, "2026-07-20T10:31:00.000Z"),
        "profile-1",
      ),
    ).toBeNull();
    expect(parseStoredSubmissionJobEnvelope(queuedSubmissionEnvelope(), "profile-1")).toEqual(
      queuedSubmissionEnvelope(),
    );
  });
  it("rejects a reordered terminal write after an expired lease is taken over", () => {
    const first = claimSubmissionJobEnvelope({
      envelope: queuedSubmissionEnvelope(),
      instanceId: "tab-a",
      nowMs: 1000,
    });
    if (!first) throw new Error("Expected first claim.");
    const second = claimSubmissionJobEnvelope({
      envelope: first,
      instanceId: "tab-b",
      nowMs: 46000,
    });
    if (!second) throw new Error("Expected lease takeover.");
    const reviewed = finalizeClaimedSubmissionJobEnvelope({
      envelope: second,
      claim: { owner: "tab-b", revision: second.revision },
      nowMs: 46001,
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
      nowMs: 46002,
      update: (job) => ({ ...job, status: "submitted", activityId: "activity-2" }),
    });
    expect(reviewed?.job.status).toBe("review_required");
    expect(staleSubmitted).toBeNull();
  });
  it("accepts a long-running terminal write when no other tab took over the claim", () => {
    const claimed = claimSubmissionJobEnvelope({
      envelope: queuedSubmissionEnvelope(),
      instanceId: "tab-a",
      nowMs: 1000,
    });
    if (!claimed) throw new Error("Expected a claim.");
    const submitted = finalizeClaimedSubmissionJobEnvelope({
      envelope: claimed,
      claim: { owner: "tab-a", revision: claimed.revision },
      nowMs: 46001,
      update: (job) => ({ ...job, status: "submitted", activityId: "activity-1" }),
    });
    expect(submitted?.job).toMatchObject({ status: "submitted", activityId: "activity-1" });
  });
  it("checkpoints ingestion identity without releasing the active submission claim", () => {
    const claimed = claimSubmissionJobEnvelope({
      envelope: queuedSubmissionEnvelope(),
      instanceId: "tab-a",
      nowMs: 1000,
    });
    if (!claimed) throw new Error("Expected a claim.");
    const checkpoint = checkpointClaimedSubmissionJobEnvelope({
      envelope: claimed,
      claim: { owner: "tab-a", revision: claimed.revision },
      update: (job) => ({ ...job, ingestionId: "ingestion-1" }),
    });
    expect(checkpoint).toMatchObject({
      claimOwner: "tab-a",
      revision: claimed.revision,
      job: { status: "submitting", ingestionId: "ingestion-1" },
    });
    expect(parseStoredSubmissionJobEnvelope(checkpoint, "profile-1")?.job.ingestionId).toBe(
      "ingestion-1",
    );
  });
  it("does not discard a submitting artifact or replace it with a distinct artifact", () => {
    const claimed = claimSubmissionJobEnvelope({
      envelope: queuedSubmissionEnvelope(),
      instanceId: "tab-a",
      nowMs: 1000,
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
