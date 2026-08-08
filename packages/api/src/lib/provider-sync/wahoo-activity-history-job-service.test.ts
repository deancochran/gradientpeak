import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE,
  WahooAuthorizationResetRequiredError,
} from "../integrations/wahoo/credentials";
import { WahooActivityHistoryJobService } from "./wahoo-activity-history-job-service";

function createSummary(id: number) {
  return {
    id,
    workout_id: 456,
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
  let importRun = {
    id: "import-run-1",
    profile_id: "profile-1",
    integration_id: "integration-1" as string | null,
    integration_generation: 1 as number | null,
    kind: "history_sync" as "history_sync" | "manual_sync" | "onboarding",
    status: "queued" as "completed" | "failed" | "queued" | "running",
    window_start_at: new Date("1900-01-01T00:00:00.000Z") as Date | null,
    window_end_at: new Date("2026-04-03T12:00:00.000Z") as Date | null,
    next_cursor: null,
    next_page: 1 as number | null,
    discovered_count: 0,
    imported_count: 0,
    skipped_count: 0,
    failed_count: 0,
    earliest_activity_at: null as Date | null,
    latest_activity_at: null as Date | null,
    started_at: null as Date | null,
    completed_at: null as Date | null,
    last_error_code: null as string | null,
    created_at: new Date("2026-04-03T12:00:00.000Z"),
    updated_at: new Date("2026-04-03T12:00:00.000Z"),
  };
  const importRuns = {
    create: vi.fn(
      async (input: {
        kind: "history_sync" | "manual_sync" | "onboarding";
        profileId: string;
        integrationId?: string;
        integrationGeneration?: number;
        windowStartAt?: Date;
        windowEndAt?: Date;
        nextPage?: number;
        now?: Date;
      }) => {
        importRun = {
          ...importRun,
          profile_id: input.profileId,
          integration_id: input.integrationId ?? null,
          integration_generation: input.integrationGeneration ?? null,
          kind: input.kind,
          window_start_at: input.windowStartAt ?? null,
          window_end_at: input.windowEndAt ?? null,
          next_page: input.nextPage ?? null,
          created_at: input.now ?? new Date(),
        };
        return importRun;
      },
    ),
    start: vi.fn(async (_id: string, now = new Date()) => {
      importRun = { ...importRun, status: "running", started_at: now, updated_at: now };
      return importRun;
    }),
    resume: vi.fn(async (_id: string, now = new Date()) => {
      importRun = { ...importRun, status: "running", completed_at: null, updated_at: now };
      return importRun;
    }),
    read: vi.fn(async (id: string) => (id === importRun.id ? importRun : null)),
    recordPageCommitted: vi.fn(
      async (input: {
        discovered: number;
        imported: number;
        skipped: number;
        failed: number;
        earliestActivityAt: Date | null;
        latestActivityAt: Date | null;
        nextPage?: number | null;
        now?: Date;
      }) => {
        importRun = {
          ...importRun,
          discovered_count: importRun.discovered_count + input.discovered,
          imported_count: importRun.imported_count + input.imported,
          skipped_count: importRun.skipped_count + input.skipped,
          failed_count: importRun.failed_count + input.failed,
          earliest_activity_at:
            input.earliestActivityAt &&
            (!importRun.earliest_activity_at ||
              input.earliestActivityAt < importRun.earliest_activity_at)
              ? input.earliestActivityAt
              : importRun.earliest_activity_at,
          latest_activity_at:
            input.latestActivityAt &&
            (!importRun.latest_activity_at || input.latestActivityAt > importRun.latest_activity_at)
              ? input.latestActivityAt
              : importRun.latest_activity_at,
          next_page: input.nextPage ?? null,
          updated_at: input.now ?? new Date(),
        };
        return importRun;
      },
    ),
    complete: vi.fn(async (_id: string, now = new Date()) => {
      importRun = { ...importRun, status: "completed", completed_at: now, next_page: null };
      return importRun;
    }),
    fail: vi.fn(async (_id: string, errorCode: string, now = new Date()) => {
      importRun = {
        ...importRun,
        status: "failed",
        completed_at: now,
        last_error_code: errorCode,
      };
      return importRun;
    }),
    recordPage: vi.fn(),
  };
  return {
    getImportRun: () => importRun,
    importer: {
      importWorkoutSummary: vi.fn(),
    },
    providerSyncRepository: {
      bindJobImportRun: vi.fn().mockResolvedValue(true),
      claimDueJobs: vi.fn(),
      completeJobWithSyncState: vi.fn().mockResolvedValue(true),
      failJobWithSyncState: vi.fn().mockResolvedValue(true),
      isIntegrationGenerationActive: vi.fn(),
      markJobFailed: vi.fn(),
      markJobSucceeded: vi.fn(),
      renewJobLease: vi.fn().mockResolvedValue(true),
      continueJob: vi.fn().mockResolvedValue(true),
      updateSyncStateAfterFailure: vi.fn(),
      updateSyncStateAfterRun: vi.fn(),
    },
    importRuns,
    setImportRun: (run: typeof importRun) => {
      importRun = run;
    },
    wahooClient: {
      getWorkoutSummary: vi.fn(),
      listWorkoutSummaries: vi.fn(),
    },
    wahooRepository: {
      findWahooIntegrationByProfileId: vi.fn(),
      markWahooReconnectRequired: vi.fn().mockResolvedValue(true),
      updateWahooIntegrationTokens: vi.fn().mockResolvedValue(2),
    },
  };
}

function historyJob(payload: Record<string, unknown> = { trigger: "scheduled" }) {
  return {
    attempt: 1,
    dedupeKey: "provider-history-reconcile:integration-1:activity",
    id: "job-1",
    integrationGeneration: 1,
    integrationId: "integration-1",
    internalResourceId: null,
    jobType: "wahoo.activity_history_reconcile",
    maxAttempts: 5,
    payload,
    profileId: "profile-1",
    provider: "wahoo",
    resourceKind: "activity",
    runAt: "2026-04-03T12:00:00.000Z",
    status: "running",
  };
}

function activeIntegration() {
  return {
    accessToken: "access-1",
    expiresAt: null,
    externalId: "77",
    credentialGeneration: 1,
    id: "integration-1",
    integrationGeneration: 1,
    profileId: "profile-1",
    refreshToken: null,
  };
}

describe("WahooActivityHistoryJobService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("defers a queued bulk import when another profile import owns serialization", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(true);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.importRuns.start.mockImplementationOnce(async () => null as never);
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(deps.providerSyncRepository.continueJob).toHaveBeenCalledOnce();
    expect(deps.wahooClient.listWorkoutSummaries).not.toHaveBeenCalled();
    expect(deps.importRuns.fail).not.toHaveBeenCalled();
  });

  it("reconciles history using refreshed and persisted credentials", async () => {
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
      credentialGeneration: 1,
      expiresAt: "2026-04-03T12:00:30.000Z",
      externalId: "77",
      id: "integration-1",
      integrationGeneration: 1,
      profileId: "profile-1",
      refreshToken: "refresh-1",
    });
    deps.wahooClient.listWorkoutSummaries.mockResolvedValueOnce({
      sourceCount: 50,
      summaries: [{ ...createSummary(123), file: undefined }],
    });
    deps.wahooClient.listWorkoutSummaries.mockResolvedValueOnce({
      sourceCount: 0,
      summaries: [],
    });
    deps.wahooClient.getWorkoutSummary.mockResolvedValueOnce(createSummary(123));
    deps.importer.importWorkoutSummary.mockResolvedValue({
      success: true,
      activityId: "activity-1",
    });
    const wahooClientFactory = vi.fn(() => deps.wahooClient);
    const refreshAccessToken = vi.fn().mockResolvedValue({
      accessToken: "access-2",
      expiresAt: "2026-04-03T14:00:00.000Z",
      refreshToken: "refresh-2",
    });

    const service = new WahooActivityHistoryJobService({
      activateAccessToken: vi.fn(async () => undefined),
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      refreshAccessToken,
      wahooClientFactory,
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
      perPage: 30,
      startDate: "1900-01-01T00:00:00.000Z",
    });
    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledTimes(2);
    expect(deps.wahooClient.getWorkoutSummary).toHaveBeenCalledWith("456");
    expect(deps.wahooRepository.updateWahooIntegrationTokens).toHaveBeenCalledWith({
      accessToken: "access-2",
      credentialGeneration: 1,
      expectedCredentialGeneration: 1,
      expectedIntegrationGeneration: 1,
      expiresAt: "2026-04-03T14:00:00.000Z",
      integrationGeneration: 1,
      id: "integration-1",
      reconnectRequiredAt: null,
      refreshToken: "refresh-2",
    });
    expect(wahooClientFactory).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-2", refreshToken: "refresh-2" }),
    );
    expect(deps.importer.importWorkoutSummary).toHaveBeenCalledWith(77, createSummary(123), {
      integrationGeneration: 1,
      integrationId: "integration-1",
      importRunId: "import-run-1",
      deferAthleteStateRefresh: true,
      signal: expect.any(AbortSignal),
    });
    expect(deps.providerSyncRepository.completeJobWithSyncState).toHaveBeenCalledWith({
      expectedIntegrationGeneration: 1,
      highWatermark: "2026-04-03T12:00:00.000Z",
      id: "job-1",
      integrationId: "integration-1",
      metadata: {
        activityHistoryCoverage: {
          end: "2026-04-03T12:00:00.000Z",
          highWatermark: "2026-04-03T12:00:00.000Z",
          itemCount: 50,
          pageCount: 2,
          start: "1900-01-01T00:00:00.000Z",
          importRunId: "import-run-1",
          version: 3,
        },
      },
      provider: "wahoo",
      resource: "historical_activities",
      workerId: expect.stringMatching(/^worker-1:/),
    });
  });

  it("uses the persisted full-history import window", async () => {
    const deps = createDeps();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      historyJob({ trigger: "scheduled" }),
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.wahooClient.listWorkoutSummaries.mockResolvedValue({ sourceCount: 0, summaries: [] });
    const service = new WahooActivityHistoryJobService({
      activateAccessToken: vi.fn(async () => undefined),
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
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
      endDate: "2026-03-31T12:00:00.000Z",
      page: 1,
      perPage: 30,
      startDate: "1900-01-01T00:00:00.000Z",
    });
    expect(deps.providerSyncRepository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          activityHistoryCoverage: expect.objectContaining({
            start: "1900-01-01T00:00:00.000Z",
          }),
        },
      }),
    );
  });

  it("completes a terminal-page run after a crash without refetching or recounting", async () => {
    const deps = createDeps();
    const persistedTerminalRun = {
      ...deps.getImportRun(),
      discovered_count: 31,
      imported_count: 29,
      material_change_count: 17,
      next_page: null,
      skipped_count: 2,
      status: "running" as const,
    };
    deps.setImportRun(persistedTerminalRun);
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      historyJob({ trigger: "scheduled", importRunId: "import-run-1" }),
    ]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(true);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.wahooClient.listWorkoutSummaries).not.toHaveBeenCalled();
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
    expect(deps.importRuns.recordPageCommitted).not.toHaveBeenCalled();
    expect(deps.importRuns.complete).toHaveBeenCalledTimes(1);
    expect(deps.getImportRun()).toMatchObject({
      discovered_count: 31,
      imported_count: 29,
      material_change_count: 17,
      skipped_count: 2,
      status: "completed",
    });
    expect(deps.providerSyncRepository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          activityHistoryCoverage: expect.objectContaining({ itemCount: 31 }),
        },
      }),
    );
  });

  it("retries finalization after terminal import commit without refetching or recounting", async () => {
    const deps = createDeps();
    const persistedTerminalRun = {
      ...deps.getImportRun(),
      discovered_count: 31,
      imported_count: 29,
      material_change_count: 17,
      next_page: null,
      skipped_count: 2,
      status: "running" as const,
    };
    deps.setImportRun(persistedTerminalRun);
    deps.providerSyncRepository.claimDueJobs
      .mockResolvedValueOnce([historyJob({ trigger: "scheduled", importRunId: "import-run-1" })])
      .mockResolvedValueOnce([
        { ...historyJob({ trigger: "scheduled", importRunId: "import-run-1" }), attempt: 2 },
      ]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(true);
    deps.providerSyncRepository.completeJobWithSyncState.mockRejectedValueOnce(
      new Error("coverage persistence failed"),
    );
    deps.providerSyncRepository.failJobWithSyncState.mockResolvedValue(true);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    const countsAfterFirstAttempt = {
      discovered_count: deps.getImportRun().discovered_count,
      imported_count: deps.getImportRun().imported_count,
      skipped_count: deps.getImportRun().skipped_count,
    };

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.wahooClient.listWorkoutSummaries).not.toHaveBeenCalled();
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
    expect(deps.importRuns.recordPageCommitted).not.toHaveBeenCalled();
    expect(deps.importRuns.complete).toHaveBeenCalledTimes(1);
    expect(deps.importRuns.fail).not.toHaveBeenCalled();
    expect(deps.getImportRun()).toMatchObject({
      ...countsAfterFirstAttempt,
      status: "completed",
    });
    expect(deps.providerSyncRepository.completeJobWithSyncState).toHaveBeenCalledTimes(2);
    expect(deps.providerSyncRepository.completeJobWithSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: {
          activityHistoryCoverage: expect.objectContaining({
            importRunId: "import-run-1",
            itemCount: 31,
          }),
        },
      }),
    );
  });

  it("keeps the job retryable when atomic completion and coverage persistence fails", async () => {
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
        payload: { trigger: "scheduled" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-03T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({
      accessToken: "access-1",
      expiresAt: null,
      externalId: "77",
      id: "integration-1",
      profileId: "profile-1",
      refreshToken: null,
    });
    deps.wahooClient.listWorkoutSummaries.mockResolvedValue({ sourceCount: 0, summaries: [] });
    deps.providerSyncRepository.completeJobWithSyncState.mockRejectedValueOnce(
      new Error("coverage persistence failed"),
    );
    deps.providerSyncRepository.failJobWithSyncState.mockResolvedValueOnce(true);
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(deps.providerSyncRepository.failJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedIntegrationGeneration: 1,
        id: "job-1",
        integrationId: "integration-1",
        lastError: "activity_history_failed",
        provider: "wahoo",
        resource: "historical_activities",
        status: "failed",
        workerId: expect.stringMatching(/^worker-1:/),
      }),
    );

    deps.providerSyncRepository.claimDueJobs.mockResolvedValueOnce([
      {
        ...historyJob(),
        attempt: 2,
        payload: { importRunId: "import-run-1", trigger: "scheduled" },
      },
    ]);
    deps.providerSyncRepository.completeJobWithSyncState.mockResolvedValueOnce(true);

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledTimes(1);
    expect(deps.providerSyncRepository.completeJobWithSyncState).toHaveBeenCalledTimes(2);
  });

  it("aborts import work without stale finalization when lease renewal loses ownership", async () => {
    const deps = createDeps();
    vi.useFakeTimers();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(true);
    deps.providerSyncRepository.renewJobLease.mockResolvedValue(false);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.wahooClient.listWorkoutSummaries.mockResolvedValue({
      sourceCount: 1,
      summaries: [createSummary(123)],
    });
    let importSignal: AbortSignal | undefined;
    deps.importer.importWorkoutSummary.mockImplementation(
      (_providerUserId, _summary, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          importSignal = options.signal;
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    const processing = service.processDueJobs({ leaseMs: 3_000, workerId: "worker-1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.importer.importWorkoutSummary).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(processing).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(importSignal?.aborted).toBe(true);
    expect(deps.providerSyncRepository.completeJobWithSyncState).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.failJobWithSyncState).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobFailed).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.updateSyncStateAfterFailure).not.toHaveBeenCalled();
  });

  it("dead-letters token-limit refresh failures with actionable reset guidance", async () => {
    const deps = createDeps();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.providerSyncRepository.failJobWithSyncState.mockResolvedValue(true);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({
      ...activeIntegration(),
      expiresAt: "2026-04-03T11:00:00.000Z",
      reconnectRequiredAt: null,
      refreshToken: "refresh-1",
    });
    const service = new WahooActivityHistoryJobService({
      activateAccessToken: vi.fn(),
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      refreshAccessToken: vi.fn().mockRejectedValue(new WahooAuthorizationResetRequiredError()),
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(deps.providerSyncRepository.failJobWithSyncState).toHaveBeenCalledWith({
      expectedIntegrationGeneration: 1,
      id: "job-1",
      integrationId: "integration-1",
      lastError: WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE,
      nextRunAt: undefined,
      provider: "wahoo",
      resource: "historical_activities",
      status: "dead_lettered",
      workerId: expect.stringMatching(/^worker-1:/),
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
      expiresAt: null,
      externalId: "77",
      id: "integration-1",
      profileId: "profile-1",
      refreshToken: null,
    });
    deps.wahooClient.listWorkoutSummaries.mockResolvedValueOnce({
      sourceCount: 2,
      summaries: [createSummary(123), createSummary(124)],
    });
    deps.importer.importWorkoutSummary
      .mockResolvedValueOnce({ success: false, error: "storage offline" })
      .mockResolvedValueOnce({ success: true, skipped: true, reason: "Activity already imported" });

    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
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
    expect(deps.providerSyncRepository.failJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedIntegrationGeneration: 1,
        id: "job-1",
        integrationId: "integration-1",
        lastError: "activity_history_failed",
        provider: "wahoo",
        resource: "historical_activities",
        status: "failed",
        workerId: expect.stringMatching(/^wahoo-activity-history-worker:/),
      }),
    );
  });

  it.each([
    ["missing", undefined, "missing_started_at"],
    ["invalid", "not-a-date", "invalid_started_at"],
  ] as const)("dead-letters %s imported started_at without a wall-clock fallback", async (_, startedAt, lastError) => {
    const deps = createDeps();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.providerSyncRepository.markJobFailed.mockResolvedValue(true);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.wahooClient.listWorkoutSummaries.mockResolvedValue({
      sourceCount: 1,
      summaries: [{ ...createSummary(123), started_at: startedAt }],
    });

    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
    expect(deps.wahooClient.getWorkoutSummary).not.toHaveBeenCalled();
    expect(deps.importRuns.recordPageCommitted).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.completeJobWithSyncState).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.failJobWithSyncState).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobFailed).toHaveBeenCalledWith({
      id: "job-1",
      lastError,
      status: "dead_lettered",
      workerId: expect.stringMatching(/^worker-1:/),
    });
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
      importRuns: deps.importRuns as never,
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
      expect.stringMatching(/^wahoo-activity-history-worker:/),
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
      importRuns: deps.importRuns as never,
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
      workerId: expect.stringMatching(/^wahoo-activity-history-worker:/),
    });
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
  });

  it("terminates at the documented total and records import-run coverage metadata", async () => {
    const deps = createDeps();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.wahooClient.listWorkoutSummaries
      .mockResolvedValueOnce({ page: 1, sourceCount: 30, summaries: [], total: 31 })
      .mockResolvedValueOnce({ page: 2, sourceCount: 1, summaries: [], total: 31 });
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledTimes(2);
    expect(deps.providerSyncRepository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          activityHistoryCoverage: expect.objectContaining({
            itemCount: 31,
            pageCount: 2,
            importRunId: "import-run-1",
            version: 3,
          }),
        },
      }),
    );
  });

  it("stops on a full page when the client observes the raw start boundary", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.wahooClient.listWorkoutSummaries.mockResolvedValue({
      page: 1,
      reachedStartBoundary: true,
      sourceCount: 30,
      summaries: [],
      total: null,
    });
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toMatchObject({
      completed: 1,
    });
    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a total beyond the budget", 721],
    ["no terminal evidence", null],
  ])("continues resumably after bounded per-lease work with %s", async (_case, total) => {
    const deps = createDeps();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.wahooClient.listWorkoutSummaries.mockImplementation(({ page }) =>
      Promise.resolve({ page, sourceCount: 30, summaries: [], total }),
    );
    deps.providerSyncRepository.failJobWithSyncState.mockResolvedValue(true);
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledTimes(4);
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.completeJobWithSyncState).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.continueJob).toHaveBeenCalledWith(
      expect.objectContaining({ importRunId: "import-run-1", payload: expect.any(Object) }),
    );
    expect(deps.importRuns.recordPageCommitted).toHaveBeenLastCalledWith(
      expect.objectContaining({ nextPage: 5 }),
    );
  });

  it("does not impose the former 720-item total cap", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    deps.wahooClient.listWorkoutSummaries.mockImplementation(({ page }) =>
      Promise.resolve({ page, sourceCount: 30, summaries: [], total: 720 }),
    );
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toMatchObject({
      completed: 1,
    });
    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledTimes(4);
    expect(deps.providerSyncRepository.continueJob).toHaveBeenCalledOnce();
    expect(deps.providerSyncRepository.completeJobWithSyncState).not.toHaveBeenCalled();
  });

  it.each([
    0,
    1.5,
    {},
  ])("dead-letters malformed import-run identity before provider calls", async (importRunId) => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      historyJob({ trigger: "scheduled", importRunId }),
    ]);
    deps.providerSyncRepository.markJobFailed.mockResolvedValue(true);
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toMatchObject({
      failed: 1,
    });
    expect(deps.providerSyncRepository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dead_lettered" }),
    );
    expect(deps.wahooRepository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
    expect(deps.wahooClient.listWorkoutSummaries).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing run", null],
    ["a cross-profile run", { profile_id: "profile-2" }],
    ["a cross-integration run", { integration_id: "integration-2" }],
    ["a stale-generation run", { integration_generation: 2 }],
  ])("dead-letters %s before credential or provider I/O", async (_case, override) => {
    const deps = createDeps();
    const existing = await deps.importRuns.read("import-run-1");
    if (!existing) throw new Error("Expected import-run fixture");
    deps.importRuns.read.mockResolvedValueOnce(
      override === null ? null : { ...existing, ...override },
    );
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      historyJob({ trigger: "scheduled", importRunId: "import-run-1" }),
    ]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(true);
    deps.providerSyncRepository.markJobFailed.mockResolvedValue(true);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(activeIntegration());
    const activateAccessToken = vi.fn(async () => undefined);
    const refreshAccessToken = vi.fn();
    const wahooClientFactory = vi.fn(() => deps.wahooClient);
    const service = new WahooActivityHistoryJobService({
      activateAccessToken,
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      refreshAccessToken,
      wahooClientFactory,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(deps.providerSyncRepository.markJobFailed).toHaveBeenCalledWith({
      id: "job-1",
      lastError: "Invalid activity import run identity",
      status: "dead_lettered",
      workerId: expect.stringMatching(/^worker-1:/),
    });
    expect(deps.importRuns.fail).not.toHaveBeenCalled();
    expect(activateAccessToken).not.toHaveBeenCalled();
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(wahooClientFactory).not.toHaveBeenCalled();
    expect(deps.importer.importWorkoutSummary).not.toHaveBeenCalled();
  });

  it.each([
    ["the initial authority check", 1, 0, 0, 0, 0],
    ["credential refresh", 3, 0, 0, 1, 0],
    ["the history list", 5, 1, 0, 1, 0],
    ["the detail lookup", 7, 1, 1, 1, 0],
    ["the post-import authority check", 6, 1, 0, 1, 1],
    ["finalization", 7, 1, 0, 1, 1],
  ])("stops all subsequent work when disconnect linearizes after %s", async (_boundary, falseOnGuard, expectedLists, expectedDetails, expectedRefreshes, expectedImports) => {
    const deps = createDeps();
    const summary = expectedDetails
      ? { ...createSummary(123), file: undefined }
      : createSummary(123);
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "history-1",
        id: "job-1",
        integrationGeneration: 1,
        integrationId: "integration-1",
        internalResourceId: null,
        jobType: "wahoo.activity_history_reconcile",
        maxAttempts: 5,
        payload: { trigger: "scheduled" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-03T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockImplementation(() =>
      Promise.resolve(
        deps.providerSyncRepository.isIntegrationGenerationActive.mock.calls.length < falseOnGuard,
      ),
    );
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({
      accessToken: "access-1",
      expiresAt: "2026-04-03T12:00:30.000Z",
      externalId: "77",
      credentialGeneration: 1,
      id: "integration-1",
      integrationGeneration: 1,
      profileId: "profile-1",
      refreshToken: "refresh-1",
    });
    deps.wahooClient.listWorkoutSummaries.mockResolvedValue({
      sourceCount: 1,
      summaries: [summary],
    });
    deps.wahooClient.getWorkoutSummary.mockResolvedValue(createSummary(123));
    deps.importer.importWorkoutSummary.mockResolvedValue({
      success: true,
      activityId: "activity-1",
    });
    const refreshAccessToken = vi.fn().mockResolvedValue({
      accessToken: "access-2",
      expiresAt: "2026-04-03T14:00:00.000Z",
      refreshToken: "refresh-2",
    });
    const service = new WahooActivityHistoryJobService({
      activateAccessToken: vi.fn(async () => undefined),
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      refreshAccessToken,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(refreshAccessToken).toHaveBeenCalledTimes(expectedRefreshes);
    expect(deps.wahooClient.listWorkoutSummaries).toHaveBeenCalledTimes(expectedLists);
    expect(deps.wahooClient.getWorkoutSummary).toHaveBeenCalledTimes(expectedDetails);
    expect(deps.importer.importWorkoutSummary).toHaveBeenCalledTimes(expectedImports);
    expect(deps.providerSyncRepository.completeJobWithSyncState).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobFailed).not.toHaveBeenCalled();
  });

  it("converges a stale history job when finalization was already claimed", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([historyJob()]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(false);
    deps.providerSyncRepository.markJobSucceeded.mockResolvedValue(false);
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "job-1",
      expect.stringMatching(/^worker-1:/),
    );
    expect(deps.wahooRepository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
  });

  it("stores only the finite failure code when provider diagnostics contain identifiers or raw response data", async () => {
    const deps = createDeps();
    const canary = "wahoo-workout-92831 token=secret route=/api/raw-response";
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "history-1",
        id: "job-1",
        integrationGeneration: 1,
        integrationId: "integration-1",
        internalResourceId: null,
        jobType: "wahoo.activity_history_reconcile",
        maxAttempts: 5,
        payload: { trigger: "scheduled" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-03T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.providerSyncRepository.isIntegrationGenerationActive.mockResolvedValue(true);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({
      accessToken: "access-1",
      expiresAt: null,
      externalId: "77",
      credentialGeneration: 1,
      id: "integration-1",
      integrationGeneration: 1,
      profileId: "profile-1",
      refreshToken: null,
    });
    deps.wahooClient.listWorkoutSummaries.mockRejectedValue(new Error(canary));
    deps.providerSyncRepository.failJobWithSyncState.mockResolvedValue(true);
    const service = new WahooActivityHistoryJobService({
      importer: deps.importer as never,
      importRuns: deps.importRuns as never,
      providerSyncRepository: deps.providerSyncRepository as never,
      wahooClientFactory: () => deps.wahooClient,
      wahooRepository: deps.wahooRepository,
    });

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    const durable = JSON.stringify([deps.providerSyncRepository.failJobWithSyncState.mock.calls]);
    expect(durable).toContain("activity_history_failed");
    expect(durable).not.toContain(canary);
  });
});
