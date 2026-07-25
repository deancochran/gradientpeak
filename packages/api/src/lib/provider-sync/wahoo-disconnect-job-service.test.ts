import { describe, expect, it, vi } from "vitest";
import { WahooReconnectRequiredError } from "../integrations/wahoo/credentials";
import { WahooSyncJobService } from "./wahoo-job-service";

const secret = "decrypted-access-token";
const rawProviderData = "raw-provider-response";

function disconnectJob(overrides: Record<string, unknown> = {}) {
  return {
    attempt: 1,
    id: "disconnect-job",
    integrationGeneration: 2,
    integrationId: "integration-1",
    jobType: "wahoo.disconnect",
    maxAttempts: 3,
    payload: { expectedGeneration: 2 },
    profileId: "profile-1",
    provider: "wahoo",
    runAt: "2026-07-24T12:00:00.000Z",
    status: "running",
    ...overrides,
  };
}

function createDeps(job = disconnectJob()) {
  return {
    providerSyncRepository: {
      beginWahooDisconnectAttempt: vi
        .fn()
        .mockResolvedValue({ accessToken: secret, disposition: "ready" }),
      claimDueJobs: vi.fn().mockResolvedValue([job]),
      finalizeWahooDisconnect: vi.fn().mockResolvedValue(true),
      isIntegrationGenerationActive: vi.fn().mockResolvedValue(true),
      markJobFailed: vi.fn(),
      markJobSucceeded: vi.fn().mockResolvedValue(true),
      renewJobLease: vi.fn().mockResolvedValue(true),
      updateSyncStateAfterFailure: vi.fn(),
      updateSyncStateAfterRun: vi.fn(),
    },
    syncService: { syncEvent: vi.fn(), unsyncEvent: vi.fn() },
    wahooClientFactory: vi
      .fn()
      .mockReturnValue({ disconnect: vi.fn().mockResolvedValue({ success: true }) }),
    wahooRepository: { findWahooIntegrationByProfileId: vi.fn() },
  };
}

async function process(deps: ReturnType<typeof createDeps>) {
  return new WahooSyncJobService(deps as never).processDueJobs({
    limit: 1,
    workerId: "disconnect-test",
  });
}

describe("Wahoo disconnect job worker", () => {
  it("processes the single deduplicated disconnect claim without exposing credentials or provider data", async () => {
    const deps = createDeps();

    await expect(process(deps)).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(deps.wahooClientFactory).toHaveBeenCalledWith({ accessToken: secret });
    expect(deps.providerSyncRepository.finalizeWahooDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "confirmed" }),
    );
    expect(
      JSON.stringify(deps.providerSyncRepository.finalizeWahooDisconnect.mock.calls),
    ).not.toContain(secret);
    expect(
      JSON.stringify(deps.providerSyncRepository.finalizeWahooDisconnect.mock.calls),
    ).not.toContain(rawProviderData);
  });

  it("marks the attempt uncertain before reading credentials or calling Wahoo", async () => {
    const deps = createDeps();
    const order: string[] = [];
    deps.providerSyncRepository.beginWahooDisconnectAttempt.mockImplementation(async () => {
      order.push("begin");
      return { accessToken: secret, disposition: "ready" as const };
    });
    deps.wahooClientFactory.mockImplementation(() => ({
      disconnect: async () => {
        order.push("call");
        return { success: true };
      },
    }));

    await process(deps);
    expect(order).toEqual(["begin", "call"]);
    expect(deps.providerSyncRepository.beginWahooDisconnectAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 2 }),
    );
  });

  it("keeps the encrypted credential record for a transient response-loss retry", async () => {
    const deps = createDeps();
    deps.wahooClientFactory.mockReturnValue({
      disconnect: vi.fn().mockRejectedValue(new Error("connection lost")),
    });

    await expect(process(deps)).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(deps.providerSyncRepository.finalizeWahooDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "retry" }),
    );
    expect(
      deps.providerSyncRepository.finalizeWahooDisconnect.mock.calls[0]?.[0],
    ).not.toHaveProperty("accessToken");
  });

  it.each([
    new WahooReconnectRequiredError(),
    Object.assign(new Error("not found"), { status: 404 }),
  ])("keeps credentials fenced when revocation response is ambiguous", async (error) => {
    const deps = createDeps();
    deps.wahooClientFactory.mockReturnValue({ disconnect: vi.fn().mockRejectedValue(error) });

    await expect(process(deps)).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(deps.providerSyncRepository.finalizeWahooDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: (error as { status?: number }).status ? "dead_lettered" : "retry",
      }),
    );
  });

  it("uses the pending generation credential read and tombstones only after confirmed revocation", async () => {
    const deps = createDeps();
    await process(deps);

    expect(deps.providerSyncRepository.beginWahooDisconnectAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: 2,
        integrationId: "integration-1",
        jobId: "disconnect-job",
      }),
    );
    expect(deps.providerSyncRepository.finalizeWahooDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "confirmed" }),
    );
  });

  it("cannot let a stale pre-call generation read credentials or call Wahoo", async () => {
    const deps = createDeps(disconnectJob({ jobType: "wahoo.publish_event" }));
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(false);

    await expect(process(deps)).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(deps.providerSyncRepository.beginWahooDisconnectAttempt).not.toHaveBeenCalled();
    expect(deps.wahooClientFactory).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "disconnect-job",
      expect.stringMatching(/^disconnect-test:/),
    );
  });

  it("cannot persist a stale disconnect completion after OAuth reconnect", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.finalizeWahooDisconnect.mockResolvedValue(false);

    await expect(process(deps)).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(deps.wahooClientFactory).toHaveBeenCalledTimes(1);
    expect(deps.providerSyncRepository.finalizeWahooDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "confirmed" }),
    );
  });

  it("completes a disconnect superseded by reconnect without provider work", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.beginWahooDisconnectAttempt.mockResolvedValue({
      disposition: "superseded",
    });

    await expect(process(deps)).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "disconnect-job",
      expect.stringMatching(/^disconnect-test:/),
    );
    expect(deps.wahooClientFactory).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.finalizeWahooDisconnect).not.toHaveBeenCalled();
  });

  it("dead-letters a corrupt pending disconnect without credentials", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.beginWahooDisconnectAttempt.mockResolvedValue({
      disposition: "invalid",
    });

    await expect(process(deps)).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(deps.providerSyncRepository.finalizeWahooDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "dead_lettered" }),
    );
    expect(deps.wahooClientFactory).not.toHaveBeenCalled();
  });
});
