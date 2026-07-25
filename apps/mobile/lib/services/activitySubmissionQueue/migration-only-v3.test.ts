import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY,
  LEGACY_PENDING_FINALIZED_ARTIFACT_KEY,
  migrateSingleSportLocalStateToV3Once,
} from "./migration-only-v3";
import { setActivitySubmissionQueueJobsForTests } from "./storage";

const storage = new Map<string, string>();
const files = new Map<string, { byteSize: number; sha256: string }>();
const metadataFailures = new Map<string, number>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn(async (key: string) => storage.delete(key)),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => {
        storage.delete(key);
      });
    }),
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
vi.mock("expo-file-system", () => ({
  Paths: { document: "file:///documents/" },
  Directory: class {
    uri: string;
    exists = true;
    constructor(...parts: Array<{ uri?: string } | string>) {
      this.uri = parts.map((part) => (typeof part === "string" ? part : part.uri)).join("");
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(...parts: Array<{ uri?: string } | string>) {
      this.uri = parts.map((part) => (typeof part === "string" ? part : part.uri)).join("");
    }
    get exists() {
      return files.has(this.uri);
    }
    copy(destination: { uri: string }) {
      const metadata = files.get(this.uri);
      if (!metadata) throw new Error("missing");
      files.set(destination.uri, metadata);
    }
  },
}));
vi.mock("./localArtifact", () => ({
  getLocalActivityArtifactMetadata: async (path: string) => {
    const failures = metadataFailures.get(path) ?? 0;
    if (failures) {
      metadataFailures.set(path, failures - 1);
      throw new Error("interrupted verification");
    }
    const metadata = files.get(path);
    if (!metadata) throw new Error("missing");
    return metadata;
  },
}));
vi.mock("../ActivityRecorder/recordingEvidenceJournal", () => ({
  withRecordingEvidenceTransaction: async (
    task: (tx: { runAsync: () => Promise<{ changes: number }> }) => unknown,
  ) => task({ runAsync: async () => ({ changes: 1 }) }),
}));

describe("single-sport local-state V3 migration", () => {
  beforeEach(() => {
    storage.clear();
    files.clear();
    metadataFailures.clear();
    setActivitySubmissionQueueJobsForTests(new Map());
  });

  it("quarantines unverifiable legacy records without deleting evidence", async () => {
    storage.set(
      LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY,
      JSON.stringify([
        {
          id: "job-1",
          artifactId: "session-1",
          sessionId: "session-1",
          localActivityFilePath: "file:///activity.fit",
          streamArtifactPaths: ["file:///streams"],
          draft: {
            profileId: "profile-1",
            startedAt: "2026-01-01T10:00:00.000Z",
            finishedAt: "2026-01-01T11:00:00.000Z",
            name: "Ride",
            activityType: "bike",
            durationSeconds: 3600,
            movingSeconds: 3500,
            distanceMeters: 25000,
          },
          status: "queued",
          attempts: 0,
          createdAt: "2026-01-01T11:00:00.000Z",
          updatedAt: "2026-01-01T11:00:00.000Z",
        },
      ]),
    );

    await migrateSingleSportLocalStateToV3Once();
    expect(storage.has(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY)).toBe(true);
    expect(storage.has(LEGACY_PENDING_FINALIZED_ARTIFACT_KEY)).toBe(false);

    await migrateSingleSportLocalStateToV3Once();
    expect(storage.has(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY)).toBe(true);
  });

  it("copies and verifies a legacy item before removing only its old queue reference", async () => {
    const sha256 = "a".repeat(64);
    files.set("file:///cache/activity.fit", { byteSize: 1024, sha256 });
    storage.set(
      LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY,
      JSON.stringify([
        {
          id: "job-1",
          artifactId: "session-1",
          sessionId: "session-1",
          localActivityFilePath: "file:///cache/activity.fit",
          localActivityFileSize: 1024,
          artifactSha256: sha256,
          streamArtifactPaths: [],
          draft: {
            profileId: "profile-1",
            startedAt: "2026-01-01T10:00:00.000Z",
            finishedAt: "2026-01-01T11:00:00.000Z",
            name: "Ride",
            activityType: "bike",
            durationSeconds: 3600,
            movingSeconds: 3500,
            distanceMeters: 25000,
          },
          status: "queued",
          attempts: 0,
          createdAt: "2026-01-01T11:00:00.000Z",
          updatedAt: "2026-01-01T11:00:00.000Z",
        },
      ]),
    );

    await migrateSingleSportLocalStateToV3Once();

    expect(storage.has(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY)).toBe(false);
    expect(files.get("file:///documents/activity-submission-v3job-1.fit")).toEqual({
      byteSize: 1024,
      sha256,
    });
  });

  it("resumes after interruption between the copied and verified phases", async () => {
    const sha256 = "b".repeat(64);
    files.set("file:///cache/activity.fit", { byteSize: 1024, sha256 });
    storage.set(
      LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY,
      JSON.stringify([
        {
          id: "job-1",
          artifactId: "session-1",
          sessionId: "session-1",
          localActivityFilePath: "file:///cache/activity.fit",
          localActivityFileSize: 1024,
          artifactSha256: sha256,
          streamArtifactPaths: [],
          draft: {
            profileId: "profile-1",
            startedAt: "2026-01-01T10:00:00.000Z",
            finishedAt: "2026-01-01T11:00:00.000Z",
            name: "Ride",
            activityType: "bike",
            durationSeconds: 3600,
            movingSeconds: 3500,
            distanceMeters: 25000,
          },
          status: "queued",
          attempts: 0,
          createdAt: "2026-01-01T11:00:00.000Z",
          updatedAt: "2026-01-01T11:00:00.000Z",
        },
      ]),
    );
    metadataFailures.set("file:///documents/activity-submission-v3job-1.fit", 1);

    await migrateSingleSportLocalStateToV3Once();
    expect(storage.has(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY)).toBe(true);

    await migrateSingleSportLocalStateToV3Once();
    expect(storage.has(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY)).toBe(false);
  });
});
