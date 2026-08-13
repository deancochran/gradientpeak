import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { deleteTrainingPlanUseCase } from "./mutationUseCases";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TRAINING_PLAN_ID = "22222222-2222-4222-8222-222222222222";

describe("deleteTrainingPlanUseCase", () => {
  it("deletes only the owned template and leaves Calendar Session ownership to its foreign key", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const transaction = vi.fn();
    const db = { execute, transaction };
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

    expect(transaction).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as never);
    expect(query.sql).toContain("delete from training_plans");
    expect(query.sql).not.toMatch(/delete\s+from\s+(?:events|activities|event_completions)/i);
    expect(query.params).toEqual([TRAINING_PLAN_ID, PROFILE_ID]);
  });

  it("does not delete anything when the owned template is absent", async () => {
    const execute = vi.fn();
    const repository = { getOwnedTrainingPlan: vi.fn().mockResolvedValue(null) };

    await expect(
      deleteTrainingPlanUseCase({
        db: { execute } as never,
        id: TRAINING_PLAN_ID,
        profileId: PROFILE_ID,
        repository: repository as never,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(execute).not.toHaveBeenCalled();
  });
});
