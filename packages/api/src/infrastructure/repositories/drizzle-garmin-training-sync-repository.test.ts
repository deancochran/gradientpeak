import { activityPlanStructureSchema } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import type { GarminTrainingSyncState } from "../../lib/provider-sync/planned-activities/garmin-training-sync";
import { runGarminPlannedSessionSyncJobs } from "./drizzle-garmin-training-sync-repository";

const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "11111111-1111-4111-8111-111111111111",
      duration: { type: "time", seconds: 60 },
      targets: [],
    },
  ],
});

describe("Garmin planned-session worker entry", () => {
  it("executes an actual claimed row through the pre-POST recovery marker and injected fetch", async () => {
    const claimedRow = {
      id: "job-id",
      integrationGeneration: 2,
      integrationId: "integration-id",
      plannedSessionId: "session-id",
      profileId: "profile-id",
      operation: "publish" as const,
      planningDate: "2026-11-01",
    };
    let state: GarminTrainingSyncState = { kind: "none" };
    const store = {
      load: vi.fn(async () => state),
      isActiveAndGranted: vi.fn(async () => true),
      requireRecovery: vi.fn(async (_job, phase) => {
        state = { kind: "recovery_required", phase };
      }),
      recordActivityPlanOutcome: vi.fn(),
      recordScheduleOutcome: vi.fn(),
      saveActivityPlan: vi.fn(async (_job, link) => {
        state = { kind: "activityPlan", ...link };
      }),
      saveSchedule: vi.fn(async (_job, link) => {
        state = { kind: "scheduled", ...link };
      }),
      clear: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("workoutportal")) return new Response(JSON.stringify({ workoutId: 7 }));
      if (url.endsWith("/training-api/workout/v2/7")) {
        return new Response(
          JSON.stringify({
            workoutId: 7,
            ownerId: 9,
            workoutName: "Run",
            description: "",
            sport: "RUNNING",
            poolLength: null,
            poolLengthUnit: null,
            workoutProvider: "GRADIENTPEAK",
            workoutSourceId: "GRADIENTPEAK",
            isSessionTransitionEnabled: false,
            segments: [
              {
                segmentOrder: 1,
                sport: "RUNNING",
                poolLength: null,
                poolLengthUnit: null,
                estimatedDurationInSecs: 60,
                estimatedDistanceInMeters: null,
                steps: [
                  {
                    type: "WorkoutStep",
                    stepOrder: 1,
                    intensity: "ACTIVE",
                    description: null,
                    durationType: "TIME",
                    durationValue: 60,
                    durationValueType: "SECOND",
                    targetType: "OPEN",
                    targetValue: null,
                    targetValueLow: null,
                    targetValueHigh: null,
                    targetValueType: null,
                    secondaryTargetType: null,
                    secondaryTargetValue: null,
                    secondaryTargetValueLow: null,
                    secondaryTargetValueHigh: null,
                    secondaryTargetValueType: null,
                    strokeType: null,
                    drillType: null,
                    equipmentType: null,
                    exerciseCategory: null,
                    exerciseName: null,
                    weightValue: null,
                    weightDisplayUnit: null,
                  },
                ],
              },
            ],
          }),
        );
      }
      return new Response(JSON.stringify({ scheduleId: 8 }));
    });

    await expect(
      runGarminPlannedSessionSyncJobs({
        db: {} as never,
        workerId: "worker-a",
        fetchImpl: fetchImpl as typeof fetch,
        claimDueJobs: vi.fn(async () => [claimedRow]),
        createStore: () => store,
        resolveCredentials: vi.fn(async () => "fresh-token"),
        loadCurrentSession: vi.fn(async () => ({
          planningDate: "2026-11-01",
          activityPlan: { name: "Run", description: null, structure },
        })),
      }),
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0, recoveryRequired: 0 });

    expect(store.requireRecovery).toHaveBeenCalledWith(
      expect.objectContaining(claimedRow),
      "workout_create",
    );
    expect(store.requireRecovery).toHaveBeenCalledWith(
      expect.objectContaining(claimedRow),
      "schedule_create",
    );
    expect(store.complete).toHaveBeenCalledWith(expect.objectContaining(claimedRow));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
