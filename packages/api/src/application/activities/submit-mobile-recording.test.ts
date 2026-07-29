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
const OTHER_PROFILE_ID = "11111111-1111-4111-8111-111111111112";
const PLAN_ID = "11111111-1111-4111-8111-111111111113";
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
  artifactSource: "uploadedArtifact",
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
        activity_category: "run",
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

function activityPlanStructure(activity_categories: Array<"bike" | "run">) {
  return {
    version: 3,
    segments: activity_categories.map((activity_category, index) => ({
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      role: "activity" as const,
      activity_category,
      name: activity_category,
      intervals: [
        {
          id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              name: "Step",
              duration: { type: "time" as const, seconds: 600 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    })),
  };
}

function createDb(input: {
  activities: Array<Record<string, unknown> | undefined>;
  ingestions?: Array<Record<string, unknown> | undefined>;
  selectRows?: unknown[][];
}) {
  const activities = [...input.activities];
  const ingestions = [...(input.ingestions ?? [])];
  const selectRows = [...(input.selectRows ?? [[{ defaultContentVisibility: "private" }]])];
  const selectBuilder = {
    from: vi.fn(() => selectBuilder),
    where: vi.fn(() => selectBuilder),
    limit: vi.fn(async () => selectRows.shift() ?? []),
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
    uploadFlow.prepareMobileRecordingArtifact.mockResolvedValue({
      status: "claimed",
      ingestion: { id: INGESTION_ID },
      claimToken: CLAIM_TOKEN,
      artifact: acceptedArtifact,
    });
  });

  it("attaches an accessible single-activity-category plan to a new recording", async () => {
    const db = createDb({
      activities: [undefined, { id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [
        {
          id: INGESTION_ID,
          profile_id: PROFILE_ID,
          source: "mobile_recording",
          status: "ready",
        },
      ],
      selectRows: [
        [
          {
            id: PLAN_ID,
            contentVisibility: "private",
            isSystem: false,
            ownerProfileId: PROFILE_ID,
            structure: activityPlanStructure(["run", "run"]),
          },
        ],
      ],
    });

    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: recordingSummarySubmissionInputSchema.parse({
        ...submission,
        activityPlanId: PLAN_ID,
        content_visibility: "private",
        recordingSessionId: "single-activity-category-plan-session",
      }),
    });

    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ activityPlanId: PLAN_ID }),
    );
  });

  it("rejects a mixed plan before storage work", async () => {
    const db = createDb({
      activities: [undefined, { id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [
        {
          id: INGESTION_ID,
          profile_id: PROFILE_ID,
          source: "mobile_recording",
          status: "ready",
        },
      ],
      selectRows: [
        [
          {
            id: PLAN_ID,
            contentVisibility: "private",
            isSystem: false,
            ownerProfileId: PROFILE_ID,
            structure: activityPlanStructure(["bike", "run"]),
          },
        ],
      ],
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: recordingSummarySubmissionInputSchema.parse({
          ...submission,
          activityPlanId: PLAN_ID,
          content_visibility: "private",
          recordingSessionId: "mixed-plan-rejection-session",
        }),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", [[]]],
    [
      "strict-invalid",
      [
        [
          {
            id: PLAN_ID,
            contentVisibility: "private",
            isSystem: false,
            ownerProfileId: PROFILE_ID,
            structure: { version: 3, segments: [{ role: "activity" }] },
          },
        ],
      ],
    ],
    [
      "inaccessible",
      [
        [
          {
            id: PLAN_ID,
            contentVisibility: "private",
            isSystem: false,
            ownerProfileId: OTHER_PROFILE_ID,
            structure: activityPlanStructure(["run"]),
          },
        ],
        [
          {
            id: PLAN_ID,
            ownerProfileId: OTHER_PROFILE_ID,
            templateVisibility: "private",
            contentVisibility: "private",
            isSystem: false,
          },
        ],
        [],
      ],
    ],
  ] as const)("rejects a %s plan before accepting recording artifacts", async (_label, selectRows) => {
    const db = createDb({
      activities: [undefined],
      selectRows: selectRows.map((rows) => [...rows]),
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: recordingSummarySubmissionInputSchema.parse({
          ...submission,
          activityPlanId: PLAN_ID,
          content_visibility: "private",
          recordingSessionId: `${_label}-plan-session`,
        }),
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: "Activity plan is not available for mobile recording",
    });
    expect(uploadFlow.prepareMobileRecordingArtifact).not.toHaveBeenCalled();
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
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

  it("keeps an accepted artifact submission scoped to its explicit recording session", async () => {
    const acceptedSubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      recordingSessionId: "accepted-artifact-session-1",
      artifactSource: "acceptedArtifact",
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

  it("rejects a conflicting replay for the same session-bound accepted artifact", async () => {
    const acceptedSubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      recordingSessionId: "accepted-artifact-session-1",
      artifactSource: "acceptedArtifact",
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
        submission: acceptedSubmission,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
