import { describe, expect, it, vi } from "vitest";
import type { WahooProjectionSnapshot } from "../integrations/wahoo/plan-converter";
import { WahooSyncJobService } from "./wahoo-job-service";

const snapshot: WahooProjectionSnapshot = {
  occurrenceIds: [],
  plan: {
    header: {
      name: "Resolved session",
      version: "1.0.0",
      workout_type_family: 0,
      workout_type_location: 0,
    },
    intervals: [],
  },
};

function plannedSessionJob(overrides: Record<string, unknown> = {}) {
  return {
    attempt: 1,
    id: "job-1",
    integrationGeneration: 3,
    integrationId: "integration-1",
    internalResourceId: "22222222-2222-4222-8222-222222222222",
    jobType: "wahoo.publish_planned_session",
    maxAttempts: 3,
    operation: "publish",
    payload: {
      performanceModelAsOf: "2026-07-28T12:00:00.000Z",
      plannedSessionId: "22222222-2222-4222-8222-222222222222",
      operation: "publish",
      projectionHash: "projection-1",
      projectionSnapshot: snapshot,
      startsAt: "2026-07-29T12:00:00.000+00:00",
      timezone: "UTC",
    },
    profileId: "profile-1",
    provider: "wahoo",
    resourceKind: "planned_session",
    runAt: new Date().toISOString(),
    status: "running",
    ...overrides,
  };
}

function repository(job: ReturnType<typeof plannedSessionJob>) {
  return {
    claimDueJobs: vi.fn().mockResolvedValue([job]),
    completeJobWithSyncState: vi.fn().mockResolvedValue(true),
    failJobWithSyncState: vi.fn().mockResolvedValue(true),
    getQueueTelemetry: vi
      .fn()
      .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
    isIntegrationGenerationActive: vi.fn().mockResolvedValue(true),
    markJobFailed: vi.fn().mockResolvedValue(true),
    markJobSucceeded: vi.fn().mockResolvedValue(true),
    renewJobLease: vi.fn().mockResolvedValue(true),
    updateRunningJobDesiredState: vi.fn().mockResolvedValue(true),
  };
}

describe("WahooSyncJobService planned sessions", () => {
  it("drains a planned-session publish payload and never invokes event delivery", async () => {
    const jobs = repository(plannedSessionJob());
    const syncPlannedSession = vi.fn().mockResolvedValue({ action: "created", success: true });
    const service = new WahooSyncJobService({
      providerSyncRepository: jobs as never,
      syncService: { syncPlannedSession } as never,
      wahooRepository: {} as never,
    });
    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(jobs.claimDueJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTypes: expect.arrayContaining([
          "wahoo.publish_planned_session",
          "wahoo.unsync_planned_session",
        ]),
      }),
    );
    expect(syncPlannedSession).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "profile-1",
      expect.objectContaining({ expectedProjectionHash: "projection-1" }),
    );
  });

  it.each([
    ["event payload", plannedSessionJob({ payload: { eventId: "event-1", operation: "publish" } })],
    ["event resource kind", plannedSessionJob({ resourceKind: "event" })],
  ])("dead-letters a %s", async (_label, job) => {
    const jobs = repository(job);
    const syncPlannedSession = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: jobs as never,
      syncService: { syncPlannedSession } as never,
      wahooRepository: {} as never,
    });
    await service.processDueJobs({ workerId: "test" });
    expect(syncPlannedSession).not.toHaveBeenCalled();
    expect(jobs.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_planned_activity_payload",
        status: "dead_lettered",
      }),
    );
  });
});
