import { providerCapabilityIsAuthorized } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import { projectGarminTrainingActivityPlan } from "../../integrations/garmin/training-mapper";
import { executeGarminTrainingSyncJob } from "./garmin-training-sync";
import { WahooPlannedActivitySyncService } from "./wahoo-planned-activity-sync-service";

describe("Garmin Training queue gating", () => {
  it("does not invoke the Wahoo delivery adapter for Garmin or Strava-only connections", async () => {
    const enqueuePublishPlannedSession = vi.fn();
    const enqueueUnsyncPlannedSession = vi.fn();
    const service = new WahooPlannedActivitySyncService({
      provider: "wahoo",
      enqueuePublishPlannedSession,
      enqueueUnsyncPlannedSession,
    });

    await expect(
      service.enqueue({
        connectedProviders: ["garmin", "strava"],
        plannedSessionIds: ["session-1"],
        operation: "publish",
        profileId: "profile-1",
      }),
    ).resolves.toBeNull();

    expect(enqueuePublishPlannedSession).not.toHaveBeenCalled();
    expect(enqueueUnsyncPlannedSession).not.toHaveBeenCalled();
  });

  it("treats WORKOUT_IMPORT as necessary but not sufficient for a disconnected worker lane", async () => {
    expect(
      providerCapabilityIsAuthorized({
        provider: "garmin",
        capability: "planned_activity_push",
        grantedScope: "WORKOUT_IMPORT",
      }),
    ).toBe(true);
    const remote = { createActivityPlan: vi.fn() };
    const store = {
      load: vi.fn(),
      isActiveAndGranted: vi.fn(async () => false),
      requireRecovery: vi.fn(),
      recordActivityPlanOutcome: vi.fn(),
      recordScheduleOutcome: vi.fn(),
      saveActivityPlan: vi.fn(),
      saveSchedule: vi.fn(),
      clear: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    await expect(
      executeGarminTrainingSyncJob({
        job: {
          id: "job",
          integrationGeneration: 1,
          integrationId: "integration",
          operation: "publish",
          plannedSessionId: "session",
          planningDate: "2026-11-01",
          profileId: "profile",
        },
        remote: remote as never,
        store,
      }),
    ).resolves.toBe("failed");
    expect(remote.createActivityPlan).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(expect.any(Object), "missing_permission");
  });

  it("rejects an unsupported prescription before it can create a Garmin lane", () => {
    expect(() =>
      projectGarminTrainingActivityPlan({
        name: "Swim session",
        description: null,
        structure: {
          version: 5,
          activity_category: "swim",
          items: [
            {
              type: "step",
              id: "00000000-0000-4000-8000-000000000001",
              duration: { type: "time", seconds: 300 },
              targets: [],
            },
          ],
        } as never,
      }),
    ).toThrow(/cannot preserve/i);
  });
});
