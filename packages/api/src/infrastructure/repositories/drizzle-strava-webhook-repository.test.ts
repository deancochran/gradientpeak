import { schema } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import { createStravaRepository } from "./drizzle-strava-repository";

function createDb(input: { failJobInsert?: boolean } = {}) {
  const state = {
    jobs: [] as Array<Record<string, unknown>>,
    receipts: [] as Array<Record<string, unknown>>,
  };
  const integration = {
    generation: 2,
    id: "11111111-1111-4111-8111-111111111111",
    lifecycleStatus: "active",
    profileId: "22222222-2222-4222-8222-222222222222",
  };

  const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => {
    const snapshot = structuredClone(state);
    let selectedTable: unknown;
    const selectedRows = () => {
      if (selectedTable === schema.providerWebhookReceipts) {
        return state.receipts.map((receipt) => ({
          id: receipt.id,
          jobId: receipt.job_id ?? null,
        }));
      }
      if (selectedTable === schema.integrations) return [integration];
      if (selectedTable === schema.providerSyncJobs) return state.jobs;
      return [];
    };
    const selectQuery = {
      from(table: unknown) {
        selectedTable = table;
        return selectQuery;
      },
      where: () => selectQuery,
      orderBy: () => selectQuery,
      limit() {
        return selectedTable === schema.integrations
          ? { for: async () => selectedRows() }
          : Promise.resolve(selectedRows());
      },
    };
    const tx = {
      execute: vi.fn(async () => []),
      select: vi.fn(() => selectQuery),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          if (table === schema.providerWebhookReceipts) {
            const persist = () => {
              if (!state.receipts.some((receipt) => receipt.id === values.id)) {
                state.receipts.push({ ...values });
              }
            };
            return Promise.resolve().then(persist);
          }
          return {
            returning: async () => {
              if (input.failJobInsert) throw new Error("job insert unavailable");
              const row = {
                ...values,
                id: "33333333-3333-4333-8333-333333333333",
                status: "queued",
              };
              state.jobs.push(row);
              return [row];
            },
          };
        },
      })),
      update: vi.fn((table: unknown) => ({
        set(values: Record<string, unknown>) {
          return {
            where: () => ({
              returning: async () => {
                if (table === schema.providerWebhookReceipts && state.receipts[0]) {
                  Object.assign(state.receipts[0], values);
                  return [{ id: state.receipts[0].id }];
                }
                return [];
              },
            }),
          };
        },
      })),
    };
    try {
      return await operation(tx);
    } catch (error) {
      state.jobs = snapshot.jobs;
      state.receipts = snapshot.receipts;
      throw error;
    }
  });
  return { db: { transaction } as never, state };
}

const receipt = {
  deliveryId: "a".repeat(64),
  eventType: "activity.update",
  objectId: "123",
  objectType: "activity" as const,
  ownerExternalId: "456",
  payload: { accepted: true },
  priority: 50,
};

describe("Drizzle Strava webhook receipt transaction", () => {
  it("returns the immutable existing receipt without creating a duplicate job", async () => {
    const { db, state } = createDb();
    const repository = createStravaRepository({ db });
    const first = await repository.storeAndEnqueueWebhookReceipt(receipt);
    const duplicate = await repository.storeAndEnqueueWebhookReceipt(receipt);
    expect(first).toMatchObject({ inserted: true, queued: true });
    expect(duplicate).toEqual({
      inserted: false,
      jobId: first.jobId,
      queued: false,
      receiptId: first.receiptId,
    });
    expect(state.receipts).toHaveLength(1);
    expect(state.jobs).toHaveLength(1);
  });

  it("rolls back the receipt when its atomic job enqueue fails", async () => {
    const { db, state } = createDb({ failJobInsert: true });
    const repository = createStravaRepository({ db });
    await expect(repository.storeAndEnqueueWebhookReceipt(receipt)).rejects.toThrow(
      "job insert unavailable",
    );
    expect(state.receipts).toHaveLength(0);
    expect(state.jobs).toHaveLength(0);
  });
});
