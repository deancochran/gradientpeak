import {
  ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
  activityFileIngestionOperationSchema,
} from "@repo/core/activity-files";
import {
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  compileActivityPlan,
} from "@repo/core/activity-plan";
import { completedActivitySegmentSetSchema } from "@repo/core/activity-segments";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { recordingGuidanceTimelineSchema } from "@repo/core/recording/guidance";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityPlanCanonicalStructureHash } from "../activity-plans/structure-hash";

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
const reconciliation = vi.hoisted(() => vi.fn());
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
vi.mock("../calendar/reconcile-manual-planned-session-completion", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../calendar/reconcile-manual-planned-session-completion")
  >()),
  reconcileManualPlannedSessionCompletion: reconciliation,
}));

import { recordingSummarySubmissionInputSchema } from "../../contracts/recording-submission";
import { analyzeAcceptedRecordingArtifactStreams } from "../activity-file-ingestion/analyze-parsed-activity-file";
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
function acceptedSegmentSet(input: {
  category: "bike" | "run";
  ranges: readonly {
    id: string;
    startOffsetMs: number;
    endOffsetMs: number;
  }[];
}) {
  return completedActivitySegmentSetSchema.parse({
    version: 1,
    elapsedMs: input.ranges.at(-1)?.endOffsetMs ?? 0,
    segments: input.ranges.map((range, ordinal) => ({
      ...range,
      ordinal,
      role: "activity",
      activity_category: input.category,
      summary: {
        version: 1,
        normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
        timing: {
          timingCoverage: "complete",
          activeMs: range.endOffsetMs - range.startOffsetMs,
          movingMs: range.endOffsetMs - range.startOffsetMs,
        },
      },
    })),
  });
}
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
    compilerVersion: 3,
    planHash: "b".repeat(64),
    occurrences: [
      {
        occurrenceId: "occurrence-1",
        globalOrdinal: 0,
        stepId: null,
        repeatIteration: 0,
        role: "activity",
        activity_category: "run",
        startedAt: "2026-07-24T08:00:00.000Z",
        completedAt: "2026-07-24T09:00:00.000Z",
        activeSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 10000,
        timerEvents: [],
        laps: [],
      },
    ],
  },
  uploadedArtifact: { ingestionId: INGESTION_ID },
  summary: { distanceMeters: 10000 },
});
function activityPlanStructure(activity_category: "bike" | "run", segmentCount = 1) {
  return activityPlanStructureSchema.parse({
    version: 5 as const,
    activity_category,
    items: Array.from({ length: segmentCount }, (_, index) => ({
      type: "step" as const,
      id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: "Step",
      duration: { type: "time" as const, seconds: 600 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    })),
  });
}
const SCHEDULED_SESSION_ID = "33333333-3333-4333-8333-333333333333";
function scheduledFixture(
  recordingSessionId = "scheduled-recording-session",
  structure = activityPlanStructure("run"),
) {
  const structureHash = activityPlanCanonicalStructureHash(structure);
  const source = { kind: "direct" as const, operationId: "scheduled_recording_operation_1234" };
  const prescription = {
    resolutionManifest: {
      resolver_version: "prescription-resolver-v2",
      policy_version: "training-plan-policy-v2",
      training_plan_id: null,
      training_plan_revision: null,
      training_plan_hash: null,
      athlete_context_revision: null,
      activity_plan_id: PLAN_ID,
      activity_plan_revision: 7,
      activity_plan_semantic_hash: activityPlanSemanticHash({
        structure,
        trainingIntent: "aerobic_base",
      }),
      effective_target_duration_minutes: null,
      effective_target_common_load: null,
      evidence_facts: [],
      session_demand: {
        activity_category: "run" as const,
        training_intent: "aerobic_base" as const,
        target_duration_minutes: 30,
        target_common_load: null,
        importance: "normal" as const,
      },
      fallback_level: "system_default_no_context" as const,
      reason_codes: [],
      resolved_structure: structure,
      resolved_structure_hash: structureHash,
      prescription_estimate: {
        duration: { status: "exact" as const, value_seconds: 1800 },
        common_load: { status: "unavailable" as const, value: null },
        rest_seconds: 0,
        has_open_completion: false,
        warnings: [],
        factors: [],
      },
      fingerprint: `v1:sha256:${"b".repeat(64)}`,
    },
    capturedAt: "2026-07-23T08:00:00.000Z",
  };
  const plannedSession = {
    id: SCHEDULED_SESSION_ID,
    sessionRevision: 4,
    source,
    prescription,
  };
  const [occurrence] = compileActivityPlan(structure).occurrences;
  if (!occurrence) throw new Error("Expected prescribed occurrence");
  const scheduledSubmission = recordingSummarySubmissionInputSchema.parse({
    ...submission,
    recordingSessionId,
    activityPlanId: PLAN_ID,
    content_visibility: "private",
    executionManifest: {
      ...submission.executionManifest,
      planHash: structureHash.replace("v1:sha256:", ""),
      occurrences: [
        {
          ...submission.executionManifest.occurrences[0],
          occurrenceId: occurrence.occurrenceId,
          stepId: occurrence.stepId,
          ...(occurrence.repeatId ? { repeatId: occurrence.repeatId } : {}),
          repeatIteration: occurrence.repeatIteration,
          globalOrdinal: occurrence.globalOrdinal,
          completion: { status: "completed", method: "manual" },
        },
      ],
    },
    planExecution: {
      manifestVersion: 2,
      compilerVersion: 3,
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
    activityFileParser.parseActivityFile.mockReturnValue({
      records: [],
      summary: { totalDistance: 0 },
    });
    fitFileParser.safeDecodeFitFile.mockReturnValue({ errors: [], messages: {} });
    activityWriter.submitActivity.mockResolvedValue({ id: "activity-1" });
    plannedSessionRepository.getOwned.mockReset();
    plannedSessionRepository.mutateOwned.mockReset();
    plannedSessionRepositoryFactory.mockReset();
    reconciliation.mockReset();
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
  it("binds one-hertz accepted power efforts to their exact adjacent segment slices", () => {
    const startedAt = new Date(submission.startedAt);
    const firstSegmentId = "44444444-4444-4444-8444-444444444441";
    const secondSegmentId = "44444444-4444-4444-8444-444444444442";
    const segmentSet = acceptedSegmentSet({
      category: "bike",
      ranges: [
        { id: firstSegmentId, startOffsetMs: 0, endOffsetMs: 60000 },
        {
          id: secondSegmentId,
          startOffsetMs: 60000,
          endOffsetMs: 120000,
        },
      ],
    });
    const result = analyzeAcceptedRecordingArtifactStreams({
      activityId: "activity-1",
      profileId: PROFILE_ID,
      startedAt,
      segmentSet,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      records: Array.from({ length: 121 }, (_, seconds) => ({
        timestamp: new Date(startedAt.getTime() + seconds * 1000),
        power: seconds === 60 ? 1000 : 200,
      })),
    });
    expect(result.summary).toMatchObject({ avgPower: 206.66666666666666, maxPower: 1000 });
    expect(result.segmentSet.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstSegmentId,
          summary: expect.objectContaining({ averagePowerWatts: 213.33333333333334 }),
        }),
        expect.objectContaining({
          id: secondSegmentId,
          summary: expect.objectContaining({ averagePowerWatts: 200 }),
        }),
      ]),
    );
    expect(result.efforts.length).toBeGreaterThan(0);
    for (const effort of result.efforts) {
      const segment = segmentSet.segments.find((candidate) => candidate.id === effort.segment_id);
      expect(segment).toBeDefined();
      expect(effort.start_offset_ms).toBeGreaterThanOrEqual(segment?.startOffsetMs ?? 0);
      expect(effort.end_offset_ms).toBeLessThanOrEqual(segment?.endOffsetMs ?? 0);
    }
  });
  it("clips a trailing accepted sample at the segment end and preserves scalar parity", () => {
    const startedAt = new Date(submission.startedAt);
    const result = analyzeAcceptedRecordingArtifactStreams({
      activityId: "activity-1",
      profileId: PROFILE_ID,
      startedAt,
      segmentSet: acceptedSegmentSet({
        category: "bike",
        ranges: [
          { id: "44444444-4444-4444-8444-444444444443", startOffsetMs: 0, endOffsetMs: 5000 },
        ],
      }),
      records: [
        { timestamp: startedAt, power: 100 },
        { timestamp: new Date(startedAt.getTime() + 4000), power: 100 },
        { timestamp: new Date(startedAt.getTime() + 6000), power: 200 },
      ],
    });
    expect(result.summary).toMatchObject({ avgPower: 120, maxPower: 200 });
    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      averagePowerWatts: result.summary.avgPower,
      normalizedPowerResult: {
        diagnostics: { contributingDurationSeconds: 5 },
      },
    });
  });
  it("excludes the exact paused second from normalized power and never produces a bridging effort", () => {
    const startedAt = new Date(submission.startedAt);
    const segmentId = "44444444-4444-4444-8444-444444444445";
    const result = analyzeAcceptedRecordingArtifactStreams({
      activityId: "activity-1",
      profileId: PROFILE_ID,
      startedAt,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      segmentSet: acceptedSegmentSet({
        category: "bike",
        ranges: [{ id: segmentId, startOffsetMs: 0, endOffsetMs: 4000 }],
      }),
      pauseRangesBySegment: new Map([[segmentId, [{ startOffsetMs: 1500, endOffsetMs: 2500 }]]]),
      records: Array.from({ length: 5 }, (_, seconds) => ({
        timestamp: new Date(startedAt.getTime() + seconds * 1000),
        power: 200,
      })),
    });
    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      normalizedPowerResult: {
        diagnostics: {
          contributingDurationSeconds: 3,
          excludedInactiveDurationSeconds: 1,
        },
      },
    });
    expect(
      result.efforts.some((effort) => effort.start_offset_ms < 1500 && effort.end_offset_ms > 2500),
    ).toBe(false);
  });
  it("keeps a 20k one-hertz accepted timeline aggregate-correct", () => {
    const startedAt = new Date(submission.startedAt);
    const result = analyzeAcceptedRecordingArtifactStreams({
      activityId: "activity-1",
      profileId: PROFILE_ID,
      startedAt,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      segmentSet: acceptedSegmentSet({
        category: "bike",
        ranges: [
          { id: "44444444-4444-4444-8444-444444444446", startOffsetMs: 0, endOffsetMs: 20000000 },
        ],
      }),
      records: Array.from({ length: 20001 }, (_, seconds) => ({
        timestamp: new Date(startedAt.getTime() + seconds * 1000),
        power: 200,
      })),
    });
    expect(result.summary).toMatchObject({ avgPower: 200, maxPower: 200 });
    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      averagePowerWatts: 200,
      normalizedPowerResult: { diagnostics: { contributingDurationSeconds: 20000 } },
    });
  });
  it("keeps altitude in the raw artifact policy but makes accepted interval grade metrics unavailable", () => {
    const startedAt = new Date(submission.startedAt);
    const result = analyzeAcceptedRecordingArtifactStreams({
      activityId: "activity-1",
      profileId: PROFILE_ID,
      startedAt,
      segmentSet: acceptedSegmentSet({
        category: "run",
        ranges: [
          { id: "44444444-4444-4444-8444-444444444444", startOffsetMs: 0, endOffsetMs: 2000 },
        ],
      }),
      records: [
        { timestamp: startedAt, speed: 4, altitude: 100 },
        { timestamp: new Date(startedAt.getTime() + 1000), speed: 4, altitude: 110 },
        { timestamp: new Date(startedAt.getTime() + 2000), speed: 4, altitude: 120 },
      ],
    });
    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      normalizedGradedPaceResult: { status: "unavailable", reason: "no_contributing_intervals" },
    });
    expect(result.efforts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ effort_type: "grade_adjusted_speed" })]),
    );
  });
  async function submitScheduledInput(
    authoritative: ReturnType<typeof scheduledFixture>["authoritative"],
    input: ReturnType<typeof recordingSummarySubmissionInputSchema.parse>,
    selectRows?: unknown[][],
  ) {
    const activityId = recordingSessionActivityId(PROFILE_ID, input.recordingSessionId);
    let current = authoritative;
    plannedSessionRepository.getOwned.mockImplementation(async () => current);
    plannedSessionRepository.mutateOwned.mockImplementation(async (mutation) => {
      current = plannedSessionSchema.parse({
        ...current,
        sessionRevision: current.sessionRevision + 1,
        lifecycle: {
          status: "completed",
          completion: { state: "linked", outcome: mutation.outcome, activityId, linkedAt: NOW },
        },
      });
      return { status: "updated", session: current };
    });
    activityWriter.submitActivity.mockImplementation(async (_db, value) => {
      await value.composition?.persist({} as never, { activityId, now: new Date(NOW) });
      return { id: activityId };
    });
    const db = createDb({
      activities: [{ id: activityId, profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(input.recordingSessionId)],
      ...(selectRows ? { selectRows } : {}),
    });
    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: input,
    });
    return activityWriter.submitActivity.mock.calls.at(-1)?.[1];
  }
  it("persists same-category V5 steps as one completed artifact session", async () => {
    const { authoritative, scheduledSubmission, structure } = scheduledFixture(
      "two-v4-blocks-one-session",
      activityPlanStructure("run", 2),
    );
    const start = Date.parse(scheduledSubmission.startedAt);
    const input = recordingSummarySubmissionInputSchema.parse({
      ...scheduledSubmission,
      finishedAt: new Date(start + 20000).toISOString(),
      executionManifest: {
        ...scheduledSubmission.executionManifest,
        occurrences: compileActivityPlan(structure).occurrences.map((occurrence, index) => ({
          ...scheduledSubmission.executionManifest.occurrences[0],
          occurrenceId: occurrence.occurrenceId,
          stepId: occurrence.stepId,
          ...(occurrence.repeatId ? { repeatId: occurrence.repeatId } : {}),
          repeatIteration: occurrence.repeatIteration,
          globalOrdinal: occurrence.globalOrdinal,
          role: occurrence.role,
          activity_category: occurrence.activity_category,
          startedAt: new Date(start + index * 10000).toISOString(),
          completedAt: new Date(start + (index + 1) * 10000).toISOString(),
          activeSeconds: 10,
          movingSeconds: 10,
          distanceMeters: 100,
          completion: { status: "completed", method: "manual" },
        })),
      },
    });
    const written = await submitScheduledInput(authoritative, input);
    expect(activityWriter.submitActivity).toHaveBeenCalledTimes(1);
    expect(written.segmentSet.segments).toMatchObject([
      {
        ordinal: 0,
        role: "activity",
        activity_category: "run",
        startOffsetMs: 0,
        endOffsetMs: 20000,
        summary: {
          recordingExecution: {
            occurrenceCount: 2,
            occurrences: [
              { occurrenceId: compileActivityPlan(structure).occurrences[0]?.occurrenceId },
              { occurrenceId: compileActivityPlan(structure).occurrences[1]?.occurrenceId },
            ],
          },
        },
      },
    ]);
    expect(plannedSessionRepository.mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "full", sessionId: SCHEDULED_SESSION_ID }),
    );
  });
  it("uses accepted artifact streams rather than divergent client summary measurements", async () => {
    const startedAt = new Date(submission.startedAt);
    activityFileParser.parseActivityFile.mockReturnValue({
      records: [
        {
          timestamp: startedAt,
          heartRate: 120,
          power: 100,
          cadence: 80,
          speed: 4,
        },
        {
          timestamp: new Date(startedAt.getTime() + 1000),
          heartRate: 160,
          power: 200,
          cadence: 90,
          speed: 6,
        },
        {
          timestamp: new Date(startedAt.getTime() + 4000),
          heartRate: 180,
          power: 300,
          cadence: 100,
          speed: 8,
        },
      ],
      summary: { totalDistance: 1234 },
    });
    const input = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      summary: { distanceMeters: 99999 },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(input.recordingSessionId)],
    });
    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: input,
    });
    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        distanceMeters: 99999,
        avgHeartRate: 175,
        maxHeartRate: 180,
        avgPower: 275,
        maxPower: 300,
        avgCadence: 97.5,
        maxCadence: 100,
        avgSpeedMps: 7.5,
        maxSpeedMps: 8,
        normalizedSpeedMps: null,
        analysis: expect.objectContaining({ efforts: expect.any(Array) }),
        segmentSet: expect.objectContaining({
          segments: [
            expect.objectContaining({
              summary: expect.objectContaining({
                averagePowerWatts: 275,
                averageCadenceRpm: 97.5,
                averageSpeedMetersPerSecond: 7.5,
              }),
            }),
          ],
        }),
      }),
    );
  });
  it("keeps timing-only accepted artifacts nullable without inventing sensor measurements", async () => {
    activityFileParser.parseActivityFile.mockReturnValue({
      records: [],
      summary: { totalDistance: 12345 },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(submission.recordingSessionId)],
    });
    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission,
    });
    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        distanceMeters: 10000,
        avgHeartRate: null,
        maxHeartRate: null,
        avgPower: null,
        maxPower: null,
        avgCadence: null,
        maxCadence: null,
        avgSpeedMps: null,
        maxSpeedMps: null,
        normalizedSpeedMps: null,
        analysis: expect.objectContaining({ efforts: [], detectedLTHR: null }),
      }),
    );
  });
  it("persists normalized power and eligible accepted-stream efforts without inventing load", async () => {
    const startedAt = new Date(submission.startedAt);
    activityFileParser.parseActivityFile.mockReturnValue({
      records: Array.from({ length: 61 }, (_, seconds) => ({
        timestamp: new Date(startedAt.getTime() + seconds * 1000),
        power: 200,
        heartRate: 150,
      })),
      summary: { totalDistance: 0 },
    });
    const input = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      executionManifest: {
        ...submission.executionManifest,
        occurrences: [
          {
            ...submission.executionManifest.occurrences[0],
            activity_category: "bike",
          },
        ],
      },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(input.recordingSessionId)],
    });
    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: input,
    });
    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        avgPower: 200,
        segmentSet: expect.objectContaining({
          segments: [
            expect.objectContaining({
              summary: expect.objectContaining({
                normalizedPowerResult: expect.objectContaining({
                  status: "partial",
                  valueWatts: 200,
                }),
              }),
            }),
          ],
        }),
        analysis: expect.objectContaining({
          efforts: expect.arrayContaining([
            expect.objectContaining({ effort_type: "power", duration_seconds: 30, value: 200 }),
          ]),
        }),
      }),
    );
  });
  it("excludes sensor samples spanning recorded pause windows from summaries and calculations", async () => {
    const startedAt = new Date(submission.startedAt);
    activityFileParser.parseActivityFile.mockReturnValue({
      records: [0, 1, 2, 3, 4].map((seconds) => ({
        timestamp: new Date(startedAt.getTime() + seconds * 1000),
        heartRate: 100 + seconds * 100,
        power: 100 + seconds * 100,
        cadence: 80 + seconds,
        speed: 4 + seconds,
      })),
      summary: { totalDistance: 0 },
    });
    const input = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      executionManifest: {
        ...submission.executionManifest,
        occurrences: [
          {
            ...submission.executionManifest.occurrences[0],
            timerEvents: [
              { type: "pause", timestamp: new Date(startedAt.getTime() + 1500).toISOString() },
              { type: "resume", timestamp: new Date(startedAt.getTime() + 2500).toISOString() },
            ],
          },
        ],
      },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(input.recordingSessionId)],
    });
    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: input,
    });
    expect(activityWriter.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        avgPower: 350,
        maxPower: 500,
        avgSpeedMps: 6.5,
        maxSpeedMps: 8,
        normalizedSpeedMps: null,
        segmentSet: expect.objectContaining({
          segments: [
            expect.objectContaining({
              summary: expect.objectContaining({
                averagePowerWatts: 350,
                averageSpeedMetersPerSecond: 6.5,
              }),
            }),
          ],
        }),
      }),
    );
  });
  it.each([
    {
      kind: "intensity" as const,
      denied: false,
      outcome: "partial" as const,
      explicitUndefined: false,
    },
    { kind: "route" as const, denied: false, outcome: "full" as const, explicitUndefined: false },
    { kind: "intensity" as const, denied: true, outcome: null, explicitUndefined: false },
    {
      kind: "intensity" as const,
      denied: false,
      outcome: "partial" as const,
      explicitUndefined: true,
    },
  ])("authorizes $kind guidance (denied: $denied, SuperJSON undefined: $explicitUndefined)", async ({
    kind,
    denied,
    outcome,
    explicitUndefined,
  }) => {
    const { authoritative, scheduledSubmission, structure } = scheduledFixture();
    const initial = {
      revision: 0,
      kind: "initial",
      timestamp: scheduledSubmission.startedAt,
      elapsedMs: 0,
      activeMs: 0,
      plan: scheduledSubmission.planExecution,
      routeId: null,
      intensityScale: 1,
      ...(explicitUndefined ? { closedExecution: undefined } : {}),
    };
    const routeId = "00000000-0000-4000-8000-000000000006";
    const guidance = recordingGuidanceTimelineSchema.parse({
      version: 1,
      revisions: [
        initial,
        {
          ...initial,
          revision: 1,
          kind,
          timestamp: new Date(Date.parse(initial.timestamp) + 1000).toISOString(),
          elapsedMs: 1000,
          activeMs: 1000,
          ...(kind === "intensity" ? { intensityScale: 0.9 } : { routeId }),
        },
      ],
    });
    const input = recordingSummarySubmissionInputSchema.parse({
      ...scheduledSubmission,
      guidance,
      ...(kind === "route" ? { routeId } : {}),
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: 3600000,
        activeMs: 3000000,
      },
    });
    uploadFlow.prepareMobileRecordingArtifact.mockResolvedValue({
      status: "processing",
      ingestion: ingestion(input.recordingSessionId),
      staging: {
        bucket: "activity-files",
        path: "fixture.tcx",
        format: "tcx",
        mediaType: "application/vnd.garmin.tcx+xml",
        bytes: new TextEncoder().encode(
          `<GradientPeakExecution>${JSON.stringify({ guidance })}</GradientPeakExecution>`,
        ),
      },
    });
    const planRow = [
      {
        id: PLAN_ID,
        ownerProfileId: OTHER_PROFILE_ID,
        contentVisibility: "public",
        isSystem: false,
        structure,
      },
    ];
    const rows = denied
      ? [[]]
      : kind === "route"
        ? [[{ id: routeId }], planRow, [{ id: routeId }]]
        : [planRow];
    const result = submitScheduledInput(authoritative, input, rows);
    if (denied) {
      await expect(result).rejects.toMatchObject({ code: "forbidden" });
      expect(activityWriter.submitActivity).not.toHaveBeenCalled();
    } else {
      await result;
      expect(plannedSessionRepository.mutateOwned).toHaveBeenCalledWith(
        expect.objectContaining({ outcome, sessionId: SCHEDULED_SESSION_ID }),
      );
    }
  });
  it.each([
    {
      name: "queued legacy mobile completion",
      states: ["legacy", "legacy"],
      outcome: "full",
      legacyPolicy: true,
    },
    {
      name: "legacy mobile skip or early finish with indistinguishable evidence",
      states: ["legacy", "legacy"],
      outcome: "full",
      legacyPolicy: true,
    },
    {
      name: "legacy mobile truncated prescription (historical policy, not proven completion)",
      states: ["legacy"],
      outcome: "full",
      legacyPolicy: true,
    },
    {
      name: "new mobile completed prescription",
      states: ["completed", "completed"],
      outcome: "full",
    },
    { name: "new mobile skipped occurrence", states: ["skipped", "completed"], outcome: "partial" },
    {
      name: "new mobile unfinished final occurrence",
      states: ["completed", "unfinished"],
      outcome: "partial",
    },
    { name: "new mobile wholly unfinished recording", states: ["unfinished"], outcome: "partial" },
    {
      name: "mixed recovered legacy and explicit evidence",
      states: ["legacy", "completed"],
      outcome: "partial",
    },
    {
      name: "unclassified web timer evidence",
      states: ["legacy", "legacy"],
      outcome: "partial",
      manualTimer: true,
    },
  ] as const)("applies the compatibility/evidence policy for $name", async (scenario) => {
    const { authoritative, scheduledSubmission, structure } = scheduledFixture(
      `compatibility-${scenario.name}`,
      activityPlanStructure("run", 2),
    );
    const prescribed = compileActivityPlan(structure).occurrences;
    const start = Date.parse(scheduledSubmission.startedAt);
    const raw = {
      ...scheduledSubmission,
      finishedAt: new Date(start + scenario.states.length * 10000).toISOString(),
      ...("manualTimer" in scenario
        ? {
            sessionTiming: {
              source: "manual_timer",
              coverage: "partial",
              elapsedMs: scenario.states.length * 10000,
              activeMs: scenario.states.length * 8000,
            },
          }
        : {}),
      executionManifest: {
        ...scheduledSubmission.executionManifest,
        occurrences: scenario.states.map((state, index) => {
          if (index === null) throw new Error("Unexpected unprescribed occurrence");
          const occurrence = prescribed[index];
          if (!occurrence) throw new Error("Expected prescribed occurrence");
          const startedAt = new Date(start + index * 10000).toISOString();
          const completedAt = new Date(start + (index + 1) * 10000).toISOString();
          return {
            occurrenceId: occurrence.occurrenceId,
            stepId: occurrence.stepId,
            ...(occurrence.repeatId ? { repeatId: occurrence.repeatId } : {}),
            repeatIteration: occurrence.repeatIteration,
            globalOrdinal: occurrence.globalOrdinal,
            role: occurrence.role,
            activity_category: occurrence.activity_category,
            startedAt,
            completedAt,
            activeSeconds: 8,
            movingSeconds: 8,
            distanceMeters: 100,
            ...(state === "legacy"
              ? {}
              : {
                  completion: state === "unfinished" ? null : { status: state, method: "manual" },
                }),
            timerEvents: [],
            laps: [
              {
                lapNumber: 1,
                startedAt,
                endedAt: completedAt,
                activeSeconds: 8,
                distanceMeters: 100,
              },
            ],
          };
        }),
      },
    };
    // Queue serialization must neither add completion claims to old artifacts nor lose explicit null.
    const input = recordingSummarySubmissionInputSchema.parse(JSON.parse(JSON.stringify(raw)));
    const manifestBefore = structuredClone(input.executionManifest);
    const written = await submitScheduledInput(authoritative, input);
    expect(plannedSessionRepository.mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: scenario.outcome }),
    );
    expect(input.executionManifest).toEqual(manifestBefore);
    if ("legacyPolicy" in scenario) {
      expect(
        input.executionManifest.occurrences.every((entry) => !Object.hasOwn(entry, "completion")),
      ).toBe(true);
      expect(
        written.segmentSet.segments.every(
          (segment: {
            summary: {
              recordingExecution?: unknown;
            };
          }) => segment.summary.recordingExecution === undefined,
        ),
      ).toBe(true);
    }
  });
  it.each([
    {
      name: "first instantaneous skip",
      observations: [
        [0, 0, 0, "skipped"],
        [1, 0, 10, "completed"],
        [2, 10, 20, "completed"],
      ],
      finish: 20,
      outcome: "partial",
      skipped: 0,
    },
    {
      name: "middle instantaneous skip",
      observations: [
        [0, 0, 10, "completed"],
        [1, 10, 10, "skipped"],
        [2, 10, 20, "completed"],
      ],
      finish: 20,
      outcome: "partial",
      skipped: 1,
    },
    {
      name: "final instantaneous skip",
      observations: [
        [0, 0, 10, "completed"],
        [1, 10, 20, "completed"],
        [2, 20, 20, "skipped"],
      ],
      finish: 20,
      outcome: "partial",
      skipped: 2,
    },
    {
      name: "all steps skipped before actual recording",
      observations: [
        [0, 0, 0, "skipped"],
        [1, 0, 0, "skipped"],
        [2, 0, 0, "skipped"],
        [0, 0, 5, null],
      ],
      finish: 5,
      outcome: "partial",
      skipped: 0,
    },
    {
      name: "all completed and continued",
      observations: [
        [0, 0, 10, "completed"],
        [1, 10, 20, "completed"],
        [2, 20, 30, "completed"],
      ],
      finish: 30,
      outcome: "full",
    },
    {
      name: "unfinished final occurrence",
      observations: [
        [0, 0, 10, "completed"],
        [1, 10, 20, "completed"],
        [2, 20, 25, null],
      ],
      finish: 25,
      outcome: "partial",
    },
    {
      name: "revisit after completion",
      observations: [
        [0, 0, 10, "completed"],
        [1, 10, 20, "completed"],
        [2, 20, 30, null],
        [2, 30, 35, null],
        [2, 35, 40, null],
      ],
      finish: 40,
      outcome: "partial",
    },
    {
      name: "complete a previously skipped occurrence",
      observations: [
        [1, 0, 5, null],
        [0, 5, 10, "completed"],
        [1, 10, 20, "completed"],
        [2, 20, 30, "completed"],
      ],
      finish: 30,
      outcome: "full",
    },
  ] as const)("saves manifest evidence for $name with the correct calendar outcome", async (scenario) => {
    const { authoritative, scheduledSubmission, structure } = scheduledFixture(
      `web-${scenario.name}`,
      activityPlanStructure("run", 3),
    );
    const start = Date.parse(submission.startedAt);
    const prescribed = compileActivityPlan(structure).occurrences;
    const input = recordingSummarySubmissionInputSchema.parse({
      ...scheduledSubmission,
      finishedAt: new Date(start + scenario.finish * 1000).toISOString(),
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: scenario.finish * 1000,
        activeMs: scenario.finish * 1000,
      },
      executionManifest: {
        ...scheduledSubmission.executionManifest,
        occurrences: scenario.observations.map(([index, from, to, status], globalOrdinal) => {
          if (index === null) throw new Error("Unexpected unprescribed occurrence");
          const occurrence = prescribed[index];
          if (!occurrence) throw new Error("Expected prescribed occurrence");
          return {
            occurrenceId: occurrence.occurrenceId,
            stepId: occurrence.stepId,
            ...(occurrence.repeatId ? { repeatId: occurrence.repeatId } : {}),
            repeatIteration: occurrence.repeatIteration,
            globalOrdinal,
            role: "activity",
            activity_category: "run",
            startedAt: new Date(start + from * 1000).toISOString(),
            completedAt: new Date(start + to * 1000).toISOString(),
            activeSeconds: to - from,
            movingSeconds: 0,
            distanceMeters: 0,
            ...(status ? { completion: { status, method: "manual" } } : {}),
            timingEvidence: {
              source: "manual_timer",
              coverage: "partial",
              startOffsetMs: from * 1000,
              endOffsetMs: to * 1000,
            },
            timerEvents: [],
            laps: [],
          };
        }),
      },
    });
    const originalManifest = structuredClone(input.executionManifest);
    const written = await submitScheduledInput(authoritative, input);
    expect(plannedSessionRepository.mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "link_completion",
        profileId: PROFILE_ID,
        sessionId: SCHEDULED_SESSION_ID,
        expectedRevision: authoritative.sessionRevision,
        outcome: scenario.outcome,
      }),
    );
    expect(written.activeMs).toBeNull();
    expect(written.movingMs).toBeNull();
    expect(written.timingCoverage).toBe("partial");
    expect(
      written.segmentSet.segments.reduce(
        (
          sum: number,
          segment: {
            summary: {
              timing: {
                activeMs: number;
              };
            };
          },
        ) => sum + segment.summary.timing.activeMs,
        0,
      ),
    ).toBe(scenario.finish * 1000);
    expect(
      written.segmentSet.segments.reduce(
        (
          sum: number,
          segment: {
            startOffsetMs: number;
            endOffsetMs: number;
          },
        ) => sum + segment.endOffsetMs - segment.startOffsetMs,
        0,
      ),
    ).toBe(scenario.finish * 1000);
    expect(input.executionManifest).toEqual(originalManifest);
    written.segmentSet.segments.forEach(
      (
        segment: {
          startOffsetMs: number;
          endOffsetMs: number;
          ordinal: number;
        },
        index: number,
      ) => {
        expect(segment.endOffsetMs).toBeGreaterThan(segment.startOffsetMs);
        expect(segment.ordinal).toBe(index);
        if (index)
          expect(segment.startOffsetMs).toBe(written.segmentSet.segments[index - 1].endOffsetMs);
      },
    );
    if ("skipped" in scenario && scenario.skipped !== undefined) {
      const skipped = compileActivityPlan(structure).occurrences[scenario.skipped];
      expect(
        input.executionManifest.occurrences.find(
          (entry) => entry.occurrenceId === skipped?.occurrenceId,
        ),
      ).toMatchObject({ activeSeconds: 0, completion: { status: "skipped" } });
    }
  });
  it.each([
    ["skipped", "partial"],
    ["unfinished", "partial"],
    ["completed", "full"],
  ] as const)("uses the latest %s outcome of a revisited occurrence", async (latest, expected) => {
    const { authoritative, scheduledSubmission } = scheduledFixture(`latest-${latest}`);
    const first = scheduledSubmission.executionManifest.occurrences[0];
    if (!first) throw new Error("Expected occurrence");
    const input = recordingSummarySubmissionInputSchema.parse({
      ...scheduledSubmission,
      executionManifest: {
        ...scheduledSubmission.executionManifest,
        occurrences: [
          {
            ...first,
            completedAt: "2026-07-24T08:30:00.000Z",
            activeSeconds: 1800,
            movingSeconds: 1700,
          },
          {
            ...first,
            globalOrdinal: 1,
            startedAt: "2026-07-24T08:30:00.000Z",
            activeSeconds: 1800,
            movingSeconds: 1700,
            completion: latest === "unfinished" ? undefined : { status: latest, method: "manual" },
          },
        ],
      },
    });
    await submitScheduledInput(authoritative, input);
    expect(plannedSessionRepository.mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: expected }),
    );
  });
  it("passes partial evidence into replacement of an earlier full manual calendar completion", async () => {
    const { authoritative, scheduledSubmission } = scheduledFixture("replace-full-with-partial");
    const activityId = recordingSessionActivityId(
      PROFILE_ID,
      scheduledSubmission.recordingSessionId,
    );
    let current = plannedSessionSchema.parse({
      ...authoritative,
      sessionRevision: 5,
      lifecycle: {
        status: "completed",
        completion: {
          state: "linked",
          activityId: "99999999-9999-4999-8999-999999999999",
          outcome: "full",
          linkedAt: NOW,
        },
      },
    });
    plannedSessionRepository.getOwned.mockImplementation(async () => current);
    reconciliation.mockImplementation(async (input) => {
      current = plannedSessionSchema.parse({
        ...current,
        sessionRevision: 6,
        lifecycle: {
          status: "completed",
          completion: { state: "linked", activityId, outcome: input.outcome, linkedAt: NOW },
        },
      });
      return { outcome: "updated", session: current };
    });
    activityWriter.submitActivity.mockImplementation(async (_db, input) => {
      await input.composition.persist({} as never, { activityId, now: new Date(NOW) });
      return { id: activityId };
    });
    const input = recordingSummarySubmissionInputSchema.parse({
      ...scheduledSubmission,
      executionManifest: {
        ...scheduledSubmission.executionManifest,
        occurrences: scheduledSubmission.executionManifest.occurrences.map((entry) => ({
          ...entry,
          completion: null,
        })),
      },
    });
    const db = createDb({
      activities: [{ id: activityId, profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(input.recordingSessionId)],
    });
    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: input,
    });
    expect(reconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        sessionId: SCHEDULED_SESSION_ID,
        activityId,
        expectedRevision: 5,
        outcome: "partial",
      }),
    );
    expect(plannedSessionRepository.mutateOwned).not.toHaveBeenCalled();
  });
  it("preserves adjacent recorded rest intervals when the activity between them was skipped instantaneously", async () => {
    const base = submission.executionManifest.occurrences[0];
    const entries = [
      { role: "activity", start: 0, end: 10 },
      { role: "rest", start: 10, end: 15 },
      { role: "activity", start: 15, end: 15 },
      { role: "rest", start: 15, end: 20 },
      { role: "activity", start: 20, end: 30 },
    ];
    const input = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      finishedAt: "2026-07-24T08:00:30.000Z",
      executionManifest: {
        ...submission.executionManifest,
        occurrences: entries.map((entry, index) => ({
          ...base,
          role: entry.role,
          activity_category: entry.role === "rest" ? null : "run",
          occurrenceId: `occurrence-${index}`,
          globalOrdinal: index,
          stepId: null,
          repeatIteration: 0,
          startedAt: new Date(Date.parse(submission.startedAt) + entry.start * 1000).toISOString(),
          completedAt: new Date(Date.parse(submission.startedAt) + entry.end * 1000).toISOString(),
          activeSeconds: entry.end - entry.start,
          movingSeconds: 0,
          distanceMeters: 0,
          completion: { status: index === 2 ? "skipped" : "completed", method: "manual" },
        })),
      },
    });
    const db = createDb({
      activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
      ingestions: [undefined, acceptedIngestion(input.recordingSessionId)],
    });
    await submitMobileRecording(db as never, {} as never, {
      actorProfileId: PROFILE_ID,
      submission: input,
    });
    const written = activityWriter.submitActivity.mock.calls.at(-1)?.[1];
    expect(written.segmentSet.segments).toMatchObject([
      { role: "activity", startOffsetMs: 0, endOffsetMs: 10000 },
      {
        role: "rest",
        startOffsetMs: 10000,
        endOffsetMs: 20000,
        summary: {
          recordingExecution: {
            occurrences: [{ occurrenceId: "occurrence-1" }, { occurrenceId: "occurrence-3" }],
          },
        },
      },
      { role: "activity", startOffsetMs: 20000, endOffsetMs: 30000 },
    ]);
  });
  it("rejects contradictory work in a zero-length group instead of dropping it", async () => {
    const first = submission.executionManifest.occurrences[0];
    const input = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      executionManifest: {
        ...submission.executionManifest,
        occurrences: [
          {
            ...first,
            completedAt: submission.startedAt,
            activeSeconds: 1,
            movingSeconds: 0,
            distanceMeters: 0,
            completion: { status: "skipped", method: "manual" },
          },
          {
            ...first,
            globalOrdinal: 1,
            occurrenceId: "recorded-work",
            stepId: null,
            repeatIteration: 0,
          },
        ],
      },
    });
    const db = createDb({ activities: [], ingestions: [undefined] });
    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: input,
      }),
    ).rejects.toMatchObject({ code: "manifest_invalid" });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
    expect(uploadFlow.prepareMobileRecordingArtifact).not.toHaveBeenCalled();
  });
  it("rejects forged and mutated V3 prescription hashes before artifact storage", async () => {
    const { scheduledSubmission, structure } = scheduledFixture("forged-prescription-session");
    const execution = scheduledSubmission.planExecution;
    const plannedSession = execution?.plannedSession;
    if (!execution || !plannedSession) throw new Error("Expected scheduled execution fixture");
    const forgedHash = `v1:sha256:${"f".repeat(64)}`;
    const forged = recordingSummarySubmissionInputSchema.safeParse({
      ...scheduledSubmission,
      planExecution: {
        ...execution,
        structureHash: forgedHash,
        plannedSession: {
          ...plannedSession,
          prescription: {
            ...plannedSession.prescription,
            resolutionManifest: {
              ...plannedSession.prescription.resolutionManifest,
              resolved_structure_hash: forgedHash,
            },
          },
        },
      },
    });
    const mutated = {
      ...structure,
      items: structure.items.map((item, index) =>
        index === 0 && item.type === "step" ? { ...item, name: "Mutated after capture" } : item,
      ),
    };
    const mutatedSubmission = recordingSummarySubmissionInputSchema.safeParse({
      ...scheduledSubmission,
      planExecution: {
        ...execution,
        structure: mutated,
        plannedSession: {
          ...plannedSession,
          prescription: {
            ...plannedSession.prescription,
            resolutionManifest: {
              ...plannedSession.prescription.resolutionManifest,
              resolved_structure: mutated,
            },
          },
        },
      },
    });
    expect(forged.success).toBe(false);
    expect(mutatedSubmission.success).toBe(false);
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
            structure,
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
  it("rejects wrong scheduled source identity and leaves acceptance to the transaction rollback", async () => {
    const { authoritative, scheduledSubmission, structure } = scheduledFixture(
      "wrong-provenance-session",
    );
    plannedSessionRepository.getOwned.mockResolvedValue({
      ...authoritative,
      source: { kind: "direct", operationId: "different-scheduled-recording-operation" },
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
            structure,
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
  it("accepts execution captured before the referenced plan was edited", async () => {
    const { authoritative, scheduledSubmission } = scheduledFixture("plan-edited-after-start");
    const prescription = authoritative.prescription;
    if (!prescription)
      throw new Error("Scheduled test fixture requires compatibility prescription");
    const editedAuthoritative = plannedSessionSchema.parse({
      ...authoritative,
      prescription: {
        ...prescription,
        resolutionManifest: {
          ...prescription.resolutionManifest,
          activity_plan_revision: 8,
          resolved_structure: activityPlanStructure("run", 2),
          resolved_structure_hash: activityPlanCanonicalStructureHash(
            activityPlanStructure("run", 2),
          ),
        },
      },
    });
    await submitScheduledInput(editedAuthoritative, scheduledSubmission);
    expect(plannedSessionRepository.mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SCHEDULED_SESSION_ID, expectedRevision: 4 }),
    );
  });
  it("fails closed when the submitted planned session is not owned by the recording actor", async () => {
    const { scheduledSubmission } = scheduledFixture("wrong-owner-session");
    plannedSessionRepository.getOwned.mockResolvedValue(null);
    const db = createDb({ activities: [], ingestions: [undefined] });
    await expect(
      submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: scheduledSubmission,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(activityWriter.submitActivity).not.toHaveBeenCalled();
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
  it.each([
    { label: "owned", contentVisibility: "private", isSystem: false, ownerProfileId: PROFILE_ID },
    {
      label: "public",
      contentVisibility: "public",
      isSystem: false,
      ownerProfileId: OTHER_PROFILE_ID,
    },
    { label: "system", contentVisibility: "public", isSystem: true, ownerProfileId: null },
  ])("attaches an accessible $label plan to a new recording", async (planAccess) => {
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
            ...planAccess,
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
              version: 3,
              segments: activityPlanStructure("bike", 2).items.map((item, index) => ({
                ...item,
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
        elapsedMs: 1200000,
        activeMs: 900000,
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
              endOffsetMs: 1200000,
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
              startOffsetMs: 1200000,
              endOffsetMs: 1200000,
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
          elapsedMs: 1200000,
          segments: [
            expect.objectContaining({
              startOffsetMs: 0,
              endOffsetMs: 1200000,
              summary: expect.objectContaining({
                timing: { timingCoverage: "partial", activeMs: 900000 },
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
  it("preserves partial occurrence timing and completion coverage at the activity boundary", async () => {
    const recordingSessionId = "partial-final-occurrence";
    const base = submission.executionManifest.occurrences[0];
    const manualSubmission = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      recordingSessionId,
      finishedAt: "2026-07-24T08:00:40.000Z",
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: 40000,
        activeMs: 30000,
      },
      executionManifest: {
        ...submission.executionManifest,
        occurrences: [
          {
            ...base,
            completedAt: "2026-07-24T08:00:10.000Z",
            activeSeconds: 10,
            movingSeconds: 0,
            completion: { status: "completed", method: "manual" },
            timingEvidence: {
              source: "manual_timer",
              coverage: "partial",
              startOffsetMs: 0,
              endOffsetMs: 10000,
            },
          },
          {
            ...base,
            occurrenceId: "unfinished-final",
            globalOrdinal: 1,
            startedAt: "2026-07-24T08:00:10.000Z",
            completedAt: "2026-07-24T08:00:40.000Z",
            activeSeconds: 20,
            movingSeconds: 0,
            timingEvidence: {
              source: "manual_timer",
              coverage: "partial",
              startOffsetMs: 10000,
              endOffsetMs: 40000,
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
        elapsedMs: 40000,
        activeMs: null,
        movingMs: null,
        timingCoverage: "partial",
        segmentSet: expect.objectContaining({
          segments: [
            expect.objectContaining({
              startOffsetMs: 0,
              endOffsetMs: 40000,
              summary: expect.objectContaining({
                timing: { timingCoverage: "partial", activeMs: 30000 },
                recordingExecution: expect.objectContaining({
                  coverage: "partial",
                  occurrenceCount: 2,
                  occurrences: [
                    expect.objectContaining({
                      occurrenceId: "occurrence-1",
                      completion: { status: "completed", method: "manual" },
                    }),
                  ],
                }),
              }),
            }),
          ],
        }),
      }),
    );
  });
  it("keeps same-category block revisits as occurrence evidence in one source segment", async () => {
    const recordingSessionId = "segment-revisit";
    const base = submission.executionManifest.occurrences[0];
    const occurrenceIds = ["occurrence-1", "occurrence-2", "occurrence-1"];
    const manualSubmission = recordingSummarySubmissionInputSchema.parse({
      ...submission,
      recordingSessionId,
      finishedAt: "2026-07-24T08:00:30.000Z",
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: 30000,
        activeMs: 30000,
      },
      executionManifest: {
        ...submission.executionManifest,
        occurrences: occurrenceIds.map((occurrenceId, index) => ({
          ...base,
          stepId: null,
          repeatIteration: 0,
          occurrenceId,
          globalOrdinal: index,
          startedAt: new Date(Date.parse(submission.startedAt) + index * 10000).toISOString(),
          completedAt: new Date(
            Date.parse(submission.startedAt) + (index + 1) * 10000,
          ).toISOString(),
          activeSeconds: 10,
          movingSeconds: 0,
          ...(index === 2 ? { completion: { status: "completed", method: "manual" } } : {}),
          timingEvidence: {
            source: "manual_timer",
            coverage: "partial",
            startOffsetMs: index * 10000,
            endOffsetMs: (index + 1) * 10000,
          },
        })),
      },
    });
    const savedSets: unknown[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const db = createDb({
        activities: [{ id: "activity-1", profile_id: PROFILE_ID }],
        ingestions: [undefined, acceptedIngestion(recordingSessionId)],
      });
      await submitMobileRecording(db as never, {} as never, {
        actorProfileId: PROFILE_ID,
        submission: manualSubmission,
      });
      const written = activityWriter.submitActivity.mock.calls.at(-1)?.[1];
      expect(written).toMatchObject({
        activeMs: null,
        movingMs: null,
        segmentSet: {
          segments: [
            {
              ordinal: 0,
              startOffsetMs: 0,
              endOffsetMs: 30000,
              summary: {
                timing: { activeMs: 30000 },
                recordingExecution: {
                  occurrenceCount: 3,
                  occurrences: [{ occurrenceId: "occurrence-1", globalOrdinal: 2 }],
                },
              },
            },
          ],
        },
      });
      expect(written.segmentSet.segments).toHaveLength(1);
      expect(written.segmentSet.segments[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
      savedSets.push(written.segmentSet);
    }
    expect(savedSets[0]).toEqual(savedSets[1]);
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
      summary: { distanceMeters: 10000 },
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
      summary: { distanceMeters: 10000 },
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
