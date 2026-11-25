import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  dailyTrainingLoad,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileAthleteState,
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
import { and, eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { organizationsRouter } from "../organizations";

function context(db: DrizzleDbClient, id: string) {
  return {
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id, email: "fixture@example.test" } },
    trpcSource: "vitest-live-db",
  } as never;
}

async function person(db: DrizzleDbClient, name: string) {
  const id = randomUUID();
  await db.insert(users).values({ id, name, email: `${id}@fixture.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${id}@fixture.test`,
    full_name: name,
    username: `fixture-${id}`,
    onboarding_status: "completed",
    is_public: false,
    planning_timezone: "America/Los_Angeles",
  });
  return id;
}

it("proves bounded visual roster scopes, local dates, cursors, and revoked access on a guarded disposable database", async () => {
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "coach_visual_roster",
    async (pool, url) => {
      await bootstrapSupabaseSchemas(pool);
      for (const path of requireFreshBaseline().migrationPaths) await applySqlFile(pool, path);
      const client = createDbClient({ url });
      try {
        const db = client.db;
        const owner = await person(db, "Owner");
        const coach = await person(db, "Coach");
        const activitiesOnly = await person(db, "Activities only");
        const metricsOnly = await person(db, "Metrics only");
        const goalsOnly = await person(db, "Goals only");
        const noConsent = await person(db, "No consent");
        const allScopes = await person(db, "All scopes");
        const organizationId = randomUUID();
        const wrongOrganizationId = randomUUID();
        const ownerCaller = organizationsRouter.createCaller(context(db, owner));
        for (const id of [organizationId, wrongOrganizationId])
          await ownerCaller.create({
            organizationId: id,
            name: "Visual roster",
            slug: `visual-roster-${id}`,
            timezone: "America/Los_Angeles",
          });
        const [membership] = await db
          .insert(organizationMemberships)
          .values({ id: randomUUID(), organization_id: organizationId, profile_id: coach })
          .returning();
        if (!membership) throw new Error("Missing coach membership");
        const roleId = randomUUID();
        await db.insert(organizationMembershipRoleGrants).values({
          id: roleId,
          organization_id: organizationId,
          membership_id: membership.id,
          role_key: "coach",
        });
        const engagements = new Map<string, string>();
        for (const athlete of [activitiesOnly, metricsOnly, goalsOnly, noConsent, allScopes]) {
          const engagementId = randomUUID();
          engagements.set(athlete, engagementId);
          await db.insert(coachingEngagements).values({
            id: engagementId,
            organization_id: organizationId,
            athlete_profile_id: athlete,
          });
          await db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: engagementId,
            coach_membership_id: membership.id,
            assignment_kind: "primary",
          });
        }
        for (const scope of ["metrics", "activities", "goals"] as const) {
          const policy = randomUUID();
          await db.execute(sql`
            insert into athlete_consent_policy_versions
              (id, scope_key, effective_from, jurisdiction, terms_text, content_digest)
            values (${policy}::uuid, ${scope}, now() - interval '1 second', 'US', 'Fixture terms', ${`sha256:${policy}`})
          `);
          const consentingAthletes =
            scope === "activities"
              ? [activitiesOnly, allScopes]
              : scope === "metrics"
                ? [metricsOnly, allScopes]
                : [goalsOnly, allScopes];
          for (const athlete of consentingAthletes)
            await db.insert(athleteDataSharingConsents).values({
              organization_id: organizationId,
              engagement_id: engagements.get(athlete) ?? "",
              athlete_profile_id: athlete,
              scope_key: scope,
              policy_version_id: policy,
              granted_by_profile_id: athlete,
            });
        }
        const today = new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Los_Angeles",
        });
        for (const athlete of [activitiesOnly, metricsOnly, allScopes]) {
          await db.insert(profileAthleteState).values({
            profile_id: athlete,
            source_revision: athlete === activitiesOnly ? 2 : 1,
            published_revision: 1,
            fitness: 30,
            fatigue: 20,
            evidence_confidence: 0.8,
            computed_at: new Date(),
          });
          await db.insert(dailyTrainingLoad).values([
            {
              profile_id: athlete,
              planning_date: today,
              common_load: 12,
              fitness: 30,
              fatigue: 20,
              form: 10,
              coverage_status: "partial",
              contributing_activity_count: 1,
              omitted_activity_count: 1,
              source_revision: 1,
              calculation_version: "fixture-v1",
            },
            {
              profile_id: athlete,
              planning_date: "2099-01-01",
              common_load: 99,
              fitness: 99,
              fatigue: 1,
              form: 98,
              coverage_status: "complete",
              contributing_activity_count: 1,
              omitted_activity_count: 0,
              source_revision: 1,
              calculation_version: "fixture-v1",
            },
          ]);
        }
        await db.insert(profileGoals).values(
          [allScopes, goalsOnly].map((profileId) => ({
            id: randomUUID(),
            profile_id: profileId,
            created_at: new Date(),
            updated_at: new Date(),
            title: "Target event",
            priority: 1,
            activity_category: "run" as const,
            target_date: "2027-01-01",
            target_payload: {
              type: "event_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500,
            },
          })),
        );
        const caller = organizationsRouter.createCaller(context(db, coach)).coachAthletes;
        const full = await caller.listVisualRoster({ organizationId, limit: 50 });
        expect(full.items).toHaveLength(5);
        const first = await caller.listVisualRoster({ organizationId, limit: 1 });
        expect(first.queryCount).toBe(3);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const second = await caller.listVisualRoster({
          organizationId,
          limit: 1,
          cursor: first.nextCursor,
        });
        expect(first.items[0]?.profileId).not.toBe(second.items[0]?.profileId);
        const activitiesOnlyResult = full.items.find((item) => item.profileId === activitiesOnly);
        expect(activitiesOnlyResult).toMatchObject({
          metrics: { status: "unshared" },
          activities: {
            status: "available",
            qualifier: "stale",
            planningTimezone: "America/Los_Angeles",
          },
          goals: { status: "unshared", items: [] },
        });
        expect(activitiesOnlyResult?.activities.points).toHaveLength(1);
        expect(activitiesOnlyResult?.activities.points[0]).toMatchObject({
          coverageStatus: "partial",
          omittedActivityCount: 1,
        });
        expect(activitiesOnlyResult?.activities.points[0]).not.toMatchObject({
          date: "2099-01-01",
        });
        const scopeResult = (profileId: string) =>
          full.items.find((item) => item.profileId === profileId);
        expect(scopeResult(metricsOnly)).toMatchObject({
          metrics: { status: "available" },
          activities: { status: "unshared", points: [] },
          goals: { status: "unshared", items: [] },
        });
        expect(scopeResult(goalsOnly)).toMatchObject({
          metrics: { status: "unshared" },
          activities: { status: "unshared", points: [] },
          goals: { status: "available" },
        });
        expect(scopeResult(noConsent)).toMatchObject({
          metrics: { status: "unshared" },
          activities: { status: "unshared", points: [] },
          goals: { status: "unshared", items: [] },
        });
        await db
          .update(athleteDataSharingConsents)
          .set({ ended_at: new Date() })
          .where(
            and(
              eq(athleteDataSharingConsents.athlete_profile_id, allScopes),
              eq(athleteDataSharingConsents.scope_key, "activities"),
            ),
          );
        const consentRevoked = await caller.listVisualRoster({ organizationId, limit: 50 });
        expect(consentRevoked.items.find((item) => item.profileId === allScopes)).toMatchObject({
          activities: { status: "unshared", points: [] },
        });
        await db
          .update(coachingEngagements)
          .set({ ended_at: new Date() })
          .where(eq(coachingEngagements.id, engagements.get(allScopes) ?? ""));
        expect(
          (await caller.listVisualRoster({ organizationId, limit: 50 })).items.map(
            (item) => item.profileId,
          ),
        ).not.toContain(allScopes);
        await expect(
          caller.listVisualRoster({ organizationId: wrongOrganizationId }),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await db
          .update(organizationMembershipRoleGrants)
          .set({ revoked_at: sql`now()` })
          .where(eq(organizationMembershipRoleGrants.id, roleId));
        await expect(caller.listVisualRoster({ organizationId })).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      } finally {
        await client.close();
      }
    },
  );
});
