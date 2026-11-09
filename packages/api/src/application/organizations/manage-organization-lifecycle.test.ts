import { beforeEach, describe, expect, it, vi } from "vitest";

type RepositoryMock = {
  getCurrentAdministrativeAuthority: ReturnType<typeof vi.fn>;
  staffCursorBelongsToOrganization: ReturnType<typeof vi.fn>;
  listCurrentStaff: ReturnType<typeof vi.fn>;
};
const state = vi.hoisted(() => ({ repository: {} as RepositoryMock }));
vi.mock("../../repositories/organization-lifecycle-repository", () => ({
  createOrganizationLifecycleRepository: () => state.repository,
}));

import { listOrganizationStaff } from "./manage-organization-lifecycle";

const ids = {
  actor: "00000000-0000-4000-8000-000000000001",
  organization: "00000000-0000-4000-8000-000000000002",
  membership: "00000000-0000-4000-8000-000000000003",
  root: "00000000-0000-4000-8000-000000000004",
  coach: "00000000-0000-4000-8000-000000000005",
};

describe("organization staff discovery", () => {
  beforeEach(() => {
    state.repository = {
      getCurrentAdministrativeAuthority: vi.fn().mockResolvedValue({
        membershipId: ids.actor,
        isRootOwner: true,
        rootMembershipId: ids.actor,
      }),
      staffCursorBelongsToOrganization: vi.fn().mockResolvedValue(true),
      listCurrentStaff: vi.fn().mockResolvedValue([
        {
          membershipId: ids.membership,
          isRootOwner: false,
          profileId: ids.membership,
          displayName: "Suspended coach",
          username: "suspended-coach",
          roleKeys: ["coach"],
          suspendedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]),
    };
  });

  it("passes the explicit lifecycle filter through the cursor fence and bounded query", async () => {
    const result = await listOrganizationStaff({
      db: {} as never,
      actorProfileId: ids.actor,
      organizationId: ids.organization,
      limit: 1,
      cursor: ids.membership,
      status: "suspended",
    });
    expect(state.repository.staffCursorBelongsToOrganization).toHaveBeenCalledWith(
      ids.organization,
      ids.membership,
      "suspended",
    );
    expect(state.repository.listCurrentStaff).toHaveBeenCalledWith(
      ids.organization,
      1,
      ids.membership,
      "suspended",
    );
    expect(result.items[0]).toMatchObject({
      membershipId: ids.membership,
      suspendedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("rejects a cursor from a different lifecycle filter", async () => {
    state.repository.staffCursorBelongsToOrganization.mockResolvedValue(false);
    await expect(
      listOrganizationStaff({
        db: {} as never,
        actorProfileId: ids.actor,
        organizationId: ids.organization,
        limit: 1,
        cursor: ids.membership,
        status: "active",
      }),
    ).rejects.toMatchObject({ reason: "invalid_cursor" });
  });

  it("does not authorize a suspended administrator", async () => {
    state.repository.getCurrentAdministrativeAuthority.mockResolvedValue(null);
    await expect(
      listOrganizationStaff({
        db: {} as never,
        actorProfileId: ids.actor,
        organizationId: ids.organization,
        limit: 1,
        cursor: null,
        status: "suspended",
      }),
    ).rejects.toMatchObject({ reason: "forbidden" });
  });

  it("exposes action eligibility from the role and suspension policies", async () => {
    state.repository.getCurrentAdministrativeAuthority.mockResolvedValue({
      membershipId: ids.actor,
      isRootOwner: false,
      rootMembershipId: ids.root,
    });
    state.repository.listCurrentStaff.mockResolvedValue([
      {
        membershipId: ids.actor,
        isRootOwner: false,
        profileId: ids.actor,
        displayName: "Admin actor",
        username: "admin-actor",
        roleKeys: ["admin"],
        suspendedAt: null,
      },
      {
        membershipId: ids.root,
        isRootOwner: true,
        profileId: ids.root,
        displayName: "Root owner",
        username: "root-owner",
        roleKeys: ["admin"],
        suspendedAt: null,
      },
      {
        membershipId: ids.membership,
        isRootOwner: false,
        profileId: ids.membership,
        displayName: "Suspended coach",
        username: "suspended-coach",
        roleKeys: ["coach"],
        suspendedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        membershipId: ids.coach,
        isRootOwner: false,
        profileId: ids.coach,
        displayName: "Active coach",
        username: "active-coach",
        roleKeys: ["coach"],
        suspendedAt: null,
      },
    ]);

    const result = await listOrganizationStaff({
      db: {} as never,
      actorProfileId: ids.actor,
      organizationId: ids.organization,
      limit: 4,
      cursor: null,
      status: "suspended",
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        membershipId: ids.actor,
        actions: {
          suspend: { eligible: false },
          resume: { eligible: false },
          grantAdmin: { eligible: false },
          revokeAdmin: { eligible: false },
          grantCoach: { eligible: true },
          revokeCoach: { eligible: false },
        },
      }),
      expect.objectContaining({
        membershipId: ids.root,
        actions: {
          suspend: { eligible: false },
          resume: { eligible: false },
          grantAdmin: { eligible: false },
          revokeAdmin: { eligible: false },
          grantCoach: { eligible: false },
          revokeCoach: { eligible: false },
        },
      }),
      expect.objectContaining({
        membershipId: ids.membership,
        actions: {
          suspend: { eligible: true },
          resume: { eligible: true },
          grantAdmin: { eligible: false },
          revokeAdmin: { eligible: false },
          grantCoach: { eligible: false },
          revokeCoach: { eligible: false },
        },
      }),
      expect.objectContaining({
        membershipId: ids.coach,
        actions: {
          suspend: { eligible: true },
          resume: { eligible: true },
          grantAdmin: { eligible: false },
          revokeAdmin: { eligible: false },
          grantCoach: { eligible: true },
          revokeCoach: { eligible: true },
        },
      }),
    ]);
  });
});
