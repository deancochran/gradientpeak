import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  coachingAssignments,
  coachingEngagements,
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
  await db
    .insert(users)
    .values({ id, name: label, email: `${label}-${id}@test.invalid`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${label}-${id}@test.invalid`,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
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
  grantedAt?: Date,
) {
  const id = randomUUID();
  await db
    .insert(organizationMemberships)
    .values({ id, organization_id: organizationId, profile_id: profileId });
  await db.insert(organizationMembershipRoleGrants).values({
    organization_id: organizationId,
    membership_id: id,
    role_key: role,
    ...(grantedAt ? { granted_at: grantedAt } : {}),
  });
  return id;
}

describe("staff offboarding-impact API against a disposable migrated PostgreSQL database", () => {
  it("keeps the read preview scoped, paginated, and free of ended or ineffective records", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "staff_offboarding_impact",
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
          const stranger = await person(client.db, "stranger");
          const futureAdmin = await person(client.db, "future-admin");
          const organizationId = randomUUID();
          const foreignOrganizationId = randomUUID();
          const ownerCaller = caller(client.db, owner);
          const created = await ownerCaller.create({
            organizationId,
            name: "Impact",
            slug: `impact-${organizationId}`,
            timezone: "UTC",
          });
          const foreignCreated = await caller(client.db, stranger).create({
            organizationId: foreignOrganizationId,
            name: "Foreign",
            slug: `foreign-${foreignOrganizationId}`,
            timezone: "UTC",
          });
          const adminMembershipId = await staff(client.db, organizationId, admin, "admin");
          const otherAdminMembershipId = await staff(
            client.db,
            organizationId,
            otherAdmin,
            "admin",
          );
          const coachMembershipId = await staff(client.db, organizationId, coach, "coach");
          const clock = Date.now();
          const createdAt = new Date(clock - 3_000);
          const assignedAt = new Date(clock - 2_000);
          const endedAt = new Date(clock - 1_000);
          await staff(
            client.db,
            organizationId,
            futureAdmin,
            "admin",
            new Date(Date.now() + 60_000),
          );
          const foreignCoachMembershipId = foreignCreated.membershipId;
          const engagementIds: string[] = [];
          for (let index = 0; index < 22; index += 1) {
            const athlete = await person(client.db, `athlete-${index}`);
            const engagementId = randomUUID();
            engagementIds.push(engagementId);
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
          }
          const primaryEngagementId = engagementIds.at(0);
          if (!primaryEngagementId) throw new Error("Missing generated primary engagement");
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: primaryEngagementId,
            coach_membership_id: coachMembershipId,
            assignment_kind: "supporting",
          });
          const endedAthlete = await person(client.db, "ended-athlete");
          const endedAssignmentEngagement = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: endedAssignmentEngagement,
            organization_id: organizationId,
            athlete_profile_id: endedAthlete,
            created_at: createdAt,
          });
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: endedAssignmentEngagement,
            coach_membership_id: coachMembershipId,
            assignment_kind: "primary",
            assigned_at: assignedAt,
            ended_at: endedAt,
          });
          const endedEngagementAthlete = await person(client.db, "ended-engagement-athlete");
          const endedEngagement = randomUUID();
          await staff(client.db, organizationId, endedEngagementAthlete, "coach");
          await client.db.insert(coachingEngagements).values({
            id: endedEngagement,
            organization_id: organizationId,
            athlete_profile_id: endedEngagementAthlete,
          });
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: endedEngagement,
            coach_membership_id: coachMembershipId,
            assignment_kind: "primary",
          });
          await expect(
            caller(client.db, endedEngagementAthlete).lifecycle.endEngagement({
              organizationId,
              engagementId: endedEngagement,
              reason: "athlete_ended",
              correlationId: randomUUID(),
            }),
          ).resolves.toEqual({ engagementId: endedEngagement, status: "ended" });
          const futureAthlete = await person(client.db, "future-athlete");
          const futureEngagement = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: futureEngagement,
            organization_id: organizationId,
            athlete_profile_id: futureAthlete,
            created_at: new Date(clock + 60_000),
          });
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: futureEngagement,
            coach_membership_id: coachMembershipId,
            assignment_kind: "primary",
            assigned_at: assignedAt,
          });

          const first = await ownerCaller.lifecycle.staff.offboardingImpact({
            organizationId,
            membershipId: coachMembershipId,
            limit: 20,
          });
          expect(first).toMatchObject({
            assignedAthleteCount: 22,
            hasMore: true,
            resourceInventory: { status: "unavailable" },
          });
          expect(first.assignedAthletes).toHaveLength(20);
          expect(first.assignedAthletes.flatMap((row) => row.assignmentKinds)).toContain(
            "supporting",
          );
          expect(first.assignedAthletes.map((row) => row.engagementId)).not.toContain(
            endedAssignmentEngagement,
          );
          expect(first.assignedAthletes.map((row) => row.engagementId)).not.toContain(
            endedEngagement,
          );
          expect(first.assignedAthletes.map((row) => row.engagementId)).not.toContain(
            futureEngagement,
          );
          const second = await ownerCaller.lifecycle.staff.offboardingImpact({
            organizationId,
            membershipId: coachMembershipId,
            limit: 20,
            cursor: first.nextCursor,
          });
          expect(second).toMatchObject({ assignedAthleteCount: 22, hasMore: false });
          expect(
            Array.from(
              new Set(
                [...first.assignedAthletes, ...second.assignedAthletes].map(
                  (row) => row.engagementId,
                ),
              ),
            ),
          ).toHaveLength(22);
          await expect(
            ownerCaller.lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: coachMembershipId,
              limit: 1,
              cursor: foreignCoachMembershipId,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          for (const membershipId of [foreignCoachMembershipId, randomUUID()])
            await expect(
              ownerCaller.lifecycle.staff.offboardingImpact({
                organizationId,
                membershipId,
                limit: 1,
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            caller(client.db, coach).lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: coachMembershipId,
              limit: 1,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, stranger).lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: coachMembershipId,
              limit: 1,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, futureAdmin).lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: coachMembershipId,
              limit: 1,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            ownerCaller.lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: created.membershipId,
              limit: 1,
            }),
          ).resolves.toMatchObject({
            target: { offboarding: { eligible: false, reason: "self" } },
          });
          await expect(
            caller(client.db, admin).lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: created.membershipId,
              limit: 1,
            }),
          ).resolves.toMatchObject({
            target: { offboarding: { eligible: false, reason: "root_owner" } },
          });
          await expect(
            caller(client.db, admin).lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: otherAdminMembershipId,
              limit: 1,
            }),
          ).resolves.toMatchObject({
            target: { offboarding: { eligible: false, reason: "admin_target" } },
          });
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
            caller(client.db, admin).lifecycle.staff.offboardingImpact({
              organizationId,
              membershipId: coachMembershipId,
              limit: 1,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);
});
