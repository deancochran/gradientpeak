import { describe, expect, it } from "vitest";
import type { OrganizationMembershipContextRow } from "../../repositories/organization-access-repository";
import {
  decodeOrganizationListCursor,
  listMyOrganizationContexts,
  readOrganizationContext,
} from "./read-coaching-access";

const now = new Date("2026-07-29T12:00:00.000Z");
const profileId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const organizationId = "11111111-1111-4111-8111-111111111111";

function row(
  overrides: Partial<OrganizationMembershipContextRow> = {},
): OrganizationMembershipContextRow {
  return {
    organizationId,
    rootOwnerMembershipId: membershipId,
    name: "Peak Coaching",
    slug: "peak-coaching",
    timezone: "UTC",
    organizationSuspendedAt: null,
    organizationClosedAt: null,
    organizationCreatedAt: now,
    organizationUpdatedAt: now,
    membershipId,
    profileId,
    membershipSuspendedAt: null,
    membershipEndedAt: null,
    roleKeys: ["coach", "admin"],
    ...overrides,
  };
}

describe("organization context reads", () => {
  it("maps aggregated fixed roles in contract order and returns a stable page cursor", async () => {
    const repository = {
      listActiveMembershipContexts: async () => [
        row(),
        row({
          organizationId: "44444444-4444-4444-8444-444444444444",
          name: "Summit",
          slug: "summit",
        }),
      ],
      findActiveMembershipContext: async () => null,
    };
    const page = await listMyOrganizationContexts({
      repository,
      profileId,
      limit: 1,
      cursor: null,
    });
    expect(page).toMatchObject({
      items: [{ membership: { roles: ["admin", "coach"] }, isRootOwner: true }],
      hasMore: true,
    });
    expect(page.nextCursor).toEqual(expect.any(String));
    if (!page.nextCursor) throw new Error("Expected next cursor");
    expect(decodeOrganizationListCursor(page.nextCursor)).toEqual({
      name: "Peak Coaching",
      slug: "peak-coaching",
      organizationId,
    });
  });

  it("returns a terminal page without a cursor", async () => {
    const repository = {
      listActiveMembershipContexts: async () => [row()],
      findActiveMembershipContext: async () => null,
    };
    await expect(
      listMyOrganizationContexts({ repository, profileId, limit: 20, cursor: null }),
    ).resolves.toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("round-trips whitespace-bearing database sort keys without normalization", async () => {
    const repository = {
      listActiveMembershipContexts: async () => [
        row({ name: " Peak Coaching ", slug: " peak-coaching " }),
        row({
          organizationId: "44444444-4444-4444-8444-444444444444",
          name: "Summit",
          slug: "summit",
        }),
      ],
      findActiveMembershipContext: async () => null,
    };
    const page = await listMyOrganizationContexts({
      repository,
      profileId,
      limit: 1,
      cursor: null,
    });
    if (!page.nextCursor) throw new Error("Expected next cursor");
    expect(decodeOrganizationListCursor(page.nextCursor)).toEqual({
      name: " Peak Coaching ",
      slug: " peak-coaching ",
      organizationId,
    });
  });

  it("fails closed when an aggregated role is outside the fixed contract", async () => {
    const repository = {
      listActiveMembershipContexts: async () => [row({ roleKeys: ["admin", "unknown"] })],
      findActiveMembershipContext: async () => null,
    };
    await expect(
      listMyOrganizationContexts({ repository, profileId, limit: 20, cursor: null }),
    ).rejects.toThrow();
  });

  it("fails closed when the repository returns a roleless membership", async () => {
    const repository = {
      listActiveMembershipContexts: async () => [row({ roleKeys: [] })],
      findActiveMembershipContext: async () => row({ roleKeys: [] }),
    };
    await expect(
      listMyOrganizationContexts({ repository, profileId, limit: 20, cursor: null }),
    ).rejects.toThrow("roleless organization context");
    await expect(
      readOrganizationContext({ repository, organizationId, profileId }),
    ).resolves.toBeNull();
  });

  it("fails closed when a list row violates an active lifecycle fence", async () => {
    const repository = {
      listActiveMembershipContexts: async () => [row({ organizationClosedAt: now })],
      findActiveMembershipContext: async () => null,
    };
    await expect(
      listMyOrganizationContexts({ repository, profileId, limit: 20, cursor: null }),
    ).rejects.toThrow("inactive or roleless organization context");
  });

  it("aggregates roles independently for multiple organizations", async () => {
    const secondOrganizationId = "44444444-4444-4444-8444-444444444444";
    const repository = {
      listActiveMembershipContexts: async () => [
        row({ roleKeys: ["coach"] }),
        row({
          organizationId: secondOrganizationId,
          membershipId: "66666666-6666-4666-8666-666666666666",
          name: "Summit",
          slug: "summit",
          roleKeys: ["admin"],
        }),
      ],
      findActiveMembershipContext: async () => null,
    };
    await expect(
      listMyOrganizationContexts({ repository, profileId, limit: 20, cursor: null }),
    ).resolves.toMatchObject({
      items: [
        { organization: { organizationId }, membership: { roles: ["coach"] } },
        {
          organization: { organizationId: secondOrganizationId },
          membership: { roles: ["admin"] },
        },
      ],
    });
  });

  it("returns no detail context when the repository has no active row", async () => {
    const repository = {
      listActiveMembershipContexts: async () => [],
      findActiveMembershipContext: async () => null,
    };
    await expect(
      readOrganizationContext({ repository, organizationId, profileId }),
    ).resolves.toBeNull();
  });
});
