import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { PLAYBACK_EXECUTION, SIMULATION_EXECUTION } from "@repo/core/recording/execution-evidence";
import { describe, expect, it } from "vitest";
import { createResolutionManifestFixture } from "../test/builders/planned-session";
import {
  beginMobileRecordingUploadInputSchema,
  recordingSummarySubmissionInputSchema,
} from "./recording-submission";

const acceptedArtifact = {
  sha256: "a".repeat(64),
  byteSize: 123,
  bucket: "activity-files",
  path: `artifacts/sha256/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}`,
  mediaType: "application/vnd.ant.fit",
  format: "fit" as const,
};
const baseSubmission = {
  profileId: "11111111-1111-4111-8111-111111111111",
  recordingSessionId: "session-1",
  name: "Morning run",
  startedAt: "2026-07-24T08:00:00.000Z",
  finishedAt: "2026-07-24T09:00:00.000Z",
  executionManifest: {
    version: 1 as const,
    compilerVersion: 3 as const,
    planHash: "b".repeat(64),
    occurrences: [
      {
        occurrenceId: "occurrence-1",
        globalOrdinal: 0,
        stepId: null,
        repeatIteration: 0,
        role: "activity" as const,
        activity_category: "run" as const,
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
  summary: { distanceMeters: 10000 },
};
const prescribedStructure = activityPlanStructureSchema.parse({
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step",
      id: "66666666-6666-4666-8666-666666666666",
      name: "Steady",
      duration: { type: "time" as const, seconds: 600 },
      targets: [{ type: "RPE" as const, intensity: 7 }],
    },
  ],
});
const plannedSessionPrescription = {
  resolutionManifest: createResolutionManifestFixture({
    activityPlanId: "77777777-7777-4777-8777-777777777777",
    activityPlanRevision: 3,
    structure: prescribedStructure,
    demand: {
      activity_category: "run",
      training_intent: "general_maintenance",
      target_duration_minutes: 10,
      target_common_load: null,
      importance: "normal",
    },
  }),
  capturedAt: "2026-07-23T08:00:00.000Z",
};
const planExecution = {
  manifestVersion: 2 as const,
  compilerVersion: 3 as const,
  activityPlanId: "77777777-7777-4777-8777-777777777777",
  scheduledEventId: "88888888-8888-4888-8888-888888888888",
  name: "Hard",
  description: null,
  activityPlanRevision: 3,
  structureHash: plannedSessionPrescription.resolutionManifest.resolved_structure_hash,
  structure: prescribedStructure,
  plannedSession: {
    id: "99999999-9999-4999-8999-999999999999",
    sessionRevision: 5,
    source: { kind: "direct" as const, operationId: "api-recording-contract-test-operation" },
    prescription: plannedSessionPrescription,
  },
  personalizationEnabled: false,
  targetPresentations: [],
};
describe("recording submission contract", () => {
  it.each([
    SIMULATION_EXECUTION,
    PLAYBACK_EXECUTION,
  ])("rejects explicit $mode evidence at upload and submission boundaries", (execution) => {
    const upload = {
      recordingSessionId: "session-1",
      byteSize: 123,
      sha256: "a".repeat(64),
      format: "tcx",
    };
    expect(beginMobileRecordingUploadInputSchema.safeParse({ ...upload, execution }).success).toBe(
      false,
    );
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
        execution,
      }).success,
    ).toBe(false);
    expect(beginMobileRecordingUploadInputSchema.safeParse(upload).success).toBe(true);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
      }).success,
    ).toBe(true);
    expect(
      beginMobileRecordingUploadInputSchema.safeParse({
        ...upload,
        execution: { mode: "recording", evidence: "real" },
      }).success,
    ).toBe(true);
  });
  it("requires an explicit, session-bound uploaded artifact claim", () => {
    const parsed = recordingSummarySubmissionInputSchema.parse({
      ...baseSubmission,
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(parsed).toMatchObject({
      source: "mobile_recording",
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(parsed.recordingSessionId).toBe("session-1");
  });
  it("accepts only the server-owned ingestion identifier for a staged upload", () => {
    const parsed = recordingSummarySubmissionInputSchema.parse({
      ...baseSubmission,
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(parsed).toMatchObject({
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(parsed).not.toHaveProperty("stagingPath");
  });
  it("accepts exact scheduled execution provenance and binds it to the submitted plan", () => {
    const parsed = recordingSummarySubmissionInputSchema.parse({
      ...baseSubmission,
      activityPlanId: planExecution.activityPlanId,
      planExecution,
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(parsed.planExecution?.plannedSession).toEqual(planExecution.plannedSession);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        activityPlanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        planExecution,
        uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
      }).success,
    ).toBe(false);
  });
  it("accepts bounded manual laps only with honest partial timer timing", () => {
    const parsed = recordingSummarySubmissionInputSchema.parse({
      ...baseSubmission,
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: 3600000,
        activeMs: 3000000,
      },
      laps: [{ lapNumber: 1, durationSeconds: 600, timingSource: "manual_timer" }],
    });
    expect(parsed.sessionTiming).toEqual({
      source: "manual_timer",
      coverage: "partial",
      elapsedMs: 3600000,
      activeMs: 3000000,
    });
    expect(parsed.laps).toHaveLength(1);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
        sessionTiming: {
          source: "manual_timer",
          coverage: "partial",
          elapsedMs: 1000,
          activeMs: 2000,
        },
      }).success,
    ).toBe(false);
  });
  it("rejects missing, ambiguous, and client-path artifact sources", () => {
    expect(recordingSummarySubmissionInputSchema.safeParse(baseSubmission).success).toBe(false);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...Object.fromEntries(
          Object.entries(baseSubmission).filter(([key]) => key !== "recordingSessionId"),
        ),
        uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
      }).success,
    ).toBe(false);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        acceptedArtifact: { ...acceptedArtifact, path: "activities/profile/uploads/legacy.fit" },
      }).success,
    ).toBe(false);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        acceptedArtifact,
        uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
      }).success,
    ).toBe(false);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        uploadedArtifact: {
          ingestionId: "33333333-3333-4333-8333-333333333333",
          stagingPath: "attacker-controlled.fit",
        },
      }).success,
    ).toBe(false);
  });
  it("binds begin-upload requests to a bounded digest, size, and format", () => {
    expect(
      beginMobileRecordingUploadInputSchema.parse({
        recordingSessionId: "session-1",
        byteSize: 123,
        sha256: "a".repeat(64),
        format: "fit",
      }),
    ).toEqual({
      recordingSessionId: "session-1",
      byteSize: 123,
      sha256: "a".repeat(64),
      format: "fit",
    });
    expect(
      beginMobileRecordingUploadInputSchema.safeParse({
        recordingSessionId: "session-1",
        byteSize: 50 * 1024 * 1024 + 1,
        sha256: "A".repeat(64),
        format: "zip",
      }).success,
    ).toBe(false);
    expect(
      beginMobileRecordingUploadInputSchema.safeParse({
        recordingSessionId: "session-1",
        byteSize: 123,
        sha256: "a".repeat(64),
        format: "fit",
        remoteFilePath: "activities/profile/uploads/legacy.fit",
      }).success,
    ).toBe(false);
  });
});
