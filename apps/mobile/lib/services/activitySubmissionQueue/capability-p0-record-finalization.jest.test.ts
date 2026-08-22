import { afterEach, describe, expect, it } from "@jest/globals";
import { loadActivitySubmissionQueueJobs, setActivitySubmissionQueueJobsForTests } from "./storage";

describe("record finalization queue outcomes", () => {
  afterEach(() => {
    setActivitySubmissionQueueJobsForTests();
  });

  it("keeps a failed finalized submission retryable without losing its local evidence", async () => {
    setActivitySubmissionQueueJobsForTests(
      new Map([
        [
          "session-1",
          {
            schemaVersion: 3,
            id: "session-1",
            artifactId: "session-1",
            sessionId: "session-1",
            localActivityFilePath: "file:///activity.fit",
            streamArtifactPaths: [],
            executionManifest: {
              version: 1,
              compilerVersion: 1,
              planHash: "0".repeat(64),
              occurrences: [],
            },
            draft: {
              recordingSessionId: "session-1",
              profileId: "profile-1",
              startedAt: "2026-01-01T10:00:00.000Z",
              finishedAt: "2026-01-01T11:00:00.000Z",
              name: "Morning ride",
              activity_category: "bike",
              durationSeconds: 3600,
              movingSeconds: 3500,
              distanceMeters: 25000,
            },
            status: "failed",
            attempts: 1,
            retryClass: "transient",
            lastError: "network unavailable",
            createdAt: "2026-01-01T11:00:00.000Z",
            updatedAt: "2026-01-01T11:00:00.000Z",
          },
        ],
      ]),
    );

    await expect(loadActivitySubmissionQueueJobs()).resolves.toMatchObject([
      {
        id: "session-1",
        status: "failed",
        retryClass: "transient",
        localActivityFilePath: "file:///activity.fit",
      },
    ]);
  });
});
