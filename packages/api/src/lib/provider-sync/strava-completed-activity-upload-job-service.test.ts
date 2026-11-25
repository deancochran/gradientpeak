import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  StravaCompletedActivityUploadPayload,
  StravaRepository,
  StravaSyncJobRecord,
} from "../../repositories";
import { StravaClientError } from "../integrations/strava/client";
import {
  STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB,
  StravaCompletedActivityUploadJobService,
} from "./strava-completed-activity-upload-job-service";

const artifact = {
  artifactId: "33333333-3333-4333-8333-333333333333",
  bucket: "activity-files",
  byteSize: 3,
  digest: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
  format: "fit" as const,
  mediaType: "application/octet-stream",
  path: "artifact-path",
  segmentsRevision: 4,
};

function job(payload: StravaCompletedActivityUploadPayload): StravaSyncJobRecord {
  return {
    attempt: 1,
    id: "job",
    importRunId: null,
    integrationGeneration: 2,
    integrationId: "integration",
    jobType: STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB,
    maxAttempts: 30,
    payload,
    profileId: "profile",
    provider: "strava",
    status: "running",
  };
}

function createDeps(payload: StravaCompletedActivityUploadPayload) {
  const repository = {
    claimDueJobs: vi.fn(async () => [job(payload)]),
    completeActivityUpload: vi.fn(async () => true),
    failJob: vi.fn(async () => true),
    findIntegrationByProfileId: vi.fn(async () => ({
      accessToken: "access",
      credentialGeneration: 3,
      expiresAt: "2030-01-01T00:00:00.000Z",
      externalId: "athlete",
      id: "integration",
      integrationGeneration: 2,
      lifecycleStatus: "active" as const,
      profileId: "profile",
      reconnectRequiredAt: null,
      refreshToken: "refresh",
      scope: "activity:read_all,activity:write",
    })),
    isIntegrationGenerationActive: vi.fn(async () => true),
    markJobSucceeded: vi.fn(async () => true),
    markReconnectRequired: vi.fn(async () => true),
    runCompletedActivityUploadDispatch: vi.fn(async ({ dispatch }) => dispatch()),
    readCompletedActivityUploadTarget: vi.fn(async () => ({
      artifact,
      integrationGeneration: 2,
      integrationId: "integration",
      status: "ready" as const,
    })),
    renewJobLease: vi.fn(async () => true),
    rescheduleActivityUpload: vi.fn(async () => true),
    updateIntegrationTokens: vi.fn(async () => 4),
  };
  const client = {
    getUploadStatus: vi.fn(),
    uploadActivity: vi.fn(),
  };
  const service = new StravaCompletedActivityUploadJobService({
    artifactStorage: {
      readObjectBounded: vi.fn(async () => ({
        contentType: "application/octet-stream",
        data: new Uint8Array([1, 2, 3]),
      })),
      storage: {} as never,
    },
    clientFactory: () => client as never,
    db: {} as never,
    now: () => new Date("2026-09-08T12:00:00.000Z"),
    repository: repository as unknown as StravaRepository,
  });
  return { client, repository, service };
}

const preDispatch = {
  activityId: "11111111-1111-4111-8111-111111111111",
  artifact,
  externalId: "gp-v1-signed",
  phase: "pre_dispatch" as const,
};

beforeEach(() => {
  vi.stubEnv("STRAVA_CLIENT_ID", "client-id");
  vi.stubEnv("STRAVA_CLIENT_SECRET", "client-secret");
  vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "https://app.example.test");
});

afterEach(() => vi.unstubAllEnvs());

describe("Strava completed activity upload worker", () => {
  it("persists a known upload ID and schedules the first poll at least one second later", async () => {
    const deps = createDeps(preDispatch);
    deps.client.uploadActivity.mockResolvedValue({
      data: { id: 88, activity_id: null, error: null, status: "processing" },
      rateLimit: null,
    });
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.runCompletedActivityUploadDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ phase: "dispatching" }) }),
    );
    expect(deps.repository.rescheduleActivityUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        nextRunAt: "2026-09-08T12:00:01.000Z",
        payload: expect.objectContaining({ phase: "polling", uploadId: "88" }),
      }),
    );
  });

  it("dead-letters an uncertain POST and never schedules another POST", async () => {
    const deps = createDeps(preDispatch);
    deps.client.uploadActivity.mockRejectedValue(new StravaClientError("request_timeout"));
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.failJob).toHaveBeenCalledWith(
      expect.objectContaining({ lastError: "dispatch_uncertain", status: "dead_lettered" }),
    );
    expect(deps.repository.rescheduleActivityUpload).not.toHaveBeenCalled();

    const recovered = createDeps({ ...preDispatch, phase: "dispatching" });
    await recovered.service.processDueJobs({ workerId: "test" });
    expect(recovered.client.uploadActivity).not.toHaveBeenCalled();
    expect(recovered.repository.failJob).toHaveBeenCalledWith(
      expect.objectContaining({ lastError: "dispatch_uncertain", status: "dead_lettered" }),
    );
  });

  it("does not upload when disconnect advances the generation before dispatch is fenced", async () => {
    const deps = createDeps(preDispatch);
    deps.repository.runCompletedActivityUploadDispatch.mockResolvedValue(null);

    await deps.service.processDueJobs({ workerId: "test" });

    expect(deps.client.uploadActivity).not.toHaveBeenCalled();
    expect(deps.repository.failJob).not.toHaveBeenCalled();
  });

  it("keeps disconnect generation advancement after the serialized POST completes", async () => {
    const deps = createDeps(preDispatch);
    const sequence: string[] = [];
    deps.client.uploadActivity.mockImplementation(async () => {
      sequence.push("upload-completed");
      return {
        data: { id: 88, activity_id: null, error: null, status: "processing" },
        rateLimit: null,
      };
    });
    deps.repository.runCompletedActivityUploadDispatch.mockImplementation(async ({ dispatch }) => {
      const result = await dispatch();
      sequence.push("disconnect-may-advance");
      return result;
    });

    await deps.service.processDueJobs({ workerId: "test" });

    expect(sequence).toEqual(["upload-completed", "disconnect-may-advance"]);
  });

  it("returns a 429 to retryable pre-dispatch state without creating another dedupe identity", async () => {
    const deps = createDeps(preDispatch);
    deps.client.uploadActivity.mockRejectedValue(
      new StravaClientError("rate_limited", { retryAfterSeconds: 12, status: 429 }),
    );

    await deps.service.processDueJobs({ workerId: "test" });

    expect(deps.repository.rescheduleActivityUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "strava_upload_dispatch_retry",
        nextRunAt: "2026-09-08T12:00:12.000Z",
        payload: preDispatch,
      }),
    );
    expect(deps.repository.failJob).not.toHaveBeenCalled();
  });

  it("allows a segments-only revision change when the accepted artifact identity and digest match", async () => {
    const deps = createDeps(preDispatch);
    deps.repository.readCompletedActivityUploadTarget.mockResolvedValue({
      artifact: { ...artifact, segmentsRevision: artifact.segmentsRevision + 1 },
      integrationGeneration: 2,
      integrationId: "integration",
      status: "ready",
    });
    deps.client.uploadActivity.mockResolvedValue({
      data: { id: 88, activity_id: null, error: null, status: "processing" },
      rateLimit: null,
    });

    await deps.service.processDueJobs({ workerId: "test" });

    expect(deps.client.uploadActivity).toHaveBeenCalledTimes(1);
  });

  it("retries known-ID polling without issuing another upload", async () => {
    const deps = createDeps({ ...preDispatch, phase: "polling", uploadId: "88" });
    deps.client.getUploadStatus.mockRejectedValue(new StravaClientError("network_unavailable"));
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.client.uploadActivity).not.toHaveBeenCalled();
    expect(deps.repository.rescheduleActivityUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "strava_upload_poll_retry",
        payload: expect.objectContaining({ phase: "polling", uploadId: "88" }),
      }),
    );
  });

  it("atomically attaches the completed Strava source to the existing activity", async () => {
    const deps = createDeps({ ...preDispatch, phase: "polling", uploadId: "88" });
    deps.client.getUploadStatus.mockResolvedValue({
      data: { id: 88, activity_id: 987, error: null, status: "ready" },
      rateLimit: null,
    });
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.completeActivityUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: preDispatch.activityId,
        providerExternalId: "987",
      }),
    );
    expect(deps.client.uploadActivity).not.toHaveBeenCalled();
  });
});
