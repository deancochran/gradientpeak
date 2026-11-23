import { integrationCredentials, integrations } from "@repo/db";
import { describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const transaction = { kind: "transaction" };
const mocks = vi.hoisted(() => ({
  enqueueJobInTransaction: vi.fn(),
  withOpenIntegrationManagementTransaction: vi.fn(),
}));

vi.mock("./integrations/onboarding-integration-gate", () => ({
  withOpenIntegrationManagementTransaction: mocks.withOpenIntegrationManagementTransaction,
}));
vi.mock("../infrastructure/repositories", () => ({
  createWahooSyncRepository: vi.fn(() => ({
    enqueueJobInTransaction: mocks.enqueueJobInTransaction,
  })),
}));

import { WahooProfileSetupService } from "./wahoo-profile-setup-service";

describe("WahooProfileSetupService.refreshSetupData", () => {
  it("does not enqueue when onboarding closes before the fenced transaction", async () => {
    const conflict = new Error("closed");
    mocks.withOpenIntegrationManagementTransaction.mockRejectedValue(conflict);
    const service = new WahooProfileSetupService({ db: {} as never });

    await expect(service.refreshSetupData(PROFILE_ID, "wahoo")).rejects.toBe(conflict);
    expect(mocks.enqueueJobInTransaction).not.toHaveBeenCalled();
  });

  it("uses the fenced transaction for enrichment admission and state persistence", async () => {
    const integration = {
      generation: 2,
      id: "22222222-2222-4222-8222-222222222222",
      lifecycle_status: "active",
      profile_id: PROFILE_ID,
      provider: "wahoo",
    };
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: () => ({
            limit: () =>
              table === integrationCredentials
                ? Promise.resolve([{ scope: "user_read" }])
                : table === integrations
                  ? { for: async () => [integration] }
                  : Promise.resolve([]),
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: () => ({ onConflictDoUpdate: async () => [] }),
      })),
    };
    Object.assign(transaction, tx);
    mocks.withOpenIntegrationManagementTransaction.mockImplementation(
      ({ operation }: { operation: (tx: unknown) => Promise<unknown> }) => operation(transaction),
    );
    mocks.enqueueJobInTransaction.mockResolvedValue({ id: "job", status: "queued" });
    const service = new WahooProfileSetupService({ db: {} as never });

    await expect(service.refreshSetupData(PROFILE_ID, "wahoo")).resolves.toMatchObject({
      status: "queued",
    });
    expect(mocks.enqueueJobInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ jobType: "wahoo.profile_enrichment" }),
    );
    expect(tx.insert).toHaveBeenCalled();
  });
});
