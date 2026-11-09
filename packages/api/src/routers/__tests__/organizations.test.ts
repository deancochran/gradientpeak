import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import {
  mapAcceptedInvitationRelationship,
  mapOrganizationInvitationSummary,
} from "../../application/organizations/manage-organizations";
import type {
  OrganizationAccessRepository,
  OrganizationMembershipContextRow,
} from "../../repositories/organization-access-repository";
import type { OrganizationInvitationSummaryRow } from "../../repositories/organization-management-repository";
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
  it("drops the repository cursor key from strict public invitation summaries", () => {
    const row: OrganizationInvitationSummaryRow = {
      invitationId: "11111111-1111-4111-8111-111111111111",
      organizationId: ORGANIZATION_ID,
      kind: "athlete",
      requestedRole: null,
      status: "pending",
      expiresAt: new Date("2026-01-01T00:01:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.123Z"),
      createdAtCursor: "2026-01-01T00:00:00.123456Z",
    };

    expect(mapOrganizationInvitationSummary(row)).toEqual({
      invitationId: row.invitationId,
      organizationId: row.organizationId,
      kind: "athlete",
      requestedRole: null,
      status: "pending",
      expiresAt: "2026-01-01T00:01:00.000Z",
      createdAt: "2026-01-01T00:00:00.123Z",
    });
    expect(mapOrganizationInvitationSummary(row)).not.toHaveProperty("createdAtCursor");
  });

  it("maps accepted lifecycle truth without treating acceptance as active access", () => {
    expect(
      mapAcceptedInvitationRelationship({
        kind: "staff",
        membershipId: MEMBERSHIP_ID,
        membershipSuspendedAt: new Date(),
        membershipEndedAt: null,
        membershipHasEffectiveStaffRole: true,
        membershipIsRootOwner: false,
        engagementId: null,
        engagementPausedAt: null,
        engagementEndedAt: null,
      }),
    ).toEqual({ relationshipState: "staff_suspended", navigationTarget: "staff_roster" });
    expect(
      mapAcceptedInvitationRelationship({
        kind: "staff",
        membershipId: MEMBERSHIP_ID,
        membershipSuspendedAt: new Date(),
        membershipEndedAt: null,
        membershipHasEffectiveStaffRole: false,
        membershipIsRootOwner: false,
        engagementId: null,
        engagementPausedAt: null,
        engagementEndedAt: null,
      }),
    ).toEqual({ relationshipState: "staff_suspended", navigationTarget: "none" });
    expect(
      mapAcceptedInvitationRelationship({
        kind: "athlete",
        membershipId: null,
        membershipSuspendedAt: null,
        membershipEndedAt: null,
        membershipHasEffectiveStaffRole: null,
        membershipIsRootOwner: null,
        engagementId: null,
        engagementPausedAt: null,
        engagementEndedAt: null,
      }),
    ).toEqual({ relationshipState: "athlete_no_current_engagement", navigationTarget: "none" });
    expect(
      mapAcceptedInvitationRelationship({
        kind: "staff",
        membershipId: MEMBERSHIP_ID,
        membershipSuspendedAt: null,
        membershipEndedAt: null,
        membershipHasEffectiveStaffRole: false,
        membershipIsRootOwner: false,
        engagementId: null,
        engagementPausedAt: null,
        engagementEndedAt: null,
      }),
    ).toEqual({ relationshipState: "staff_no_effective_role", navigationTarget: "none" });
    expect(
      mapAcceptedInvitationRelationship({
        kind: "staff",
        membershipId: MEMBERSHIP_ID,
        membershipSuspendedAt: null,
        membershipEndedAt: null,
        membershipHasEffectiveStaffRole: false,
        membershipIsRootOwner: true,
        engagementId: null,
        engagementPausedAt: null,
        engagementEndedAt: null,
      }),
    ).toEqual({ relationshipState: "staff_active", navigationTarget: "none" });
  });

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
    await expect(
      caller.create({
        organizationId: ORGANIZATION_ID,
        name: "Peak Coaching",
        slug: "peak-coaching",
        timezone: "Mars/Olympus",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(
      anonymous.invitations.resolveAcceptedRelationship({
        organizationId: ORGANIZATION_ID,
        invitationId: MEMBERSHIP_ID,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" } satisfies Partial<TRPCError>);
    await expect(
      caller.invitations.resolveAcceptedRelationship({
        organizationId: ORGANIZATION_ID,
        invitationId: MEMBERSHIP_ID,
        email: "leak@example.test",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(harness.getAccessRepository).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and malformed staff-role mutations before persistence", async () => {
    const harness = createHarness();
    const anonymous = createRouterCaller(harness.router, { session: null });
    await expect(
      anonymous.staffRoles.grant({
        organizationId: ORGANIZATION_ID,
        membershipId: MEMBERSHIP_ID,
        role: "coach",
        operationId: ORGANIZATION_ID,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" } satisfies Partial<TRPCError>);
    const caller = createRouterCaller(harness.router, { userId: SESSION_PROFILE_ID });
    await expect(
      caller.staffRoles.revoke({
        organizationId: ORGANIZATION_ID,
        membershipId: MEMBERSHIP_ID,
        role: "owner",
        operationId: ORGANIZATION_ID,
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(
      caller.staffRoles.grant({
        organizationId: ORGANIZATION_ID,
        membershipId: MEMBERSHIP_ID,
        role: "coach",
        operationId: ORGANIZATION_ID,
        extra: true,
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(harness.getAccessRepository).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated, malformed, and cross-scope invitation discovery cursors", async () => {
    const harness = createHarness();
    const anonymous = createRouterCaller(harness.router, { session: null });
    await expect(anonymous.invitations.listMine({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>);
    const caller = createRouterCaller(harness.router, { userId: SESSION_PROFILE_ID });
    await expect(caller.invitations.listMine({ limit: 51 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
    const organizationCursor = cursor({
      v: 1,
      s: "organization",
      o: ORGANIZATION_ID,
      c: now.toISOString().replace("Z", "000Z"),
      i: MEMBERSHIP_ID,
    });
    await expect(caller.invitations.listMine({ cursor: organizationCursor })).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
      } satisfies Partial<TRPCError>,
    );
    await expect(
      caller.invitations.listForOrganization({
        organizationId: OTHER_ORGANIZATION_ID,
        cursor: organizationCursor,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(
      caller.invitations.listForOrganization({
        organizationId: ORGANIZATION_ID,
        cursor: cursor({
          v: 1,
          s: "organization",
          o: ORGANIZATION_ID,
          c: now.toISOString(),
          i: MEMBERSHIP_ID,
        }),
      }),
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
      await expect(
        caller.managementCapabilities({ organizationId: ORGANIZATION_ID }),
      ).resolves.toEqual({ status: "forbidden" });
    }
  });

  it("reports closed advisory management capabilities without treating an admin as a coach", async () => {
    const caller = createRouterCaller(
      createHarness({
        contextRow: row({ rootOwnerMembershipId: OTHER_PROFILE_ID, roleKeys: ["admin"] }),
      }).router,
      { userId: SESSION_PROFILE_ID },
    );
    const result = await caller.managementCapabilities({ organizationId: ORGANIZATION_ID });
    expect(result).toMatchObject({ status: "granted", isRootOwner: false });
    if (result.status !== "granted") throw new Error("expected capability summary");
    expect(result.operations).toContainEqual({
      outcome: "eligible",
      operation: "manage_organization_groups",
      requiresFullAthleteAuthorization: false,
    });
    expect(result.operations).toContainEqual({
      outcome: "ineligible",
      operation: "read_athlete_activities",
      reason: "missing_required_role",
    });
    expect(result.operations).toContainEqual({
      outcome: "ineligible",
      operation: "transfer_root_ownership",
      reason: "not_root_owner",
    });
  });
});
