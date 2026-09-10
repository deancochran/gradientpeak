import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  enqueueCompletedActivityUpload: vi.fn(),
  readCompletedActivityUploadState: vi.fn(),
  readCompletedActivityUploadTarget: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createStravaRepository: () => repository,
}));

import { createStravaCompletedActivityUploadDedupeKey } from "../../repositories/strava-repository";
import { stravaProviderRuntime } from "./strava-provider-runtime";

const completedActivityExport = stravaProviderRuntime.execution.server.completedActivityExport;

const artifact = {
  artifactId: "33333333-3333-4333-8333-333333333333",
  bucket: "activity-files",
  byteSize: 3,
  digest: "a".repeat(64),
  format: "fit" as const,
  mediaType: "application/octet-stream",
  path: "canonical-private-path",
  segmentsRevision: 4,
};

beforeEach(() => {
  vi.stubEnv("STRAVA_CLIENT_ID", "client-id");
  vi.stubEnv("STRAVA_CLIENT_SECRET", "client-secret");
  vi.stubEnv("STRAVA_UPLOAD_EXTERNAL_ID_SECRET", "upload-signing-secret-at-least-32-bytes");
  vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "https://app.example.test");
  repository.enqueueCompletedActivityUpload.mockReset();
  repository.readCompletedActivityUploadState.mockReset();
  repository.readCompletedActivityUploadTarget.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("Strava completed activity provider operation", () => {
  it.each([
    "queued",
    "running",
    "completed",
    "dispatch_uncertain",
    "failed",
  ] as const)("surfaces the durable %s upload state", async (status) => {
    repository.readCompletedActivityUploadState.mockResolvedValue({ jobId: "job", status });
    await expect(
      completedActivityExport.readCompletedActivityUploadEligibility({
        activityId: "activity",
        db: {} as never,
        profileId: "profile",
      }),
    ).resolves.toMatchObject({ jobId: "job", provider: "strava", status });
  });

  it.each([
    ["reconnect_required", "reconnect_required"],
    ["unsupported_evidence", "unsupported_evidence"],
    ["not_connected", "not_connected"],
  ] as const)("returns %s without enqueueing", async (targetStatus, expectedStatus) => {
    repository.readCompletedActivityUploadTarget.mockResolvedValue({ status: targetStatus });
    await expect(
      completedActivityExport.sendCompletedActivity({
        activityId: "activity",
        db: {} as never,
        profileId: "profile",
      }),
    ).resolves.toMatchObject({ jobId: null, provider: "strava", status: expectedStatus });
    expect(repository.enqueueCompletedActivityUpload).not.toHaveBeenCalled();
  });

  it("fails closed when the activity is not owned by the actor profile", async () => {
    repository.readCompletedActivityUploadTarget.mockResolvedValue({
      status: "activity_not_found",
    });
    await expect(
      completedActivityExport.sendCompletedActivity({
        activityId: "activity",
        db: {} as never,
        profileId: "other-profile",
      }),
    ).rejects.toThrow("Activity not found");
    expect(repository.enqueueCompletedActivityUpload).not.toHaveBeenCalled();
  });

  it("queues the exact owner artifact and returns a terminal dedupe result without a new effect", async () => {
    const activityId = "11111111-1111-4111-8111-111111111111";
    repository.readCompletedActivityUploadTarget.mockResolvedValue({
      artifact,
      integrationGeneration: 2,
      integrationId: "integration",
      status: "ready",
    });
    repository.enqueueCompletedActivityUpload.mockResolvedValue({
      created: false,
      id: "existing-job",
      status: "completed",
    });
    await expect(
      completedActivityExport.sendCompletedActivity({
        activityId,
        db: {} as never,
        profileId: "profile",
      }),
    ).resolves.toEqual({ jobId: "existing-job", provider: "strava", status: "completed" });
    expect(repository.enqueueCompletedActivityUpload).toHaveBeenCalledWith(
      expect.objectContaining({ activityId, artifact, profileId: "profile" }),
    );
  });

  it("builds a stable dedupe key from destination generation, activity, and source digest", () => {
    const input = {
      activityId: "activity",
      artifactDigest: "a".repeat(64),
      integrationGeneration: 2,
      integrationId: "integration",
    };
    expect(createStravaCompletedActivityUploadDedupeKey(input)).toBe(
      createStravaCompletedActivityUploadDedupeKey(input),
    );
    expect(createStravaCompletedActivityUploadDedupeKey(input)).not.toBe(
      createStravaCompletedActivityUploadDedupeKey({ ...input, artifactDigest: "b".repeat(64) }),
    );
  });
});
