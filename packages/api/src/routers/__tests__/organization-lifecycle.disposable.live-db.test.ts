import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationAuditEvents,
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
import { and, eq, isNull } from "drizzle-orm";
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
  const email = `${label}-${id}@organization-lifecycle.test`;
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

describe("organization lifecycle API against a disposable migrated PostgreSQL database", () => {
  it("lists only current metadata and delegates terminal transitions to durable commands", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_lifecycle",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "owner");
          const admin = await person(client.db, "admin");
          const otherAdmin = await person(client.db, "other-admin");
          const coach = await person(client.db, "coach");
          const futureCoach = await person(client.db, "future-coach");
          const athlete = await person(client.db, "athlete");
          const secondAthlete = await person(client.db, "second-athlete");
          const foreignOwner = await person(client.db, "foreign-owner");
          const foreignCoach = await person(client.db, "foreign-coach");
          const organizationId = randomUUID();
          const foreignOrganizationId = randomUUID();
          const ownerCaller = caller(client.db, owner.id);
          const created = await ownerCaller.create({
            organizationId,
            name: "Lifecycle",
            slug: `lifecycle-${organizationId}`,
            timezone: "UTC",
          });
          await caller(client.db, foreignOwner.id).create({
            organizationId: foreignOrganizationId,
            name: "Foreign lifecycle",
            slug: `foreign-lifecycle-${foreignOrganizationId}`,
            timezone: "UTC",
          });
          const adminMembershipId = await staff(client.db, organizationId, admin.id, "admin");
          const otherAdminMembershipId = await staff(
            client.db,
            organizationId,
            otherAdmin.id,
            "admin",
          );
          const coachMembershipId = await staff(client.db, organizationId, coach.id, "coach");
          const futureCoachMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: futureCoachMembershipId,
            organization_id: organizationId,
            profile_id: futureCoach.id,
          });
          await client.db.insert(organizationMembershipRoleGrants).values({
            organization_id: organizationId,
            membership_id: futureCoachMembershipId,
            role_key: "coach",
            granted_at: new Date(Date.now() + 60_000),
          });
          const foreignCoachMembershipId = await staff(
            client.db,
            foreignOrganizationId,
            foreignCoach.id,
            "coach",
          );
          // Athletes retain independent membership only to satisfy the existing database command's actor guard.
          await staff(client.db, organizationId, athlete.id, "coach");
          await staff(client.db, organizationId, secondAthlete.id, "coach");

          const staffPage = await ownerCaller.lifecycle.staff.list({ organizationId, limit: 50 });
          expect(staffPage.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                membershipId: adminMembershipId,
                identity: expect.not.objectContaining({ email: expect.anything() }),
                endMembership: { eligible: true, reason: null },
              }),
              expect.objectContaining({
                membershipId: coachMembershipId,
                status: "active",
                roleKeys: ["coach"],
                endMembership: { eligible: true, reason: null },
              }),
              expect.objectContaining({
                membershipId: created.membershipId,
                endMembership: { eligible: false, reason: "self" },
              }),
            ]),
          );
          expect(staffPage.items).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ membershipId: futureCoachMembershipId }),
            ]),
          );
          const adminStaffPage = await caller(client.db, admin.id).lifecycle.staff.list({
            organizationId,
            limit: 50,
          });
          expect(adminStaffPage.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                membershipId: adminMembershipId,
                endMembership: { eligible: false, reason: "self" },
              }),
              expect.objectContaining({
                membershipId: created.membershipId,
                endMembership: { eligible: false, reason: "root_owner" },
              }),
              expect.objectContaining({
                membershipId: otherAdminMembershipId,
                endMembership: { eligible: false, reason: "admin_target" },
              }),
              expect.objectContaining({
                membershipId: coachMembershipId,
                endMembership: { eligible: true, reason: null },
              }),
            ]),
          );
          await expect(
            ownerCaller.lifecycle.staff.list({
              organizationId,
              cursor: foreignCoachMembershipId,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });

          const engagementId = randomUUID();
          const secondEngagementId = randomUUID();
          await client.db.insert(coachingEngagements).values([
            { id: engagementId, organization_id: organizationId, athlete_profile_id: athlete.id },
            {
              id: secondEngagementId,
              organization_id: organizationId,
              athlete_profile_id: secondAthlete.id,
            },
          ]);
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: engagementId,
            coach_membership_id: coachMembershipId,
            assignment_kind: "primary",
          });
          const policyId = randomUUID();
          await client.db.insert(athleteConsentPolicyVersions).values({
            id: policyId,
            scope_key: "training",
            effective_from: new Date(Date.now() - 1_000),
            jurisdiction: "test",
            terms_text: "test terms",
            content_digest: randomUUID(),
          });
          const consentId = randomUUID();
          const secondConsentId = randomUUID();
          await client.db.insert(athleteDataSharingConsents).values([
            {
              id: consentId,
              organization_id: organizationId,
              engagement_id: engagementId,
              athlete_profile_id: athlete.id,
              scope_key: "training",
              policy_version_id: policyId,
              granted_by_profile_id: athlete.id,
            },
            {
              id: secondConsentId,
              organization_id: organizationId,
              engagement_id: secondEngagementId,
              athlete_profile_id: secondAthlete.id,
              scope_key: "training",
              policy_version_id: policyId,
              granted_by_profile_id: secondAthlete.id,
            },
          ]);

          const roster = await caller(client.db, admin.id).lifecycle.adminRoster.list({
            organizationId,
            limit: 1,
          });
          expect(roster).toMatchObject({
            hasMore: true,
            items: [
              expect.objectContaining({
                identity: expect.not.objectContaining({ email: expect.anything() }),
              }),
            ],
          });
          // Operational overview counts are full-scope aggregates, not first-page lengths. Build
          // more athletes than the normal UI page and compare each count to its matching filtered
          // paginated read. Supporting responsibility intentionally does not satisfy primary.
          const overviewBefore = await ownerCaller.lifecycle.operationalOverview({
            organizationId,
          });
          const overviewEngagements: Array<{ id: string; active: boolean }> = [];
          for (let index = 0; index < 23; index += 1) {
            const overviewAthlete = await person(client.db, `overview-athlete-${index}`);
            const id = randomUUID();
            const active = index < 21;
            overviewEngagements.push({ id, active });
            await client.db.insert(coachingEngagements).values({
              id,
              organization_id: organizationId,
              athlete_profile_id: overviewAthlete.id,
              ...(active ? {} : { paused_at: new Date() }),
            });
            if (active && index < 10)
              await client.db.insert(coachingAssignments).values({
                organization_id: organizationId,
                engagement_id: id,
                coach_membership_id: coachMembershipId,
                assignment_kind: "primary",
              });
            if (active && index === 10)
              await client.db.insert(coachingAssignments).values({
                organization_id: organizationId,
                engagement_id: id,
                coach_membership_id: coachMembershipId,
                assignment_kind: "supporting",
              });
          }
          const overview = await ownerCaller.lifecycle.operationalOverview({ organizationId });
          expect(overview).toMatchObject({
            activeStaff: overviewBefore.activeStaff,
            activeEngagements: overviewBefore.activeEngagements + 21,
            pausedEngagements: overviewBefore.pausedEngagements + 2,
            activeEngagementsWithoutPrimary: overviewBefore.activeEngagementsWithoutPrimary + 11,
          });
          const activeOverviewPage = await ownerCaller.lifecycle.adminRoster.list({
            organizationId,
            limit: 50,
            engagementStatus: "active",
            withoutPrimaryAssignment: false,
          });
          const pausedOverviewPage = await ownerCaller.lifecycle.adminRoster.list({
            organizationId,
            limit: 50,
            engagementStatus: "paused",
            withoutPrimaryAssignment: false,
          });
          const primaryGapPage = await ownerCaller.lifecycle.adminRoster.list({
            organizationId,
            limit: 50,
            engagementStatus: "active",
            withoutPrimaryAssignment: true,
          });
          const activeStaffPage = await ownerCaller.lifecycle.staff.list({
            organizationId,
            status: "active",
            limit: 50,
          });
          expect(activeOverviewPage.items).toHaveLength(overview.activeEngagements);
          expect(pausedOverviewPage.items).toHaveLength(overview.pausedEngagements);
          expect(primaryGapPage.items).toHaveLength(overview.activeEngagementsWithoutPrimary);
          expect(activeStaffPage.items).toHaveLength(overview.activeStaff);
          expect(primaryGapPage.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ engagementId: overviewEngagements[10]?.id }),
            ]),
          );
          expect(primaryGapPage.items).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ engagementId: overviewEngagements[0]?.id }),
            ]),
          );
          await expect(
            caller(client.db, foreignOwner.id).lifecycle.operationalOverview({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, foreignOwner.id).lifecycle.endMembership({
              organizationId,
              membershipId: coachMembershipId,
              reason: "administrative_end",
              correlationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            ownerCaller.lifecycle.endEngagement({
              organizationId: randomUUID(),
              engagementId: randomUUID(),
              reason: "athlete_ended",
              correlationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            caller(client.db, admin.id).lifecycle.endMembership({
              organizationId,
              membershipId: adminMembershipId,
              reason: "administrative_end",
              correlationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, admin.id).lifecycle.endMembership({
              organizationId,
              membershipId: created.membershipId,
              reason: "administrative_end",
              correlationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            client.db
              .select({ endedAt: organizationMemberships.ended_at })
              .from(organizationMemberships)
              .where(eq(organizationMemberships.id, created.membershipId)),
          ).resolves.toEqual([{ endedAt: null }]);

          const membershipCorrelation = randomUUID();
          await expect(
            ownerCaller.lifecycle.endMembership({
              organizationId,
              membershipId: coachMembershipId,
              reason: "administrative_end",
              correlationId: membershipCorrelation,
            }),
          ).resolves.toEqual({ membershipId: coachMembershipId, status: "ended" });
          await expect(
            ownerCaller.lifecycle.endMembership({
              organizationId,
              membershipId: coachMembershipId,
              reason: "administrative_end",
              correlationId: membershipCorrelation,
            }),
          ).resolves.toEqual({ membershipId: coachMembershipId, status: "ended" });
          await expect(
            client.db
              .select({ endedAt: coachingAssignments.ended_at })
              .from(coachingAssignments)
              .where(eq(coachingAssignments.coach_membership_id, coachMembershipId)),
          ).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ endedAt: expect.any(Date) })]),
          );
          await expect(
            client.db
              .select({ id: organizationAuditEvents.id })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.correlation_id, membershipCorrelation)),
          ).resolves.toHaveLength(1);

          await client.db
            .update(organizationMembershipRoleGrants)
            .set({ revoked_at: new Date() })
            .where(
              and(
                eq(organizationMembershipRoleGrants.membership_id, adminMembershipId),
                isNull(organizationMembershipRoleGrants.revoked_at),
              ),
            );
          await expect(
            caller(client.db, admin.id).lifecycle.adminRoster.list({ organizationId, limit: 50 }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, admin.id).lifecycle.operationalOverview({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });

          const engagementCorrelation = randomUUID();
          await expect(
            caller(client.db, athlete.id).lifecycle.endEngagement({
              organizationId,
              engagementId,
              reason: "athlete_ended",
              correlationId: engagementCorrelation,
            }),
          ).resolves.toEqual({ engagementId, status: "ended" });
          await expect(
            caller(client.db, athlete.id).lifecycle.endEngagement({
              organizationId,
              engagementId,
              reason: "athlete_ended",
              correlationId: engagementCorrelation,
            }),
          ).resolves.toEqual({ engagementId, status: "ended" });
          await expect(
            client.db
              .select({ endedAt: athleteDataSharingConsents.ended_at })
              .from(athleteDataSharingConsents)
              .where(eq(athleteDataSharingConsents.id, consentId)),
          ).resolves.toEqual([expect.objectContaining({ endedAt: expect.any(Date) })]);
          await expect(
            client.db
              .select({ id: organizationAuditEvents.id })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.correlation_id, engagementCorrelation)),
          ).resolves.toHaveLength(1);

          await expect(
            ownerCaller.lifecycle.withdrawConsent({
              organizationId,
              consentId: secondConsentId,
              reason: "athlete_withdrew",
              correlationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, admin.id).lifecycle.withdrawConsent({
              organizationId,
              consentId: secondConsentId,
              reason: "athlete_withdrew",
              correlationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            client.db
              .select({ endedAt: athleteDataSharingConsents.ended_at })
              .from(athleteDataSharingConsents)
              .where(eq(athleteDataSharingConsents.id, secondConsentId)),
          ).resolves.toEqual([{ endedAt: null }]);
          const consentCorrelation = randomUUID();
          await expect(
            caller(client.db, secondAthlete.id).lifecycle.withdrawConsent({
              organizationId,
              consentId: secondConsentId,
              reason: "athlete_withdrew",
              correlationId: consentCorrelation,
            }),
          ).resolves.toEqual({ consentId: secondConsentId, status: "withdrawn" });
          await expect(
            caller(client.db, secondAthlete.id).lifecycle.withdrawConsent({
              organizationId,
              consentId: secondConsentId,
              reason: "athlete_withdrew",
              correlationId: consentCorrelation,
            }),
          ).resolves.toEqual({ consentId: secondConsentId, status: "withdrawn" });
          await expect(
            client.db
              .select({ id: organizationAuditEvents.id })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.correlation_id, consentCorrelation)),
          ).resolves.toHaveLength(1);
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);
});
