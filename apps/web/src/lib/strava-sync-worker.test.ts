import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  history: vi.fn(async () => ({ completed: 1, failed: 0, processed: 1 })),
  upload: vi.fn(async () => ({ completed: 1, failed: 0, processed: 1 })),
  webhook: vi.fn(async () => ({ completed: 2, failed: 0, processed: 2 })),
}));

vi.mock("./strava-sync-runtime", () => ({
  createStravaSyncRuntime: () => ({
    activityHistoryJobs: { processDueJobs: runtime.history },
    completedActivityUploadJobs: { processDueJobs: runtime.upload },
    webhookJobs: { processDueJobs: runtime.webhook },
  }),
  getStravaDrainConfig: () => ({ leaseMs: 600_000, limit: 4 }),
  isStravaIntegrationEnabled: () => true,
}));

import { drainStravaProviderSync } from "./strava-sync-worker";

beforeEach(() => {
  runtime.history.mockClear();
  runtime.upload.mockClear();
  runtime.webhook.mockClear();
});

describe("app-owned Strava worker", () => {
  it("bounds and divides one drain across webhook and history jobs", async () => {
    await expect(drainStravaProviderSync()).resolves.toEqual({
      alreadyRunning: false,
      result: {
        activityHistoryJobs: { completed: 1, failed: 0, processed: 1 },
        completedActivityUploadJobs: { completed: 1, failed: 0, processed: 1 },
        provider: "strava",
        webhookJobs: { completed: 2, failed: 0, processed: 2 },
      },
    });
    expect(runtime.webhook).toHaveBeenCalledWith({
      leaseMs: 600_000,
      limit: 1,
      workerId: "app-strava-webhook-drain",
    });
    expect(runtime.history).toHaveBeenCalledWith({
      leaseMs: 600_000,
      limit: 2,
      workerId: "app-strava-history-drain",
    });
    expect(runtime.upload).toHaveBeenCalledWith({
      leaseMs: 600_000,
      limit: 1,
      workerId: "app-strava-upload-drain",
    });
  });
});
