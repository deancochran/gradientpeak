import { schema } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { WahooRepository } from "../../repositories/wahoo-repository";
import { createWahooRepository } from "./drizzle-wahoo-repository";

type RepositoryHasDirectActivityCreate = "createImportedActivity" extends keyof WahooRepository
  ? true
  : false;
const repositoryHasDirectActivityCreate: RepositoryHasDirectActivityCreate = false;

type SelectQueryBuilder = {
  from: () => SelectQueryBuilder;
  innerJoin: () => SelectQueryBuilder;
  leftJoin: () => SelectQueryBuilder;
  where: () => SelectQueryBuilder;
  limit: () => Promise<Record<string, unknown>[]>;
};

describe("Wahoo repository activity persistence boundary", () => {
  it("does not expose a direct imported-activity creation path", () => {
    const repository = createWahooRepository({ db: {} as never });
    expect(repositoryHasDirectActivityCreate).toBe(false);
    expect(repository).not.toHaveProperty("createImportedActivity");
  });

  it("keeps link repair as an idempotency concern separate from canonical creation", () => {
    const repository = createWahooRepository({ db: {} as never });
    expect(repository).toHaveProperty("findImportedActivityByProviderExternalId");
    expect(repository).toHaveProperty("createImportedActivityResourceLink");
  });

  it("scopes sync route lookup to owned, public, or system routes", async () => {
    let whereCondition: unknown;
    const limit = vi.fn(async () => []);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((condition: unknown) => {
            whereCondition = condition;
            return { limit };
          }),
        })),
      })),
    };
    const repository = createWahooRepository({ db: db as never });

    await repository.getRouteForSync({
      profileId: "00000000-0000-4000-8000-000000000001",
      routeId: "00000000-0000-4000-8000-000000000002",
    });

    const query = new PgDialect().sqlToQuery(whereCondition as never);
    expect(query.sql).toContain('"activity_routes"."id" = $1');
    expect(query.sql).toContain('"activity_routes"."profile_id" = $2');
    expect(query.sql).toContain('"activity_routes"."is_public" = $3');
    expect(query.sql).toContain('"activity_routes"."is_system_template" = $4');
    expect(query.sql).toContain(" or ");
    expect(query.params).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
      true,
      true,
    ]);
  });

  it("reads provider activity bytes from the current accepted source artifact", async () => {
    let selected: Record<string, unknown> | undefined;
    const row = {
      activityId: "00000000-0000-4000-8000-000000000010",
      linkId: "00000000-0000-4000-8000-000000000011",
      profileId: "00000000-0000-4000-8000-000000000012",
      activityFilePath: "sources/wahoo.fit",
      activityFileSize: 4096,
      analysisReady: true,
    };
    const builder: SelectQueryBuilder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      limit: async () => [row],
    };
    const db = {
      select: vi.fn((fields: Record<string, unknown>) => {
        selected = fields;
        return builder;
      }),
    };

    const result = await createWahooRepository({
      db: db as never,
    }).findImportedActivityLinkByExternalId({ externalId: "42", integrationId: row.linkId });

    expect(selected?.activityFilePath).toBe(schema.activityArtifacts.path);
    expect(selected?.activityFileSize).toBe(schema.activityArtifacts.byte_size);
    expect(result).toEqual(row);
  });

  it("derives planned workout category from V3 structure", async () => {
    const structure = {
      version: 3,
      segments: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Bike",
          role: "activity",
          category: "bike",
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              name: "Work",
              repetitions: 2,
              steps: [
                {
                  id: "30000000-0000-4000-8000-000000000001",
                  name: "Steady",
                  duration: { type: "time", seconds: 600 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const builder: SelectQueryBuilder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      limit: async () => [
        {
          id: "event-1",
          startsAt: new Date("2026-07-18T08:00:00.000Z"),
          routeId: null,
          activityPlan: {
            id: "plan-1",
            name: "Repeats",
            description: null,
            structure,
            updatedAt: new Date("2026-07-17T08:00:00.000Z"),
          },
        },
      ],
    };
    const db = { select: vi.fn(() => builder) };

    const result = await createWahooRepository({ db: db as never }).getPlannedEventForSync({
      eventId: "event-1",
      profileId: "profile-1",
    });

    expect(result?.activityPlan?.activityCategory).toBe("bike");
  });
});
