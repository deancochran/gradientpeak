import { describe, expect, it, vi } from "vitest";
import type { ProviderSyncJobRecord } from "../../repositories";
import {
  createProviderSyncWorkerId,
  executeProviderSyncJobs,
  ProviderSyncConcurrencyLimiter,
} from "./job-execution";

function job(id: string, lane: string, queueSequence: number): ProviderSyncJobRecord {
  return {
    attempt: 1,
    dedupeKey: id,
    id,
    integrationId: "integration",
    internalResourceId: null,
    jobType: "test",
    lastError: null,
    maxAttempts: 3,
    operation: null,
    payload: {},
    payloadHash: null,
    profileId: "profile",
    provider: "wahoo",
    queueSequence,
    resourceKind: null,
    runAt: "2026-01-01T00:00:00.000Z",
    staleLockRecovered: false,
    status: "running",
    supersedesJobId: null,
    syncLaneKey: lane,
  };
}

describe("executeProviderSyncJobs", () => {
  it("runs different lanes concurrently and each lane in queue order", async () => {
    const activeLanes = new Set<string>();
    let maxActiveLanes = 0;
    const order: string[] = [];
    const release = Promise.withResolvers<void>();

    const execution = executeProviderSyncJobs({
      concurrency: 2,
      jobFamily: "test",
      jobs: [job("a2", "a", 2), job("b1", "b", 3), job("a1", "a", 1)],
      processJob: async (current) => {
        const lane = current.syncLaneKey;
        if (!lane) throw new Error("Expected a test lane");
        activeLanes.add(lane);
        maxActiveLanes = Math.max(maxActiveLanes, activeLanes.size);
        order.push(current.id);
        if (order.length < 2) await release.promise;
        else release.resolve();
        activeLanes.delete(lane);
        return "completed";
      },
      provider: "wahoo",
      telemetry: { recordExecution: vi.fn() },
    });

    await execution;
    expect(maxActiveLanes).toBe(2);
    expect(order.indexOf("a1")).toBeLessThan(order.indexOf("a2"));
  });

  it("processes a burst once per claimed job with bounded concurrency and no duplicate effects", async () => {
    let active = 0;
    let maxActive = 0;
    const seen = new Set<string>();
    const jobs = Array.from({ length: 250 }, (_, index) =>
      job(`job-${index}`, `lane-${index % 25}`, index),
    );

    const result = await executeProviderSyncJobs({
      concurrency: 7,
      jobFamily: "load-test",
      jobs,
      processJob: async (current) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        expect(seen.has(current.id)).toBe(false);
        seen.add(current.id);
        await Promise.resolve();
        active -= 1;
        return "completed";
      },
      provider: "wahoo",
      telemetry: { recordExecution: vi.fn() },
    });

    expect(result).toEqual({ completed: 250, failed: 0, processed: 250 });
    expect(maxActive).toBeLessThanOrEqual(7);
    expect(seen.size).toBe(250);
  });

  it("reports actionable aggregate telemetry without job or lane identifiers", async () => {
    const recordExecution = vi.fn();
    const staleJob = {
      ...job("sensitive-job-id", "sensitive-lane-id", 1),
      attempt: 3,
      staleLockRecovered: true,
    };

    await executeProviderSyncJobs({
      concurrency: 1,
      jobFamily: "webhooks",
      jobs: [staleJob],
      now: () => Date.parse("2026-01-01T00:00:10.000Z"),
      processJob: async () => "dead_lettered",
      provider: "wahoo",
      getEndingQueueTelemetry: async () => ({
        deadLetterDepth: 4,
        oldestDueAt: "2026-01-01T00:00:00.000Z",
        queueDepth: 12,
      }),
      telemetry: { recordExecution },
    });

    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 3,
        endingDeadLetterDepth: 4,
        deadLettered: 1,
        durationMs: 0,
        endingMaxQueueAgeMs: 10_000,
        endingQueueDepth: 12,
        staleLocksRecovered: 1,
      }),
    );
    expect(JSON.stringify(recordExecution.mock.calls)).not.toContain("sensitive");
  });

  it("reserves no more than shared process capacity", () => {
    const limiter = new ProviderSyncConcurrencyLimiter(3);
    expect(limiter.reserve(2)).toBe(2);
    expect(limiter.reserve(2)).toBe(1);
    expect(limiter.reserve(1)).toBe(0);
    limiter.release(2);
    expect(limiter.reserve(2)).toBe(2);
  });

  it("creates a distinct fencing identity for each invocation", () => {
    const first = createProviderSyncWorkerId("drain");
    const second = createProviderSyncWorkerId("drain");
    expect(first).not.toBe(second);
    expect(first.startsWith("drain:")).toBe(true);
    expect(second.startsWith("drain:")).toBe(true);
  });

  it("renews the lease while a long-running provider operation is active", async () => {
    vi.useFakeTimers();
    const operation = Promise.withResolvers<"completed">();
    const renewLease = vi.fn().mockResolvedValue(true);
    const execution = executeProviderSyncJobs({
      concurrency: 1,
      jobFamily: "long-running",
      jobs: [job("job", "lane", 1)],
      leaseRenewIntervalMs: 1000,
      processJob: () => operation.promise,
      provider: "wahoo",
      renewLease,
      telemetry: { recordExecution: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(renewLease).toHaveBeenCalledTimes(1);
    operation.resolve("completed");
    await execution;
    vi.useRealTimers();
  });

  it("aborts and fences execution when lease renewal loses ownership", async () => {
    vi.useFakeTimers();
    const observedAbort = vi.fn();
    const execution = executeProviderSyncJobs({
      concurrency: 1,
      jobFamily: "lease-loss",
      jobs: [job("job", "lane", 1)],
      leaseRenewIntervalMs: 1000,
      processJob: async (_job, { signal }) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener(
            "abort",
            () => {
              observedAbort();
              resolve();
            },
            { once: true },
          ),
        );
        return "completed";
      },
      provider: "wahoo",
      renewLease: vi.fn().mockResolvedValue(false),
      telemetry: { recordExecution: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(execution).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(observedAbort).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
