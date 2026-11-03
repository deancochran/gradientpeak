import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import { createOrganizationAccessRepository } from "./organization-access-repository";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function collectSqlMetadata(
  node: unknown,
  state = { columns: [] as string[], params: [] as unknown[] },
) {
  if (!node || typeof node !== "object") return state;
  const value = node as {
    name?: unknown;
    value?: unknown;
    queryChunks?: unknown[];
    constructor?: { name?: string };
  };
  if (typeof value.name === "string") state.columns.push(value.name);
  if (value.constructor?.name === "Param") state.params.push(value.value);
  if (Array.isArray(value.queryChunks)) {
    for (const chunk of value.queryChunks) collectSqlMetadata(chunk, state);
  }
  if (Array.isArray(value.value)) {
    for (const chunk of value.value) collectSqlMetadata(chunk, state);
  }
  return state;
}

function createDb(rows: unknown[]) {
  const joinConditions: unknown[] = [];
  let whereCondition: unknown;
  let selectedFields: Record<string, unknown> | undefined;
  const builder = {
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(async () => rows),
  };
  builder.innerJoin.mockImplementation((_table: unknown, condition: unknown) => {
    joinConditions.push(condition);
    return builder;
  });
  builder.leftJoin.mockImplementation((_table: unknown, condition: unknown) => {
    joinConditions.push(condition);
    return builder;
  });
  builder.where.mockImplementation((condition: unknown) => {
    whereCondition = condition;
    return builder;
  });
  builder.groupBy.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  const db = {
    select: vi.fn((fields: Record<string, unknown>) => {
      selectedFields = fields;
      return { from: vi.fn(() => builder) };
    }),
  };
  return {
    db,
    getJoinConditions: () => joinConditions,
    getSelectedFields: () => selectedFields,
    getWhereCondition: () => whereCondition,
    getLimit: () => builder.limit,
  };
}

describe("organization access repository", () => {
  it("uses one fixed-authority query scoped to the authenticated profile and organization", async () => {
    const query = createDb([]);
    const repository = createOrganizationAccessRepository(query.db as unknown as DrizzleDbClient);

    await expect(
      repository.findActiveMembershipContext({
        organizationId: ORGANIZATION_ID,
        profileId: PROFILE_ID,
      }),
    ).resolves.toBeNull();

    expect(Object.keys(query.getSelectedFields() ?? {})).toEqual([
      "organizationId",
      "rootOwnerMembershipId",
      "name",
      "slug",
      "timezone",
      "organizationSuspendedAt",
      "organizationClosedAt",
      "organizationCreatedAt",
      "organizationUpdatedAt",
      "membershipId",
      "profileId",
      "membershipSuspendedAt",
      "membershipEndedAt",
      "roleKeys",
    ]);
    expect(query.getJoinConditions()).toHaveLength(2);
    const metadata = { columns: [] as string[], params: [] as unknown[] };
    for (const condition of [query.getWhereCondition(), ...query.getJoinConditions()]) {
      collectSqlMetadata(condition, metadata);
    }
    expect(metadata.columns).toEqual(
      expect.arrayContaining([
        "organization_id",
        "profile_id",
        "membership_id",
        "granted_at",
        "suspended_at",
        "closed_at",
        "ended_at",
        "revoked_at",
      ]),
    );
    expect(metadata.columns).not.toEqual(expect.arrayContaining(["role_id", "permission_key"]));
    expect(metadata.params).toEqual(expect.arrayContaining([PROFILE_ID, ORGANIZATION_ID]));
  });

  it("uses the keyset predicate and fetches limit plus one active membership contexts", async () => {
    const query = createDb([]);
    const repository = createOrganizationAccessRepository(query.db as unknown as DrizzleDbClient);

    await repository.listActiveMembershipContexts({
      profileId: PROFILE_ID,
      limit: 20,
      cursor: { name: "Peak Coaching", slug: "peak-coaching", organizationId: ORGANIZATION_ID },
    });

    expect(query.db.select).toHaveBeenCalledTimes(1);
    const metadata = collectSqlMetadata(query.getWhereCondition());
    expect(metadata.params).toEqual(
      expect.arrayContaining([PROFILE_ID, "Peak Coaching", "peak-coaching", ORGANIZATION_ID]),
    );
    expect(query.getLimit()).toHaveBeenCalledWith(21);
  });

  it("binds even an empty supplied organization ID in the detail predicate", async () => {
    const query = createDb([]);
    const repository = createOrganizationAccessRepository(query.db as unknown as DrizzleDbClient);

    await expect(
      repository.findActiveMembershipContext({ organizationId: "", profileId: PROFILE_ID }),
    ).resolves.toBeNull();

    expect(collectSqlMetadata(query.getWhereCondition()).params).toEqual(
      expect.arrayContaining([PROFILE_ID, ""]),
    );
  });
});
