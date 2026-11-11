import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StravaRepository, StravaSyncJobRecord } from "../../repositories";
import { StravaClientError } from "../integrations/strava/client";
import {
  createStravaWebhookDeliveryIdentity,
  type StravaWebhookPayload,
} from "./strava-webhook-contract";
import { STRAVA_WEBHOOK_RECEIPT_JOB, StravaWebhookJobService } from "./strava-webhook-job-service";

const job: StravaSyncJobRecord = {
  attempt: 1,
  id: "job",
  importRunId: null,
  integrationGeneration: 2,
  integrationId: "integration",
  jobType: STRAVA_WEBHOOK_RECEIPT_JOB,
  maxAttempts: 5,
  payload: { receiptId: "receipt" },
  profileId: "profile",
  provider: "strava",
  status: "running",
};

const activityEvent = (aspect: "create" | "update" | "delete"): StravaWebhookPayload => ({
  aspect_type: aspect,
  event_time: 1_725_000_000,
  object_id: 123,
  object_type: "activity",
  owner_id: 456,
  subscription_id: 789,
  updates: aspect === "update" ? { title: "Updated" } : {},
});

const deauthorizationEvent: StravaWebhookPayload = {
  aspect_type: "update",
  event_time: 1_725_000_000,
  object_id: 456,
  object_type: "athlete",
  owner_id: 456,
  subscription_id: 789,
  updates: { authorized: "false" },
};

function createDeps(payload: StravaWebhookPayload) {
  const repository = {
    claimDueJobs: vi.fn(async () => [job]),
    isIntegrationGenerationActive: vi.fn(async () => true),
    getWebhookReceipt: vi.fn(async () => ({
      eventType: `${payload.object_type}.${payload.aspect_type}`,
      id: "receipt",
      integrationGeneration: 2,
      integrationId: "integration",
      jobId: "job",
      payload,
      processingStatus: "pending",
      providerAccountId: "456",
      providerEventId: createStravaWebhookDeliveryIdentity(payload),
    })),
    findIntegrationByExternalId: vi.fn(async () => ({
      accessToken: "access",
      credentialGeneration: 4,
      expiresAt: "2030-01-01T00:00:00.000Z",
      externalId: "456",
      id: "integration",
      integrationGeneration: 2,
      lifecycleStatus: "active" as const,
      profileId: "profile",
      reconnectRequiredAt: null,
      refreshToken: "refresh",
      scope: "activity:read_all",
    })),
    findDirectActivitySource: vi.fn(
      async (): Promise<{
        activityId: string | null;
        providerRevision: string | null;
        resolutionStatus: string;
      } | null> => null,
    ),
    renewJobLease: vi.fn(async () => true),
    finalizeWebhookReceiptJob: vi.fn(async () => true),
    failJob: vi.fn(async () => true),
    markReconnectRequired: vi.fn(async () => true),
    applyProviderDeauthorization: vi.fn(async () => true),
  };
  const client = {
    getAuthenticatedAthlete: vi.fn(async () => ({ data: { id: 456 }, rateLimit: null })),
    getActivity: vi.fn(async () => ({
      data: {
        id: 123,
        athlete: { id: 456 },
        name: "Activity",
        type: "Run",
        sport_type: "Run",
        start_date: "2026-09-01T10:00:00Z",
        elapsed_time: 600,
        moving_time: 590,
        distance: 2_000,
      },
      rateLimit: null,
    })),
    getActivityStreams: vi.fn(async () => ({ data: {}, rateLimit: null })),
  };
  const importActivity = vi.fn(async () => ({ id: "activity" }));
  const deleteActivitySource = vi.fn(async () => ({ status: "canonical_deleted" as const }));
  const service = new StravaWebhookJobService({
    clientFactory: () => client as never,
    db: {} as never,
    deleteActivitySource: deleteActivitySource as never,
    importActivity: importActivity as never,
    repository: repository as unknown as StravaRepository,
  });
  return { client, deleteActivitySource, importActivity, repository, service };
}

beforeEach(() => {
  vi.stubEnv("STRAVA_CLIENT_ID", "client-id");
  vi.stubEnv("STRAVA_CLIENT_SECRET", "client-secret");
  vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "https://app.example.test");
});

afterEach(() => vi.unstubAllEnvs());

describe("Strava webhook worker", () => {
  it.each([
    "create",
    "update",
  ] as const)("fetches authoritative detail and streams before canonical %s import", async (aspect) => {
    const deps = createDeps(activityEvent(aspect));
    await expect(deps.service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(deps.client.getActivity).toHaveBeenCalledWith("123");
    expect(deps.client.getActivityStreams).toHaveBeenCalledWith("123");
    expect(deps.importActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationGeneration: 2,
        integrationId: "integration",
        profileId: "profile",
        providerUpdatedAt: "2024-08-30T06:40:00.000Z",
      }),
    );
  });

  it("feeds an upload webhook echo through the already attached confirmed source", async () => {
    const deps = createDeps(activityEvent("create"));
    deps.repository.findDirectActivitySource.mockResolvedValue({
      activityId: "existing-gradientpeak-activity",
      providerRevision: null,
      resolutionStatus: "confirmed",
    });
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.importActivity).toHaveBeenCalledTimes(1);
    expect(deps.repository.findDirectActivitySource).toHaveBeenCalledWith({
      profileId: "profile",
      providerExternalId: "123",
    });
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobStatus: "completed" }),
    );
  });

  it("treats a stale or spoofed delete as a no-op when authenticated detail still exists", async () => {
    const deps = createDeps(activityEvent("delete"));
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.client.getActivity).toHaveBeenCalledWith("123");
    expect(deps.deleteActivitySource).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "completed",
        lastError: "strava_delete_not_corroborated",
      }),
    );
  });

  it("rejects a forged delete whose authoritative activity owner does not match", async () => {
    const deps = createDeps(activityEvent("delete"));
    deps.client.getActivity.mockResolvedValue({
      data: { ...activityEvent("delete"), athlete: { id: 999 }, id: 123 },
      rateLimit: null,
    } as never);
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.deleteActivitySource).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "dead_lettered",
        lastError: "strava_activity_owner_mismatch",
      }),
    );
  });

  it("applies source deletion only after an authenticated activity 404", async () => {
    const deps = createDeps(activityEvent("delete"));
    deps.client.getActivity.mockRejectedValue(
      new StravaClientError("activity_missing", { status: 404 }),
    );
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.deleteActivitySource).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration",
        provider: "strava",
        providerExternalId: "123",
      }),
    );
    expect(deps.importActivity).not.toHaveBeenCalled();
  });

  it("requires reconnect rather than deleting after an authenticated activity authorization failure", async () => {
    const deps = createDeps(activityEvent("delete"));
    deps.client.getActivity.mockRejectedValue(
      new StravaClientError("authorization", { status: 401 }),
    );
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.deleteActivitySource).not.toHaveBeenCalled();
    expect(deps.repository.markReconnectRequired).toHaveBeenCalledTimes(1);
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "dead_lettered",
        lastError: "strava_authorization",
      }),
    );
  });

  it("retries a delete signal when authenticated corroboration is transiently unavailable", async () => {
    const deps = createDeps(activityEvent("delete"));
    deps.client.getActivity.mockRejectedValue(new StravaClientError("network_unavailable"));
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.deleteActivitySource).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobStatus: "failed", lastError: "strava_network_unavailable" }),
    );
  });

  it("does not apply an out-of-order deletion older than the imported revision", async () => {
    const deps = createDeps(activityEvent("delete"));
    deps.repository.findDirectActivitySource.mockResolvedValue({
      activityId: "activity",
      providerRevision: "2024-08-31T06:40:00.000Z",
      resolutionStatus: "confirmed",
    });
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.deleteActivitySource).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobStatus: "completed" }),
    );
  });

  it("treats a stale deauthorization signal as a no-op when authenticated athlete lookup succeeds", async () => {
    const deps = createDeps(deauthorizationEvent);
    await expect(deps.service.processDueJobs({ workerId: "test" })).resolves.toMatchObject({
      completed: 1,
    });
    expect(deps.client.getAuthenticatedAthlete).toHaveBeenCalledTimes(1);
    expect(deps.repository.applyProviderDeauthorization).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "completed",
        lastError: "strava_deauthorization_not_corroborated",
      }),
    );
  });

  it("applies lifecycle deletion only after athlete authorization failure corroborates deauthorization", async () => {
    const deps = createDeps(deauthorizationEvent);
    deps.client.getAuthenticatedAthlete.mockRejectedValue(
      new StravaClientError("authorization", { status: 401 }),
    );
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.applyProviderDeauthorization).toHaveBeenCalledWith(
      expect.objectContaining({ ownerExternalId: "456", profileId: "profile", provider: "strava" }),
    );
  });

  it("requires reconnect without deauthorizing after authenticated athlete 403", async () => {
    const deps = createDeps(deauthorizationEvent);
    deps.client.getAuthenticatedAthlete.mockRejectedValue(
      new StravaClientError("authorization", { status: 403 }),
    );
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.markReconnectRequired).toHaveBeenCalledOnce();
    expect(deps.repository.applyProviderDeauthorization).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "dead_lettered",
        lastError: "strava_authorization",
      }),
    );
  });

  it("rejects a forged deauthorization event bound to a different authenticated athlete", async () => {
    const deps = createDeps(deauthorizationEvent);
    deps.client.getAuthenticatedAthlete.mockResolvedValue({ data: { id: 999 }, rateLimit: null });
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.applyProviderDeauthorization).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "dead_lettered",
        lastError: "strava_athlete_owner_mismatch",
      }),
    );
  });

  it("retries deauthorization corroboration on transient provider failure", async () => {
    const deps = createDeps(deauthorizationEvent);
    deps.client.getAuthenticatedAthlete.mockRejectedValue(
      new StravaClientError("provider_unavailable", { status: 503 }),
    );
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.applyProviderDeauthorization).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobStatus: "failed", lastError: "strava_provider_unavailable" }),
    );
  });

  it("generation-fences stale work before resolving credentials or calling Strava", async () => {
    const deps = createDeps(activityEvent("create"));
    deps.repository.isIntegrationGenerationActive.mockResolvedValue(false);
    await deps.service.processDueJobs({ workerId: "test" });
    expect(deps.repository.findIntegrationByExternalId).not.toHaveBeenCalled();
    expect(deps.client.getActivity).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "completed",
        lastError: "integration_generation_inactive",
      }),
    );
  });

  it("dead-letters an authoritative activity owned by another athlete", async () => {
    const deps = createDeps(activityEvent("update"));
    deps.client.getActivity.mockResolvedValueOnce({
      data: {
        id: 123,
        athlete: { id: 999 },
        name: "Wrong owner",
        type: "Run",
        start_date: "2026-09-01T10:00:00Z",
        elapsed_time: 600,
        moving_time: 590,
        distance: 2_000,
      },
      rateLimit: null,
    } as never);
    await expect(deps.service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(deps.client.getActivityStreams).not.toHaveBeenCalled();
    expect(deps.importActivity).not.toHaveBeenCalled();
    expect(deps.repository.finalizeWebhookReceiptJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobStatus: "dead_lettered",
        lastError: "strava_activity_owner_mismatch",
      }),
    );
  });
});
