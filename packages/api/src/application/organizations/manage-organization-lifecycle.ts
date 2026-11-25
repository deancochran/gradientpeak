import type { DrizzleDbClient } from "@repo/db/client";
import {
  createOrganizationLifecycleRepository,
  type OrganizationLifecycleRepository,
} from "../../repositories/organization-lifecycle-repository";
import { canManageStaffRole, type StaffRole } from "./manage-staff-roles";
import { canManageStaffSuspension } from "./manage-staff-suspension";

export type OrganizationLifecycleCommandFailure =
  | "forbidden"
  | "not_found"
  | "invalid_cursor"
  | "conflict"
  | "unavailable";

export class OrganizationLifecycleError extends Error {
  constructor(readonly reason: OrganizationLifecycleCommandFailure) {
    super(reason);
    this.name = "OrganizationLifecycleError";
  }
}

function databaseFailure(error: unknown): OrganizationLifecycleError | null {
  const messages = new Set<string>();
  let candidate: unknown = error;
  while (candidate instanceof Error && !messages.has(candidate.message)) {
    messages.add(candidate.message);
    candidate = candidate.cause;
  }
  const message = [...messages].join(" ").toLowerCase();
  if (
    message.includes("organization not found") ||
    message.includes("membership not found") ||
    message.includes("engagement not found")
  )
    return new OrganizationLifecycleError("not_found");
  if (message.includes("correlation_id conflicts"))
    return new OrganizationLifecycleError("conflict");
  if (
    message.includes("actor ") ||
    message.includes("target membership cannot") ||
    message.includes("only the exact athlete") ||
    message.includes("organization is not active") ||
    message.includes("organization is closed")
  )
    return new OrganizationLifecycleError("forbidden");
  return null;
}

async function requireAdmin(
  repository: OrganizationLifecycleRepository,
  organizationId: string,
  actorProfileId: string,
) {
  const authority = await repository.getCurrentAdministrativeAuthority(
    organizationId,
    actorProfileId,
  );
  if (!authority) throw new OrganizationLifecycleError("forbidden");
  return authority;
}

function page<T extends { membershipId?: string; engagementId?: string }>(
  rows: T[],
  limit: number,
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit ? (last?.membershipId ?? last?.engagementId ?? null) : null,
  };
}

export async function listOrganizationStaff(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  limit: number;
  cursor: string | null;
  status: "active" | "suspended";
}) {
  const repository = createOrganizationLifecycleRepository(input.db);
  const actor = await requireAdmin(repository, input.organizationId, input.actorProfileId);
  if (
    input.cursor !== null &&
    !(await repository.staffCursorBelongsToOrganization(
      input.organizationId,
      input.cursor,
      input.status,
    ))
  )
    throw new OrganizationLifecycleError("invalid_cursor");
  const result = page(
    await repository.listCurrentStaff(
      input.organizationId,
      input.limit,
      input.cursor,
      input.status,
    ),
    input.limit,
  );
  return {
    ...result,
    items: result.items.map((item) => {
      const reason: "self" | "root_owner" | "admin_target" | null =
        item.membershipId === actor.membershipId
          ? "self"
          : item.isRootOwner
            ? "root_owner"
            : !actor.isRootOwner && item.roleKeys.includes("admin")
              ? "admin_target"
              : null;
      const targetIsActive = item.suspendedAt === null;
      const actorRoles: readonly StaffRole[] = actor.isRootOwner ? [] : ["admin"];
      const canManageRole = (mutation: "grant" | "revoke", role: StaffRole) =>
        targetIsActive &&
        canManageStaffRole({
          mutation,
          role,
          actorMembershipId: actor.membershipId,
          rootMembershipId: actor.rootMembershipId,
          actorRoles,
          targetMembershipId: item.membershipId,
        });
      const canManageSuspension = canManageStaffSuspension({
        actorMembershipId: actor.membershipId,
        actorIsActive: true,
        rootMembershipId: actor.rootMembershipId,
        targetMembershipId: item.membershipId,
        targetIsEnded: false,
      });
      return {
        ...item,
        endMembership: { eligible: reason === null, reason },
        actions: {
          suspend: { eligible: canManageSuspension },
          resume: { eligible: canManageSuspension },
          grantAdmin: { eligible: canManageRole("grant", "admin") },
          revokeAdmin: { eligible: canManageRole("revoke", "admin") },
          grantCoach: { eligible: canManageRole("grant", "coach") },
          revokeCoach: { eligible: canManageRole("revoke", "coach") },
        },
      };
    }),
  };
}

/** Counts remain an administrative metadata read; no training, messages, or health content is selected. */
export async function readAdministrativeOperationalOverview(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
}) {
  const result = await createOrganizationLifecycleRepository(
    input.db,
  ).getAdministrativeOperationalOverview(input.organizationId, input.actorProfileId);
  if (!result) throw new OrganizationLifecycleError("forbidden");
  return result;
}

export async function listAdministrativeAthleteRoster(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  limit: number;
  cursor: string | null;
  engagementStatus: "active" | "paused" | null;
  withoutPrimaryAssignment: boolean;
}) {
  const repository = createOrganizationLifecycleRepository(input.db);
  await requireAdmin(repository, input.organizationId, input.actorProfileId);
  if (
    input.cursor !== null &&
    !(await repository.rosterCursorBelongsToOrganization(
      input.organizationId,
      input.cursor,
      input.engagementStatus,
      input.withoutPrimaryAssignment,
    ))
  )
    throw new OrganizationLifecycleError("invalid_cursor");
  return page(
    await repository.listCurrentAthleteRoster(
      input.organizationId,
      input.limit,
      input.cursor,
      input.engagementStatus,
      input.withoutPrimaryAssignment,
    ),
    input.limit,
  );
}

/**
 * Read-only offboarding preparation. Resource ownership is deliberately not
 * inferred until the shared-library inventory has an authoritative adapter.
 */
export async function previewStaffOffboardingImpact(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  membershipId: string;
  limit: number;
  cursor: string | null;
}) {
  const repository = createOrganizationLifecycleRepository(input.db);
  const actor = await requireAdmin(repository, input.organizationId, input.actorProfileId);
  const target = await repository.getCurrentStaffOffboardingTarget(
    input.organizationId,
    input.membershipId,
  );
  // The organization-scoped lookup makes unknown and foreign memberships
  // indistinguishable to an authorized caller, and reveals nothing to others.
  if (!target) throw new OrganizationLifecycleError("not_found");
  if (
    input.cursor !== null &&
    !(await repository.offboardingAssignmentCursorBelongsToTarget(
      input.organizationId,
      input.membershipId,
      input.cursor,
    ))
  )
    throw new OrganizationLifecycleError("invalid_cursor");
  const result = await repository.readCurrentOffboardingImpactPage(
    input.organizationId,
    input.membershipId,
    input.limit,
    input.cursor,
  );
  const assignedAthletes = page(result.items, input.limit);
  const protectedReason: "self" | "root_owner" | "admin_target" | null =
    target.membershipId === actor.membershipId
      ? "self"
      : target.isRootOwner
        ? "root_owner"
        : !actor.isRootOwner && target.hasAdminRole
          ? "admin_target"
          : null;
  return {
    target: {
      membershipId: target.membershipId,
      identity: {
        profileId: target.profileId,
        displayName: target.displayName,
        username: target.username,
      },
      offboarding: { eligible: protectedReason === null, reason: protectedReason },
    },
    assignedAthleteCount: result.total,
    assignedAthletes: assignedAthletes.items,
    nextCursor: assignedAthletes.nextCursor,
    hasMore: assignedAthletes.hasMore,
    resourceInventory: { status: "unavailable" as const },
  };
}

async function command(
  db: DrizzleDbClient,
  operation: (repository: OrganizationLifecycleRepository) => Promise<unknown>,
) {
  try {
    const result = await operation(createOrganizationLifecycleRepository(db));
    if (result === null) throw new OrganizationLifecycleError("not_found");
  } catch (error) {
    const mapped = databaseFailure(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export async function endOrganizationMembership(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  membershipId: string;
  reason: string;
  correlationId: string;
}): Promise<never> {
  const repository = createOrganizationLifecycleRepository(input.db);
  const actor = await requireAdmin(repository, input.organizationId, input.actorProfileId);
  const target = await repository.getCurrentStaffOffboardingTarget(
    input.organizationId,
    input.membershipId,
  );
  if (!target) throw new OrganizationLifecycleError("not_found");
  if (
    target.membershipId === actor.membershipId ||
    target.isRootOwner ||
    (!actor.isRootOwner && target.hasAdminRole)
  )
    throw new OrganizationLifecycleError("forbidden");
  // Staff offboarding has no durable handover or resource-inventory authority
  // yet. Do not issue a terminal command until those prerequisites exist.
  throw new OrganizationLifecycleError("unavailable");
}

export async function endCoachingEngagement(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  engagementId: string;
  reason: string;
  correlationId: string;
}) {
  await command(input.db, (repository) => repository.endEngagement(input));
  return { engagementId: input.engagementId, status: "ended" as const };
}

export async function withdrawAthleteConsent(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  consentId: string;
  reason: string;
  correlationId: string;
}) {
  await command(input.db, (repository) => repository.withdrawConsent(input));
  return { consentId: input.consentId, status: "withdrawn" as const };
}
