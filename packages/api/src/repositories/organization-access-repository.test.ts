import { COACHING_ACCESS_PERMISSION } from "@repo/core/organizations";
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
    where: vi.fn(),
    limit: vi.fn(async (limit: number) => rows.slice(0, limit)),
  };
  builder.innerJoin.mockImplementation((_table: unknown, condition: unknown) => {
    joinConditions.push(condition);
    return builder;
  });
  builder.where.mockImplementation((condition: unknown) => {
    whereCondition = condition;
    return builder;
  });

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
  };
}

describe("organization access repository", () => {
  it("scopes the read to matching active membership, active role grant, and permission", async () => {
    const query = createDb([{ id: ORGANIZATION_ID, name: "Peak Coaching", slug: "peak-coaching" }]);
    const repository = createOrganizationAccessRepository(query.db as unknown as DrizzleDbClient);

    await expect(
      repository.findOrganizationWithCapability({
        organizationId: ORGANIZATION_ID,
        profileId: PROFILE_ID,
        permission: COACHING_ACCESS_PERMISSION,
      }),
    ).resolves.toEqual({
      id: ORGANIZATION_ID,
      name: "Peak Coaching",
      slug: "peak-coaching",
    });

    expect(Object.keys(query.getSelectedFields() ?? {})).toEqual(["id", "name", "slug"]);
    expect(query.getJoinConditions()).toHaveLength(4);

    const metadata = { columns: [] as string[], params: [] as unknown[] };
    for (const condition of [query.getWhereCondition(), ...query.getJoinConditions()]) {
      collectSqlMetadata(condition, metadata);
    }
    expect(metadata.columns).toEqual(
      expect.arrayContaining([
        "organization_id",
        "profile_id",
        "status",
        "membership_id",
        "role_id",
        "permission_key",
      ]),
    );
    expect(metadata.params).toEqual([
      ORGANIZATION_ID,
      PROFILE_ID,
      "active",
      "active",
      COACHING_ACCESS_PERMISSION,
    ]);
  });

  it.each([
    "nonmember",
    "inactive membership",
    "inactive role grant",
    "missing permission",
  ])("fails closed for %s", async () => {
    const query = createDb([]);
    const repository = createOrganizationAccessRepository(query.db as unknown as DrizzleDbClient);

    await expect(
      repository.findOrganizationWithCapability({
        organizationId: ORGANIZATION_ID,
        profileId: PROFILE_ID,
        permission: COACHING_ACCESS_PERMISSION,
      }),
    ).resolves.toBeNull();
  });
});
