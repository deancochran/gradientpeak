import { schema } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { createStravaRepository } from "./drizzle-strava-repository";

function createDb(
  input: {
    existingRelationshipKind?: "imported";
    job?: {
      lastError: string | null;
      phase: "pre_dispatch" | "dispatching" | "polling";
      status: string;
    };
  } = {},
) {
  const state = {
    insertedSources: [] as Array<Record<string, unknown>>,
    jobUpdates: [] as Array<Record<string, unknown>>,
    sourceUpdates: [] as Array<Record<string, unknown>>,
  };
  let selectedTable: unknown;
  const tx = {
    execute: vi.fn(async (_query: unknown) => undefined),
    insert: vi.fn((table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === schema.activitySourceReferences) state.insertedSources.push(values);
      },
    })),
    select: vi.fn(() => {
      const query = {
        for: async () => {
          if (selectedTable === schema.providerSyncJobs) {
            return [
              {
                activityId: "11111111-1111-4111-8111-111111111111",
                id: "22222222-2222-4222-8222-222222222222",
                lastError: input.job?.lastError ?? "dispatch_uncertain",
                payload: { phase: input.job?.phase ?? "dispatching" },
                status: input.job?.status ?? "dead_lettered",
              },
            ];
          }
          if (selectedTable === schema.integrations) return [{ id: echo.integrationId }];
          return input.existingRelationshipKind
            ? [
                {
                  activityId: "11111111-1111-4111-8111-111111111111",
                  id: "55555555-5555-4555-8555-555555555555",
                  relationshipKind: input.existingRelationshipKind,
                },
              ]
            : [];
        },
        from(table: unknown) {
          selectedTable = table;
          return query;
        },
        limit: () => query,
        orderBy: () => query,
        where: () => query,
      };
      return query;
    }),
    update: vi.fn((table: unknown) => ({
      set(values: Record<string, unknown>) {
        if (table === schema.providerSyncJobs) state.jobUpdates.push(values);
        if (table === schema.activitySourceReferences) state.sourceUpdates.push(values);
        return {
          where: () =>
            table === schema.providerSyncJobs
              ? {
                  returning: async () => [{ id: "22222222-2222-4222-8222-222222222222" }],
                }
              : Promise.resolve([]),
        };
      },
    })),
  };
  const db = {
    transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  return { db, state, tx };
}

function createDispatchDb(
  input: {
    integrationActive?: boolean;
    markerFresh?: boolean;
    unlock?: "error" | "false" | "success";
  } = {},
) {
  const sequence: string[] = [];
  const release = vi.fn((destroy?: boolean) => {
    sequence.push(destroy ? "release-destroyed" : "release");
  });
  const query = vi.fn(async (statement: string | { text?: string }) => {
    const text = typeof statement === "string" ? statement : (statement.text ?? "");
    if (text.startsWith("select pg_advisory_lock")) {
      sequence.push("session-fence-acquired");
      return { rows: [] };
    }
    if (text === "begin") {
      sequence.push("marker-transaction-began");
      return { rows: [] };
    }
    if (text.includes('from "integrations"')) {
      sequence.push("integration-checked");
      return { rows: input.integrationActive === false ? [] : [{ id: echo.integrationId }] };
    }
    if (text.startsWith('update "provider_sync_jobs"')) {
      sequence.push("dispatching-marker-written");
      return {
        rows: input.markerFresh === false ? [] : [{ id: "22222222-2222-4222-8222-222222222222" }],
      };
    }
    if (text === "commit") {
      sequence.push("dispatching-marker-committed");
      return { rows: [] };
    }
    if (text.startsWith("select pg_advisory_unlock")) {
      sequence.push("session-fence-unlock-attempted");
      if (input.unlock === "error") throw new Error("connection lost during unlock");
      return { rows: [{ released: input.unlock !== "false" }] };
    }
    if (text === "rollback") {
      sequence.push("marker-transaction-rolled-back");
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${text}`);
  });
  const client = { query, release };
  const connect = vi.fn(async () => client);
  return { client, connect, db: { $client: { connect } }, query, release, sequence };
}

const echo = {
  activityId: "11111111-1111-4111-8111-111111111111",
  externalId: `gp-v1-${"a".repeat(43)}.fit`,
  integrationGeneration: 2,
  integrationId: "33333333-3333-4333-8333-333333333333",
  profileId: "44444444-4444-4444-8444-444444444444",
  providerExternalId: "987",
};

const dispatchInput = {
  expectedIntegrationGeneration: echo.integrationGeneration,
  integrationId: echo.integrationId,
  jobId: "22222222-2222-4222-8222-222222222222",
  payload: {
    activityId: echo.activityId,
    artifact: {
      artifactId: "33333333-3333-4333-8333-333333333333",
      bucket: "activity-files",
      byteSize: 3,
      digest: "a".repeat(64),
      format: "fit" as const,
      mediaType: "application/octet-stream",
      path: "artifact-path",
      segmentsRevision: 1,
    },
    externalId: echo.externalId,
    phase: "dispatching" as const,
  },
  profileId: echo.profileId,
  workerId: "worker",
};

describe("Drizzle Strava completed-activity echo convergence", () => {
  it("atomically attaches a late exported source and completes a dispatch-uncertain job", async () => {
    const { db, state } = createDb();
    const repository = createStravaRepository({ db: db as never });

    await expect(repository.convergeCompletedActivityUploadEcho(echo)).resolves.toBe(true);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(state.insertedSources).toEqual([
      expect.objectContaining({
        activity_id: echo.activityId,
        provider_external_id: "987",
        relationship_kind: "exported",
      }),
    ]);
    expect(state.jobUpdates).toEqual([
      expect.objectContaining({ last_error: null, status: "completed" }),
    ]);
  });

  it("upgrades an imported source to both while completing the same late echo", async () => {
    const { db, state } = createDb({ existingRelationshipKind: "imported" });
    const repository = createStravaRepository({ db: db as never });

    await expect(repository.convergeCompletedActivityUploadEcho(echo)).resolves.toBe(true);

    expect(state.insertedSources).toHaveLength(0);
    expect(state.sourceUpdates).toEqual([
      expect.objectContaining({ relationship_kind: "both", resolution_status: "confirmed" }),
    ]);
    expect(state.jobUpdates).toEqual([
      expect.objectContaining({ last_error: null, status: "completed" }),
    ]);
  });

  it.each([
    { lastError: null, phase: "pre_dispatch" as const, status: "queued" },
    {
      lastError: "strava_upload_pre_dispatch_failed",
      phase: "pre_dispatch" as const,
      status: "failed",
    },
  ])("does not converge a $status pre-dispatch job without dispatch evidence", async (job) => {
    const { db, state } = createDb({ job });
    const repository = createStravaRepository({ db: db as never });

    await expect(repository.convergeCompletedActivityUploadEcho(echo)).resolves.toBe(false);

    expect(state.insertedSources).toHaveLength(0);
    expect(state.jobUpdates).toHaveLength(0);
  });

  it("converges a polling job because its upload dispatch is evidenced", async () => {
    const { db, state } = createDb({
      job: { lastError: "strava_upload_poll_retry", phase: "polling", status: "failed" },
    });
    const repository = createStravaRepository({ db: db as never });

    await expect(repository.convergeCompletedActivityUploadEcho(echo)).resolves.toBe(true);

    expect(state.insertedSources).toHaveLength(1);
    expect(state.jobUpdates).toEqual([
      expect.objectContaining({ last_error: null, status: "completed" }),
    ]);
  });

  it("commits dispatch evidence before the POST while retaining the session profile fence", async () => {
    const { client, db, release, sequence } = createDispatchDb();
    const repository = createStravaRepository({ db: db as never });
    const dispatch = vi.fn(async () => {
      sequence.push("provider-callback");
      return "posted";
    });

    await expect(
      repository.runCompletedActivityUploadDispatch({
        ...dispatchInput,
        dispatch,
      }),
    ).resolves.toBe("posted");

    expect(sequence).toEqual([
      "session-fence-acquired",
      "marker-transaction-began",
      "integration-checked",
      "dispatching-marker-written",
      "dispatching-marker-committed",
      "provider-callback",
      "session-fence-unlock-attempted",
      "release",
    ]);
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      "select pg_advisory_lock(hashtextextended($1, $2))",
      [echo.profileId, 0],
    );
    expect(release).toHaveBeenCalledWith(false);
  });

  it.each([
    { integrationActive: false, markerFresh: true, stale: "integration" },
    { integrationActive: true, markerFresh: false, stale: "job marker" },
  ])("does not invoke the provider callback when the $stale is stale", async (state) => {
    const { db, release, sequence } = createDispatchDb(state);
    const repository = createStravaRepository({ db: db as never });
    const dispatch = vi.fn(async () => "posted");

    await expect(
      repository.runCompletedActivityUploadDispatch({ ...dispatchInput, dispatch }),
    ).resolves.toBeNull();

    expect(dispatch).not.toHaveBeenCalled();
    expect(sequence).toContain("dispatching-marker-committed");
    expect(sequence).toContain("session-fence-unlock-attempted");
    expect(release).toHaveBeenCalledWith(false);
  });

  it("unlocks and releases the dedicated connection when the provider callback throws", async () => {
    const { db, release, sequence } = createDispatchDb();
    const repository = createStravaRepository({ db: db as never });
    const dispatch = vi.fn(async () => {
      sequence.push("provider-callback");
      throw new Error("provider call failed");
    });

    await expect(
      repository.runCompletedActivityUploadDispatch({ ...dispatchInput, dispatch }),
    ).rejects.toThrow("provider call failed");

    expect(sequence.slice(-2)).toEqual(["session-fence-unlock-attempted", "release"]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it.each([
    "false",
    "error",
  ] as const)("destroys the dedicated connection when session unlock returns %s", async (unlock) => {
    const { db, release } = createDispatchDb({ unlock });
    const repository = createStravaRepository({ db: db as never });

    await expect(
      repository.runCompletedActivityUploadDispatch({
        ...dispatchInput,
        dispatch: async () => "posted",
      }),
    ).resolves.toBe("posted");

    expect(release).toHaveBeenCalledWith(true);
  });

  it("uses the same profile identity and namespace as disconnect's transaction fence", async () => {
    const { db, tx } = createDb();
    const repository = createStravaRepository({ db: db as never });

    await expect(
      repository.requestProviderDisconnect({ profileId: echo.profileId, provider: "strava" }),
    ).rejects.toThrow();

    const disconnectFence = new PgDialect().sqlToQuery(tx.execute.mock.calls[0]?.[0] as never);
    expect(disconnectFence).toEqual({
      params: [echo.profileId],
      sql: "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      typings: ["none"],
    });
  });
});
