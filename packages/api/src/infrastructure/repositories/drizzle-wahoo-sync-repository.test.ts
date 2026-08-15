import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOnboardingJobOwnership,
  createWahooSyncRepository,
  onboardingJobIdentityMatches,
} from "./drizzle-wahoo-sync-repository";

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

describe("onboarding queue ownership", () => {
  const input = {
    dedupeKey: "wahoo-history-reconcile:integration-1:1",
    integrationId: "integration-1",
    integrationGeneration: 1,
    jobType: "wahoo.activity_history_reconcile",
    payload: { trigger: "onboarding" },
    profileId: "profile-1",
    provider: "wahoo" as const,
    resourceKind: "activity" as const,
    runAt: "2026-08-12T00:00:00.000Z",
    syncLaneKey: "wahoo:integration-1:activity-history",
  };
  const existing = {
    integrationGeneration: 1,
    integrationId: "integration-1",
    internalResourceId: null,
    jobType: "wahoo.activity_history_reconcile",
    operation: null,
    payloadHash: null,
    payloadMatches: true,
    profileId: "profile-1",
    provider: "wahoo",
    resourceKind: "activity" as const,
    status: "queued",
    trigger: "onboarding",
  };

  it("reuses an exact queued or running onboarding identity idempotently", () => {
    expect(onboardingJobIdentityMatches(existing, input, 1)).toBe(true);
  });

  it("adopts equivalent queued connection work when onboarding begins", () => {
    expect(() =>
      assertOnboardingJobOwnership(
        { ...existing, payloadMatches: false, trigger: "connect" },
        input,
        1,
      ),
    ).not.toThrow();
  });

  it.each(["manual", "connect"])("rejects incompatible queued %s work", (trigger) => {
    expect(() =>
      assertOnboardingJobOwnership(
        { ...existing, jobType: "other", payloadMatches: false, trigger },
        input,
        1,
      ),
    ).toThrow("Existing provider work must finish");
  });

  it("rejects a running identity mismatch", () => {
    expect(() =>
      assertOnboardingJobOwnership({ ...existing, jobType: "other", status: "running" }, input, 1),
    ).toThrow("Existing provider work must finish");
  });

  it("does not take over an equivalent running connection job", () => {
    expect(() =>
      assertOnboardingJobOwnership(
        { ...existing, payloadMatches: false, status: "running", trigger: "connect" },
        input,
        1,
      ),
    ).toThrow("Existing provider work must finish");
  });
});
