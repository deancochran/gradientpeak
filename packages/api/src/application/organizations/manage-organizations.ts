import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type OrganizationInvitationSummary,
  type OrganizationRoleKey,
  organizationInvitationSummarySchema,
} from "@repo/core/organizations";
import type { DrizzleDbClient } from "@repo/db/client";
import { z } from "zod";
import { withRepeatableReadSnapshot } from "../../db";
import {
  createOrganizationManagementRepository,
  type OrganizationInvitationSummaryRow,
  type OrganizationManagementRepository,
} from "../../repositories/organization-management-repository";

const invitationListCursorVersion = 1;
const invitationCursorTimestampSchema = z
  .string()
  .datetime({ offset: true, precision: 6 })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
const invitationListCursorPayloadSchema = z
  .object({
    v: z.literal(invitationListCursorVersion),
    s: z.enum(["organization", "recipient"]),
    o: z.string().uuid().nullable(),
    c: invitationCursorTimestampSchema,
    i: z.string().uuid(),
  })
  .strict();

export type InvitationListCursor = {
  scope: "organization" | "recipient";
  organizationId: string | null;
  createdAtCursor: string;
  invitationId: string;
};

export type OrganizationInvitationListPage = {
  items: OrganizationInvitationSummary[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function decodeInvitationListCursor(value: string): InvitationListCursor | null {
  try {
    const parsed = invitationListCursorPayloadSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (!parsed.success) return null;
    return {
      scope: parsed.data.s,
      organizationId: parsed.data.o,
      createdAtCursor: parsed.data.c,
      invitationId: parsed.data.i,
    };
  } catch {
    return null;
  }
}

function encodeInvitationListCursor(input: {
  scope: InvitationListCursor["scope"];
  organizationId: string | null;
  createdAtCursor: string;
  invitationId: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      v: invitationListCursorVersion,
      s: input.scope,
      o: input.organizationId,
      c: input.createdAtCursor,
      i: input.invitationId,
    }),
  ).toString("base64url");
}

export function mapOrganizationInvitationSummary(
  row: OrganizationInvitationSummaryRow,
): OrganizationInvitationSummary {
  return organizationInvitationSummarySchema.parse({
    invitationId: row.invitationId,
    organizationId: row.organizationId,
    kind: row.kind,
    requestedRole: row.requestedRole,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

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

/** Token-bound recipient failures deliberately collapse to one public error. */
function unavailableInvitation(): never {
  throw new OrganizationManagementError("invalid_recipient");
}

async function lockRecipientInvitation(
  repo: OrganizationManagementRepository,
  token: string,
  actorProfileId: string,
) {
  const digest = tokenDigest(token);
  const candidate = await repo.findInvitation(digest);
  if (!candidate) return unavailableInvitation();
  // Keep the organization-first ordering used by acceptance so accept/decline
  // transitions serialize before the invitation is re-read and locked.
  const organization = await repo.lockOrganization(candidate.organizationId);
  const invitation = await repo.lockInvitation(digest);
  const recipient = await repo.recipient(actorProfileId);
  if (!organization || !invitation || !recipient?.verified) return unavailableInvitation();
  const matches =
    invitation.invited_profile_id === actorProfileId ||
    (invitation.invited_email !== null &&
      invitation.invited_email.toLowerCase() === recipient.email.toLowerCase());
  if (!matches) return unavailableInvitation();
  return { organization, invitation };
}

async function requirePendingInvitationAuthority(
  repo: OrganizationManagementRepository,
  organization: Awaited<ReturnType<OrganizationManagementRepository["lockOrganization"]>>,
  invitation: NonNullable<Awaited<ReturnType<OrganizationManagementRepository["lockInvitation"]>>>,
) {
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
    return unavailableInvitation();
}

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

export async function previewOrganizationInvitation(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  token: string;
}) {
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationManagementRepository(tx);
    const { organization, invitation } = await lockRecipientInvitation(
      repo,
      input.token,
      input.actorProfileId,
    );
    if (
      invitation.status !== "pending" ||
      (await repo.isExpired(invitation.organization_id, invitation.expires_at))
    )
      return unavailableInvitation();
    await requirePendingInvitationAuthority(repo, organization, invitation);
    return {
      invitationId: invitation.id,
      organizationId: invitation.organization_id,
      organizationName: organization.name,
      kind: invitation.invitation_kind,
      requestedRole: invitation.requested_role_key,
      expiresAt: invitation.expires_at,
    };
  });
}

export async function declineOrganizationInvitation(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  token: string;
}) {
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationManagementRepository(tx);
    const { organization, invitation } = await lockRecipientInvitation(
      repo,
      input.token,
      input.actorProfileId,
    );
    if (
      invitation.status === "declined" &&
      invitation.declined_by_profile_id === input.actorProfileId
    )
      return { invitationId: invitation.id, status: "declined" as const };
    if (
      invitation.status !== "pending" ||
      (await repo.isExpired(invitation.organization_id, invitation.expires_at))
    )
      return unavailableInvitation();
    await requirePendingInvitationAuthority(repo, organization, invitation);
    await repo.decline(invitation.id, input.actorProfileId);
    // This occurs only for the durable pending-to-declined transition. The
    // invitation trigger permits decline without inviter authority, so the
    // application check above is required before recording the recipient act.
    await repo.recordRecipientDecline(
      invitation.organization_id,
      invitation.id,
      input.actorProfileId,
    );
    return { invitationId: invitation.id, status: "declined" as const };
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

export async function listOrganizationInvitations(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  limit: number;
  cursor: InvitationListCursor | null;
}): Promise<OrganizationInvitationListPage> {
  return withRepeatableReadSnapshot(input.db, async (tx) => {
    const repository = createOrganizationManagementRepository(tx);
    const administrator = await repository.findActiveAdminMembership(
      input.organizationId,
      input.actorProfileId,
    );
    if (!administrator) throw new OrganizationManagementError("forbidden");
    const rows = await repository.listOrganizationInvitations({
      organizationId: input.organizationId,
      limit: input.limit,
      cursor: input.cursor,
    });
    const pageRows = rows.slice(0, input.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(mapOrganizationInvitationSummary),
      hasMore: rows.length > input.limit,
      nextCursor:
        rows.length > input.limit && last
          ? encodeInvitationListCursor({
              scope: "organization",
              organizationId: input.organizationId,
              createdAtCursor: last.createdAtCursor,
              invitationId: last.invitationId,
            })
          : null,
    };
  });
}

export async function listMyOrganizationInvitations(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  limit: number;
  cursor: InvitationListCursor | null;
}): Promise<OrganizationInvitationListPage> {
  return withRepeatableReadSnapshot(input.db, async (tx) => {
    const repository = createOrganizationManagementRepository(tx);
    const rows = await repository.listRecipientInvitations({
      profileId: input.actorProfileId,
      limit: input.limit,
      cursor: input.cursor,
    });
    const pageRows = rows.slice(0, input.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(mapOrganizationInvitationSummary),
      hasMore: rows.length > input.limit,
      nextCursor:
        rows.length > input.limit && last
          ? encodeInvitationListCursor({
              scope: "recipient",
              organizationId: null,
              createdAtCursor: last.createdAtCursor,
              invitationId: last.invitationId,
            })
          : null,
    };
  });
}
