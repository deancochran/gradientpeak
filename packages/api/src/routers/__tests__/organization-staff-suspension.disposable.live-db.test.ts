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
import { and, eq, sql } from "drizzle-orm";
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
          const otherCoach = await person(client.db, "other-coach");
          const endedCoach = await person(client.db, "ended-coach");
          const failureCoach = await person(client.db, "failure-coach");
          const athlete = await person(client.db, "athlete");
          const failureAthlete = await person(client.db, "failure-athlete");
          const organizationId = randomUUID();
          const foreignOrganizationId = randomUUID();
          const ownerCaller = caller(client.db, owner);
          const created = await ownerCaller.create({
            organizationId,
            name: "Staff suspension",
            slug: `staff-suspension-${organizationId}`,
            timezone: "UTC",
          });
          const foreignCreated = await caller(client.db, foreignOwner).create({
            organizationId: foreignOrganizationId,
            name: "Foreign staff suspension",
            slug: `foreign-staff-suspension-${foreignOrganizationId}`,
            timezone: "UTC",
          });
          await staff(client.db, organizationId, admin, "admin");
          const coachMembershipId = await staff(client.db, organizationId, coach, "coach");
          const otherCoachMembershipId = await staff(
            client.db,
            organizationId,
            otherCoach,
            "coach",
          );
          const endedCoachMembershipId = await staff(
            client.db,
            organizationId,
            endedCoach,
            "coach",
          );
          const failureCoachMembershipId = await staff(
            client.db,
            organizationId,
            failureCoach,
            "coach",
          );
          await client.db
            .update(organizationMemberships)
            .set({ ended_at: new Date() })
            .where(eq(organizationMemberships.id, endedCoachMembershipId));
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
          const failureEngagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: failureEngagementId,
            organization_id: organizationId,
            athlete_profile_id: failureAthlete,
          });
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: failureEngagementId,
            coach_membership_id: failureCoachMembershipId,
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
          await client.db.insert(organizationGroupCoachAssignments).values({
            organization_id: organizationId,
            group_id: groupId,
            coach_membership_id: failureCoachMembershipId,
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
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId,
              membershipId: created.membershipId,
              operationId: randomUUID(),
              reason: "administrative_review",
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId: foreignOrganizationId,
              membershipId: foreignCreated.membershipId,
              operationId: randomUUID(),
              reason: "administrative_review",
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const operationId = randomUUID();
          const beforeSuspension = await ownerCaller.lifecycle.operationalOverview({
            organizationId,
          });
          // Deliberately discard the first completed response, as a client that lost its ACK would.
          await ownerCaller.lifecycle.suspendMembership({
            organizationId,
            membershipId: coachMembershipId,
            operationId,
            reason: "administrative_review",
          });
          const afterSuspension = await ownerCaller.lifecycle.operationalOverview({
            organizationId,
          });
          expect(afterSuspension).toEqual({
            ...beforeSuspension,
            activeStaff: beforeSuspension.activeStaff - 1,
            activeEngagementsWithoutPrimary: beforeSuspension.activeEngagementsWithoutPrimary + 1,
          });
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
              reason: "different_reason",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(
            ownerCaller.lifecycle.resumeMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId,
              reason: "administrative_review",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(
            caller(client.db, admin).lifecycle.suspendMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId,
              reason: "administrative_review",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId,
              membershipId: otherCoachMembershipId,
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
              .select({
                endedAt: coachingEngagements.ended_at,
                pausedAt: coachingEngagements.paused_at,
              })
              .from(coachingEngagements)
              .where(eq(coachingEngagements.id, engagementId)),
          ).resolves.toEqual([{ endedAt: null, pausedAt: null }]);
          await expect(
            client.db
              .select({ revokedAt: organizationMembershipRoleGrants.revoked_at })
              .from(organizationMembershipRoleGrants)
              .where(eq(organizationMembershipRoleGrants.membership_id, coachMembershipId)),
          ).resolves.toEqual([{ revokedAt: null }]);
          await expect(
            client.db
              .select({
                action: organizationAuditEvents.action,
                actorMembershipId: organizationAuditEvents.actor_membership_id,
                actorProfileId: organizationAuditEvents.actor_profile_id,
                correlationId: organizationAuditEvents.correlation_id,
                details: organizationAuditEvents.details,
                organizationId: organizationAuditEvents.organization_id,
                resourceId: organizationAuditEvents.resource_id,
                resourceType: organizationAuditEvents.resource_type,
              })
              .from(organizationAuditEvents)
              .where(
                and(
                  eq(organizationAuditEvents.correlation_id, operationId),
                  eq(organizationAuditEvents.action, "organization.membership_suspended"),
                ),
              ),
          ).resolves.toEqual([
            {
              action: "organization.membership_suspended",
              actorMembershipId: created.membershipId,
              actorProfileId: owner,
              correlationId: operationId,
              details: { reason_code: "administrative_review" },
              organizationId,
              resourceId: coachMembershipId,
              resourceType: "organization_membership",
            },
          ]);

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
          // A delayed suspend retry is only a receipt replay; it cannot undo the resume.
          expect(await ownerCaller.lifecycle.operationalOverview({ organizationId })).toEqual({
            ...beforeSuspension,
            activeEngagementsWithoutPrimary: beforeSuspension.activeEngagementsWithoutPrimary + 1,
          });
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId,
              reason: "administrative_review",
            }),
          ).resolves.toEqual({ membershipId: coachMembershipId, operationId, status: "suspended" });
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
          await expect(
            client.db
              .select({ endedAt: organizationGroupCoachAssignments.ended_at })
              .from(organizationGroupCoachAssignments)
              .where(eq(organizationGroupCoachAssignments.coach_membership_id, coachMembershipId)),
          ).resolves.toEqual([expect.objectContaining({ endedAt: expect.any(Date) })]);
          const laterSuspendOperationId = randomUUID();
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId: laterSuspendOperationId,
              reason: "administrative_review",
            }),
          ).resolves.toEqual({
            membershipId: coachMembershipId,
            operationId: laterSuspendOperationId,
            status: "suspended",
          });
          // A delayed resume retry is likewise historical and cannot unsuspend a later suspension.
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
          ).resolves.toEqual([expect.objectContaining({ suspendedAt: expect.any(Date) })]);
          const noOpSuspendOperationId = randomUUID();
          await expect(
            ownerCaller.lifecycle.suspendMembership({
              organizationId,
              membershipId: coachMembershipId,
              operationId: noOpSuspendOperationId,
              reason: "administrative_review",
            }),
          ).resolves.toEqual({
            membershipId: coachMembershipId,
            operationId: noOpSuspendOperationId,
            status: "suspended",
          });
          await expect(
            client.db
              .select({
                action: organizationAuditEvents.action,
                correlationId: organizationAuditEvents.correlation_id,
                resourceId: organizationAuditEvents.resource_id,
              })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.correlation_id, noOpSuspendOperationId)),
          ).resolves.toEqual([
            {
              action: "organization.membership_suspended",
              correlationId: noOpSuspendOperationId,
              resourceId: coachMembershipId,
            },
          ]);
          const otherSuspendOperationId = randomUUID();
          await ownerCaller.lifecycle.suspendMembership({
            organizationId,
            membershipId: otherCoachMembershipId,
            operationId: otherSuspendOperationId,
            reason: "administrative_review",
          });
          const firstSuspendedPage = await ownerCaller.lifecycle.staff.list({
            organizationId,
            status: "suspended",
            limit: 1,
          });
          expect(firstSuspendedPage).toMatchObject({
            hasMore: true,
            nextCursor: expect.any(String),
          });
          const secondSuspendedPage = await ownerCaller.lifecycle.staff.list({
            organizationId,
            status: "suspended",
            cursor: firstSuspendedPage.nextCursor,
            limit: 1,
          });
          expect([...firstSuspendedPage.items, ...secondSuspendedPage.items]).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ membershipId: coachMembershipId, status: "suspended" }),
              expect.objectContaining({
                membershipId: otherCoachMembershipId,
                status: "suspended",
              }),
            ]),
          );
          expect([...firstSuspendedPage.items, ...secondSuspendedPage.items]).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ membershipId: endedCoachMembershipId }),
            ]),
          );

          // This constraint is created inside and rolled back with the outer disposable-test
          // transaction. It fails only the target membership update, after assignment endings,
          // proving the nested application transaction restores all three durable effects.
          const faultOperationId = randomUUID();
          const faultConstraint = `staff_suspension_fault_${randomUUID().replaceAll("-", "")}`;
          await expect(
            client.db.transaction(async (tx) => {
              await tx.execute(
                sql.raw(
                  `alter table organization_memberships add constraint ${faultConstraint} check (id <> '${failureCoachMembershipId}'::uuid or suspended_at is null) not valid`,
                ),
              );
              await expect(
                caller(tx as unknown as DrizzleDbClient, owner).lifecycle.suspendMembership({
                  organizationId,
                  membershipId: failureCoachMembershipId,
                  operationId: faultOperationId,
                  reason: "administrative_review",
                }),
              ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
              await expect(
                tx
                  .select({ suspendedAt: organizationMemberships.suspended_at })
                  .from(organizationMemberships)
                  .where(eq(organizationMemberships.id, failureCoachMembershipId)),
              ).resolves.toEqual([{ suspendedAt: null }]);
              await expect(
                tx
                  .select({ endedAt: coachingAssignments.ended_at })
                  .from(coachingAssignments)
                  .where(eq(coachingAssignments.coach_membership_id, failureCoachMembershipId)),
              ).resolves.toEqual([{ endedAt: null }]);
              await expect(
                tx
                  .select({ endedAt: organizationGroupCoachAssignments.ended_at })
                  .from(organizationGroupCoachAssignments)
                  .where(
                    eq(
                      organizationGroupCoachAssignments.coach_membership_id,
                      failureCoachMembershipId,
                    ),
                  ),
              ).resolves.toEqual([{ endedAt: null }]);
              await expect(
                tx
                  .select({ id: organizationAuditEvents.id })
                  .from(organizationAuditEvents)
                  .where(eq(organizationAuditEvents.correlation_id, faultOperationId)),
              ).resolves.toHaveLength(0);
              throw new Error("rollback transaction-scoped fault harness");
            }),
          ).rejects.toThrow("rollback transaction-scoped fault harness");
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);
});
