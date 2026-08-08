import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { readPublishedAthleteStateSnapshotData } from "./athlete-state-repository";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const COMPUTED_AT = "2026-08-01T12:00:00.000Z";

function publishedReadRow() {
  return {
    planning_timezone: "America/Los_Angeles",
    state: {
      profile_id: PROFILE_ID,
      source_revision: 5,
      published_revision: 4,
      dirty_from_at: "2026-07-31T12:00:00.000Z",
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
    expect(normalizedSql).toContain("where profile.id = $1");
    expect(normalizedSql).toContain("where state.profile_id = $2");
    expect(normalizedSql).toContain("where run.profile_id = $3");
    expect(normalizedSql).toContain("estimate.profile_id = profile.id");
    expect(normalizedSql).toContain("estimate.source_revision = state.published_revision");
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
    expect(query.sql.replace(/\s+/g, " ")).toContain("where state.profile_id = $2 for update");
  });
});
