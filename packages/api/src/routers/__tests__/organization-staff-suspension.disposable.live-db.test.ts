import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationAuditEvents,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
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
async function person(db: DrizzleDbClient, name: string) {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, name, email: `${id}@staff-suspension.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${id}@staff-suspension.test`,
    full_name: name,
    username: `${name}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return id;
}
async function staff(
  db: DrizzleDbClient,
  organizationId: string,
  profileId: string,
  role: "admin" | "coach",
) {
  const id = randomUUID();
  await db
    .insert(organizationMemberships)
    .values({ id, organization_id: organizationId, profile_id: profileId });
  await db.insert(organizationMembershipRoleGrants).values({
    organization_id: organizationId,
    membership_id: id,
    role_key: role,
  });
  return id;
}

describe("organization staff suspension API against a fresh disposable PostgreSQL database", () => {
  it("atomically suspends assignment authority, records replay receipts, and resumes only membership state", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_staff_suspension",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "owner");
          const foreignOwner = await person(client.db, "foreign-owner");
          const admin = await person(client.db, "admin");
          const coach = await person(client.db, "coach");
          const athlete = await person(client.db, "athlete");
          const organizationId = randomUUID();
          const foreignOrganizationId = randomUUID();
          const ownerCaller = caller(client.db, owner);
          const created = await ownerCaller.create({
            organizationId,
            name: "Staff suspension",
            slug: `staff-suspension-${organizationId}`,
            timezone: "UTC",
          });
          await caller(client.db, foreignOwner).create({
            organizationId: foreignOrganizationId,
            name: "Foreign staff suspension",
            slug: `foreign-staff-suspension-${foreignOrganizationId}`,
            timezone: "UTC",
          });
          await staff(client.db, organizationId, admin, "admin");
          const coachMembershipId = await staff(client.db, organizationId, coach, "coach");
          const engagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: engagementId,
            organization_id: organizationId,
            athlete_profile_id: athlete,
          });
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: engagementId,
            coach_membership_id: coachMembershipId,
            assignment_kind: "primary",
          });
          const groupId = randomUUID();
          await client.db.insert(organizationGroups).values({
            id: groupId,
            organization_id: organizationId,
            name: "Team",
            created_by_membership_id: created.membershipId,
          });
          await client.db.insert(organizationGroupCoachAssignments).values({
            organization_id: organizationId,
            group_id: groupId,
            coach_membership_id: coachMembershipId,
            assigned_by_membership_id: created.membershipId,
          });
          const policyId = randomUUID();
          await client.db.insert(athleteConsentPolicyVersions).values({
            id: policyId,
            scope_key: "training",
            effective_from: new Date(Date.now() - 1_000),
            jurisdiction: "test",
            terms_text: "terms",
            content_digest: randomUUID(),
          });
          const consentId = randomUUID();
          await client.db.insert(athleteDataSharingConsents).values({
            id: consentId,
            organization_id: organizationId,
            engagement_id: engagementId,
            athlete_profile_id: athlete,
            scope_key: "training",
            policy_version_id: policyId,
            granted_by_profile_id: athlete,
          });

          await expect(
            caller(client.db, admin).lifecycle.suspendMembership({
              organizationId,
              membershipId: created.membershipId,
              operationId: randomUUID(),
              reason: "administrative_review",
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const operationId = randomUUID();
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId,
              reason: "administrative_review",
            }),
          ).resolves.toEqual({ membershipId: coachMembershipId, operationId, status: "suspended" });
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId,
              reason: "administrative_review",
            }),
          ).resolves.toEqual({ membershipId: coachMembershipId, operationId, status: "suspended" });
          await expect(
            ownerCaller.lifecycle.resumeMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId,
              reason: "administrative_review",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(
            ownerCaller.lifecycle.staff.list({ organizationId, limit: 50 }),
          ).resolves.toMatchObject({
            items: expect.not.arrayContaining([
              expect.objectContaining({ membershipId: coachMembershipId }),
            ]),
          });
          await expect(
            ownerCaller.lifecycle.staff.list({ organizationId, status: "suspended", limit: 50 }),
          ).resolves.toMatchObject({
            items: [
              expect.objectContaining({
                membershipId: coachMembershipId,
                status: "suspended",
                suspendedAt: expect.any(Date),
              }),
            ],
          });
          await expect(
            ownerCaller.lifecycle.staff.list({
              organizationId,
              status: "suspended",
              cursor: created.membershipId,
              limit: 50,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          await expect(
            caller(client.db, coach).lifecycle.staff.list({
              organizationId,
              status: "suspended",
              limit: 50,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            ownerCaller.lifecycle.staff.list({
              organizationId: foreignOrganizationId,
              status: "suspended",
              limit: 50,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            client.db
              .select({ suspendedAt: organizationMemberships.suspended_at })
              .from(organizationMemberships)
              .where(eq(organizationMemberships.id, coachMembershipId)),
          ).resolves.toEqual([expect.objectContaining({ suspendedAt: expect.any(Date) })]);
          await expect(
            client.db
              .select({ endedAt: coachingAssignments.ended_at })
              .from(coachingAssignments)
              .where(eq(coachingAssignments.coach_membership_id, coachMembershipId)),
          ).resolves.toEqual([expect.objectContaining({ endedAt: expect.any(Date) })]);
          await expect(
            client.db
              .select({ endedAt: organizationGroupCoachAssignments.ended_at })
              .from(organizationGroupCoachAssignments)
              .where(eq(organizationGroupCoachAssignments.coach_membership_id, coachMembershipId)),
          ).resolves.toEqual([expect.objectContaining({ endedAt: expect.any(Date) })]);
          await expect(
            client.db
              .select({ endedAt: athleteDataSharingConsents.ended_at })
              .from(athleteDataSharingConsents)
              .where(eq(athleteDataSharingConsents.id, consentId)),
          ).resolves.toEqual([{ endedAt: null }]);
          await expect(
            client.db
              .select({ revokedAt: organizationMembershipRoleGrants.revoked_at })
              .from(organizationMembershipRoleGrants)
              .where(eq(organizationMembershipRoleGrants.membership_id, coachMembershipId)),
          ).resolves.toEqual([{ revokedAt: null }]);
          await expect(
            client.db
              .select({ id: organizationAuditEvents.id })
              .from(organizationAuditEvents)
              .where(
                and(
                  eq(organizationAuditEvents.correlation_id, operationId),
                  eq(organizationAuditEvents.action, "organization.membership_suspended"),
                ),
              ),
          ).resolves.toHaveLength(1);

          const resumeOperationId = randomUUID();
          await expect(
            ownerCaller.lifecycle.resumeMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId: resumeOperationId,
              reason: "administrative_review",
            }),
          ).resolves.toEqual({
            membershipId: coachMembershipId,
            operationId: resumeOperationId,
            status: "resumed",
          });
          await expect(
            client.db
              .select({ suspendedAt: organizationMemberships.suspended_at })
              .from(organizationMemberships)
              .where(eq(organizationMemberships.id, coachMembershipId)),
          ).resolves.toEqual([{ suspendedAt: null }]);
          // Resume never recreates assignments or revives consents.
          await expect(
            client.db
              .select({ endedAt: coachingAssignments.ended_at })
              .from(coachingAssignments)
              .where(eq(coachingAssignments.coach_membership_id, coachMembershipId)),
          ).resolves.toEqual([expect.objectContaining({ endedAt: expect.any(Date) })]);
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);
});
