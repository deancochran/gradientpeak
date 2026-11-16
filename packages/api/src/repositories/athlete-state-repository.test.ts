import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import {
  claimNextAthleteState,
  markAthleteStateDirty,
  publishAthleteState,
  readPublishedAthleteStateSnapshotData,
} from "./athlete-state-repository";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const COMPUTED_AT = "2026-08-01T12:00:00.000Z";

describe("athlete-state analysis work claim", () => {
  it("carries the coalesced dirty boundary into the durable worker lease", async () => {
    const dirtyFromAt = new Date("2026-05-01T08:00:00.000Z");
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          profile_id: PROFILE_ID,
          source_revision: 9,
          planning_timezone: "UTC",
          dirty_from_at: dirtyFromAt,
          activity_analysis_cursor_started_at: null,
          activity_analysis_cursor_activity_id: null,
        },
      ],
    });

    await expect(
      claimNextAthleteState({ execute } as never, {
        now: new Date(COMPUTED_AT),
        leaseMilliseconds: 300_000,
        profileId: PROFILE_ID,
      }),
    ).resolves.toMatchObject({
      profileId: PROFILE_ID,
      sourceRevision: 9,
      dirtyFromAt,
      activityAnalysisCursor: null,
    });
  });

  it("cancels an old lease and cursor when newer dirty work is coalesced", async () => {
    const returning = vi.fn().mockResolvedValue([{ sourceRevision: 10 }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const tx = { insert: vi.fn(() => ({ values })) };
    const effectiveAt = new Date("2026-04-01T08:00:00.000Z");

    await expect(
      markAthleteStateDirty(tx as never, {
        profileId: PROFILE_ID,
        effectiveAt,
        now: new Date(COMPUTED_AT),
      }),
    ).resolves.toBe(10);

    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          activity_analysis_cursor_started_at: null,
          activity_analysis_cursor_activity_id: null,
          lease_token: null,
          lease_expires_at: null,
        }),
      }),
    );
  });
});

function publishedReadRow() {
  return {
    planning_timezone: "America/Los_Angeles",
    state: {
      profile_id: PROFILE_ID,
      source_revision: 5,
      published_revision: 4,
      dirty_from_at: "2026-07-31T12:00:00.000Z",
      activity_analysis_cursor_started_at: null,
      activity_analysis_cursor_activity_id: null,
      fitness: 40,
      fatigue: 35,
      evidence_confidence: 0.8,
      coverage_start_at: "2026-06-01T12:00:00.000Z",
      coverage_end_at: COMPUTED_AT,
      last_activity_at: COMPUTED_AT,
      algorithm_version: "athlete-state-projection-v1",
      computed_at: COMPUTED_AT,
      lease_token: null,
      lease_expires_at: null,
      retry_after: null,
      consecutive_failures: 0,
      last_failure_code: null,
      updated_at: COMPUTED_AT,
    },
    estimates: [
      {
        profile_id: PROFILE_ID,
        capability_kind: "longest_distance",
        activity_category: "run",
        value: 10_000,
        unit: "meters",
        confidence: 0.9,
        effective_at: COMPUTED_AT,
        evidence_window_start_at: null,
        evidence_window_end_at: COMPUTED_AT,
        algorithm_version: "athlete-state-projection-v1",
        source_revision: 4,
        computed_at: COMPUTED_AT,
      },
    ],
    blocking_import: "active" as const,
  };
}

describe("published athlete-state repository snapshot", () => {
  it("returns state, matching estimates, and import status from one profile-scoped statement", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [publishedReadRow()] });

    const result = await readPublishedAthleteStateSnapshotData({ execute } as never, {
      profileId: PROFILE_ID,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      planningTimezone: "America/Los_Angeles",
      blockingImport: "active",
      current: {
        state: { profile_id: PROFILE_ID, published_revision: 4 },
        estimates: [{ profile_id: PROFILE_ID, source_revision: 4, value: 10_000 }],
      },
    });
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as never);
    const normalizedSql = query.sql.replace(/\s+/g, " ");
    expect(normalizedSql).toContain('where "profile"."id" = $1');
    expect(normalizedSql).toContain('where "state"."profile_id" = $2');
    expect(normalizedSql).toContain('where "run"."profile_id" = $3');
    expect(normalizedSql).toContain('"estimate"."profile_id" = profile.id');
    expect(normalizedSql).toContain('"estimate"."source_revision" = state.published_revision');
    expect(normalizedSql).toContain('"state"."published_revision"');
    if (!result) throw new Error("Expected published athlete-state snapshot");
    expect(
      result.current?.estimates.every(
        (estimate) => estimate.source_revision === result.current?.state.published_revision,
      ),
    ).toBe(true);
    expect(query.params).toEqual([PROFILE_ID, PROFILE_ID, PROFILE_ID]);
  });

  it("keeps the optional state lock inside the same snapshot statement", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [publishedReadRow()] });

    await readPublishedAthleteStateSnapshotData({ execute } as never, {
      profileId: PROFILE_ID,
      lockStateForUpdate: true,
    });

    expect(execute).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as never);
    expect(query.sql.replace(/\s+/g, " ")).toContain('where "state"."profile_id" = $2 for update');
  });

  it("does not qualify aliased UPDATE target columns while claiming a state row", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await claimNextAthleteState({ execute } as never, {
      now: new Date(COMPUTED_AT),
      leaseMilliseconds: 60_000,
    });

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as never);
    const normalizedSql = query.sql.replace(/\s+/g, " ");
    expect(normalizedSql).toContain('update "profile_athlete_state" state set lease_token =');
    expect(normalizedSql).not.toContain('set "state"."lease_token"');
  });
});

describe("athlete-state publication fence", () => {
  it("does not replace estimates when the source-revision claim is stale", async () => {
    const afterPublishInTransaction = vi.fn();
    const prepareEstimates = vi.fn().mockResolvedValue([]);
    const deleteEstimates = vi.fn();
    const insertEstimates = vi.fn();
    const updateState = vi.fn();
    const select = vi.fn((fields: Record<string, unknown>) => ({
      from: vi.fn(() => {
        const builder = {
          innerJoin: vi.fn(() => builder),
          where: vi.fn(() =>
            "profileId" in fields
              ? { limit: vi.fn(() => ({ for: vi.fn().mockResolvedValue([]) })) }
              : Promise.resolve([{ dirtyFromAt: null }]),
          ),
        };
        return builder;
      }),
    }));
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      select,
      delete: deleteEstimates,
      insert: insertEstimates,
      update: updateState,
    };
    const db = { $client: {}, transaction: vi.fn((callback) => callback(tx)) };

    await expect(
      publishAthleteState(db as never, {
        claim: {
          profileId: PROFILE_ID,
          sourceRevision: 5,
          leaseToken: "22222222-2222-4222-8222-222222222222",
          planningTimezone: "UTC",
          dirtyFromAt: null,
          activityAnalysisCursor: null,
        },
        state: {
          fitness: 1,
          fatigue: 1,
          evidenceConfidence: 1,
          coverageStartAt: null,
          coverageEndAt: null,
          lastActivityAt: null,
          algorithmVersion: "athlete-state-projection-v1",
        },
        estimates: prepareEstimates,
        now: new Date(COMPUTED_AT),
        afterPublishInTransaction,
      }),
    ).resolves.toBe(false);
    expect(deleteEstimates).not.toHaveBeenCalled();
    expect(insertEstimates).not.toHaveBeenCalled();
    expect(updateState).not.toHaveBeenCalled();
    expect(prepareEstimates).not.toHaveBeenCalled();
    expect(afterPublishInTransaction).not.toHaveBeenCalled();
  });

  it("uses one writable repeatable-read transaction and enqueues only after the fenced update", async () => {
    const publishedReturning = vi.fn().mockResolvedValue([{ profileId: PROFILE_ID }]);
    const updateWhere = vi.fn(() => ({ returning: publishedReturning }));
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      select: vi.fn((fields: Record<string, unknown>) => ({
        from: vi.fn(() => {
          const builder = {
            innerJoin: vi.fn(() => builder),
            where: vi.fn(() =>
              "profileId" in fields
                ? {
                    limit: vi.fn(() => ({
                      for: vi.fn().mockResolvedValue([{ profileId: PROFILE_ID }]),
                    })),
                  }
                : Promise.resolve([{ dirtyFromAt: null }]),
            ),
          };
          return builder;
        }),
      })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
    };
    const db = { $client: {}, transaction: vi.fn((callback) => callback(tx)) };
    const preparedEstimates = [{ profile_id: PROFILE_ID }] as never;
    const prepareEstimates = vi.fn().mockResolvedValue(preparedEstimates);
    const afterPublishInTransaction = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishAthleteState(db as never, {
        claim: {
          profileId: PROFILE_ID,
          sourceRevision: 5,
          leaseToken: "22222222-2222-4222-8222-222222222222",
          planningTimezone: "UTC",
          dirtyFromAt: null,
          activityAnalysisCursor: null,
        },
        state: {
          fitness: 1,
          fatigue: 1,
          evidenceConfidence: 1,
          coverageStartAt: null,
          coverageEndAt: null,
          lastActivityAt: null,
          algorithmVersion: "athlete-state-projection-v1",
        },
        estimates: prepareEstimates,
        now: new Date(COMPUTED_AT),
        afterPublishInTransaction,
      }),
    ).resolves.toBe(true);

    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read write",
      isolationLevel: "repeatable read",
    });
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(prepareEstimates).toHaveBeenCalledWith(tx);
    expect(insertValues).toHaveBeenCalledWith(preparedEstimates);
    expect(afterPublishInTransaction).toHaveBeenCalledWith(tx);
    expect(prepareEstimates.mock.invocationCallOrder[0]).toBeLessThan(
      tx.delete.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      prepareEstimates.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(publishedReturning.mock.invocationCallOrder[0]).toBeLessThan(
      afterPublishInTransaction.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
