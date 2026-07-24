import { beforeEach, describe, expect, it, vi } from "vitest";

const activityWriter = vi.hoisted(() => ({ submitActivity: vi.fn() }));
const uploadFlow = vi.hoisted(() => ({
  loadAcceptedArtifactForClaim: vi.fn(),
  markPreparedMobileRecordingArtifactFailed: vi.fn(),
  prepareMobileRecordingArtifact: vi.fn(),
  retryMobileRecordingStagingCleanup: vi.fn(),
}));

vi.mock("./submit-activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./submit-activity")>()),
  submitActivity: activityWriter.submitActivity,
}));
vi.mock("../activity-file-ingestion/mobile-recording-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../activity-file-ingestion/mobile-recording-upload")>()),
  loadAcceptedArtifactForClaim: uploadFlow.loadAcceptedArtifactForClaim,
  markPreparedMobileRecordingArtifactFailed: uploadFlow.markPreparedMobileRecordingArtifactFailed,
  prepareMobileRecordingArtifact: uploadFlow.prepareMobileRecordingArtifact,
  retryMobileRecordingStagingCleanup: uploadFlow.retryMobileRecordingStagingCleanup,
}));

import { recordingSummarySubmissionInputSchema } from "../../contracts/recording-submission";
import { recordingSessionActivityId } from "./submit-activity";
import { submitMobileRecording } from "./submit-mobile-recording";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INGESTION_ID = "22222222-2222-4222-8222-222222222222";
const CLAIM_TOKEN = "33333333-3333-4333-8333-333333333333";
const ACCEPTED_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const acceptedArtifact = {
  sha256: ACCEPTED_SHA256,
  byteSize: 3,
  bucket: "activity-files",
  path: `artifacts/sha256/${PROFILE_ID}/${ACCEPTED_SHA256}`,
  mediaType: "application/vnd.ant.fit",
  format: "fit" as const,
  originalName: null,
};
const submission = recordingSummarySubmissionInputSchema.parse({
  profileId: PROFILE_ID,
  recordingSessionId: "session-1",
  name: "Recorder run",
  startedAt: "2026-07-24T08:00:00.000Z",
  finishedAt: "2026-07-24T09:00:00.000Z",
  executionManifest: {
    version: 1,
    compilerVersion: 1,
    planHash: "b".repeat(64),
    occurrences: [
      {
        occurrenceId: "occurrence-1",
        globalOrdinal: 0,
        segmentId: "44444444-4444-4444-8444-444444444444",
        role: "activity",
        category: "run",
        startedAt: "2026-07-24T08:00:00.000Z",
        completedAt: "2026-07-24T09:00:00.000Z",
        activeSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 10_000,
        timerEvents: [],
        laps: [],
      },
    ],
  },
  uploadedArtifact: { ingestionId: INGESTION_ID },
  summary: { distanceMeters: 10_000 },
});

function createDb(input: {
  activities: Array<Record<string, unknown> | undefined>;
  ingestions?: Array<Record<string, unknown> | undefined>;
}) {
  const activities = [...input.activities];
  const ingestions = [...(input.ingestions ?? [])];
  const selectBuilder = {
    from: vi.fn(() => selectBuilder),
    where: vi.fn(() => selectBuilder),
    limit: vi.fn(async () => [{ defaultContentVisibility: "private" }]),
  };
  return {
    query: {
      activities: { findFirst: vi.fn(async () => activities.shift()) },
      activityFileIngestions: { findFirst: vi.fn(async () => ingestions.shift()) },
    },
    select: vi.fn(() => selectBuilder),
  };
}

describe("submitMobileRecording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activityWriter.submitActivity.mockResolvedValue({ id: "activity-1" });
    uploadFlow.retryMobileRecordingStagingCleanup.mockResolvedValue(true);
    uploadFlow.loadAcceptedArtifactForClaim.mockResolvedValue(acceptedArtifact);
  });

  it("passes the exact upload lease into the atomic activity finalization", async () => {
    const readyIngestion = {
      id: INGESTION_ID,
      profile_id: PROFILE_ID,
      source: "mobile_recording",
      status: "ready",
      staging_cleanup_pending: true,
    };
    const db = createDb({
      activities: [undefined, { id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [readyIngestion],
    });
    uploadFlow.prepareMobileRecordingArtifact.mockResolvedValue({
      status: "claimed",
      ingestion: { id: INGESTION_ID },
      claimToken: CLAIM_TOKEN,
      artifact: acceptedArtifact,
    });

    const result = await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission,
    });

    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedActivityId: expect.any(String),
        profileId: PROFILE_ID,
        analysis: expect.objectContaining({
          ingestion: expect.objectContaining({
            source: "mobile_recording",
            ingestionId: INGESTION_ID,
            claimToken: CLAIM_TOKEN,
            stagingCleanupPending: true,
            artifact: acceptedArtifact,
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      activity: { id: "activity-1" },
      ingestion: { id: INGESTION_ID },
      acceptedArtifact,
    });
    expect(uploadFlow.retryMobileRecordingStagingCleanup).toHaveBeenCalledWith(
      db,
      expect.anything(),
      { profileId: PROFILE_ID, ingestion: readyIngestion },
    );
  });

  it("returns the same accepted result on replay and retries pending cleanup", async () => {
    const readyIngestion = {
      id: INGESTION_ID,
      profile_id: PROFILE_ID,
      source: "mobile_recording",
      status: "ready",
      staging_cleanup_pending: true,
    };
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [readyIngestion],
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission,
      }),
    ).resolves.toMatchObject({ activity: { id: "activity-1" }, acceptedArtifact });
    expect(uploadFlow.prepareMobileRecordingArtifact).not.toHaveBeenCalled();
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
    expect(uploadFlow.retryMobileRecordingStagingCleanup).toHaveBeenCalledTimes(1);
  });

  it("uses the accepted artifact identity for legacy submissions without a recording session", async () => {
    const legacySubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      acceptedArtifact,
      summary: { distanceMeters: 10_000 },
    });
    const readyIngestion = {
      id: INGESTION_ID,
      profile_id: PROFILE_ID,
      source: "mobile_recording",
      status: "ready",
      staging_cleanup_pending: false,
    };
    const db = createDb({
      activities: [undefined, { id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, readyIngestion],
    });
    const storage = {
      storage: { from: vi.fn() },
      readObjectBounded: vi.fn(async () => ({
        data: new Uint8Array([97, 98, 99]),
        contentType: "application/fit",
      })),
    };
    const result = await submitMobileRecording(db as never, storage as never, {
      actorProfileId: PROFILE_ID,
      submission: legacySubmission,
    });

    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedActivityId: recordingSessionActivityId(
          PROFILE_ID,
          `accepted-artifact:${acceptedArtifact.sha256}:${acceptedArtifact.byteSize}`,
        ),
        analysis: expect.objectContaining({
          ingestion: expect.objectContaining({
            operationKey: `mobile-recording:accepted-artifact:${acceptedArtifact.sha256}:${acceptedArtifact.byteSize}`,
          }),
        }),
      }),
    );
    expect(result).toMatchObject({ activity: { id: "activity-1" } });
  });

  it("returns a persisted pre-rollout sessionless recording under its legacy digest operation", async () => {
    const legacySubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      acceptedArtifact,
      summary: { distanceMeters: 10_000 },
    });
    const legacyIngestion = {
      id: INGESTION_ID,
      profile_id: PROFILE_ID,
      source: "mobile_recording",
      operation_key: `mobile-recording:${acceptedArtifact.sha256}`,
      activity_id: "legacy-activity-1",
      status: "ready",
      staging_cleanup_pending: false,
    };
    const db = createDb({
      activities: [undefined, { id: "legacy-activity-1", profile_id: PROFILE_ID }],
      ingestions: [legacyIngestion],
    });
    const storage = {
      storage: { from: vi.fn() },
      readObjectBounded: vi.fn(async () => ({
        data: new Uint8Array([97, 98, 99]),
        contentType: "application/fit",
      })),
    };

    await expect(
      submitMobileRecording(db as never, storage as never, {
        actorProfileId: PROFILE_ID,
        submission: legacySubmission,
      }),
    ).resolves.toMatchObject({
      activity: { id: "legacy-activity-1" },
      ingestion: { id: INGESTION_ID },
      acceptedArtifact,
    });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
  });

  it("fails closed when a persisted pre-rollout recording is incomplete or mismatched", async () => {
    const legacySubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      acceptedArtifact,
      summary: { distanceMeters: 10_000 },
    });
    const incomplete = createDb({
      activities: [undefined],
      ingestions: [
        {
          id: INGESTION_ID,
          profile_id: PROFILE_ID,
          source: "mobile_recording",
          operation_key: `mobile-recording:${acceptedArtifact.sha256}`,
          activity_id: null,
          status: "ready",
        },
      ],
    });

    await expect(
      submitMobileRecording(incomplete as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: legacySubmission,
      }),
    ).rejects.toMatchObject({ code: "submission_failed" });

    const mismatched = createDb({
      activities: [undefined, { id: "legacy-activity-1", profile_id: PROFILE_ID }],
      ingestions: [
        {
          id: INGESTION_ID,
          profile_id: PROFILE_ID,
          source: "mobile_recording",
          operation_key: `mobile-recording:${acceptedArtifact.sha256}`,
          activity_id: "legacy-activity-1",
          status: "ready",
        },
      ],
    });
    uploadFlow.loadAcceptedArtifactForClaim.mockResolvedValueOnce({
      ...acceptedArtifact,
      sha256: "c".repeat(64),
      path: `artifacts/sha256/${PROFILE_ID}/${"c".repeat(64)}`,
    });

    await expect(
      submitMobileRecording(mismatched as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: legacySubmission,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
  });

  it("keeps an accepted artifact submission scoped to its explicit recording session", async () => {
    const acceptedSubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      recordingSessionId: "accepted-artifact-session-1",
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      acceptedArtifact,
      summary: { distanceMeters: 10_000 },
    });
    const readyIngestion = {
      id: INGESTION_ID,
      profile_id: PROFILE_ID,
      source: "mobile_recording",
      status: "ready",
      staging_cleanup_pending: false,
    };
    const db = createDb({
      activities: [undefined, { id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [readyIngestion],
    });
    const storage = {
      storage: { from: vi.fn() },
      readObjectBounded: vi.fn(async () => ({
        data: new Uint8Array([97, 98, 99]),
        contentType: "application/fit",
      })),
    };

    await submitMobileRecording(db as never, storage as never, {
      actorProfileId: PROFILE_ID,
      submission: acceptedSubmission,
    });

    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedActivityId: recordingSessionActivityId(PROFILE_ID, "accepted-artifact-session-1"),
        analysis: expect.objectContaining({
          ingestion: expect.objectContaining({
            operationKey: "mobile-recording:accepted-artifact-session-1",
          }),
        }),
      }),
    );
  });

  it("rejects a legacy accepted artifact that is not at its canonical content-addressed path", async () => {
    const legacySubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      acceptedArtifact: { ...acceptedArtifact, path: "staging/attacker-controlled.fit" },
      summary: { distanceMeters: 10_000 },
    });
    const db = createDb({ activities: [undefined] });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: legacySubmission,
      }),
    ).rejects.toMatchObject({ code: "artifact_invalid" });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
  });

  it("rejects a conflicting replay for the same legacy accepted artifact identity", async () => {
    const legacySubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      acceptedArtifact,
      summary: { distanceMeters: 10_000 },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [
        { id: INGESTION_ID, profile_id: PROFILE_ID, source: "mobile_recording", status: "ready" },
      ],
    });
    uploadFlow.loadAcceptedArtifactForClaim.mockResolvedValueOnce({
      ...acceptedArtifact,
      path: `artifacts/sha256/${PROFILE_ID}/${"b".repeat(64)}`,
      sha256: "b".repeat(64),
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: legacySubmission,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
