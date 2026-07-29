import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type {
  OrganizationAccessRepository,
  OrganizationMembershipContextRow,
} from "../../repositories/organization-access-repository";
import { createRouterCaller } from "../../test/router";
import { createOrganizationsRouter } from "../organizations";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROFILE_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-07-29T12:00:00.000Z");

function cursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function row(
  overrides: Partial<OrganizationMembershipContextRow> = {},
): OrganizationMembershipContextRow {
  return {
    organizationId: ORGANIZATION_ID,
    rootOwnerMembershipId: MEMBERSHIP_ID,
    name: "Peak Coaching",
    slug: "peak-coaching",
    timezone: "UTC",
    organizationSuspendedAt: null,
    organizationClosedAt: null,
    organizationCreatedAt: now,
    organizationUpdatedAt: now,
    membershipId: MEMBERSHIP_ID,
    profileId: SESSION_PROFILE_ID,
    membershipSuspendedAt: null,
    membershipEndedAt: null,
    roleKeys: ["admin", "coach"],
    ...overrides,
  };
}

function createHarness({
  listRows = [row()],
  contextRow = row(),
}: {
  listRows?: OrganizationMembershipContextRow[];
  contextRow?: OrganizationMembershipContextRow | null;
} = {}) {
  const listActiveMembershipContexts = vi.fn(async () => listRows);
  const findActiveMembershipContext = vi.fn(async () => contextRow);
  const getAccessRepository = vi.fn(() => ({
    listActiveMembershipContexts,
    findActiveMembershipContext,
  }));
  const router = createOrganizationsRouter({
    getAccessRepository: getAccessRepository as unknown as (
      ctx: never,
    ) => OrganizationAccessRepository,
  });
  return { listActiveMembershipContexts, findActiveMembershipContext, getAccessRepository, router };
}

describe("organizationsRouter", () => {
  it("denies unauthenticated, malformed, extra, and unsupported-cursor input before persistence", async () => {
    const harness = createHarness();
    const anonymous = createRouterCaller(harness.router, { session: null });
    await expect(anonymous.listMine({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>);
    const caller = createRouterCaller(harness.router, { userId: SESSION_PROFILE_ID });
    for (const invalidCursor of [
      "not-a-cursor",
      cursor({ v: 2, n: "Peak", s: "peak", i: ORGANIZATION_ID }),
      cursor({ v: 1, n: "", s: "peak", i: ORGANIZATION_ID }),
      cursor({ v: 1, n: "Peak", s: "peak", i: "not-a-uuid" }),
      cursor({ v: 1, n: "Peak", s: "peak", i: ORGANIZATION_ID, extra: true }),
    ]) {
      await expect(caller.listMine({ cursor: invalidCursor })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      } satisfies Partial<TRPCError>);
    }
    await expect(
      caller.getContext({ organizationId: ORGANIZATION_ID, profileId: OTHER_PROFILE_ID } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(harness.getAccessRepository).not.toHaveBeenCalled();
  });

  it("returns a bounded page and propagates its decoded cursor to the repository", async () => {
    const first = row();
    const second = row({
      organizationId: OTHER_ORGANIZATION_ID,
      name: "Summit",
      slug: "summit",
      membershipId: "66666666-6666-4666-8666-666666666666",
    });
    const harness = createHarness({ listRows: [first, second] });
    const caller = createRouterCaller(harness.router, { userId: SESSION_PROFILE_ID });
    const page = await caller.listMine({ limit: 1 });
    expect(page).toMatchObject({
      items: [{ membership: { roles: ["admin", "coach"] } }],
      hasMore: true,
    });
    const terminal = createHarness({ listRows: [second] });
    const nextCaller = createRouterCaller(terminal.router, { userId: SESSION_PROFILE_ID });
    await expect(nextCaller.listMine({ limit: 1, cursor: page.nextCursor })).resolves.toMatchObject(
      { hasMore: false, nextCursor: null },
    );
    expect(terminal.listActiveMembershipContexts).toHaveBeenCalledWith({
      profileId: SESSION_PROFILE_ID,
      limit: 1,
      cursor: { name: "Peak Coaching", slug: "peak-coaching", organizationId: ORGANIZATION_ID },
    });
  });

  it("returns forbidden for absent, suspended, closed, suspended-membership, or ended-membership contexts", async () => {
    for (const contextRow of [
      null,
      row({ organizationSuspendedAt: now }),
      row({ organizationClosedAt: now }),
      row({ membershipSuspendedAt: now }),
      row({ membershipEndedAt: now }),
    ]) {
      const caller = createRouterCaller(createHarness({ contextRow }).router, {
        userId: SESSION_PROFILE_ID,
      });
      await expect(caller.getContext({ organizationId: ORGANIZATION_ID })).resolves.toEqual({
        status: "forbidden",
      });
      await expect(caller.coachingAccess({ organizationId: ORGANIZATION_ID })).resolves.toEqual({
        status: "forbidden",
      });
    }
  });
});
