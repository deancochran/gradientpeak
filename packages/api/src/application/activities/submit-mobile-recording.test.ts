import {
  ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
  activityFileIngestionOperationSchema,
} from "@repo/core/activity-files";
import { initializeActivityPlanDocument } from "@repo/core/activity-plan";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activityWriter = vi.hoisted(() => ({ submitActivity: vi.fn() }));
const artifactFinalizer = vi.hoisted(() => ({ finalizeActivityArtifactIngestion: vi.fn() }));
const uploadFlow = vi.hoisted(() => ({
  loadAcceptedArtifactForClaim: vi.fn(),
  prepareMobileRecordingArtifact: vi.fn(),
  retryMobileRecordingStagingCleanup: vi.fn(),
}));
const ingestionRepository = vi.hoisted(() => ({ getOwnedByOperation: vi.fn() }));
const plannedSessionRepository = vi.hoisted(() => ({
  getOwned: vi.fn(),
  mutateOwned: vi.fn(),
}));
const plannedSessionRepositoryFactory = vi.hoisted(() => vi.fn());
const activityFileParser = vi.hoisted(() => ({ parseActivityFile: vi.fn() }));
const fitFileParser = vi.hoisted(() => ({ safeDecodeFitFile: vi.fn() }));

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
  createDrizzlePlannedSessionRepository: (db: unknown) => {
    plannedSessionRepositoryFactory(db);
    return plannedSessionRepository;
  },
}));
vi.mock("@repo/core/server/activity-files", () => activityFileParser);
vi.mock("@repo/core/server/fit-sdk-parser", () => fitFileParser);

import { recordingSummarySubmissionInputSchema } from "../../contracts/recording-submission";
import { mobileRecordingOperationId } from "../activity-file-ingestion/mobile-recording-upload";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
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

const SCHEDULED_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const SCHEDULED_VARIANT_ID = "33333333-3333-4333-8333-333333333334";

function scheduledFixture(recordingSessionId = "scheduled-recording-session") {
  const structure = activityPlanStructure("run");
  const structureHash = activityPlanStructureHash(structure);
  const source = { kind: "direct" as const, operationId: "scheduled_recording_operation_1234" };
  const prescription = {
    activityPlanId: PLAN_ID,
    activityPlanRevision: 7,
    variantId: SCHEDULED_VARIANT_ID,
    variantName: "Tempo",
    structure,
    structureHash,
    prescriptionQuantification: null,
    capturedAt: "2026-07-23T08:00:00.000Z",
  };
  const plannedSession = {
    id: SCHEDULED_SESSION_ID,
    sessionRevision: 4,
    prescription,
  };
  const scheduledSubmission = recordingSummarySubmissionInputSchema.parse({
    ...submission,
    recordingSessionId,
    activityPlanId: PLAN_ID,
    content_visibility: "private",
    planExecution: {
      manifestVersion: 1,
      compilerVersion: 1,
      activityPlanId: PLAN_ID,
      scheduledEventId: null,
      name: "Tempo",
      description: null,
      activityPlanRevision: 7,
      structureHash,
      structure,
      plannedSession,
      personalizationEnabled: false,
      targetPresentations: [],
    },
  });
  const authoritative = plannedSessionSchema.parse({
    contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
    id: SCHEDULED_SESSION_ID,
    profileId: PROFILE_ID,
    sessionRevision: 4,
    planningDate: "2026-07-24",
    originalTargetDate: "2026-07-24",
    source,
    idempotencyKey: plannedSessionIdempotencyKey(source),
    groupEventId: null,
    prescription,
    lifecycle: { status: "scheduled" },
  });
  return { authoritative, scheduledSubmission, structure, structureHash };
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
    activityFileParser.parseActivityFile.mockReturnValue({ records: [] });
    fitFileParser.safeDecodeFitFile.mockReturnValue({ errors: [], messages: {} });
    activityWriter.submitActivity.mockResolvedValue({ id: "activity-1" });
    plannedSessionRepository.getOwned.mockReset();
    plannedSessionRepository.mutateOwned.mockReset();
    plannedSessionRepositoryFactory.mockReset();
    uploadFlow.retryMobileRecordingStagingCleanup.mockResolvedValue(true);
    uploadFlow.loadAcceptedArtifactForClaim.mockResolvedValue(acceptedArtifact);
    artifactFinalizer.finalizeActivityArtifactIngestion.mockImplementation(
      async (
        _db: unknown,
        input: {
          parse: () => unknown | Promise<unknown>;
          submit: (value: unknown) => Promise<unknown>;
        },
      ) => {
        const parsedData = await input.parse();
        return input.submit({ parsedData, artifact: acceptedArtifact });
      },
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

  it("rejects forged and mutated V3 prescription hashes before artifact storage", async () => {
    const { scheduledSubmission, structure } = scheduledFixture("forged-prescription-session");
    const forgedHash = `v1:sha256:${"f".repeat(64)}`;
    const forged = recordingSummarySubmissionInputSchema.parse({
      ...scheduledSubmission,
      planExecution: {
        ...scheduledSubmission.planExecution,
        structureHash: forgedHash,
        plannedSession: {
          ...scheduledSubmission.planExecution?.plannedSession,
          prescription: {
            ...scheduledSubmission.planExecution?.plannedSession?.prescription,
            structureHash: forgedHash,
          },
        },
      },
    });
    const mutated = {
      ...structure,
      segments: structure.segments.map((segment, index) =>
        index === 0 ? { ...segment, name: "Mutated after capture" } : segment,
      ),
    };
    const mutatedSubmission = recordingSummarySubmissionInputSchema.parse({
      ...scheduledSubmission,
      planExecution: {
        ...scheduledSubmission.planExecution,
        structure: mutated,
        plannedSession: {
          ...scheduledSubmission.planExecution?.plannedSession,
          prescription: {
            ...scheduledSubmission.planExecution?.plannedSession?.prescription,
            structure: mutated,
          },
        },
      },
    });
    const db = createDb({ activities: [], ingestions: [undefined] });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: forged,
      }),
    ).rejects.toMatchObject({ code: "manifest_invalid" });
    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: mutatedSubmission,
      }),
    ).rejects.toMatchObject({ code: "manifest_invalid" });
    expect(uploadFlow.prepareMobileRecordingArtifact).not.toHaveBeenCalled();
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
  });

  it("atomically links a valid scheduled recording through the canonical activity transaction", async () => {
    const { authoritative, scheduledSubmission, structure } = scheduledFixture();
    const activityId = recordingSessionActivityId(
      PROFILE_ID,
      scheduledSubmission.recordingSessionId,
    );
    const completed = plannedSessionSchema.parse({
      ...authoritative,
      sessionRevision: authoritative.sessionRevision + 1,
      lifecycle: {
        status: "completed",
        completion: { state: "linked", activityId, linkedAt: NOW },
      },
    });
    let current = authoritative;
    plannedSessionRepository.getOwned.mockImplementation(async () => current);
    plannedSessionRepository.mutateOwned.mockImplementation(async () => {
      current = completed;
      return { status: "updated", session: completed };
    });
    const transaction = {} as never;
    activityWriter.submitActivity.mockImplementation(async (_db, input) => {
      await input.composition?.persist(transaction, {
        activityId: input.requestedActivityId as string,
        now: new Date(NOW),
      });
      return { id: input.requestedActivityId };
    });
    const ready = acceptedIngestion(scheduledSubmission.recordingSessionId);
    const db = createDb({
      activities: [{ id: activityId, profile_id: PROFILE_ID }],
      ingestions: [undefined, ready],
      selectRows: [
        [
          {
            id: PLAN_ID,
            contentVisibility: "private",
            isSystem: false,
            ownerProfileId: PROFILE_ID,
            structure: initializeActivityPlanDocument({ activityPlanId: PLAN_ID, structure }),
          },
        ],
      ],
    });

    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: scheduledSubmission,
    });

    expect(plannedSessionRepository.mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "link_completion",
        sessionId: SCHEDULED_SESSION_ID,
        expectedRevision: authoritative.sessionRevision,
        activityId,
      }),
    );
    expect(plannedSessionRepositoryFactory).toHaveBeenCalledWith(transaction);
    expect(current).toEqual(completed);
  });

  it("rejects wrong scheduled provenance and leaves acceptance to the transaction rollback", async () => {
    const { authoritative, scheduledSubmission, structure } = scheduledFixture(
      "wrong-provenance-session",
    );
    plannedSessionRepository.getOwned.mockResolvedValue({
      ...authoritative,
      prescription: { ...authoritative.prescription, variantName: "Authoritative name" },
    });
    activityWriter.submitActivity.mockImplementation(async (_db, input) => {
      await input.composition?.persist({} as never, {
        activityId: input.requestedActivityId as string,
        now: new Date(NOW),
      });
      return { id: input.requestedActivityId };
    });
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
            structure: initializeActivityPlanDocument({ activityPlanId: PLAN_ID, structure }),
          },
        ],
      ],
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: scheduledSubmission,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(plannedSessionRepository.mutateOwned).not.toHaveBeenCalled();
  });

  it("converges an exact scheduled submission retry without relinking", async () => {
    const { authoritative, scheduledSubmission } = scheduledFixture("scheduled-retry-session");
    const activityId = recordingSessionActivityId(
      PROFILE_ID,
      scheduledSubmission.recordingSessionId,
    );
    plannedSessionRepository.getOwned.mockResolvedValue(
      plannedSessionSchema.parse({
        ...authoritative,
        sessionRevision: authoritative.sessionRevision + 2,
        lifecycle: {
          status: "completed",
          completion: { state: "linked", activityId, linkedAt: NOW },
        },
      }),
    );
    const db = createDb({
      activities: [{ id: activityId, profile_id: PROFILE_ID }],
      ingestions: [acceptedIngestion(scheduledSubmission.recordingSessionId)],
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: scheduledSubmission,
      }),
    ).resolves.toMatchObject({ activity: { id: activityId } });
    expect(plannedSessionRepository.mutateOwned).not.toHaveBeenCalled();
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
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
            structure: initializeActivityPlanDocument({
              activityPlanId: PLAN_ID,
              structure: activityPlanStructure("run", 2),
            }),
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

  it("rejects location-bearing live recording artifacts before activity creation", async () => {
    const db = createDb({
      activities: [],
      ingestions: [undefined],
    });
    activityFileParser.parseActivityFile.mockReturnValue({
      records: [
        {
          timestamp: new Date("2026-07-24T08:00:00.000Z"),
          positionLat: 37.7749,
          positionLong: -122.4194,
        },
      ],
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission,
      }),
    ).rejects.toMatchObject({
      code: "artifact_invalid",
      message: "Live recording artifacts cannot contain location data",
    });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
  });

  it("rejects FIT location fields outside track records", async () => {
    const db = createDb({
      activities: [],
      ingestions: [undefined],
    });
    fitFileParser.safeDecodeFitFile.mockReturnValue({
      errors: [],
      messages: { sessionMesgs: [{ startPositionLat: 37.7749 }] },
    });

    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission,
      }),
    ).rejects.toMatchObject({ code: "artifact_invalid" });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
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

  it("persists manual laps atomically while keeping manual timer coverage partial", async () => {
    const recordingSessionId = "manual-evidence-session";
    const manualSubmission = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      recordingSessionId,
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: 1_200_000,
        activeMs: 900_000,
      },
      laps: [
        {
          lapNumber: 1,
          durationSeconds: 300,
          totalElapsedTime: 300,
          totalTimerTime: 240,
          triggerMethod: "manual",
          timingSource: "manual_timer",
        },
      ],
      executionManifest: {
        ...submission.executionManifest,
        occurrences: [
          {
            ...submission.executionManifest.occurrences[0],
            completedAt: "2026-07-24T08:20:00.000Z",
            activeSeconds: 900,
            movingSeconds: 0,
            completion: { status: "completed", method: "manual" },
            timingEvidence: {
              source: "manual_timer",
              coverage: "partial",
              startOffsetMs: 0,
              endOffsetMs: 1_200_000,
            },
          },
          {
            ...submission.executionManifest.occurrences[0],
            occurrenceId: "occurrence-skipped",
            globalOrdinal: 1,
            startedAt: "2026-07-24T08:20:00.000Z",
            completedAt: "2026-07-24T08:20:00.000Z",
            activeSeconds: 0,
            movingSeconds: 0,
            distanceMeters: 0,
            completion: { status: "skipped", method: "manual" },
            timingEvidence: {
              source: "manual_timer",
              coverage: "partial",
              startOffsetMs: 1_200_000,
              endOffsetMs: 1_200_000,
            },
          },
        ],
      },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(recordingSessionId)],
    });

    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: manualSubmission,
    });

    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedActivityId: recordingSessionActivityId(PROFILE_ID, recordingSessionId),
        timingCoverage: "partial",
        activeMs: null,
        movingMs: null,
        laps: manualSubmission.laps,
        segmentSet: expect.objectContaining({
          elapsedMs: 1_200_000,
          segments: [
            expect.objectContaining({
              startOffsetMs: 0,
              endOffsetMs: 1_200_000,
              summary: expect.objectContaining({
                timing: { timingCoverage: "partial", activeMs: 900_000 },
                recordingExecution: {
                  version: 1,
                  source: "recording_execution_manifest",
                  coverage: "complete",
                  occurrenceCount: 2,
                  occurrences: [
                    {
                      occurrenceId: "occurrence-1",
                      globalOrdinal: 0,
                      completion: { status: "completed", method: "manual" },
                    },
                    {
                      occurrenceId: "occurrence-skipped",
                      globalOrdinal: 1,
                      completion: { status: "skipped", method: "manual" },
                    },
                  ],
                },
              }),
            }),
          ],
        }),
      }),
    );
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
