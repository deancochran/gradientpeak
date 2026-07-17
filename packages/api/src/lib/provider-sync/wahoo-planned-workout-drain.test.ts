import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainDueWahooPlannedWorkoutJobs } from "./wahoo-planned-workout-drain";

const mocks = vi.hoisted(() => {
  const repository = {
    getPlannedEventForSync: vi.fn(),
    getProfileSyncMetrics: vi.fn(),
    findWahooIntegrationByProfileId: vi.fn(),
    getRouteForSync: vi.fn(),
  };

  return {
    repository,
    processDueJobs: vi.fn(),
    syncResult: undefined as unknown,
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createProviderSyncRepository: vi.fn(() => ({})),
  createWahooRepository: vi.fn(() => mocks.repository),
}));

vi.mock("./job-execution", () => ({
  getProcessProviderSyncLimiter: vi.fn(() => ({ run: vi.fn() })),
}));

vi.mock("./wahoo-job-service", () => ({
  WahooSyncJobService: class MockWahooSyncJobService {
    constructor(
      private readonly deps: {
        syncService: {
          syncEvent(eventId: string, profileId: string): Promise<unknown>;
        };
      },
    ) {}

    async processDueJobs(input: unknown) {
      mocks.processDueJobs(input);
      mocks.syncResult = await this.deps.syncService.syncEvent("event-route", "profile-1");
      return { completed: 0, failed: 1, processed: 1 };
    }
  },
}));

describe("drainDueWahooPlannedWorkoutJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.getPlannedEventForSync.mockResolvedValue({
      id: "event-route",
      startsAt: "2026-07-13T12:00:00.000Z",
      activityPlan: {
        activityCategory: "run",
        description: null,
        id: "plan-route",
        name: "Route Run",
        routeId: "route-1",
        structure: {
          version: 3,
          segments: [
            {
              id: "40000000-0000-4000-8000-000000000001",
              role: "activity",
              category: "run",
              name: "Run",
              intervals: [
                {
                  id: "40000000-0000-4000-8000-000000000002",
                  name: "Set",
                  repetitions: 1,
                  steps: [
                    {
                      id: "40000000-0000-4000-8000-000000000003",
                      name: "Run",
                      duration: { type: "time", seconds: 600 },
                      targets: [{ type: "bpm", intensity: 150 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    });
    mocks.repository.getProfileSyncMetrics.mockResolvedValue(null);
    mocks.repository.findWahooIntegrationByProfileId.mockResolvedValue({
      accessToken: "access-token",
      expiresAt: null,
      id: "integration-1",
      refreshToken: "refresh-token",
    });
    mocks.repository.getRouteForSync.mockResolvedValue({
      description: null,
      filePath: "routes/route-1.gpx",
      id: "route-1",
      name: "Route One",
      totalAscent: 10,
      totalDescent: 10,
      totalDistance: 1000,
    });
  });

  it("keeps a due route job retryable when inline route storage is unavailable", async () => {
    await expect(drainDueWahooPlannedWorkoutJobs({ db: {} as never })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });

    expect(mocks.syncResult).toMatchObject({
      success: false,
      failureCode: "provider_failure",
      failureCategory: "provider",
      retryable: true,
    });
    expect(mocks.processDueJobs).toHaveBeenCalledWith({
      concurrency: 4,
      limit: 3,
      workerId: "calendar-planned-workout-drain",
    });
  });
});
