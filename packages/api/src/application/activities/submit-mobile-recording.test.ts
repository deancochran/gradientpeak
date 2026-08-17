import {
  ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
  activityFileIngestionOperationSchema,
} from "@repo/core/activity-files";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activityWriter = vi.hoisted(() => ({ submitActivity: vi.fn() }));
const artifactFinalizer = vi.hoisted(() => ({ finalizeActivityArtifactIngestion: vi.fn() }));
const uploadFlow = vi.hoisted(() => ({
  loadAcceptedArtifactForClaim: vi.fn(),
  prepareMobileRecordingArtifact: vi.fn(),
  retryMobileRecordingStagingCleanup: vi.fn(),
}));
const ingestionRepository = vi.hoisted(() => ({ getOwnedByOperation: vi.fn() }));

vi.mock("./submit-activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./submit-activity")>()),
  submitActivity: activityWriter.submitActivity,
}));
vi.mock("../activity-file-ingestion/finalize-activity-artifact-ingestion", () => artifactFinalizer);
vi.mock("../activity-file-ingestion/mobile-recording-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../activity-file-ingestion/mobile-recording-upload")>()),
  loadAcceptedArtifactForClaim: uploadFlow.loadAcceptedArtifactForClaim,
  prepareMobileRecordingArtifact: uploadFlow.prepareMobileRecordingArtifact,
  retryMobileRecordingStagingCleanup: uploadFlow.retryMobileRecordingStagingCleanup,
}));
vi.mock("../../infrastructure/repositories", () => ({
  createDrizzleActivityIngestionRepository: () => ingestionRepository,
}));

import { recordingSummarySubmissionInputSchema } from "../../contracts/recording-submission";
import { mobileRecordingOperationId } from "../activity-file-ingestion/mobile-recording-upload";
import { recordingSessionActivityId } from "./submit-activity";
import { submitMobileRecording } from "./submit-mobile-recording";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROFILE_ID = "11111111-1111-4111-8111-111111111112";
const PLAN_ID = "11111111-1111-4111-8111-111111111113";
const INGESTION_ID = "22222222-2222-4222-8222-222222222222";
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
const NOW = "2026-07-24T09:00:00.000Z";

function ingestion(sessionId: string, overrides: Record<string, unknown> = {}) {
  const activityId = recordingSessionActivityId(PROFILE_ID, sessionId);
  return activityFileIngestionOperationSchema.parse({
    id: INGESTION_ID,
    profileId: PROFILE_ID,
    contractVersion: ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
    operationId: mobileRecordingOperationId(sessionId),
    source: "mobile_recording",
    provider: null,
    externalId: null,
    integrationId: null,
    activityId: null,
    artifactId: null,
    stagingBucket: "activity-files",
    stagingPath: `mobile-recordings/${PROFILE_ID}/${activityId}.fit`,
    expectedSha256: ACCEPTED_SHA256,
    expectedByteSize: 3,
    expectedFormat: "fit",
    expectedMediaType: "application/vnd.ant.fit",
    uploadedAt: NOW,
    stagingCleanupPending: false,
    stagingCleanedAt: null,
    stagingCleanupError: null,
    status: "awaiting_upload",
    failureCode: null,
    requestedAt: NOW,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    receivedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function acceptedIngestion(sessionId: string, id = INGESTION_ID) {
  return ingestion(sessionId, {
    id,
    activityId: recordingSessionActivityId(PROFILE_ID, sessionId),
    artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "succeeded",
    startedAt: NOW,
    completedAt: NOW,
    stagingCleanupPending: true,
  });
}
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

function activityPlanStructure(activity_category: "bike" | "run", segmentCount = 1) {
  return {
    version: 3,
    activity_category,
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      role: "activity" as const,
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
  ingestions?: Array<ReturnType<typeof ingestion> | undefined>;
  selectRows?: unknown[][];
}) {
  const activities = [...input.activities];
  const ingestions = [...(input.ingestions ?? [])];
  ingestionRepository.getOwnedByOperation.mockImplementation(async () => ingestions.shift());
  const selectRows = [...(input.selectRows ?? [[{ defaultContentVisibility: "private" }]])];
  const selectBuilder = {
    from: vi.fn(() => selectBuilder),
    where: vi.fn(() => selectBuilder),
    limit: vi.fn(async () => selectRows.shift() ?? []),
  };
  return {
    query: {
      activities: { findFirst: vi.fn(async () => activities.shift()) },
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
    artifactFinalizer.finalizeActivityArtifactIngestion.mockImplementation(
      async (_db: unknown, input: { submit: (value: unknown) => Promise<unknown> }) =>
        input.submit({ parsedData: null, artifact: acceptedArtifact }),
    );
    uploadFlow.prepareMobileRecordingArtifact.mockResolvedValue({
      status: "processing",
      ingestion: ingestion("session-1", { status: "processing", startedAt: NOW }),
      staging: {
        bucket: "activity-files",
        path: `staging/mobile-recordings/${PROFILE_ID}/artifact.fit`,
        bytes: new Uint8Array([1, 2, 3]),
        format: "fit",
        mediaType: "application/vnd.ant.fit",
      },
    });
  });

  it("attaches an accessible single-activity-category plan to a new recording", async () => {
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [
        undefined,
        {
          ...acceptedIngestion("single-activity-category-plan-session"),
        },
      ],
      selectRows: [
        [
          {
            id: PLAN_ID,
            contentVisibility: "private",
            isSystem: false,
            ownerProfileId: PROFILE_ID,
            structure: activityPlanStructure("run", 2),
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

  it("rejects a legacy segment-category plan before storage work", async () => {
    const db = createDb({
      activities: [],
      ingestions: [undefined],
      selectRows: [
        [
          {
            id: PLAN_ID,
            contentVisibility: "private",
            isSystem: false,
            ownerProfileId: PROFILE_ID,
            structure: {
              ...activityPlanStructure("bike", 2),
              segments: activityPlanStructure("bike", 2).segments.map((segment, index) => ({
                ...segment,
                activity_category: index === 0 ? "bike" : "run",
              })),
            },
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
            structure: activityPlanStructure("run"),
          },
        ],
        [
          {
            id: PLAN_ID,
            ownerProfileId: OTHER_PROFILE_ID,
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

  it("passes the exact direct ingestion identity into atomic activity finalization", async () => {
    const readyIngestion = acceptedIngestion("session-1");
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, readyIngestion],
    });
    uploadFlow.prepareMobileRecordingArtifact.mockResolvedValue({
      status: "processing",
      ingestion: ingestion("session-1", { status: "processing", startedAt: NOW }),
      staging: {
        bucket: "activity-files",
        path: `staging/mobile-recordings/${PROFILE_ID}/artifact.fit`,
        bytes: new Uint8Array([1, 2, 3]),
        format: "fit",
        mediaType: "application/vnd.ant.fit",
      },
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
    const readyIngestion = acceptedIngestion("session-1");
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

  it("keeps an uploaded artifact submission scoped to its explicit recording session", async () => {
    const uploadedSubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      recordingSessionId: "uploaded-artifact-session-1",
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      uploadedArtifact: { ingestionId: INGESTION_ID },
      summary: { distanceMeters: 10_000 },
    });
    const readyIngestion = acceptedIngestion("uploaded-artifact-session-1", INGESTION_ID);
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, readyIngestion],
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
      submission: uploadedSubmission,
    });

    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedActivityId: recordingSessionActivityId(PROFILE_ID, "uploaded-artifact-session-1"),
        analysis: expect.objectContaining({
          ingestion: expect.objectContaining({
            operationId: mobileRecordingOperationId("uploaded-artifact-session-1"),
          }),
        }),
      }),
    );
  });

  it("rejects a conflicting replay for the same session-bound upload claim", async () => {
    const uploadedSubmission = recordingSummarySubmissionInputSchema.parse({
      profileId: PROFILE_ID,
      recordingSessionId: "uploaded-artifact-session-1",
      name: "Recorder run",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: submission.executionManifest,
      uploadedArtifact: { ingestionId: "22222222-2222-4222-8222-222222222223" },
      summary: { distanceMeters: 10_000 },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [
        acceptedIngestion("uploaded-artifact-session-1", "22222222-2222-4222-8222-222222222222"),
      ],
    });
    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: uploadedSubmission,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
