import { describe, expect, it, vi } from "vitest";
import { executeGarminTrainingSyncJob, type GarminTrainingSyncState } from "./garmin-training-sync";

const job = {
  id: "job",
  integrationGeneration: 1,
  integrationId: "i",
  plannedSessionId: "s",
  profileId: "p",
  operation: "publish" as const,
  planningDate: "2026-11-01",
};
function fixture(state: GarminTrainingSyncState, active = true) {
  const store = {
    load: vi.fn(async () => state),
    isActiveAndGranted: vi.fn(async () => active),
    requireRecovery: vi.fn(),
    recordActivityPlanOutcome: vi.fn(),
    recordScheduleOutcome: vi.fn(),
    saveActivityPlan: vi.fn(async (_j, v) => {
      state = { kind: "activityPlan", ...v };
    }),
    saveSchedule: vi.fn(async (_j, v) => {
      state = { kind: "scheduled", ...v };
    }),
    clear: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
  const remote = {
    createActivityPlan: vi.fn(async () => ({ workoutId: 7, ownerId: 9 })),
    updateActivityPlan: vi.fn(),
    createSchedule: vi.fn(async () => ({ scheduleId: 8 })),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    deleteActivityPlan: vi.fn(),
  };
  return { remote, store };
}
describe("Garmin durable scheduled-activity-plan worker", () => {
  it("resumes schedule after activityPlan creation (two-resource partial failure)", async () => {
    const x = fixture({ kind: "activityPlan", workoutId: 7, ownerId: 9 });
    await expect(executeGarminTrainingSyncJob({ job, ...x })).resolves.toBe("completed");
    expect(x.remote.createActivityPlan).not.toHaveBeenCalled();
    expect(x.remote.createSchedule).toHaveBeenCalledOnce();
  });
  it("fails closed for missing permission and stale generation", async () => {
    const x = fixture({ kind: "none" }, false);
    await executeGarminTrainingSyncJob({ job, ...x });
    expect(x.remote.createActivityPlan).not.toHaveBeenCalled();
    expect(x.store.fail).toHaveBeenCalledWith(job, "missing_permission");
  });
  it("moves dates and cleans cancellation without duplicate activity plans", async () => {
    const x = fixture({
      kind: "scheduled",
      workoutId: 7,
      ownerId: 9,
      scheduleId: 8,
      date: "2026-10-31",
    });
    await executeGarminTrainingSyncJob({ job, ...x });
    expect(x.remote.updateSchedule).toHaveBeenCalledWith({
      workoutId: 7,
      scheduleId: 8,
      date: job.planningDate,
    });
    await executeGarminTrainingSyncJob({ job: { ...job, operation: "cancel" }, ...x });
    expect(x.remote.deleteSchedule).toHaveBeenCalledWith(8);
    expect(x.remote.deleteActivityPlan).toHaveBeenCalledWith({
      workoutId: 7,
      ownerId: 9,
      kind: "activityPlan",
    });
  });
  it("records a returned activityPlan identity then fences a generation that changes", async () => {
    const x = fixture({ kind: "none" });
    x.store.isActiveAndGranted.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(executeGarminTrainingSyncJob({ job, ...x })).resolves.toBe("failed");
    expect(x.store.recordActivityPlanOutcome).toHaveBeenCalledWith(job, {
      workoutId: 7,
      ownerId: 9,
    });
    expect(x.store.saveActivityPlan).not.toHaveBeenCalled();
    expect(x.remote.createSchedule).not.toHaveBeenCalled();
    expect(x.store.fail).toHaveBeenCalledWith(job, "stale_generation");
  });
  it("does not duplicate an unknown POST and exposes recovery", async () => {
    const x = fixture({ kind: "recovery_required", phase: "workout_create" });
    await expect(executeGarminTrainingSyncJob({ job, ...x })).resolves.toBe("recovery_required");
    expect(x.remote.createActivityPlan).not.toHaveBeenCalled();
    expect(x.store.fail).toHaveBeenCalledWith(job, "recovery_required");
  });
  it("dedupes repeat execution after a durable schedule link", async () => {
    const x = fixture({
      kind: "scheduled",
      workoutId: 7,
      ownerId: 9,
      scheduleId: 8,
      date: job.planningDate,
    });
    await executeGarminTrainingSyncJob({ job, ...x });
    expect(x.remote.createActivityPlan).not.toHaveBeenCalled();
    expect(x.remote.createSchedule).not.toHaveBeenCalled();
  });
  it("updates a published activityPlan when its desired projection changes without another POST", async () => {
    const x = fixture({
      kind: "scheduled",
      workoutId: 7,
      ownerId: 9,
      scheduleId: 8,
      date: job.planningDate,
      appliedProjectionHash: "old",
    });
    await expect(
      executeGarminTrainingSyncJob({ job: { ...job, desiredProjectionHash: "new" }, ...x }),
    ).resolves.toBe("completed");
    expect(x.remote.updateActivityPlan).toHaveBeenCalledWith(
      expect.objectContaining({ workoutId: 7, ownerId: 9 }),
    );
    expect(x.remote.createActivityPlan).not.toHaveBeenCalled();
    expect(x.remote.createSchedule).not.toHaveBeenCalled();
  });
});
