import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileManualPlannedSessionCompletion } from "./reconcile-manual-planned-session-completion";

const repository = vi.hoisted(() => ({
  getOwned: vi.fn(),
  getActivityPlanPrescriptionSource: vi.fn(),
}));
vi.mock("../../infrastructure/repositories", () => ({
  createDrizzlePlannedSessionRepository: () => repository,
}));

describe("recording completion reconciliation outcome", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    "full",
    "partial",
    undefined,
  ] as const)("persists explicit %s evidence while preserving callers without an override", async (outcome) => {
    const manualId = "11111111-1111-4111-8111-111111111111";
    const activityId = "22222222-2222-4222-8222-222222222222";
    const sessionId = "33333333-3333-4333-8333-333333333333";
    const session = {
      activityPlanId: "55555555-5555-4555-8555-555555555555",
      sessionRevision: 4,
      lifecycle: {
        status: "completed",
        completion: { state: "linked", activityId: manualId, outcome: "full" },
      },
      prescription: { resolutionManifest: { resolved_structure: { activity_category: "run" } } },
    };
    repository.getOwned
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, sessionRevision: 5 });
    repository.getActivityPlanPrescriptionSource.mockResolvedValue({
      structure: { activity_category: "run" },
    });
    const rows: unknown[][] = [[], [], [], [], [{ id: manualId }], [{ id: activityId }], []];
    const select = vi.fn(() => {
      const result = rows.shift() ?? [];
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => Object.assign(Promise.resolve(result), { for: () => Promise.resolve(result) }),
      };
      return builder;
    });
    const set = vi.fn();
    const update = vi.fn(() => {
      const builder = {
        set: (values: unknown) => {
          set(values);
          return builder;
        },
        where: () => builder,
        returning: async () => [{ id: sessionId }],
      };
      return builder;
    });
    await reconcileManualPlannedSessionCompletion({
      tx: { select, update } as never,
      profileId: "44444444-4444-4444-8444-444444444444",
      sessionId,
      expectedRevision: 4,
      activityId,
      operationId: "recording-operation",
      reconciledAt: new Date("2026-07-24T09:00:00Z"),
      ...(outcome ? { outcome } : {}),
    });
    const relink = set.mock.calls[1]?.[0];
    expect(relink).toMatchObject({ completed_activity_id: activityId });
    if (outcome) expect(relink).toHaveProperty("completion_outcome", outcome);
    else expect(relink).not.toHaveProperty("completion_outcome");
  });
});
