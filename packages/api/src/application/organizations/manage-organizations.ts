import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { OrganizationRoleKey } from "@repo/core/organizations";
import type { DrizzleDbClient } from "@repo/db/client";
import { withRepeatableReadSnapshot } from "../../db";
import {
  createOrganizationManagementRepository,
  type OrganizationManagementRepository,
} from "../../repositories/organization-management-repository";

export type OrganizationManagementFailure =
  | "forbidden"
  | "not_found"
  | "invalid_recipient"
  | "expired"
  | "already_closed"
  | "membership_ended"
  | "conflict";
export class OrganizationManagementError extends Error {
  constructor(readonly reason: OrganizationManagementFailure) {
    super(reason);
    this.name = "OrganizationManagementError";
  }
}
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

async function requireAdmin(
  repo: OrganizationManagementRepository,
  organizationId: string,
  profileId: string,
) {
  const organization = await repo.lockOrganization(organizationId);
  const membership = await repo.lockMembership(organizationId, profileId);
  if (
    !organization ||
    organization.suspended ||
    organization.closed ||
    !membership ||
    membership.suspended ||
    membership.ended
  )
    throw new OrganizationManagementError("forbidden");
  const roles = await repo.roles(organizationId, membership.id);
  if (organization.root !== membership.id && !roles.some((r) => r.role === "admin"))
    throw new OrganizationManagementError("forbidden");
  return { organization, membership };
}

export async function createOrganization(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  name: string;
  slug: string;
  timezone: string;
}) {
  return input.db.transaction(async (tx) => {
    await tx.execute("set constraints all deferred");
    const repo = createOrganizationManagementRepository(tx);
    const membershipId = randomUUID();
    const created = await repo.createOrganization({
      id: input.organizationId,
      membershipId,
      profileId: input.actorProfileId,
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
    });
    if (!created[0]) {
      const existing = await repo.findOwnedOrganization(input.organizationId, input.actorProfileId);
      if (
        existing &&
        existing.name === input.name &&
        existing.slug === input.slug &&
        existing.timezone === input.timezone
      )
        return {
          organizationId: existing.id,
          membershipId: existing.membershipId,
        };
      throw new OrganizationManagementError("conflict");
    }
    await repo.createMembership(membershipId, input.organizationId, input.actorProfileId);
    await repo.grant(input.organizationId, membershipId, "admin");
    return { organizationId: input.organizationId, membershipId };
  });
}

export async function createOrganizationInvitation(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  kind: "staff" | "athlete";
  role: OrganizationRoleKey | null;
  recipientProfileId: string | null;
  recipientEmail: string | null;
  expiresAt: Date;
}) {
  const token = randomBytes(32).toString("base64url");
  const invitation = await withRepeatableReadSnapshot(
    input.db,
    async (tx) => {
      const repo = createOrganizationManagementRepository(tx);
      const { organization, membership } = await requireAdmin(
        repo,
        input.organizationId,
        input.actorProfileId,
      );
      if (input.role === "admin" && organization.root !== membership.id)
        throw new OrganizationManagementError("forbidden");
      if (await repo.isExpired(input.organizationId, input.expiresAt))
        throw new OrganizationManagementError("expired");
      const [created] = await repo.createInvitation({
        organizationId: input.organizationId,
        inviterMembershipId: membership.id,
        kind: input.kind,
        role: input.role,
        profileId: input.recipientProfileId,
        email: input.recipientEmail,
        digest: tokenDigest(token),
        expiresAt: input.expiresAt,
      });
      if (!created) throw new Error("Invitation insert returned no row");
      return created;
    },
    { accessMode: "read write" },
  );
  return {
    invitationId: invitation.id,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    token,
  };
}

export async function acceptOrganizationInvitation(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  token: string;
}) {
  // Read committed is deliberate: the canonical identity row is locked after
  // the organization lock, and must be observed at its newest committed value.
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationManagementRepository(tx);
    const candidate = await repo.findInvitation(tokenDigest(input.token));
    if (!candidate) throw new OrganizationManagementError("not_found");
    // Organization-first locking matches revoke/create writers; invitation is
    // re-read under lock below before any state transition is accepted.
    const organization = await repo.lockOrganization(candidate.organizationId);
    const invitation = await repo.lockInvitation(tokenDigest(input.token));
    if (!invitation) throw new OrganizationManagementError("not_found");
    const recipient = await repo.recipient(input.actorProfileId);
    const matches =
      invitation.invited_profile_id === input.actorProfileId ||
      (invitation.invited_email !== null &&
        recipient?.verified &&
        invitation.invited_email.toLowerCase() === recipient.email.toLowerCase());
    if (!matches || !recipient?.verified)
      throw new OrganizationManagementError("invalid_recipient");
    if (
      invitation.status === "accepted" &&
      invitation.accepted_by_profile_id === input.actorProfileId
    )
      return {
        invitationId: invitation.id,
        organizationId: invitation.organization_id,
        status: "accepted" as const,
      };
    if (invitation.status !== "pending") throw new OrganizationManagementError("already_closed");
    if (await repo.isExpired(invitation.organization_id, invitation.expires_at))
      throw new OrganizationManagementError("expired");
    const inviter = await repo.lockMembershipById(
      invitation.organization_id,
      invitation.invited_by_membership_id,
    );
    const inviterRoles = await repo.roles(
      invitation.organization_id,
      invitation.invited_by_membership_id,
    );
    if (
      !organization ||
      organization.suspended ||
      organization.closed ||
      !inviter ||
      inviter.suspended ||
      inviter.ended ||
      (organization.root !== invitation.invited_by_membership_id &&
        !inviterRoles.some((r) => r.role === "admin"))
    )
      throw new OrganizationManagementError("forbidden");
    if (invitation.invitation_kind === "staff") {
      const existing = await repo.lockMembership(invitation.organization_id, input.actorProfileId);
      if (existing?.ended || existing?.suspended)
        throw new OrganizationManagementError("membership_ended");
      const membershipId = existing?.id ?? randomUUID();
      if (!existing)
        await repo.createMembership(membershipId, invitation.organization_id, input.actorProfileId);
      await repo.grant(
        invitation.organization_id,
        membershipId,
        invitation.requested_role_key as OrganizationRoleKey,
      );
    } else await repo.createEngagement(invitation.organization_id, input.actorProfileId);
    await repo.accept(invitation.id, input.actorProfileId);
    return {
      invitationId: invitation.id,
      organizationId: invitation.organization_id,
      status: "accepted" as const,
    };
  });
}

export async function revokeOrganizationInvitation(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  invitationId: string;
}) {
  return withRepeatableReadSnapshot(
    input.db,
    async (tx) => {
      const repo = createOrganizationManagementRepository(tx);
      const { organization, membership } = await requireAdmin(
        repo,
        input.organizationId,
        input.actorProfileId,
      );
      const invitation = await repo.lockInvitationById(input.organizationId, input.invitationId);
      if (!invitation) throw new OrganizationManagementError("not_found");
      if (invitation.requestedRole === "admin" && organization.root !== membership.id)
        throw new OrganizationManagementError("forbidden");
      const result = await repo.revoke(input.organizationId, input.invitationId, membership.id);
      if (!result.rowCount) throw new OrganizationManagementError("already_closed");
      return { invitationId: input.invitationId, status: "revoked" as const };
    },
    { accessMode: "read write" },
  );
}
