import type { DrizzleDbClient } from "@repo/db/client";
import {
  createOrganizationStaffRoleRepository,
  type OrganizationStaffRoleRepository,
} from "../../repositories/organization-staff-role-repository";

export type StaffRoleMutation = "grant" | "revoke";
export type StaffRole = "admin" | "coach";

export class OrganizationStaffRoleError extends Error {
  constructor(readonly reason: "forbidden" | "not_found" | "conflict") {
    super(reason);
    this.name = "OrganizationStaffRoleError";
  }
}

function active(
  value: { id: string; suspendedAt: Date | null; endedAt: Date | null } | null,
): value is { id: string; suspendedAt: null; endedAt: null } {
  return value !== null && value.suspendedAt === null && value.endedAt === null;
}

export function canManageStaffRole(input: {
  mutation: StaffRoleMutation;
  role: StaffRole;
  actorMembershipId: string;
  rootMembershipId: string;
  actorRoles: readonly StaffRole[];
  targetMembershipId: string;
}) {
  if (input.targetMembershipId === input.actorMembershipId)
    return (
      input.mutation === "grant" &&
      input.role === "coach" &&
      (input.actorMembershipId === input.rootMembershipId || input.actorRoles.includes("admin"))
    );
  if (input.targetMembershipId === input.rootMembershipId) return false;
  if (input.actorMembershipId === input.rootMembershipId) return true;
  return input.role === "coach" && input.actorRoles.includes("admin");
}

async function authorize(input: {
  repo: OrganizationStaffRoleRepository;
  organizationId: string;
  actorProfileId: string;
  targetMembershipId: string;
  role: StaffRole;
  mutation: StaffRoleMutation;
}) {
  // All role writers lock the organization first so current authority and
  // target lifecycle state are evaluated from one serializable mutation lane.
  const organization = await input.repo.lockOrganization(input.organizationId);
  if (!organization || organization.suspendedAt || organization.closedAt)
    throw new OrganizationStaffRoleError("forbidden");
  const actor = await input.repo.lockMembershipByProfile(
    input.organizationId,
    input.actorProfileId,
  );
  const target = await input.repo.lockMembershipById(
    input.organizationId,
    input.targetMembershipId,
  );
  if (!active(actor) || !active(target)) throw new OrganizationStaffRoleError("forbidden");
  const actorRoles = (await input.repo.activeRoles(input.organizationId, actor.id)).map(
    (row) => row.role,
  );
  if (
    !canManageStaffRole({
      role: input.role,
      mutation: input.mutation,
      actorMembershipId: actor.id,
      rootMembershipId: organization.rootMembershipId,
      actorRoles,
      targetMembershipId: target.id,
    })
  )
    throw new OrganizationStaffRoleError("forbidden");
  return { actorMembershipId: actor.id };
}

export async function manageStaffRole(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  targetMembershipId: string;
  role: StaffRole;
  mutation: StaffRoleMutation;
  operationId: string;
}) {
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationStaffRoleRepository(tx);
    const { actorMembershipId } = await authorize({ ...input, repo });
    const action =
      input.mutation === "grant"
        ? "organization.staff_role_granted"
        : "organization.staff_role_revoked";
    const receipt = await repo.findOperationReceipt(input.organizationId, input.operationId);
    if (receipt) {
      if (
        receipt.action !== action ||
        receipt.actorProfileId !== input.actorProfileId ||
        receipt.actorMembershipId !== actorMembershipId ||
        receipt.targetMembershipId !== input.targetMembershipId ||
        receipt.role !== input.role
      )
        throw new OrganizationStaffRoleError("conflict");
      return {
        membershipId: input.targetMembershipId,
        role: input.role,
        operationId: input.operationId,
        status: input.mutation === "grant" ? ("granted" as const) : ("revoked" as const),
      };
    }
    const current = await repo.lockActiveGrant(
      input.organizationId,
      input.targetMembershipId,
      input.role,
    );

    if (input.mutation === "grant") {
      if (!current) {
        const inserted = await repo.grant(
          input.organizationId,
          input.targetMembershipId,
          input.role,
        );
        // An organization lock serializes cooperative writers. The re-read is
        // still required for a unique-index race from an older writer.
        if (
          !inserted[0] &&
          !(await repo.lockActiveGrant(input.organizationId, input.targetMembershipId, input.role))
        )
          throw new OrganizationStaffRoleError("conflict");
      }
      const recorded = await repo.audit({
        organizationId: input.organizationId,
        actorProfileId: input.actorProfileId,
        actorMembershipId,
        targetMembershipId: input.targetMembershipId,
        action,
        operationId: input.operationId,
        role: input.role,
      });
      if (!recorded[0]) throw new OrganizationStaffRoleError("conflict");
      return {
        membershipId: input.targetMembershipId,
        role: input.role,
        operationId: input.operationId,
        status: "granted" as const,
      };
    }

    let endedDirectAssignments: { id: string }[] = [];
    let endedGroupAssignments: { id: string }[] = [];
    if (current) {
      endedDirectAssignments =
        input.role === "coach"
          ? await repo.endDirectAssignments(input.organizationId, input.targetMembershipId)
          : [];
      endedGroupAssignments =
        input.role === "coach"
          ? await repo.endGroupAssignments(
              input.organizationId,
              input.targetMembershipId,
              actorMembershipId,
            )
          : [];
      await repo.revoke(input.organizationId, current.id);
    }
    const recorded = await repo.audit({
      organizationId: input.organizationId,
      actorProfileId: input.actorProfileId,
      actorMembershipId,
      targetMembershipId: input.targetMembershipId,
      action,
      operationId: input.operationId,
      role: input.role,
      endedDirectAssignments: endedDirectAssignments.length,
      endedGroupAssignments: endedGroupAssignments.length,
    });
    if (!recorded[0]) throw new OrganizationStaffRoleError("conflict");
    return {
      membershipId: input.targetMembershipId,
      role: input.role,
      operationId: input.operationId,
      status: "revoked" as const,
    };
  });
}
