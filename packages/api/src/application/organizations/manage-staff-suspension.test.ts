import { beforeEach, describe, expect, it, vi } from "vitest";

type RepositoryMock = {
  lockOrganization: ReturnType<typeof vi.fn>;
  lockMembershipForProfile: ReturnType<typeof vi.fn>;
  findReceipt: ReturnType<typeof vi.fn>;
  lockMembership: ReturnType<typeof vi.fn>;
  suspendMembership: ReturnType<typeof vi.fn>;
  resumeMembership: ReturnType<typeof vi.fn>;
  endDirectAssignments: ReturnType<typeof vi.fn>;
  endGroupAssignments: ReturnType<typeof vi.fn>;
  recordReceipt: ReturnType<typeof vi.fn>;
};
const state = vi.hoisted(() => ({ repository: {} as RepositoryMock }));
vi.mock("../../repositories/organization-staff-suspension-repository", () => ({
  createOrganizationStaffSuspensionRepository: () => state.repository,
}));

import {
  canManageStaffSuspension,
  resumeOrganizationMembership,
  suspendOrganizationMembership,
} from "./manage-staff-suspension";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  actorId: "00000000-0000-4000-8000-000000000002",
  actorMembershipId: "00000000-0000-4000-8000-000000000003",
  targetMembershipId: "00000000-0000-4000-8000-000000000004",
  rootMembershipId: "00000000-0000-4000-8000-000000000005",
  operationId: "00000000-0000-4000-8000-000000000006",
};

function command(action: "suspend" | "resume") {
  const db = { transaction: vi.fn((work) => work({})) };
  const input = {
    db: db as never,
    actorProfileId: ids.actorId,
    organizationId: ids.organizationId,
    membershipId: ids.targetMembershipId,
    operationId: ids.operationId,
    reason: "administrative_review",
  };
  return action === "suspend"
    ? suspendOrganizationMembership(input)
    : resumeOrganizationMembership(input);
}

describe("staff suspension management", () => {
  it("keeps inactive actors and protected memberships ineligible", () => {
    expect(
      canManageStaffSuspension({
        actorMembershipId: ids.actorMembershipId,
        actorIsActive: false,
        rootMembershipId: ids.rootMembershipId,
        targetMembershipId: ids.targetMembershipId,
        targetIsEnded: false,
      }),
    ).toBe(false);
    for (const targetMembershipId of [ids.actorMembershipId, ids.rootMembershipId])
      expect(
        canManageStaffSuspension({
          actorMembershipId: ids.actorMembershipId,
          actorIsActive: true,
          rootMembershipId: ids.rootMembershipId,
          targetMembershipId,
          targetIsEnded: false,
        }),
      ).toBe(false);
  });

  beforeEach(() => {
    state.repository = {
      // The organization lock is deliberately first in the use case, before
      // receipt/actor/target reads, so competing lifecycle commands serialize.
      lockOrganization: vi.fn().mockResolvedValue({
        id: ids.organizationId,
        rootMembershipId: ids.rootMembershipId,
        suspendedAt: null,
        closedAt: null,
      }),
      lockMembershipForProfile: vi.fn().mockResolvedValue({
        membershipId: ids.actorMembershipId,
        isRootOwner: false,
        suspendedAt: null,
        endedAt: null,
      }),
      findReceipt: vi.fn().mockResolvedValue(null),
      lockMembership: vi.fn().mockResolvedValue({
        membershipId: ids.targetMembershipId,
        suspendedAt: null,
        endedAt: null,
      }),
      suspendMembership: vi.fn().mockResolvedValue(undefined),
      resumeMembership: vi.fn().mockResolvedValue(undefined),
      endDirectAssignments: vi.fn().mockResolvedValue(undefined),
      endGroupAssignments: vi.fn().mockResolvedValue(undefined),
      recordReceipt: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("serializes on the organization first, ends both assignment forms, and preserves grants", async () => {
    await expect(command("suspend")).resolves.toEqual({
      membershipId: ids.targetMembershipId,
      operationId: ids.operationId,
      status: "suspended",
    });
    const [organizationLock] = state.repository.lockOrganization.mock.invocationCallOrder;
    const [actorLock] = state.repository.lockMembershipForProfile.mock.invocationCallOrder;
    expect(organizationLock).toEqual(expect.any(Number));
    expect(actorLock).toEqual(expect.any(Number));
    if (organizationLock === undefined || actorLock === undefined) throw new Error("missing lock");
    expect(organizationLock).toBeLessThan(actorLock);
    expect(state.repository.endDirectAssignments).toHaveBeenCalledWith(
      ids.organizationId,
      ids.targetMembershipId,
    );
    expect(state.repository.endGroupAssignments).toHaveBeenCalledWith(
      ids.organizationId,
      ids.targetMembershipId,
      ids.actorMembershipId,
    );
    expect(state.repository.recordReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ action: "organization.membership_suspended" }),
    );
  });

  it("permits a suspended target to resume without restoring assignments", async () => {
    state.repository.lockMembership.mockResolvedValue({
      membershipId: ids.targetMembershipId,
      suspendedAt: new Date(),
      endedAt: null,
    });
    await expect(command("resume")).resolves.toMatchObject({ status: "resumed" });
    expect(state.repository.resumeMembership).toHaveBeenCalledWith(
      ids.organizationId,
      ids.targetMembershipId,
    );
    expect(state.repository.endDirectAssignments).not.toHaveBeenCalled();
    expect(state.repository.endGroupAssignments).not.toHaveBeenCalled();
  });

  it.each([
    ["self", ids.actorMembershipId],
    ["root", ids.rootMembershipId],
  ])("rejects %s suspension targets", async (_label, membershipId) => {
    await expect(
      suspendOrganizationMembership({
        db: { transaction: vi.fn((work) => work({})) } as never,
        actorProfileId: ids.actorId,
        organizationId: ids.organizationId,
        membershipId,
        operationId: ids.operationId,
        reason: "administrative_review",
      }),
    ).rejects.toMatchObject({ reason: "forbidden" });
  });

  it("rejects ended targets and conflicts when an operation id changes command payload", async () => {
    state.repository.lockMembership.mockResolvedValue({
      membershipId: ids.targetMembershipId,
      suspendedAt: null,
      endedAt: new Date(),
    });
    await expect(command("suspend")).rejects.toMatchObject({ reason: "not_found" });

    state.repository.lockMembership.mockResolvedValue({
      membershipId: ids.targetMembershipId,
      suspendedAt: null,
      endedAt: null,
    });
    state.repository.findReceipt.mockResolvedValue({
      actorProfileId: ids.actorId,
      action: "organization.membership_resumed",
      resourceId: ids.targetMembershipId,
      details: { reason_code: "administrative_review" },
    });
    await expect(command("suspend")).rejects.toMatchObject({ reason: "conflict" });
  });

  it("accepts an exact no-op replay only after the actor is re-authorized", async () => {
    state.repository.lockMembership.mockResolvedValue({
      membershipId: ids.targetMembershipId,
      suspendedAt: new Date(),
      endedAt: null,
    });
    state.repository.findReceipt.mockResolvedValue({
      actorProfileId: ids.actorId,
      action: "organization.membership_suspended",
      resourceId: ids.targetMembershipId,
      details: { reason_code: "administrative_review" },
    });
    await expect(command("suspend")).resolves.toMatchObject({ status: "suspended" });
    expect(state.repository.lockMembershipForProfile).toHaveBeenCalled();
    expect(state.repository.suspendMembership).not.toHaveBeenCalled();
    expect(state.repository.recordReceipt).not.toHaveBeenCalled();
  });
});
