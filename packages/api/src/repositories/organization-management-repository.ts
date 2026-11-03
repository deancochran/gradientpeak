import {
  coachingEngagements,
  organizationInvitations,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
  users,
} from "@repo/db";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export function createOrganizationManagementRepository(db: DrizzleQueryExecutor) {
  return {
    lockOrganization: async (id: string) =>
      (
        await db
          .select({
            id: organizations.id,
            root: organizations.root_owner_membership_id,
            suspended: organizations.suspended_at,
            closed: organizations.closed_at,
          })
          .from(organizations)
          .where(eq(organizations.id, id))
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockMembership: async (organizationId: string, profileId: string) =>
      (
        await db
          .select({
            id: organizationMemberships.id,
            suspended: organizationMemberships.suspended_at,
            ended: organizationMemberships.ended_at,
          })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organization_id, organizationId),
              eq(organizationMemberships.profile_id, profileId),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockMembershipById: async (organizationId: string, membershipId: string) =>
      (
        await db
          .select({
            id: organizationMemberships.id,
            suspended: organizationMemberships.suspended_at,
            ended: organizationMemberships.ended_at,
          })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organization_id, organizationId),
              eq(organizationMemberships.id, membershipId),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    roles: (organizationId: string, membershipId: string) =>
      db
        .select({ role: organizationMembershipRoleGrants.role_key })
        .from(organizationMembershipRoleGrants)
        .where(
          and(
            eq(organizationMembershipRoleGrants.organization_id, organizationId),
            eq(organizationMembershipRoleGrants.membership_id, membershipId),
            lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
            isNull(organizationMembershipRoleGrants.revoked_at),
          ),
        ),
    createOrganization: (v: {
      id: string;
      membershipId: string;
      profileId: string;
      name: string;
      slug: string;
      timezone: string;
    }) =>
      db
        .insert(organizations)
        .values({
          id: v.id,
          created_by_profile_id: v.profileId,
          root_owner_membership_id: v.membershipId,
          name: v.name,
          slug: v.slug,
          timezone: v.timezone,
        })
        .onConflictDoNothing()
        .returning({ id: organizations.id }),
    findOwnedOrganization: async (id: string, profileId: string) =>
      (
        await db
          .select({
            id: organizations.id,
            membershipId: organizations.root_owner_membership_id,
            name: organizations.name,
            slug: organizations.slug,
            timezone: organizations.timezone,
          })
          .from(organizations)
          .where(and(eq(organizations.id, id), eq(organizations.created_by_profile_id, profileId)))
          .limit(1)
      )[0] ?? null,
    createMembership: (id: string, organizationId: string, profileId: string) =>
      db
        .insert(organizationMemberships)
        .values({ id, organization_id: organizationId, profile_id: profileId }),
    grant: (organizationId: string, membershipId: string, role: "admin" | "coach") =>
      db.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: membershipId,
        role_key: role,
      }),
    createInvitation: (v: {
      organizationId: string;
      inviterMembershipId: string;
      kind: "staff" | "athlete";
      profileId: string | null;
      email: string | null;
      role: "admin" | "coach" | null;
      digest: string;
      expiresAt: Date;
    }) =>
      db
        .insert(organizationInvitations)
        .values({
          organization_id: v.organizationId,
          invited_by_membership_id: v.inviterMembershipId,
          invitation_kind: v.kind,
          invited_profile_id: v.profileId,
          invited_email: v.email,
          requested_role_key: v.role,
          token_digest: v.digest,
          expires_at: v.expiresAt,
        })
        .returning({
          id: organizationInvitations.id,
          expiresAt: organizationInvitations.expires_at,
          createdAt: organizationInvitations.created_at,
        }),
    lockInvitation: async (digest: string) =>
      (
        await db
          .select()
          .from(organizationInvitations)
          .where(eq(organizationInvitations.token_digest, digest))
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockInvitationById: async (organizationId: string, invitationId: string) =>
      (
        await db
          .select({
            id: organizationInvitations.id,
            requestedRole: organizationInvitations.requested_role_key,
          })
          .from(organizationInvitations)
          .where(
            and(
              eq(organizationInvitations.organization_id, organizationId),
              eq(organizationInvitations.id, invitationId),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    findInvitation: async (digest: string) =>
      (
        await db
          .select({ organizationId: organizationInvitations.organization_id })
          .from(organizationInvitations)
          .where(eq(organizationInvitations.token_digest, digest))
          .limit(1)
      )[0] ?? null,
    recipient: async (profileId: string) =>
      (
        await db
          .select({ email: users.email, verified: users.emailVerified })
          .from(profiles)
          .innerJoin(users, eq(users.id, profiles.id))
          .where(eq(profiles.id, profileId))
          .for("share", { of: users })
          .limit(1)
      )[0] ?? null,
    isExpired: async (organizationId: string, expiresAt: Date) =>
      (
        await db
          .select({ expired: sql<boolean>`${expiresAt} <= transaction_timestamp()` })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1)
      )[0]?.expired !== false,
    accept: (id: string, profileId: string) =>
      db
        .update(organizationInvitations)
        .set({
          status: "accepted",
          accepted_by_profile_id: profileId,
          accepted_at: sql`transaction_timestamp()`,
        })
        .where(
          and(eq(organizationInvitations.id, id), eq(organizationInvitations.status, "pending")),
        ),
    createEngagement: (organizationId: string, profileId: string) =>
      db
        .insert(coachingEngagements)
        .values({
          organization_id: organizationId,
          athlete_profile_id: profileId,
        })
        .onConflictDoNothing(),
    revoke: (organizationId: string, id: string, actorMembershipId: string) =>
      db
        .update(organizationInvitations)
        .set({ status: "revoked", closed_by_membership_id: actorMembershipId })
        .where(
          and(
            eq(organizationInvitations.organization_id, organizationId),
            eq(organizationInvitations.id, id),
            eq(organizationInvitations.status, "pending"),
          ),
        ),
  };
}
export type OrganizationManagementRepository = ReturnType<
  typeof createOrganizationManagementRepository
>;
