import type { DrizzleDbClient } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDrizzleAthleteIntelligenceRepository } from "../drizzle-athlete-intelligence-repository";

const dialect = new PgDialect();

function createExecuteDb(rows: Array<Record<string, unknown>[]> = []) {
  const queries: unknown[] = [];
  return {
    db: {
      execute: async (query: unknown) => {
        queries.push(query);
        return { rows: rows.shift() ?? [] };
      },
    } as unknown as DrizzleDbClient,
    queries,
  };
}

function toSql(query: unknown) {
  return dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
}

describe("drizzle athlete intelligence repository", () => {
  it("coalesces active profile jobs while unioning reason codes", async () => {
    const fake = createExecuteDb([[{ id: "job-1" }]]);
    const repository = createDrizzleAthleteIntelligenceRepository(fake.db);

    await repository.coalesceRecomputeJob({
      inputFingerprint: "fingerprint-2",
      now: new Date("2026-07-09T12:00:00.000Z"),
      profileId: "profile-1",
      reasonCodes: ["metrics_changed", "activity_imported"],
    });

    const query = toSql(fake.queries[0]);
    expect(query).toContain("ON CONFLICT (profile_id) WHERE status IN ('queued', 'running')");
    expect(query).toContain("jsonb_array_elements_text");
    expect(query).toContain("jsonb_agg(DISTINCT reason_code ORDER BY reason_code)");
    expect(query).toContain("target_input_fingerprint = EXCLUDED.target_input_fingerprint");
  });

  it("reclaims stale leases with an atomic skip-locked claim", async () => {
    const fake = createExecuteDb([[], [{ id: "job-1", status: "running" }]]);
    const repository = createDrizzleAthleteIntelligenceRepository(fake.db);

    await repository.claimNextRecomputeJob({
      leaseExpiresAt: new Date("2026-07-09T12:05:00.000Z"),
      now: new Date("2026-07-09T12:00:00.000Z"),
      workerId: "worker-1",
    });

    const claimSql = toSql(fake.queries[1]);
    expect(claimSql).toContain("status = 'running' AND lock_expires_at <");
    expect(claimSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimSql).toContain("attempt_count = job.attempt_count + 1");
  });

  it("requires an unexpired, fenced profile-worker-fingerprint lease before completion", async () => {
    const fake = createExecuteDb([[{ id: "job-1", status: "completed" }]]);
    const repository = createDrizzleAthleteIntelligenceRepository(fake.db);

    await expect(
      repository.completeRecomputeJob({
        expectedInputFingerprint: "fingerprint-2",
        expectedLeaseExpiresAt: new Date("2026-07-09T12:05:00.000Z"),
        jobId: "job-1",
        now: new Date("2026-07-09T12:00:00.000Z"),
        profileId: "profile-1",
        workerId: "worker-1",
      }),
    ).resolves.toBe("completed");

    const completionSql = toSql(fake.queries[0]);
    expect(completionSql).toContain("profile_id =");
    expect(completionSql).toContain("locked_by =");
    expect(completionSql).toContain("lock_expires_at =");
    expect(completionSql).toContain("lock_expires_at >");
    expect(completionSql).toContain("target_input_fingerprint =");
  });

  it("uses the same lease fence when a worker reports failure", async () => {
    const fake = createExecuteDb([[{ id: "job-1", status: "queued" }]]);
    const repository = createDrizzleAthleteIntelligenceRepository(fake.db);

    await repository.failRecomputeJob({
      error: "transient",
      expectedInputFingerprint: "fingerprint-2",
      expectedLeaseExpiresAt: new Date("2026-07-09T12:05:00.000Z"),
      jobId: "job-1",
      now: new Date("2026-07-09T12:00:00.000Z"),
      profileId: "profile-1",
      retryAt: new Date("2026-07-09T12:01:00.000Z"),
      workerId: "worker-1",
    });

    const failureSql = toSql(fake.queries[0]);
    expect(failureSql).toContain("lock_expires_at =");
    expect(failureSql).toContain("lock_expires_at >");
  });
});
