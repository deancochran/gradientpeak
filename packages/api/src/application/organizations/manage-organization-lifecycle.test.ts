import { beforeEach, describe, expect, it, vi } from "vitest";

type RepositoryMock = {
  getCurrentAdministrativeAuthority: ReturnType<typeof vi.fn>;
  endMembership: ReturnType<typeof vi.fn>;
  staffCursorBelongsToOrganization: ReturnType<typeof vi.fn>;
  listCurrentStaff: ReturnType<typeof vi.fn>;
  getCurrentStaffOffboardingTarget: ReturnType<typeof vi.fn>;
  offboardingAssignmentCursorBelongsToTarget: ReturnType<typeof vi.fn>;
  readCurrentOffboardingImpactPage: ReturnType<typeof vi.fn>;
};
const state = vi.hoisted(() => ({ repository: {} as RepositoryMock }));
vi.mock("../../repositories/organization-lifecycle-repository", () => ({
  createOrganizationLifecycleRepository: () => state.repository,
}));

import {
  endOrganizationMembership,
  listOrganizationStaff,
  previewStaffOffboardingImpact,
} from "./manage-organization-lifecycle";

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
      endMembership: vi.fn(),
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
      getCurrentStaffOffboardingTarget: vi.fn().mockResolvedValue({
        membershipId: ids.coach,
        profileId: ids.coach,
        displayName: "Active coach",
        username: "active-coach",
        isRootOwner: false,
        hasAdminRole: false,
      }),
      offboardingAssignmentCursorBelongsToTarget: vi.fn().mockResolvedValue(true),
      readCurrentOffboardingImpactPage: vi.fn().mockResolvedValue({
        total: 2,
        items: [
          {
            engagementId: "00000000-0000-4000-8000-000000000006",
            profileId: "00000000-0000-4000-8000-000000000007",
            displayName: "Assigned athlete",
            username: "assigned-athlete",
            assignmentKinds: ["primary"],
          },
          {
            engagementId: "00000000-0000-4000-8000-000000000008",
            profileId: "00000000-0000-4000-8000-000000000009",
            displayName: "Second athlete",
            username: "second-athlete",
            assignmentKinds: ["supporting"],
          },
        ],
      }),
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

  it("fails closed before issuing a staff terminal command until handover prerequisites exist", async () => {
    await expect(
      endOrganizationMembership({
        db: {} as never,
        actorProfileId: ids.actor,
        organizationId: ids.organization,
        membershipId: ids.coach,
        reason: "administrative_end",
        correlationId: "00000000-0000-4000-8000-000000000011",
      }),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(state.repository.endMembership).not.toHaveBeenCalled();
  });

  it("preserves staff terminal target denials before the unavailable gate", async () => {
    const protectedTargets = [
      {
        membershipId: ids.actor,
        isRootOwner: false,
        hasAdminRole: true,
      },
      {
        membershipId: ids.root,
        isRootOwner: true,
        hasAdminRole: true,
      },
    ];
    for (const target of protectedTargets) {
      state.repository.getCurrentStaffOffboardingTarget.mockResolvedValueOnce({
        profileId: ids.coach,
        displayName: "Protected staff",
        username: "protected-staff",
        ...target,
      });
      await expect(
        endOrganizationMembership({
          db: {} as never,
          actorProfileId: ids.actor,
          organizationId: ids.organization,
          membershipId: target.membershipId,
          reason: "administrative_end",
          correlationId: "00000000-0000-4000-8000-000000000011",
        }),
      ).rejects.toMatchObject({ reason: "forbidden" });
    }
    expect(state.repository.endMembership).not.toHaveBeenCalled();
  });

  it("does not look up a target for an unauthorized terminal request", async () => {
    state.repository.getCurrentAdministrativeAuthority.mockResolvedValue(null);
    await expect(
      endOrganizationMembership({
        db: {} as never,
        actorProfileId: ids.actor,
        organizationId: ids.organization,
        membershipId: ids.coach,
        reason: "administrative_end",
        correlationId: "00000000-0000-4000-8000-000000000011",
      }),
    ).rejects.toMatchObject({ reason: "forbidden" });
    expect(state.repository.getCurrentStaffOffboardingTarget).not.toHaveBeenCalled();
  });

  it("returns only bounded assignment identities and effective kinds for an authorized impact preview", async () => {
    const result = await previewStaffOffboardingImpact({
      db: {} as never,
      actorProfileId: ids.actor,
      organizationId: ids.organization,
      membershipId: ids.coach,
      limit: 1,
      cursor: null,
    });
    expect(result.assignedAthleteCount).toBe(2);
    expect(result.assignedAthletes).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("00000000-0000-4000-8000-000000000006");
    expect(result.resourceInventory).toEqual({ status: "unavailable" });
    expect(state.repository.readCurrentOffboardingImpactPage).toHaveBeenCalledWith(
      ids.organization,
      ids.coach,
      1,
      null,
    );
  });

  it("does not leak a foreign or unknown membership through the scoped target lookup", async () => {
    state.repository.getCurrentStaffOffboardingTarget.mockResolvedValue(null);
    for (const membershipId of [ids.coach, "00000000-0000-4000-8000-000000000010"]) {
      await expect(
        previewStaffOffboardingImpact({
          db: {} as never,
          actorProfileId: ids.actor,
          organizationId: ids.organization,
          membershipId,
          limit: 1,
          cursor: null,
        }),
      ).rejects.toMatchObject({ reason: "not_found" });
    }
  });

  it("explains protected self, root-owner, and administrator target states", async () => {
    const protectedCases = [
      [{ membershipId: ids.actor, isRootOwner: false, hasAdminRole: true }, "self"],
      [{ membershipId: ids.root, isRootOwner: true, hasAdminRole: true }, "root_owner"],
      [{ membershipId: ids.coach, isRootOwner: false, hasAdminRole: true }, "admin_target"],
    ] as const;
    state.repository.getCurrentAdministrativeAuthority.mockResolvedValue({
      membershipId: ids.actor,
      isRootOwner: false,
      rootMembershipId: ids.root,
    });
    for (const [target, reason] of protectedCases) {
      state.repository.getCurrentStaffOffboardingTarget.mockResolvedValue({
        profileId: ids.coach,
        displayName: "Coach",
        username: "coach",
        ...target,
      });
      await expect(
        previewStaffOffboardingImpact({
          db: {} as never,
          actorProfileId: ids.actor,
          organizationId: ids.organization,
          membershipId: target.membershipId,
          limit: 1,
          cursor: null,
        }),
      ).resolves.toMatchObject({ target: { offboarding: { eligible: false, reason } } });
    }
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
