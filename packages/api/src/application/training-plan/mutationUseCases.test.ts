import { describe, expect, it, vi } from "vitest";
import { deleteTrainingPlanUseCase } from "./mutationUseCases";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TRAINING_PLAN_ID = "22222222-2222-4222-8222-222222222222";

describe("deleteTrainingPlanUseCase", () => {
  it("deletes only an owned template without planned-session history", async () => {
    const historyLimit = vi.fn().mockResolvedValue([]);
    const historyWhere = vi.fn(() => ({ limit: historyLimit }));
    const historyFrom = vi.fn(() => ({ where: historyWhere }));
    const select = vi.fn(() => ({ from: historyFrom }));
    const deleteWhere = vi.fn().mockResolvedValue([]);
    const deletePlan = vi.fn(() => ({ where: deleteWhere }));
    const transaction = vi.fn(async (callback) => callback({ select, delete: deletePlan }));
    const db = { transaction };
    const repository = {
      getOwnedTrainingPlan: vi.fn().mockResolvedValue({ id: TRAINING_PLAN_ID }),
    };

    await expect(
      deleteTrainingPlanUseCase({
        db: db as never,
        id: TRAINING_PLAN_ID,
        profileId: PROFILE_ID,
        repository: repository as never,
      }),
    ).resolves.toEqual({ success: true });

    expect(transaction).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledOnce();
    expect(deletePlan).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
  });

  it("returns a defined conflict when planned-session history references the plan", async () => {
    const historyLimit = vi.fn().mockResolvedValue([{ id: "session-1" }]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: historyLimit })) })),
    }));
    const repository = {
      getOwnedTrainingPlan: vi.fn().mockResolvedValue({ id: TRAINING_PLAN_ID }),
    };

    await expect(
      deleteTrainingPlanUseCase({
        db: {
          transaction: async (callback: (tx: { select: typeof select }) => unknown) =>
            callback({ select }),
        } as never,
        id: TRAINING_PLAN_ID,
        profileId: PROFILE_ID,
        repository: repository as never,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(select).toHaveBeenCalledOnce();
  });

  it("does not delete anything when the owned template is absent", async () => {
    const repository = { getOwnedTrainingPlan: vi.fn().mockResolvedValue(null) };

    await expect(
      deleteTrainingPlanUseCase({
        db: {} as never,
        id: TRAINING_PLAN_ID,
        profileId: PROFILE_ID,
        repository: repository as never,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.getOwnedTrainingPlan).toHaveBeenCalledOnce();
  });
});
