import { describe, expect, it } from "vitest";
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
    compilerVersion: 1,
    planHash: "b".repeat(64),
    occurrences: [
      {
        occurrenceId: "occurrence-1",
        globalOrdinal: 0,
        segmentId: "22222222-2222-4222-8222-222222222222",
        role: "activity" as const,
        activity_category: "run" as const,
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
  summary: { distanceMeters: 10_000 },
};

describe("recording submission contract", () => {
  it("requires an explicit, session-bound accepted artifact", () => {
    const parsed = recordingSummarySubmissionInputSchema.parse({
      ...baseSubmission,
      artifactSource: "acceptedArtifact",
      acceptedArtifact,
    });
    expect(parsed).toMatchObject({
      artifactSource: "acceptedArtifact",
      source: "mobile_recording",
      acceptedArtifact,
    });
    expect(parsed.recordingSessionId).toBe("session-1");
  });

  it("accepts only the server-owned ingestion identifier for a staged upload", () => {
    const parsed = recordingSummarySubmissionInputSchema.parse({
      ...baseSubmission,
      artifactSource: "uploadedArtifact",
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(parsed).toMatchObject({
      artifactSource: "uploadedArtifact",
      uploadedArtifact: { ingestionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(parsed).not.toHaveProperty("stagingPath");
  });

  it("rejects missing, ambiguous, and client-path artifact sources", () => {
    expect(recordingSummarySubmissionInputSchema.safeParse(baseSubmission).success).toBe(false);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...Object.fromEntries(
          Object.entries(baseSubmission).filter(([key]) => key !== "recordingSessionId"),
        ),
        artifactSource: "acceptedArtifact",
        acceptedArtifact,
      }).success,
    ).toBe(false);
    expect(
      recordingSummarySubmissionInputSchema.safeParse({
        ...baseSubmission,
        artifactSource: "acceptedArtifact",
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
