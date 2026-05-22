import { afterEach, describe, expect, it, vi } from "vitest";
import { WahooActivityHistoryJobService } from "./wahoo-activity-history-job-service";

function createSummary(id: number) {
  return {
    id,
    started_at: "2026-04-03T10:00:00.000Z",
    updated_at: "2026-04-03T11:05:00.000Z",
    ascent_accum: 789,
    cadence_avg: 92,
    calories_accum: 654,
    distance_accum: 40235,
    duration_active_accum: 3501,
    duration_total_accum: 3600,
    heart_rate_avg: 149,
    power_avg: 212,
    power_bike_np_last: 228,
    power_bike_tss_last: 85,
    speed_avg: 8.9,
    work_accum: 760000,
    file: { url: `https://example.com/${id}.fit` },
    fitness_app_id: 1,
    manual: false,
    edited: false,
  };
}

function createDeps() {
  return {
    importer: {
      importWorkoutSummary: vi.fn(),
    },
    providerSyncRepository: {
      claimDueJobs: vi.fn(),
      markJobFailed: vi.fn(),
      markJobSucceeded: vi.fn(),
      updateSyncStateAfterFailure: vi.fn(),
      updateSyncStateAfterRun: vi.fn(),
    },
    wahooClient: {
      listWorkoutSummaries: vi.fn(),
    },
    wahooRepository: {
      findWahooIntegrationByProfileId: vi.fn(),
    },
  };
}

describe("WahooActivityHistoryJobService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reconciles due activity history jobs through the importer", async () => {
    const deps = createDeps();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "provider-history-reconcile:integration-1:activity",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: null,
        jobType: "wahoo.activity_history_reconcile",
        maxAttempts: 5,
        payload: { trigger: "connect", windowMonths: 12 },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-03T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({
      accessToken: "access-1",
      externalId: "77",
      id: "integration-1",
      profileId: "profile-1",
      refreshToken: "refresh-1",
    });
    deps.wahooClient.listWorkoutSummaries.mockResolvedValueOnce([createSummary(123)]);
    deps.importer.importWorkoutSummary.mockResolvedValue({
      success: true,
      activityId: "activity-1",
    });

    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledWith({
      endDate: "2026-04-03T12:00:00.000Z",
      page: 1,
      perPage: 50,
      startDate: "2025-04-03T12:00:00.000Z",
    });
    expect(deps.importer.importWorkoutSummary).toHaveBeenCalledWith(77, createSummary(123));
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith("job-1", "worker-1");
    expect(deps.providerSyncRepository.updateSyncStateAfterRun).toHaveBeenCalledWith({
      integrationId: "integration-1",
      provider: "wahoo",
      resource: "historical_activities",
      succeeded: true,
    });
  });

  it("fails retryably after continuing past a per-summary import failure", async () => {
    const deps = createDeps();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "provider-history-reconcile:integration-1:activity",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: null,
        jobType: "wahoo.activity_history_reconcile",
        maxAttempts: 5,
        payload: { trigger: "connect" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-03T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({
      accessToken: "access-1",
      externalId: "77",
      id: "integration-1",
      profileId: "profile-1",
      refreshToken: null,
    });
    deps.wahooClient.listWorkoutSummaries.mockResolvedValueOnce([
      createSummary(123),
      createSummary(124),
    ]);
    deps.importer.importWorkoutSummary
      .mockResolvedValueOnce({ success: false, error: "storage offline" })
      .mockResolvedValueOnce({ success: true, skipped: true, reason: "Activity already imported" });

    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({})).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });

    expect(deps.importer.importWorkoutSummary).toHaveBeenCalledTimes(2);
    expect(deps.providerSyncRepository.markJobSucceeded).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "job-1",
        lastError: expect.stringContaining("storage offline"),
        status: "failed",
        workerId: "wahoo-activity-history-worker",
      }),
    );
    expect(deps.providerSyncRepository.updateSyncStateAfterFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        lastError: expect.stringContaining("storage offline"),
        provider: "wahoo",
        resource: "historical_activities",
      }),
    );
  });

  it("no-ops safely when the integration was disconnected before processing", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "provider-history-reconcile:integration-1:activity",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: null,
        jobType: "wahoo.activity_history_reconcile",
        maxAttempts: 5,
        payload: { trigger: "connect" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-03T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(null);

    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({})).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.wahooClient.listWorkoutSummaries).not.toHaveBeenCalled();
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "job-1",
      "wahoo-activity-history-worker",
    );
    expect(deps.providerSyncRepository.updateSyncStateAfterRun).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobFailed).not.toHaveBeenCalled();
  });

  it("dead letters invalid activity history job payloads", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "provider-history-reconcile:integration-1:activity",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: null,
        jobType: "wahoo.activity_history_reconcile",
        maxAttempts: 5,
        payload: { trigger: "unknown" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-03T12:00:00.000Z",
        status: "running",
      },
    ]);

    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({})).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });

    expect(deps.providerSyncRepository.markJobFailed).toHaveBeenCalledWith({
      id: "job-1",
      lastError: "Invalid Wahoo activity history job payload",
      status: "dead_lettered",
      workerId: "wahoo-activity-history-worker",
    });
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
  });
});
