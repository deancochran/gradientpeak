import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    getOwned: vi.fn(),
    mutateOwned: vi.fn(),
  },
  derive: vi.fn(),
  tx: {} as never,
}));

vi.mock("../../db", () => ({
  withProfileFencedRepeatableReadSnapshot: async (
    _db: unknown,
    _profileId: string,
    work: (tx: unknown) => unknown,
  ) => work(mocks.tx),
}));
vi.mock("../../infrastructure/repositories", () => ({
  createDrizzlePlannedSessionRepository: () => mocks.repository,
}));
vi.mock("../operation-receipts", () => ({
  executeWithOperationReceipt: async (input: {
    tx: unknown;
    authorize: (tx: unknown) => Promise<boolean | undefined>;
    mutate: (tx: unknown) => unknown;
  }) => {
    if ((await input.authorize(input.tx)) === false) throw new Error("unauthorized");
    return input.mutate(input.tx);
  },
}));
vi.mock("./preview-planned-session-scenario", () => ({
  derivePlannedSessionScenario: mocks.derive,
}));

import { applyPlannedSessionScenario } from "./apply-planned-session-scenario";

const profileId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const fingerprint = `v1:sha256:${"a".repeat(64)}`;
const now = new Date("2026-08-01T12:00:00.000Z");
const session = {
  contractVersion: "planned-session-v1",
  id: sessionId,
  profileId,
  sessionRevision: 1,
  planningDate: "2026-08-10",
  originalTargetDate: "2026-08-10",
  source: { kind: "direct", operationId: "a".repeat(32) },
  idempotencyKey: "a".repeat(64),
  groupEventId: null,
  activityPlanId: "33333333-3333-4333-8333-333333333333",
  lifecycle: { status: "scheduled" },
};

describe("applyPlannedSessionScenario", () => {
  const request = {
    preview: {
      sessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: 1,
      scenario: { kind: "as_planned" as const },
    },
    expectedPreviewFingerprint: fingerprint,
    operationId: "scenario-apply-operation-id-000000",
  };

  it("returns a truthful durable no-op receipt for an as-planned preview", async () => {
    mocks.repository.getOwned.mockReset();
    mocks.repository.mutateOwned.mockReset();
    mocks.repository.getOwned.mockResolvedValue(session);
    mocks.derive.mockReset();
    mocks.derive.mockResolvedValue({
      status: "available",
      previewFingerprint: fingerprint,
      selectedSession: { id: sessionId, sessionRevision: 1, planningDate: "2026-08-10" },
      stateRevision: 1,
      provenance: {
        selectedPlan: { id: session.activityPlanId, revision: 1 },
        selectedAlternative: null,
      },
    });

    await expect(
      applyPlannedSessionScenario({
        db: {} as never,
        actorId: profileId,
        profileId,
        now,
        enqueueProviderSync: vi.fn(),
        request,
      }),
    ).resolves.toMatchObject({
      status: "applied",
      action: "unchanged",
      createdActivityPlanId: null,
    });
    expect(mocks.repository.mutateOwned).not.toHaveBeenCalled();
  });

  it("returns a typed stale result without writing when the one-transaction rederivation changed", async () => {
    mocks.repository.getOwned.mockReset();
    mocks.repository.mutateOwned.mockReset();
    mocks.repository.getOwned.mockResolvedValue(session);
    mocks.derive.mockReset();
    mocks.derive.mockResolvedValue({
      status: "stale",
      reason: "state_revision",
      currentSessionRevision: null,
      currentPlanRevision: null,
      currentStateRevision: 2,
    });

    await expect(
      applyPlannedSessionScenario({
        db: {} as never,
        actorId: profileId,
        profileId,
        now,
        enqueueProviderSync: vi.fn(),
        request,
      }),
    ).resolves.toEqual({
      status: "stale",
      reason: "state_revision",
      currentSessionRevision: null,
      currentPlanRevision: null,
      currentStateRevision: 2,
    });
    expect(mocks.repository.mutateOwned).not.toHaveBeenCalled();
  });
});
