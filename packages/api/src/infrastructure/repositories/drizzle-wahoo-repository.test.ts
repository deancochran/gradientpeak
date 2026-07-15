import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { WahooRepository } from "../../repositories/wahoo-repository";
import { createWahooRepository } from "./drizzle-wahoo-repository";

type RepositoryHasDirectActivityCreate = "createImportedActivity" extends keyof WahooRepository
  ? true
  : false;
const repositoryHasDirectActivityCreate: RepositoryHasDirectActivityCreate = false;

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
});
