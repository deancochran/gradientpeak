import { schema } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { WahooRepository } from "../../repositories/wahoo-repository";
import {
  createWahooRepository,
  toWahooEventResourceProviderMetadata,
  wahooActiveIntegrationGenerationPredicate,
  wahooEventResourceLinkOwnershipPredicate,
  wahooGroupEventRouteDeliveryResourceLinkOwnershipPredicate,
  wahooRouteResourceLinkOwnershipPredicate,
} from "./drizzle-wahoo-repository";

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
  it("preserves the provider account binding when reading Wahoo resource metadata", () => {
    expect(
      toWahooEventResourceProviderMetadata({
        wahoo: {
          planId: 42,
          providerAccountExternalId: "wahoo-user-1",
          projectionHash: "projection-1",
        },
      }),
    ).toEqual({
      wahoo: {
        planId: 42,
        providerAccountExternalId: "wahoo-user-1",
        projectionHash: "projection-1",
      },
    });
  });

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

  it("binds planned-activity link writes to the active profile integration generation", () => {
    const query = new PgDialect().sqlToQuery(
      wahooActiveIntegrationGenerationPredicate({
        expectedIntegrationGeneration: 4,
        integrationId: "00000000-0000-4000-8000-000000000001",
        profileId: "00000000-0000-4000-8000-000000000002",
      }) as never,
    );

    expect(query.sql).toContain('"integrations"."id" = $1');
    expect(query.sql).toContain('"integrations"."profile_id" = $2');
    expect(query.sql).toContain('"integrations"."provider" = $3');
    expect(query.sql).toContain('"integrations"."lifecycle_status" = $4');
    expect(query.sql).toContain('"integrations"."generation" = $5');
    expect(query.params).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "wahoo",
      "active",
      4,
    ]);
  });

  it("scopes planned-activity link update and delete predicates to owned Wahoo events", () => {
    const query = new PgDialect().sqlToQuery(
      wahooEventResourceLinkOwnershipPredicate({
        expectedIntegrationGeneration: 4,
        id: "00000000-0000-4000-8000-000000000003",
        integrationId: "00000000-0000-4000-8000-000000000001",
        profileId: "00000000-0000-4000-8000-000000000002",
      }) as never,
    );

    expect(query.sql).toContain('"integration_resource_links"."id" = $1');
    expect(query.sql).toContain('"integration_resource_links"."integration_id" = $2');
    expect(query.sql).toContain('"integration_resource_links"."profile_id" = $3');
    expect(query.sql).toContain('"integration_resource_links"."provider" = $4');
    expect(query.sql).toContain('"integration_resource_links"."resource_kind" = $5');
    expect(query.params).toEqual([
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "wahoo",
      "event",
    ]);
  });

  it("scopes owned-route link update and delete predicates to the active Wahoo route link", () => {
    const query = new PgDialect().sqlToQuery(
      wahooRouteResourceLinkOwnershipPredicate({
        expectedIntegrationGeneration: 4,
        id: "00000000-0000-4000-8000-000000000003",
        integrationId: "00000000-0000-4000-8000-000000000001",
        profileId: "00000000-0000-4000-8000-000000000002",
      }) as never,
    );

    expect(query.sql).toContain('"integration_resource_links"."id" = $1');
    expect(query.sql).toContain('"integration_resource_links"."integration_id" = $2');
    expect(query.sql).toContain('"integration_resource_links"."profile_id" = $3');
    expect(query.sql).toContain('"integration_resource_links"."provider" = $4');
    expect(query.sql).toContain('"integration_resource_links"."resource_kind" = $5');
    expect(query.params).toEqual([
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "wahoo",
      "activity_route",
    ]);
  });

  it("scopes group-event route delivery links to the recipient integration and event resource kind", () => {
    const query = new PgDialect().sqlToQuery(
      wahooGroupEventRouteDeliveryResourceLinkOwnershipPredicate({
        expectedIntegrationGeneration: 4,
        id: "00000000-0000-4000-8000-000000000003",
        integrationId: "00000000-0000-4000-8000-000000000001",
        profileId: "00000000-0000-4000-8000-000000000002",
      }) as never,
    );

    expect(query.sql).toContain('"integration_resource_links"."integration_id" = $2');
    expect(query.sql).toContain('"integration_resource_links"."profile_id" = $3');
    expect(query.params).toEqual([
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "wahoo",
      "group_event_route_delivery",
    ]);
  });

  it("fails closed rather than attributing an ambiguous Wahoo account", async () => {
    const limit = vi.fn().mockResolvedValue([
      { integrationGeneration: 1, integrationId: "integration-1", profileId: "profile-1" },
      { integrationGeneration: 1, integrationId: "integration-2", profileId: "profile-2" },
    ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
      })),
    };

    await expect(
      createWahooRepository({ db: db as never }).findWahooIntegrationByExternalId(
        "provider-account",
      ),
    ).resolves.toBeNull();
    expect(limit).toHaveBeenCalledWith(2);
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

  it("requires the current group event, accepted RSVP, opt-in, and viewable source route for delivery", async () => {
    let whereCondition: unknown;
    const publicSource = {
      description: null,
      filePath: "owner/public-route.gpx",
      id: "00000000-0000-4000-8000-000000000002",
      name: "Public source",
      totalAscent: null,
      totalDescent: null,
      totalDistance: 1000,
      updatedAt: new Date("2026-07-29T12:00:00.000Z"),
    };
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              innerJoin: vi.fn(() => ({
                innerJoin: vi.fn(() => ({
                  where: vi.fn((condition: unknown) => {
                    whereCondition = condition;
                    return { limit: vi.fn().mockResolvedValue([publicSource]) };
                  }),
                })),
              })),
            })),
          })),
        })),
      })),
    };

    await expect(
      createWahooRepository({ db: db as never }).getGroupEventRouteForDelivery({
        groupEventId: "00000000-0000-4000-8000-000000000010",
        profileId: "00000000-0000-4000-8000-000000000001",
        sourceRouteId: "00000000-0000-4000-8000-000000000002",
      }),
    ).resolves.toMatchObject({
      filePath: "owner/public-route.gpx",
      id: publicSource.id,
    });

    const query = new PgDialect().sqlToQuery(whereCondition as never);
    expect(query.sql).toContain('"group_events"."id" = $1');
    expect(query.sql).toContain('"group_events"."cancelled_at" is null');
    expect(query.sql).toContain('"group_events"."starts_at" > $2');
    expect(query.sql).toContain("wahooEventRouteDeliveryEnabled");
    expect(query.sql).toContain('"activity_routes"."is_public" = $');
    expect(query.sql).toContain('"activity_routes"."is_system_template" = $');
  });

  it("lists one bounded page of eligible one-off group-event route deliveries", async () => {
    let whereCondition: unknown;
    const limit = vi.fn().mockResolvedValue([
      {
        eventId: "00000000-0000-4000-8000-000000000010",
        eventUpdatedAt: new Date("2026-07-29T12:00:00.000Z"),
        routeUpdatedAt: new Date("2026-07-29T12:01:00.000Z"),
        sourceRouteId: "00000000-0000-4000-8000-000000000002",
        startsAt: new Date("2026-07-30T12:00:00.000Z"),
      },
    ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              innerJoin: vi.fn(() => ({
                innerJoin: vi.fn(() => ({
                  where: vi.fn((condition: unknown) => {
                    whereCondition = condition;
                    return { orderBy: vi.fn(() => ({ limit })) };
                  }),
                })),
              })),
            })),
          })),
        })),
      })),
    };

    await expect(
      createWahooRepository({ db: db as never }).listEligibleGroupEventRouteDeliveries({
        limit: 100,
        profileId: "00000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toEqual([
      {
        eventId: "00000000-0000-4000-8000-000000000010",
        eventUpdatedAt: "2026-07-29T12:00:00.000Z",
        routeUpdatedAt: "2026-07-29T12:01:00.000Z",
        sourceRouteId: "00000000-0000-4000-8000-000000000002",
        startsAt: "2026-07-30T12:00:00.000Z",
      },
    ]);
    expect(limit).toHaveBeenCalledWith(100);

    const query = new PgDialect().sqlToQuery(whereCondition as never);
    expect(query.sql).toContain('"group_events"."series_id" is null');
    expect(query.sql).toContain('"group_events"."recurrence_rule" is null');
    expect(query.sql).toContain("wahooEventRouteDeliveryEnabled");
  });

  it("loads only a profile-owned non-template route for automatic library mirroring", async () => {
    let selected: Record<string, unknown> | undefined;
    let whereCondition: unknown;
    const db = {
      select: vi.fn((fields: Record<string, unknown>) => {
        selected = fields;
        return {
          from: vi.fn(() => ({
            where: vi.fn((condition: unknown) => {
              whereCondition = condition;
              return {
                limit: vi.fn().mockResolvedValue([
                  {
                    description: null,
                    filePath: "profile/route.gpx",
                    id: "00000000-0000-4000-8000-000000000002",
                    name: "Owned Route",
                    totalAscent: 10,
                    totalDescent: 9,
                    totalDistance: 1_000,
                    updatedAt: new Date("2026-07-29T12:00:00.000Z"),
                  },
                ]),
              };
            }),
          })),
        };
      }),
    };

    await expect(
      createWahooRepository({ db: db as never }).getOwnedRouteForMirror({
        profileId: "00000000-0000-4000-8000-000000000001",
        routeId: "00000000-0000-4000-8000-000000000002",
      }),
    ).resolves.toMatchObject({
      filePath: "profile/route.gpx",
      updatedAt: "2026-07-29T12:00:00.000Z",
    });

    expect(selected?.filePath).toBe(schema.activityRoutes.file_path);
    const query = new PgDialect().sqlToQuery(whereCondition as never);
    expect(query.sql).toContain('"activity_routes"."id" = $1');
    expect(query.sql).toContain('"activity_routes"."profile_id" = $2');
    expect(query.sql).toContain('"activity_routes"."is_system_template" = $3');
    expect(query.params).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
      false,
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
    expect(selected?.artifactId).toBe(schema.activityArtifacts.id);
    expect(selected?.segmentsRevision).toBe(schema.activities.segments_revision);
    expect(result).toEqual(row);
  });

  it("derives planned activity category from the canonical structure", async () => {
    const structure = {
      version: 3,
      segments: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Bike",
          role: "activity",
          activity_category: "bike",
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
          routeId: "route-1",
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

    expect(result?.activityPlan).not.toHaveProperty("activityCategory");
    expect(result?.routeId).toBe("route-1");
    expect(result?.activityPlan).not.toHaveProperty("routeId");
  });

  it("preserves validated Wahoo projection metadata for reconciliation", async () => {
    const row = {
      externalId: "42",
      id: "link-1",
      updatedAt: new Date("2026-07-18T08:00:00.000Z"),
      providerMetadata: {
        wahoo: {
          planId: 7,
          routeId: 9,
          projectionHash: "v1:sha256:abc",
          sourcePlanId: "plan-1",
          sourceRouteId: "route-1",
        },
      },
    };
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => [row],
    };
    const db = { select: vi.fn(() => builder) };

    await expect(
      createWahooRepository({ db: db as never }).getEventResourceLink({
        eventId: "event-1",
        profileId: "profile-1",
        provider: "wahoo",
      }),
    ).resolves.toMatchObject({
      providerMetadata: { wahoo: row.providerMetadata.wahoo },
    });
  });
});
