import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";
const transaction = { kind: "transaction" };

const mocks = vi.hoisted(() => ({
  enqueueJobInTransaction: vi.fn(),
  enqueueWahooPlannedSessionSyncAfterMutation: vi.fn(),
  refreshSetupDataInTransaction: vi.fn(),
  withOpenIntegrationManagementTransaction: vi.fn(),
}));

vi.mock("./onboarding-integration-gate", () => ({
  withOpenIntegrationManagementTransaction: mocks.withOpenIntegrationManagementTransaction,
}));
vi.mock("../../infrastructure/repositories", () => ({
  createWahooSyncRepository: vi.fn(() => ({
    enqueueJobInTransaction: mocks.enqueueJobInTransaction,
  })),
}));
vi.mock("../wahoo-profile-setup-service", () => ({
  WahooProfileSetupService: class {
    refreshSetupDataInTransaction(...args: unknown[]) {
      return mocks.refreshSetupDataInTransaction(...args);
    }
  },
}));
vi.mock("../../lib/provider-sync/planned-activities", () => ({
  enqueueWahooPlannedSessionSyncAfterMutation: mocks.enqueueWahooPlannedSessionSyncAfterMutation,
}));

import { syncIntegrationNow } from "./syncNowUseCase";

function createTx(input?: {
  scope?: string;
  integration?: boolean;
  events?: Array<{ id: string }>;
}) {
  const row =
    input?.integration === false
      ? []
      : [
          {
            integration: {
              generation: 3,
              id: INTEGRATION_ID,
              lifecycle_status: "active",
              profile_id: PROFILE_ID,
              provider: "wahoo",
            },
            grant: { scope: input?.scope ?? "workouts_read offline_data" },
          },
        ];
  return {
    select: vi.fn((selection: Record<string, unknown>) => ({
      from: vi.fn(() =>
        "integration" in selection
          ? {
              innerJoin: () => ({
                where: () => ({ limit: () => ({ for: async () => row }) }),
              }),
            }
          : {
              where: () => ({
                orderBy: () => ({ limit: async () => input?.events ?? [] }),
              }),
            },
      ),
    })),
  };
}

describe("syncIntegrationNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withOpenIntegrationManagementTransaction.mockImplementation(
      ({ operation }: { operation: (tx: unknown) => Promise<unknown> }) => operation(transaction),
    );
    mocks.refreshSetupDataInTransaction.mockResolvedValue({
      fieldsFilled: [],
      fieldsKept: [],
      fieldsUpdated: [],
      keptExistingValues: false,
      status: "queued",
    });
    mocks.enqueueJobInTransaction.mockResolvedValue({ id: "job-id", status: "queued" });
    mocks.enqueueWahooPlannedSessionSyncAfterMutation.mockResolvedValue({
      affectedCount: 1,
      operation: "publish",
      queued: true,
      success: true,
    });
  });

  afterEach(() => vi.useRealTimers());

  it("rejects lifecycle closure before any provider effect", async () => {
    const conflict = new Error("closed");
    mocks.withOpenIntegrationManagementTransaction.mockRejectedValue(conflict);

    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).rejects.toBe(conflict);
    expect(mocks.refreshSetupDataInTransaction).not.toHaveBeenCalled();
    expect(mocks.enqueueJobInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing integration without enqueuing", async () => {
    Object.assign(transaction, createTx({ integration: false }));
    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.enqueueJobInTransaction).not.toHaveBeenCalled();
  });

  it("rejects missing history scope inside the fenced transaction", async () => {
    Object.assign(transaction, createTx({ scope: "workouts_read" }));
    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.enqueueJobInTransaction).not.toHaveBeenCalled();
  });

  it("enqueues enrichment, history, and planned work through the same transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T15:00:00.000Z"));
    const tx = createTx({
      scope: "workouts_read workouts_write plans_read plans_write offline_data user_read",
      events: [{ id: "event-1" }],
    });
    Object.assign(transaction, tx);
    const db = {};

    await expect(
      syncIntegrationNow({ db: db as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).resolves.toMatchObject({ queued: true });
    expect(mocks.refreshSetupDataInTransaction).toHaveBeenCalledWith(
      transaction,
      PROFILE_ID,
      "wahoo",
    );
    expect(mocks.enqueueJobInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ jobType: "wahoo.activity_history_reconcile" }),
    );
    expect(mocks.enqueueWahooPlannedSessionSyncAfterMutation).toHaveBeenCalledWith({
      db,
      plannedSessionIds: ["event-1"],
      operation: "publish",
      profileId: PROFILE_ID,
      transaction,
    });
  });
});
