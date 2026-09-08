import { schema } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import { createStravaRepository } from "./drizzle-strava-repository";

function createDb(existingRelationshipKind?: "imported") {
  const state = {
    insertedSources: [] as Array<Record<string, unknown>>,
    jobUpdates: [] as Array<Record<string, unknown>>,
    sourceUpdates: [] as Array<Record<string, unknown>>,
  };
  let selectedTable: unknown;
  const tx = {
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
                lastError: "dispatch_uncertain",
                payload: { phase: "dispatching" },
                status: "dead_lettered",
              },
            ];
          }
          return existingRelationshipKind
            ? [
                {
                  activityId: "11111111-1111-4111-8111-111111111111",
                  id: "55555555-5555-4555-8555-555555555555",
                  relationshipKind: existingRelationshipKind,
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
  return { db, state };
}

const echo = {
  activityId: "11111111-1111-4111-8111-111111111111",
  externalId: `gp-v1-${"a".repeat(43)}.fit`,
  integrationGeneration: 2,
  integrationId: "33333333-3333-4333-8333-333333333333",
  profileId: "44444444-4444-4444-8444-444444444444",
  providerExternalId: "987",
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
    const { db, state } = createDb("imported");
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
});
