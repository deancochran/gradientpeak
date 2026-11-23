import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileGoals,
  profiles,
  users,
} from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { goalsRouter } from "../goals";
import { organizationsRouter } from "../organizations";

function context(db: DrizzleDbClient, userId: string) {
  return {
    db,
    headers: new Headers(),
    clientType: "web",
    session: { user: { id: userId, email: `${userId}@fixture.test` } },
  } as never;
}
async function person(db: DrizzleDbClient, name: string, planningTimezone?: string) {
  const id = randomUUID();
  await db.insert(users).values({ id, name, email: `${id}@fixture.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${id}@fixture.test`,
    full_name: name,
    username: `fixture-${id}`,
    onboarding_status: "completed",
    is_public: false,
    ...(planningTimezone === undefined ? {} : { planning_timezone: planningTimezone }),
  });
  return id;
}

it("proves selected-org goals consent, assignment revocation, and stable created-at keyset ordering on a guarded disposable database", async () => {
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "coach_athlete_goals",
    async (pool, url) => {
      await bootstrapSupabaseSchemas(pool);
      for (const migration of requireFreshBaseline().migrationPaths)
        await applySqlFile(pool, migration);
      const client = createDbClient({ url });
      try {
        const db = client.db;
        const owner = await person(db, "Owner");
        const coach = await person(db, "Coach");
        const athlete = await person(db, "Athlete", "America/Los_Angeles");
        const organizationId = randomUUID();
        const wrongOrganizationId = randomUUID();
        const ownerOrganizations = organizationsRouter.createCaller(context(db, owner));
        for (const id of [organizationId, wrongOrganizationId])
          await ownerOrganizations.create({
            organizationId: id,
            name: "Goals workspace",
            slug: `goals-${id}`,
            timezone: "UTC",
          });
        const [membership] = await db
          .insert(organizationMemberships)
          .values({ id: randomUUID(), organization_id: organizationId, profile_id: coach })
          .returning();
        if (!membership) throw new Error("missing coach membership");
        await db.insert(organizationMembershipRoleGrants).values({
          id: randomUUID(),
          organization_id: organizationId,
          membership_id: membership.id,
          role_key: "coach",
        });
        const assignAthlete = async (athleteProfileId: string) => {
          const engagementId = randomUUID();
          await db.insert(coachingEngagements).values({
            id: engagementId,
            organization_id: organizationId,
            athlete_profile_id: athleteProfileId,
          });
          await db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: engagementId,
            coach_membership_id: membership.id,
            assignment_kind: "primary",
          });
          return engagementId;
        };
        const engagementId = await assignAthlete(athlete);
        const policy = randomUUID();
        await db.execute(sql`
          insert into athlete_consent_policy_versions
            (id, scope_key, effective_from, jurisdiction, terms_text, content_digest)
          values (${policy}::uuid, 'goals', now() - interval '1 second', 'US', 'Goals terms', ${`sha256:${policy}`})
        `);
        await db.insert(athleteDataSharingConsents).values({
          organization_id: organizationId,
          engagement_id: engagementId,
          athlete_profile_id: athlete,
          scope_key: "goals",
          policy_version_id: policy,
          granted_by_profile_id: athlete,
        });
        const now = new Date("2026-01-01T00:00:00.000Z");
        const firstGoalId = randomUUID();
        const secondGoalId = randomUUID();
        await db.insert(profileGoals).values([
          {
            id: firstGoalId,
            profile_id: athlete,
            title: "First",
            priority: 1,
            activity_category: "run",
            target_date: "2026-12-31",
            target_payload: {
              type: "event_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500,
            },
            created_at: now,
            updated_at: now,
          },
          {
            id: secondGoalId,
            profile_id: athlete,
            title: "Second",
            priority: 2,
            activity_category: "run",
            target_date: "2026-12-31",
            target_payload: {
              type: "event_performance",
              activity_category: "run",
              distance_m: 10000,
              target_time_s: 3000,
            },
            created_at: now,
            updated_at: now,
          },
        ]);
        await db.execute(sql`
          update profile_goals
          set created_at = case
            when id = ${firstGoalId}::uuid then '2026-01-01T00:00:00.123456Z'::timestamptz
            when id = ${secondGoalId}::uuid then '2026-01-01T00:00:00.123457Z'::timestamptz
          end
          where id in (${firstGoalId}::uuid, ${secondGoalId}::uuid)
        `);
        const caller = goalsRouter.createCaller(context(db, coach));
        const allowed = await caller.listForOrganization({
          organizationId,
          athleteProfileId: athlete,
          limit: 1,
        });
        expect(allowed.items).toHaveLength(1);
        expect(allowed.items[0]?.name).toBe("Second");
        expect(allowed.nextCursor).not.toBeNull();
        const secondPage = await caller.listForOrganization({
          organizationId,
          athleteProfileId: athlete,
          limit: 1,
          cursor: allowed.nextCursor,
        });
        expect(secondPage.items.map((item) => item.name)).toEqual(["First"]);
        expect([...allowed.items, ...secondPage.items].map((item) => item.id)).toEqual([
          secondGoalId,
          firstGoalId,
        ]);
        await expect(
          caller.listForOrganization({
            organizationId: wrongOrganizationId,
            athleteProfileId: athlete,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        const historicalPolicy = randomUUID();
        await db.execute(sql`
          insert into athlete_consent_policy_versions
            (id, scope_key, effective_from, jurisdiction, terms_text, content_digest)
          values (${historicalPolicy}::uuid, 'goals', now() - interval '2 days', 'US', 'Historical goals terms', ${`sha256:${historicalPolicy}`})
        `);
        const expiredAthlete = await person(db, "Expired athlete", "America/Los_Angeles");
        const expiredEngagementId = await assignAthlete(expiredAthlete);
        await db.insert(athleteDataSharingConsents).values({
          organization_id: organizationId,
          engagement_id: expiredEngagementId,
          athlete_profile_id: expiredAthlete,
          scope_key: "goals",
          policy_version_id: historicalPolicy,
          granted_by_profile_id: expiredAthlete,
          granted_at: new Date(Date.now() - 86_400_000),
          expires_at: new Date(Date.now() - 1_000),
        });
        await expect(
          caller.listForOrganization({ organizationId, athleteProfileId: expiredAthlete }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        const metricsPolicy = randomUUID();
        await db.execute(sql`
          insert into athlete_consent_policy_versions
            (id, scope_key, effective_from, jurisdiction, terms_text, content_digest)
          values (${metricsPolicy}::uuid, 'metrics', now() - interval '1 second', 'US', 'Metrics terms', ${`sha256:${metricsPolicy}`})
        `);
        const metricsAthlete = await person(db, "Metrics athlete", "America/Los_Angeles");
        const metricsEngagementId = await assignAthlete(metricsAthlete);
        await db.insert(athleteDataSharingConsents).values({
          organization_id: organizationId,
          engagement_id: metricsEngagementId,
          athlete_profile_id: metricsAthlete,
          scope_key: "metrics",
          policy_version_id: metricsPolicy,
          granted_by_profile_id: metricsAthlete,
        });
        await expect(
          caller.listForOrganization({ organizationId, athleteProfileId: metricsAthlete }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        const missingAthlete = await person(db, "Missing-consent athlete", "America/Los_Angeles");
        await assignAthlete(missingAthlete);
        await expect(
          caller.listForOrganization({ organizationId, athleteProfileId: missingAthlete }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        const revokedAthlete = await person(
          db,
          "Revoked-assignment athlete",
          "America/Los_Angeles",
        );
        const revokedEngagementId = await assignAthlete(revokedAthlete);
        await db.insert(athleteDataSharingConsents).values({
          organization_id: organizationId,
          engagement_id: revokedEngagementId,
          athlete_profile_id: revokedAthlete,
          scope_key: "goals",
          policy_version_id: policy,
          granted_by_profile_id: revokedAthlete,
        });
        await expect(
          ownerOrganizations.staffRoles.revoke({
            organizationId,
            membershipId: membership.id,
            role: "coach",
            operationId: randomUUID(),
          }),
        ).resolves.toMatchObject({ status: "revoked" });
        await expect(
          caller.listForOrganization({ organizationId, athleteProfileId: revokedAthlete }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await client.close();
      }
    },
  );
});
