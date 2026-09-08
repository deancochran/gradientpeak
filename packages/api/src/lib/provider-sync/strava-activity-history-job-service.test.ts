import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StravaRepository, StravaSyncJobRecord } from "../../repositories";
import { StravaActivityHistoryJobService } from "./strava-activity-history-job-service";

const summary = (id: number) => ({
  id,
  name: `Activity ${id}`,
  type: "Run",
  sport_type: "Run",
  start_date: "2026-09-01T10:00:00Z",
  elapsed_time: 600,
  moving_time: 590,
  distance: 2_000,
});

const job: StravaSyncJobRecord = {
  attempt: 1,
  id: "job",
  importRunId: null,
  integrationGeneration: 2,
  integrationId: "integration",
  jobType: "strava.activity_history_reconcile",
  maxAttempts: 8,
  payload: { trigger: "manual" },
  profileId: "profile",
  provider: "strava",
  status: "running",
};

function createDeps() {
  const repository = {
    claimDueJobs: vi.fn(async () => [job]),
    isIntegrationGenerationActive: vi.fn(async () => true),
    findIntegrationByProfileId: vi.fn(async () => ({
      accessToken: "fresh-access",
      credentialGeneration: 4,
      expiresAt: "2030-01-01T00:00:00Z",
      externalId: "456",
      id: "integration",
      integrationGeneration: 2,
      lifecycleStatus: "active" as const,
      profileId: "profile",
      reconnectRequiredAt: null,
      refreshToken: "refresh",
      scope: "activity:read_all",
    })),
    bindJobImportRun: vi.fn(async () => true),
    findDirectActivitySource: vi.fn(
      async (): Promise<{ activityId: string | null; resolutionStatus: string } | null> => ({
        activityId: "existing",
        resolutionStatus: "confirmed",
      }),
    ),
    renewJobLease: vi.fn(async () => true),
    completeHistoryJob: vi.fn(async () => true),
    failJob: vi.fn(async () => true),
    markJobSucceeded: vi.fn(async () => true),
    markReconnectRequired: vi.fn(async () => true),
    updateIntegrationTokens: vi.fn(),
    beginProviderDisconnectAttempt: vi.fn(),
    finalizeProviderDisconnect: vi.fn(),
  };
  const importRuns = {
    create: vi.fn(async () => ({ id: "import-run", status: "queued" })),
    read: vi.fn(async () => ({ id: "import-run", status: "queued" })),
    start: vi.fn(async () => ({ id: "import-run", status: "running" })),
    resume: vi.fn(),
    recordPageCommitted: vi.fn(async (_input: { discovered: number }) => ({ id: "import-run" })),
    complete: vi.fn(async () => ({ id: "import-run", status: "completed" })),
    fail: vi.fn(async () => ({ id: "import-run", status: "failed" })),
  };
  return { repository, importRuns };
}

beforeEach(() => {
  vi.stubEnv("STRAVA_CLIENT_ID", "client-id");
  vi.stubEnv("STRAVA_CLIENT_SECRET", "client-secret");
  vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "https://app.example.test");
});

afterEach(() => vi.unstubAllEnvs());

describe("Strava bounded activity history worker", () => {
  it("paginates only to 100 summaries and checks direct identity before details or streams", async () => {
    const deps = createDeps();
    const client = {
      listAthleteActivitiesPage: vi.fn(async ({ page }: { page: number }) => ({
        data: Array.from({ length: 30 }, (_, index) => summary((page - 1) * 30 + index + 1)),
        rateLimit: null,
      })),
      getActivity: vi.fn(),
      getActivityStreams: vi.fn(),
    };
    const service = new StravaActivityHistoryJobService({
      db: {} as never,
      importRuns: deps.importRuns as never,
      repository: deps.repository as unknown as StravaRepository,
      clientFactory: () => client as never,
      submitCanonicalActivity: vi.fn() as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(client.listAthleteActivitiesPage).toHaveBeenCalledTimes(4);
    expect(deps.repository.findDirectActivitySource).toHaveBeenCalledTimes(100);
    expect(client.getActivity).not.toHaveBeenCalled();
    expect(client.getActivityStreams).not.toHaveBeenCalled();
    expect(
      deps.importRuns.recordPageCommitted.mock.calls.map(([input]) => input.discovered),
    ).toEqual([30, 30, 30, 10]);
  });

  it("resumes a persisted import page without re-reading committed summaries", async () => {
    const deps = createDeps();
    const resumedRun = {
      discovered_count: 60,
      id: "import-run",
      next_page: 3,
      status: "running",
      window_end_at: new Date("2026-09-08T00:00:00.000Z"),
      window_start_at: new Date("2026-06-10T00:00:00.000Z"),
    };
    deps.importRuns.read.mockResolvedValue(resumedRun as never);
    deps.importRuns.start.mockResolvedValue(resumedRun as never);
    const client = {
      listAthleteActivitiesPage: vi.fn(async ({ page }: { page: number }) => ({
        data: Array.from({ length: 30 }, (_, index) => summary((page - 1) * 30 + index + 1)),
        rateLimit: null,
      })),
      getActivity: vi.fn(),
      getActivityStreams: vi.fn(),
    };
    const service = new StravaActivityHistoryJobService({
      db: {} as never,
      importRuns: deps.importRuns as never,
      repository: deps.repository as unknown as StravaRepository,
      clientFactory: () => client as never,
      submitCanonicalActivity: vi.fn() as never,
    });

    await service.processDueJobs({ workerId: "test" });
    expect(client.listAthleteActivitiesPage.mock.calls[0]?.[0]).toMatchObject({
      after: 1_781_049_600,
      before: 1_788_825_600,
      page: 3,
    });
    expect(deps.repository.findDirectActivitySource).toHaveBeenCalledTimes(40);
  });

  it("recovers a completed import by atomically completing its history job", async () => {
    const deps = createDeps();
    deps.importRuns.read.mockResolvedValue({
      id: "import-run",
      status: "completed",
      window_end_at: new Date("2026-09-08T00:00:00.000Z"),
    } as never);
    const listAthleteActivitiesPage = vi.fn();
    const service = new StravaActivityHistoryJobService({
      db: {} as never,
      importRuns: deps.importRuns as never,
      repository: deps.repository as unknown as StravaRepository,
      clientFactory: () => ({ listAthleteActivitiesPage }) as never,
      submitCanonicalActivity: vi.fn() as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(listAthleteActivitiesPage).not.toHaveBeenCalled();
    expect(deps.repository.completeHistoryJob).toHaveBeenCalledWith(
      expect.objectContaining({
        highWatermark: "2026-09-08T00:00:00.000Z",
        metadata: { recovered_completed_import: true },
      }),
    );
  });

  it("does not restart page one after a terminal page was durably committed", async () => {
    const deps = createDeps();
    const terminalRun = {
      discovered_count: 12,
      id: "import-run",
      next_page: null,
      status: "running",
      window_end_at: new Date("2026-09-08T00:00:00.000Z"),
      window_start_at: new Date("2026-06-10T00:00:00.000Z"),
    };
    deps.importRuns.read.mockResolvedValue(terminalRun as never);
    deps.importRuns.start.mockResolvedValue(terminalRun as never);
    const listAthleteActivitiesPage = vi.fn();
    const service = new StravaActivityHistoryJobService({
      db: {} as never,
      importRuns: deps.importRuns as never,
      repository: deps.repository as unknown as StravaRepository,
      clientFactory: () => ({ listAthleteActivitiesPage }) as never,
      submitCanonicalActivity: vi.fn() as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(listAthleteActivitiesPage).not.toHaveBeenCalled();
    expect(deps.importRuns.complete).toHaveBeenCalledWith("import-run");
  });

  it("maps detail and raw streams into a private artifact-free canonical submission", async () => {
    const deps = createDeps();
    deps.repository.findDirectActivitySource.mockResolvedValue(null);
    const client = {
      listAthleteActivitiesPage: vi.fn(async () => ({ data: [summary(123)], rateLimit: null })),
      getActivity: vi.fn(async () => ({
        data: { ...summary(123), athlete: { id: 456 } },
        rateLimit: null,
      })),
      getActivityStreams: vi.fn(async () => ({
        data: {
          time: { data: [0, 60], original_size: 2, resolution: "high", series_type: "time" },
          heartrate: {
            data: [120, 140],
            original_size: 2,
            resolution: "high",
            series_type: "time",
          },
        },
        rateLimit: null,
      })),
    };
    const submitCanonicalActivity = vi.fn(
      async (_db: unknown, _input: unknown, _options: unknown) => ({
        id: "canonical",
        compositionResult: undefined,
        noOp: false,
        resolutionStatus: "confirmed" as const,
        reviewCandidateActivityId: null,
      }),
    );
    const service = new StravaActivityHistoryJobService({
      db: {} as never,
      importRuns: deps.importRuns as never,
      repository: deps.repository as unknown as StravaRepository,
      clientFactory: () => client as never,
      submitCanonicalActivity: submitCanonicalActivity as never,
    });

    await service.processDueJobs({ workerId: "test" });
    expect(submitCanonicalActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contentVisibility: "private",
        providerProvenance: expect.objectContaining({
          provider: "strava",
          evidenceTier: "raw_samples",
        }),
      }),
      expect.objectContaining({ stageProbableProviderDuplicates: true }),
    );
    expect(submitCanonicalActivity.mock.calls[0]?.[1]).not.toHaveProperty(
      "analysis.ingestion.artifact",
    );
  });

  it("rejects detail that does not belong to the bound authenticated athlete", async () => {
    const deps = createDeps();
    deps.repository.findDirectActivitySource.mockResolvedValue(null);
    const client = {
      listAthleteActivitiesPage: vi.fn(async () => ({ data: [summary(123)], rateLimit: null })),
      getActivity: vi.fn(async () => ({
        data: { ...summary(123), athlete: { id: 999 } },
        rateLimit: null,
      })),
      getActivityStreams: vi.fn(),
    };
    const submitCanonicalActivity = vi.fn();
    const service = new StravaActivityHistoryJobService({
      db: {} as never,
      importRuns: deps.importRuns as never,
      repository: deps.repository as unknown as StravaRepository,
      clientFactory: () => client as never,
      submitCanonicalActivity: submitCanonicalActivity as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(client.getActivityStreams).not.toHaveBeenCalled();
    expect(submitCanonicalActivity).not.toHaveBeenCalled();
  });

  it("honors successful rate headers before spending detail and stream requests", async () => {
    const deps = createDeps();
    deps.repository.findDirectActivitySource.mockResolvedValue(null);
    const client = {
      listAthleteActivitiesPage: vi.fn(async () => ({
        data: [summary(123)],
        rateLimit: {
          limit15Minute: 100,
          limitDaily: 1_000,
          usage15Minute: 99,
          usageDaily: 100,
          remaining15Minute: 1,
          remainingDaily: 900,
        },
      })),
      getActivity: vi.fn(),
      getActivityStreams: vi.fn(),
    };
    const service = new StravaActivityHistoryJobService({
      db: {} as never,
      importRuns: deps.importRuns as never,
      repository: deps.repository as unknown as StravaRepository,
      clientFactory: () => client as never,
      submitCanonicalActivity: vi.fn() as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(client.getActivity).not.toHaveBeenCalled();
    expect(deps.repository.failJob).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "strava_rate_limited",
        nextRunAt: expect.any(String),
        status: "failed",
      }),
    );
  });
});
