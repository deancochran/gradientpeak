import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOnboardingJobOwnership,
  createWahooSyncRepository,
  onboardingJobIdentityMatches,
  parseClaimedWahooSyncJobRows,
  parseQueueTelemetryRow,
} from "./drizzle-wahoo-sync-repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider sync queue database boundaries", () => {
  const claimedJobRow = {
    attempt: 1,
    dedupe_key: null,
    id: "00000000-0000-4000-8000-000000000001",
    import_run_id: null,
    integration_generation: 1,
    integration_id: "00000000-0000-4000-8000-000000000002",
    internal_resource_id: null,
    job_type: "wahoo.publish_event",
    last_error: null,
    max_attempts: 8,
    operation: null,
    payload: {},
    payload_hash: null,
    profile_id: "00000000-0000-4000-8000-000000000003",
    provider: "wahoo",
    queue_sequence: 1,
    resource_kind: "event",
    run_at: new Date("2026-09-15T00:00:00.000Z"),
    stale_lock_recovered: false,
    status: "running",
    supersedes_job_id: null,
    sync_lane_key: null,
  };

  it("normalizes finite queue telemetry counts after validating the aggregate row", () => {
    expect(
      parseQueueTelemetryRow({
        deadLetterDepth: "2",
        oldestDueAt: "2026-09-15T00:00:00.000Z",
        queueDepth: "3",
      }),
    ).toEqual({
      deadLetterDepth: 2,
      oldestDueAt: "2026-09-15T00:00:00.000Z",
      queueDepth: 3,
    });
  });

  it.each([
    { deadLetterDepth: 0, oldestDueAt: null, queueDepth: -1 },
    { deadLetterDepth: Number.POSITIVE_INFINITY, oldestDueAt: null, queueDepth: 0 },
    { deadLetterDepth: 0, oldestDueAt: null, queueDepth: Number.NaN },
  ])("rejects invalid queue telemetry counts: %#", (row) => {
    expect(() => parseQueueTelemetryRow(row)).toThrow();
  });

  it("strictly validates claimed CTE rows before mapping them to job records", () => {
    expect(parseClaimedWahooSyncJobRows([claimedJobRow])).toEqual([
      expect.objectContaining({
        provider: "wahoo",
        runAt: "2026-09-15T00:00:00.000Z",
        staleLockRecovered: false,
        status: "running",
      }),
    ]);
    expect(() =>
      parseClaimedWahooSyncJobRows([{ ...claimedJobRow, unexpected_column: "unexpected" }]),
    ).toThrow();
    expect(() => parseClaimedWahooSyncJobRows([{ ...claimedJobRow, status: "unknown" }])).toThrow(
      "Invalid provider sync job status",
    );
  });

  it("coerces raw PostgreSQL queue sequence and timestamp values", () => {
    expect(
      parseClaimedWahooSyncJobRows([
        { ...claimedJobRow, queue_sequence: "1", run_at: "2026-09-15T00:00:00.000Z" },
      ]),
    ).toEqual([
      expect.objectContaining({
        queueSequence: 1,
        runAt: "2026-09-15T00:00:00.000Z",
      }),
    ]);
  });

  it.each([
    { queue_sequence: null, run_at: claimedJobRow.run_at },
    { queue_sequence: claimedJobRow.queue_sequence, run_at: null },
    { queue_sequence: " ", run_at: claimedJobRow.run_at },
    { queue_sequence: claimedJobRow.queue_sequence, run_at: "not-a-timestamp" },
  ])("rejects absent or malformed required raw claim values: %#", (values) => {
    expect(() => parseClaimedWahooSyncJobRows([{ ...claimedJobRow, ...values }])).toThrow();
  });

  it("keeps selection and lease compare-and-swap in one SKIP LOCKED statement", async () => {
    vi.stubEnv("WAHOO_CLIENT_ID", "test-client");
    vi.stubEnv("WAHOO_CLIENT_SECRET", "test-secret");
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const tx = { execute };
    const repository = createWahooSyncRepository({
      db: { transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } as never,
    });

    await expect(
      repository.claimDueJobs({
        limit: 1,
        lockExpiresAt: "2026-09-15T00:01:00.000Z",
        now: "2026-09-15T00:00:00.000Z",
        workerId: "test-worker",
      }),
    ).resolves.toEqual([]);

    expect(execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as never);
    expect(query.sql).toContain("with candidate_rows as");
    expect(query.sql).toContain('from "provider_sync_jobs" as "candidate_provider_sync_jobs"');
    expect(query.sql).toContain('from "provider_sync_jobs" as "earlier_provider_sync_jobs"');
    expect(query.sql).toContain('from "provider_sync_jobs" as "running_provider_sync_jobs"');
    expect(query.sql).toContain("for update skip locked");
    expect(query.sql).toContain('update "provider_sync_jobs"');
  });
});

describe("provider retry enablement", () => {
  it("exposes provider-neutral lifecycle names alongside Wahoo compatibility methods", () => {
    const repository = createWahooSyncRepository({ db: {} as never });
    expect(repository.requestProviderDisconnect).toBeTypeOf("function");
    expect(repository.beginProviderDisconnectAttempt).toBeTypeOf("function");
    expect(repository.finalizeProviderDisconnect).toBeTypeOf("function");
    expect(repository.requestWahooDisconnect).toBeTypeOf("function");
  });

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
