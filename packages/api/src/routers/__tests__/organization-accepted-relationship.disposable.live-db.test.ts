import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
  users,
} from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organizationsRouter } from "../organizations";

function caller(db: DrizzleDbClient, userId: string) {
  return organizationsRouter.createCaller({
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id: userId, email: "untrusted-session@example.test" } },
    trpcSource: "vitest-live-db",
  } as never);
}

async function person(db: DrizzleDbClient, label: string) {
  const id = randomUUID();
  const email = `${label}-${id}@accepted-relationship.test`;
  await db.insert(users).values({ id, name: label, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return { id, email };
}

async function acceptStaffInvitation(
  administrator: ReturnType<typeof caller>,
  recipient: ReturnType<typeof caller>,
  organizationId: string,
  profileId: string,
) {
  const invitation = await administrator.invitations.create({
    organizationId,
    kind: "staff",
    requestedRole: "coach",
    recipientProfileId: profileId,
    recipientEmail: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await recipient.invitations.accept({ token: invitation.token });
  return invitation.invitationId;
}

async function acceptAthleteInvitation(
  administrator: ReturnType<typeof caller>,
  recipient: ReturnType<typeof caller>,
  organizationId: string,
  profileId: string,
) {
  const invitation = await administrator.invitations.create({
    organizationId,
    kind: "athlete",
    requestedRole: null,
    recipientProfileId: profileId,
    recipientEmail: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const preview = await recipient.invitations.preview({ token: invitation.token });
  if (preview.kind !== "athlete" || !preview.agreement)
    throw new Error("Expected athlete invitation agreement");
  await recipient.invitations.accept({
    token: invitation.token,
    acknowledgement: {
      version: preview.agreement.version,
      digest: preview.agreement.digest,
      accepted: true,
    },
  });
  return invitation.invitationId;
}

describe("accepted invitation relationship resolver against a disposable migrated PostgreSQL database", () => {
  it("reads accepted staff and athlete lifecycles, while failing closed for tenant and authority boundaries", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_accepted_relationship",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const path of requireFreshBaseline().migrationPaths) await applySqlFile(pool, path);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "owner");
          const nonAdmin = await person(client.db, "non-admin");
          const futureAdmin = await person(client.db, "future-admin");
          const staffActive = await person(client.db, "staff-active");
          const staffSuspended = await person(client.db, "staff-suspended");
          const staffEnded = await person(client.db, "staff-ended");
          const staffRevoked = await person(client.db, "staff-revoked");
          const staffFutureGrant = await person(client.db, "staff-future-grant");
          const staffFutureRevoked = await person(client.db, "staff-future-revoked");
          const athleteActive = await person(client.db, "athlete-active");
          const athletePaused = await person(client.db, "athlete-paused");
          const athleteEnded = await person(client.db, "athlete-ended");
          const organizationId = randomUUID();
          const ownerCaller = caller(client.db, owner.id);
          await ownerCaller.create({
            organizationId,
            name: "Accepted relationship",
            slug: `accepted-relationship-${organizationId}`,
            timezone: "UTC",
          });
          const futureAdminMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: futureAdminMembershipId,
            organization_id: organizationId,
            profile_id: futureAdmin.id,
            created_at: new Date(Date.now() + 60_000),
          });
          await client.db.insert(organizationMembershipRoleGrants).values({
            organization_id: organizationId,
            membership_id: futureAdminMembershipId,
            role_key: "admin",
          });

          const nonAdminInvitation = await acceptStaffInvitation(
            ownerCaller,
            caller(client.db, nonAdmin.id),
            organizationId,
            nonAdmin.id,
          );
          const staffActiveInvitation = await acceptStaffInvitation(
            ownerCaller,
            caller(client.db, staffActive.id),
            organizationId,
            staffActive.id,
          );
          const staffSuspendedInvitation = await acceptStaffInvitation(
            ownerCaller,
            caller(client.db, staffSuspended.id),
            organizationId,
            staffSuspended.id,
          );
          const staffEndedInvitation = await acceptStaffInvitation(
            ownerCaller,
            caller(client.db, staffEnded.id),
            organizationId,
            staffEnded.id,
          );
          const staffRevokedInvitation = await acceptStaffInvitation(
            ownerCaller,
            caller(client.db, staffRevoked.id),
            organizationId,
            staffRevoked.id,
          );
          const staffFutureGrantInvitation = await acceptStaffInvitation(
            ownerCaller,
            caller(client.db, staffFutureGrant.id),
            organizationId,
            staffFutureGrant.id,
          );
          const staffFutureRevokedInvitation = await acceptStaffInvitation(
            ownerCaller,
            caller(client.db, staffFutureRevoked.id),
            organizationId,
            staffFutureRevoked.id,
          );
          const athleteActiveInvitation = await acceptAthleteInvitation(
            ownerCaller,
            caller(client.db, athleteActive.id),
            organizationId,
            athleteActive.id,
          );
          const athletePausedInvitation = await acceptAthleteInvitation(
            ownerCaller,
            caller(client.db, athletePaused.id),
            organizationId,
            athletePaused.id,
          );
          const athleteEndedInvitation = await acceptAthleteInvitation(
            ownerCaller,
            caller(client.db, athleteEnded.id),
            organizationId,
            athleteEnded.id,
          );

          const membershipFor = async (profileId: string) => {
            const [membership] = await client.db
              .select({ id: organizationMemberships.id })
              .from(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organization_id, organizationId),
                  eq(organizationMemberships.profile_id, profileId),
                ),
              );
            if (!membership) throw new Error("Expected accepted staff membership");
            return membership.id;
          };
          const suspendedMembershipId = await membershipFor(staffSuspended.id);
          const endedMembershipId = await membershipFor(staffEnded.id);
          const revokedMembershipId = await membershipFor(staffRevoked.id);
          const futureGrantMembershipId = await membershipFor(staffFutureGrant.id);
          const futureRevokedMembershipId = await membershipFor(staffFutureRevoked.id);
          const formerlyAdminMembershipId = await membershipFor(nonAdmin.id);
          await ownerCaller.staffRoles.revoke({
            organizationId,
            membershipId: suspendedMembershipId,
            role: "coach",
            operationId: randomUUID(),
          });
          await ownerCaller.lifecycle.suspendMembership({
            organizationId,
            membershipId: suspendedMembershipId,
            operationId: randomUUID(),
            reason: "administrative_review",
          });
          await ownerCaller.lifecycle.endMembership({
            organizationId,
            membershipId: endedMembershipId,
            correlationId: randomUUID(),
            reason: "administrative_review",
          });
          await ownerCaller.staffRoles.revoke({
            organizationId,
            membershipId: revokedMembershipId,
            role: "coach",
            operationId: randomUUID(),
          });
          await ownerCaller.staffRoles.revoke({
            organizationId,
            membershipId: futureGrantMembershipId,
            role: "coach",
            operationId: randomUUID(),
          });
          await ownerCaller.staffRoles.revoke({
            organizationId,
            membershipId: futureRevokedMembershipId,
            role: "coach",
            operationId: randomUUID(),
          });
          await client.db.insert(organizationMembershipRoleGrants).values([
            {
              organization_id: organizationId,
              membership_id: futureGrantMembershipId,
              role_key: "coach",
              granted_at: new Date(Date.now() + 60_000),
            },
            {
              organization_id: organizationId,
              membership_id: futureRevokedMembershipId,
              role_key: "coach",
              granted_at: new Date(Date.now() - 60_000),
              revoked_at: new Date(Date.now() + 60_000),
            },
          ]);
          await ownerCaller.staffRoles.grant({
            organizationId,
            membershipId: formerlyAdminMembershipId,
            role: "admin",
            operationId: randomUUID(),
          });
          await expect(
            caller(client.db, nonAdmin.id).invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: nonAdminInvitation,
            }),
          ).resolves.toEqual({
            relationshipState: "staff_active",
            navigationTarget: "staff_roster",
          });
          await ownerCaller.staffRoles.revoke({
            organizationId,
            membershipId: formerlyAdminMembershipId,
            role: "admin",
            operationId: randomUUID(),
          });

          const engagementFor = async (profileId: string) => {
            const [engagement] = await client.db
              .select({ id: coachingEngagements.id })
              .from(coachingEngagements)
              .where(
                and(
                  eq(coachingEngagements.organization_id, organizationId),
                  eq(coachingEngagements.athlete_profile_id, profileId),
                ),
              );
            if (!engagement) throw new Error("Expected accepted athlete engagement");
            return engagement.id;
          };
          const pausedEngagementId = await engagementFor(athletePaused.id);
          const endedEngagementId = await engagementFor(athleteEnded.id);
          await client.db
            .update(coachingEngagements)
            .set({ paused_at: new Date() })
            .where(eq(coachingEngagements.id, pausedEngagementId));
          await ownerCaller.lifecycle.endEngagement({
            organizationId,
            engagementId: endedEngagementId,
            correlationId: randomUUID(),
            reason: "administrative_review",
          });

          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffActiveInvitation,
            }),
          ).resolves.toEqual({
            relationshipState: "staff_active",
            navigationTarget: "staff_roster",
          });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffSuspendedInvitation,
            }),
          ).resolves.toEqual({
            relationshipState: "staff_suspended",
            navigationTarget: "none",
          });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffEndedInvitation,
            }),
          ).resolves.toEqual({ relationshipState: "staff_ended", navigationTarget: "none" });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: athleteActiveInvitation,
            }),
          ).resolves.toEqual({ relationshipState: "athlete_active", navigationTarget: "none" });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: athletePausedInvitation,
            }),
          ).resolves.toEqual({ relationshipState: "athlete_paused", navigationTarget: "none" });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: athleteEndedInvitation,
            }),
          ).resolves.toEqual({
            relationshipState: "athlete_no_current_engagement",
            navigationTarget: "none",
          });

          // A roleless accepted staff membership must never appear manageable
          // merely because its membership row still exists.
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffRevokedInvitation,
            }),
          ).resolves.toEqual({
            relationshipState: "staff_no_effective_role",
            navigationTarget: "none",
          });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffFutureGrantInvitation,
            }),
          ).resolves.toEqual({
            relationshipState: "staff_no_effective_role",
            navigationTarget: "none",
          });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffFutureRevokedInvitation,
            }),
          ).resolves.toEqual({
            relationshipState: "staff_no_effective_role",
            navigationTarget: "none",
          });

          await expect(
            caller(client.db, nonAdmin.id).invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: nonAdminInvitation,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, futureAdmin.id).invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffActiveInvitation,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const otherOrganizationId = randomUUID();
          await ownerCaller.create({
            organizationId: otherOrganizationId,
            name: "Other accepted relationship",
            slug: `other-accepted-relationship-${otherOrganizationId}`,
            timezone: "UTC",
          });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId: otherOrganizationId,
              invitationId: staffActiveInvitation,
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });

          await client.db
            .update(organizations)
            .set({ suspended_at: new Date() })
            .where(eq(organizations.id, organizationId));
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffActiveInvitation,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await client.db
            .update(organizations)
            .set({ suspended_at: null, closed_at: new Date() })
            .where(eq(organizations.id, organizationId));
          await expect(
            ownerCaller.invitations.resolveAcceptedRelationship({
              organizationId,
              invitationId: staffActiveInvitation,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
        } finally {
          await client.close();
        }
      },
    );
  });
});
