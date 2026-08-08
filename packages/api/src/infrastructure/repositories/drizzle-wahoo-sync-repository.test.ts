import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWahooSyncRepository } from "./drizzle-wahoo-sync-repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider retry enablement", () => {
  it("rejects direct Wahoo retry entrypoints before touching persistence when disabled", async () => {
    vi.stubEnv("WAHOO_CLIENT_ID", "");
    vi.stubEnv("WAHOO_CLIENT_SECRET", "");
    const transaction = vi.fn(() => {
      throw new Error("persistence must not run");
    });
    const repository = createWahooSyncRepository({ db: { transaction } as never });

    await expect(
      repository.retryJob({
        id: "00000000-0000-4000-8000-000000000001",
        provider: "wahoo",
      }),
    ).resolves.toBe(false);
    await expect(
      repository.retryWebhookReceipt({
        id: "00000000-0000-4000-8000-000000000002",
        provider: "wahoo",
      }),
    ).resolves.toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("scopes direct job retries to the caller-supplied provider identity and retryable states", async () => {
    let predicate: unknown;
    const returning = vi.fn().mockResolvedValue([]);
    const builder = {
      set: () => builder,
      where: (value: unknown) => {
        predicate = value;
        return { returning };
      },
    };
    const repository = createWahooSyncRepository({
      db: { update: vi.fn(() => builder) } as never,
    });

    await expect(
      repository.retryJob({
        id: "00000000-0000-4000-8000-000000000001",
        provider: "wahoo",
      }),
    ).resolves.toBe(false);
    const query = new PgDialect().sqlToQuery(predicate as never);
    expect(query.sql).toContain('"provider_sync_jobs"."id" = $1');
    expect(query.sql).toContain('"provider_sync_jobs"."provider" = $2');
    expect(query.sql).toContain('"provider_sync_jobs"."status" in ($3, $4)');
    expect(query.params).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "wahoo",
      "failed",
      "dead_lettered",
    ]);
  });

  it("scopes direct receipt retries to the caller-supplied provider before mutation", async () => {
    let predicate: unknown;
    const selectBuilder = {
      from: () => selectBuilder,
      where: (value: unknown) => {
        predicate = value;
        return selectBuilder;
      },
      limit: () => selectBuilder,
      for: vi.fn().mockResolvedValue([]),
    };
    const tx = { select: vi.fn(() => selectBuilder) };
    const repository = createWahooSyncRepository({
      db: { transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } as never,
    });

    await expect(
      repository.retryWebhookReceipt({
        id: "00000000-0000-4000-8000-000000000002",
        provider: "wahoo",
      }),
    ).resolves.toBe(false);
    const query = new PgDialect().sqlToQuery(predicate as never);
    expect(query.sql).toContain('"provider_webhook_receipts"."id" = $1');
    expect(query.sql).toContain('"provider_webhook_receipts"."provider" = $2');
    expect(query.sql).toContain('"provider_webhook_receipts"."processing_status" = $3');
    expect(query.params).toEqual(["00000000-0000-4000-8000-000000000002", "wahoo", "failed"]);
  });
});
