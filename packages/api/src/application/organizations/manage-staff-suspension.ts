import type { DrizzleDbClient } from "@repo/db/client";
import {
  createOrganizationStaffSuspensionRepository,
  type OrganizationStaffSuspensionRepository,
} from "../../repositories/organization-staff-suspension-repository";

export class OrganizationStaffSuspensionError extends Error {
  constructor(readonly reason: "forbidden" | "not_found" | "conflict") {
    super(reason);
    this.name = "OrganizationStaffSuspensionError";
  }
}

type Action = "suspend" | "resume";
type Command = {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  membershipId: string;
  operationId: string;
  reason: string;
  action: Action;
};
const actionName = (action: Action) =>
  action === "suspend"
    ? ("organization.membership_suspended" as const)
    : ("organization.membership_resumed" as const);

function receiptMatches(
  input: Command,
  receipt: Awaited<ReturnType<OrganizationStaffSuspensionRepository["findReceipt"]>>,
) {
  return (
    receipt?.actorProfileId === input.actorProfileId &&
    receipt.action === actionName(input.action) &&
    receipt.resourceId === input.membershipId &&
    receipt.details !== null &&
    typeof receipt.details === "object" &&
    !Array.isArray(receipt.details) &&
    (receipt.details as { reason_code?: unknown }).reason_code === input.reason
  );
}

async function execute(input: Command) {
  return input.db.transaction(async (tx) => {
    const repository = createOrganizationStaffSuspensionRepository(tx);
    // This must remain the first lock: it linearizes lifecycle writers and lets
    // the deferred assignment/root-owner guards observe the complete transition.
    const organization = await repository.lockOrganization(input.organizationId);
    if (!organization) throw new OrganizationStaffSuspensionError("not_found");
    if (organization.suspendedAt || organization.closedAt)
      throw new OrganizationStaffSuspensionError("forbidden");

    const actor = await repository.lockMembershipForProfile(
      input.organizationId,
      input.actorProfileId,
    );
    if (!actor || actor.suspendedAt || actor.endedAt)
      throw new OrganizationStaffSuspensionError("forbidden");

    const replay = await repository.findReceipt(input.organizationId, input.operationId);
    if (replay) {
      if (!receiptMatches(input, replay)) throw new OrganizationStaffSuspensionError("conflict");
      return {
        membershipId: input.membershipId,
        operationId: input.operationId,
        status: input.action === "suspend" ? ("suspended" as const) : ("resumed" as const),
      };
    }

    const target = await repository.lockMembership(input.organizationId, input.membershipId);
    if (!target || target.endedAt) throw new OrganizationStaffSuspensionError("not_found");
    if (
      input.membershipId === actor.membershipId ||
      input.membershipId === organization.rootMembershipId
    )
      throw new OrganizationStaffSuspensionError("forbidden");

    if (input.action === "suspend" && target.suspendedAt === null) {
      // End both assignment forms before the deferred active-assignment checks run.
      await repository.endDirectAssignments(input.organizationId, input.membershipId);
      await repository.endGroupAssignments(
        input.organizationId,
        input.membershipId,
        actor.membershipId,
      );
      await repository.suspendMembership(input.organizationId, input.membershipId);
    } else if (input.action === "resume" && target.suspendedAt !== null)
      await repository.resumeMembership(input.organizationId, input.membershipId);

    await repository.recordReceipt({
      organizationId: input.organizationId,
      actorProfileId: input.actorProfileId,
      actorMembershipId: actor.membershipId,
      membershipId: input.membershipId,
      action: actionName(input.action),
      operationId: input.operationId,
      reason: input.reason,
    });
    return {
      membershipId: input.membershipId,
      operationId: input.operationId,
      status: input.action === "suspend" ? ("suspended" as const) : ("resumed" as const),
    };
  });
}

export const suspendOrganizationMembership = (input: Omit<Command, "action">) =>
  execute({ ...input, action: "suspend" });
export const resumeOrganizationMembership = (input: Omit<Command, "action">) =>
  execute({ ...input, action: "resume" });
