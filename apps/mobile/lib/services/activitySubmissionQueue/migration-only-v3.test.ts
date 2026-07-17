import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY,
  LEGACY_PENDING_FINALIZED_ARTIFACT_KEY,
  migrateSingleSportLocalStateToV3Once,
} from "./migration-only-v3";
import { ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY } from "./storage";

const storage = new Map<string, string>();
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
vi.mock("expo-file-system", () => ({ Directory: class {}, File: class {} }));

describe("single-sport local-state V3 migration", () => {
  beforeEach(() => storage.clear());

  it("converts once and leaves zero legacy keys", async () => {
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
    const converted = JSON.parse(storage.get(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY) ?? "[]");
    expect(converted[0]).toMatchObject({
      schemaVersion: 2,
      executionManifest: { version: 1, occurrences: [{ role: "activity", category: "bike" }] },
    });
    expect(storage.has(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY)).toBe(false);
    expect(storage.has(LEGACY_PENDING_FINALIZED_ARTIFACT_KEY)).toBe(false);

    await migrateSingleSportLocalStateToV3Once();
    expect(JSON.parse(storage.get(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY) ?? "[]")).toHaveLength(1);
  });
});
