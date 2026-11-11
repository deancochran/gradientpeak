import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  coachingAssignments,
  coachingEngagements,
  organizationGroupAthletes,
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
import { and, eq, isNull, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { organizationsRouter } from "../organizations";

function context(db: DrizzleDbClient, id: string) {
  return {
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id, email: "quality@example.test" } },
    trpcSource: "vitest-live-db",
  } as never;
}

async function person(db: DrizzleDbClient, name: string) {
  const id = randomUUID();
  await db.insert(users).values({ id, name, email: `${id}@quality.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${id}@quality.test`,
    full_name: name,
    username: `quality-${id}`,
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
  const roleId = randomUUID();
  await db
    .insert(organizationMembershipRoleGrants)
    .values({ id: roleId, organization_id: organizationId, membership_id: id, role_key: role });
  return { id, roleId };
}

it("returns only authorized aggregate scope and denies inactive actors", async () => {
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "organization_coaching_quality",
    async (pool, url) => {
      await bootstrapSupabaseSchemas(pool);
      for (const migration of requireFreshBaseline().migrationPaths)
        await applySqlFile(pool, migration);
      const client = createDbClient({ url });
      try {
        const db = client.db;
        const owner = await person(db, "Owner");
        const admin = await person(db, "Admin");
        const coach = await person(db, "Coach");
        const otherCoach = await person(db, "Other coach");
        const ordinary = await person(db, "Ordinary");
        const foreign = await person(db, "Foreign");
        const foreignOwner = await person(db, "Foreign owner");
        const futureRevokedCoach = await person(db, "Future revoked coach");
        const futureSuspendedCoach = await person(db, "Future suspended coach");
        const futureEndedCoach = await person(db, "Future ended coach");
        const future = new Date(Date.now() + 86_400_000);
        const organizationId = randomUUID();
        const ownerCaller = organizationsRouter.createCaller(context(db, owner));
        await ownerCaller.create({
          organizationId,
          name: "Quality scope",
          slug: `quality-scope-${organizationId}`,
          timezone: "UTC",
        });
        const [ownerMembership] = await db
          .select({ id: organizationMemberships.id })
          .from(organizationMemberships)
          .where(eq(organizationMemberships.organization_id, organizationId));
        const ownerMembershipId = ownerMembership?.id;
        if (!ownerMembershipId) throw new Error("missing owner membership");
        const adminStaff = await staff(db, organizationId, admin, "admin");
        const coachStaff = await staff(db, organizationId, coach, "coach");
        const otherCoachStaff = await staff(db, organizationId, otherCoach, "coach");
        await staff(db, organizationId, ordinary, "coach");
        const futureRevokedStaff = await staff(db, organizationId, futureRevokedCoach, "coach");
        const futureSuspendedStaff = await staff(db, organizationId, futureSuspendedCoach, "coach");
        const futureEndedStaff = await staff(db, organizationId, futureEndedCoach, "coach");

        const directPrimary = randomUUID();
        const groupOnly = randomUUID();
        const overlapPaused = randomUUID();
        const excludedOtherGroup = randomUUID();
        const futureEngagement = randomUUID();
        const futureEndedDirect = randomUUID();
        const futureAthleteJoinedEngagement = randomUUID();
        const overlapActive = randomUUID();
        const endedUnion = randomUUID();
        for (const [id, paused] of [
          [directPrimary, false],
          [groupOnly, false],
          [overlapPaused, false],
          [excludedOtherGroup, false],
          [futureEngagement, false],
          [futureAthleteJoinedEngagement, false],
          [futureEndedDirect, false],
          [overlapActive, false],
          [endedUnion, false],
        ] as const) {
          const athlete = await person(db, `Athlete ${id.slice(0, 6)}`);
          await db.insert(coachingEngagements).values({
            id,
            organization_id: organizationId,
            athlete_profile_id: athlete,
            ...(paused ? { paused_at: new Date() } : {}),
            ...(id === futureEngagement ? { created_at: future } : {}),
          });
        }
        await db.insert(coachingAssignments).values({
          organization_id: organizationId,
          engagement_id: directPrimary,
          coach_membership_id: coachStaff.id,
          assignment_kind: "primary",
        });
        await expect(
          db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: futureEngagement,
            coach_membership_id: coachStaff.id,
            assignment_kind: "supporting",
            assigned_at: future,
          }),
        ).rejects.toMatchObject({
          cause: { message: "coaching assignment assigned_at cannot be in the future" },
        });
        // Direct assignments do not have the group guard's terminal-time restriction. A
        // non-null future terminal fact is therefore durable and must fail closed in scope.
        await db.insert(coachingAssignments).values({
          organization_id: organizationId,
          engagement_id: futureEndedDirect,
          coach_membership_id: coachStaff.id,
          assignment_kind: "supporting",
          ended_at: future,
        });

        const group = randomUUID();
        const otherGroup = randomUUID();
        const futureCreatedGroup = randomUUID();
        for (const groupId of [group, otherGroup])
          await db.insert(organizationGroups).values({
            id: groupId,
            organization_id: organizationId,
            name: `Group ${groupId.slice(0, 6)}`,
            created_by_membership_id: ownerMembershipId,
          });
        await expect(
          db.insert(organizationGroups).values({
            id: futureCreatedGroup,
            organization_id: organizationId,
            name: `Group ${futureCreatedGroup.slice(0, 6)}`,
            created_by_membership_id: ownerMembershipId,
            created_at: future,
          }),
        ).rejects.toMatchObject({
          cause: {
            message: "organization group relationships must begin active and effective now",
          },
        });
        await db.insert(organizationGroupCoachAssignments).values([
          {
            organization_id: organizationId,
            group_id: group,
            coach_membership_id: coachStaff.id,
            assigned_by_membership_id: ownerMembershipId,
          },
          {
            organization_id: organizationId,
            group_id: otherGroup,
            coach_membership_id: otherCoachStaff.id,
            assigned_by_membership_id: ownerMembershipId,
          },
        ]);
        await expect(
          db.insert(organizationGroupCoachAssignments).values({
            organization_id: organizationId,
            group_id: otherGroup,
            coach_membership_id: coachStaff.id,
            assigned_by_membership_id: ownerMembershipId,
            assigned_at: future,
          }),
        ).rejects.toMatchObject({
          cause: {
            message: "organization group relationships must begin active and effective now",
          },
        });
        await db.insert(organizationGroupAthletes).values([
          {
            organization_id: organizationId,
            group_id: group,
            engagement_id: groupOnly,
            added_by_membership_id: ownerMembershipId,
          },
          {
            organization_id: organizationId,
            group_id: group,
            engagement_id: overlapPaused,
            added_by_membership_id: ownerMembershipId,
          },
          {
            organization_id: organizationId,
            group_id: otherGroup,
            engagement_id: excludedOtherGroup,
            added_by_membership_id: ownerMembershipId,
          },
          {
            organization_id: organizationId,
            group_id: group,
            engagement_id: overlapActive,
            added_by_membership_id: ownerMembershipId,
          },
          {
            organization_id: organizationId,
            group_id: group,
            engagement_id: endedUnion,
            added_by_membership_id: ownerMembershipId,
          },
        ]);
        await db
          .update(organizationGroupAthletes)
          .set({
            ended_at: sql`transaction_timestamp()`,
            ended_by_membership_id: ownerMembershipId,
          })
          .where(
            and(
              eq(organizationGroupAthletes.organization_id, organizationId),
              eq(organizationGroupAthletes.group_id, group),
              eq(organizationGroupAthletes.engagement_id, endedUnion),
              isNull(organizationGroupAthletes.ended_at),
            ),
          );
        await expect(
          db.insert(organizationGroupAthletes).values({
            organization_id: organizationId,
            group_id: group,
            engagement_id: futureAthleteJoinedEngagement,
            added_by_membership_id: ownerMembershipId,
            joined_at: future,
          }),
        ).rejects.toMatchObject({
          cause: {
            message: "organization group relationships must begin active and effective now",
          },
        });
        // The same guard rejects future terminal group facts, so no durable row exists
        // with which to exercise the query's independent non-null terminal predicates.
        await expect(
          db
            .update(organizationGroupCoachAssignments)
            .set({ ended_at: future, ended_by_membership_id: ownerMembershipId })
            .where(eq(organizationGroupCoachAssignments.group_id, group)),
        ).rejects.toMatchObject({
          cause: { message: "organization group revocation must be effective now" },
        });
        await expect(
          db
            .update(organizationGroupAthletes)
            .set({ ended_at: future, ended_by_membership_id: ownerMembershipId })
            .where(
              and(
                eq(organizationGroupAthletes.group_id, group),
                eq(organizationGroupAthletes.engagement_id, groupOnly),
              ),
            ),
        ).rejects.toMatchObject({
          cause: { message: "organization group revocation must be effective now" },
        });
        await expect(
          db
            .update(organizationGroups)
            .set({ archived_at: future, archived_by_membership_id: ownerMembershipId })
            .where(eq(organizationGroups.id, group)),
        ).rejects.toMatchObject({
          cause: { message: "organization group revocation must be effective now" },
        });
        await db.insert(coachingAssignments).values([
          {
            organization_id: organizationId,
            engagement_id: overlapActive,
            coach_membership_id: coachStaff.id,
            assignment_kind: "supporting",
          },
          {
            organization_id: organizationId,
            engagement_id: endedUnion,
            coach_membership_id: coachStaff.id,
            assignment_kind: "supporting",
            ended_at: sql`transaction_timestamp()`,
          },
          ...[futureRevokedStaff, futureSuspendedStaff, futureEndedStaff].map((member) => ({
            organization_id: organizationId,
            engagement_id: directPrimary,
            coach_membership_id: member.id,
            assignment_kind: "supporting" as const,
          })),
        ]);
        await db
          .update(coachingEngagements)
          .set({ paused_at: sql`transaction_timestamp()` })
          .where(eq(coachingEngagements.id, overlapPaused));

        const coachCaller = organizationsRouter.createCaller(context(db, coach)).coachingQuality;
        const coachOverview = await coachCaller.overview({ organizationId });
        expect(coachOverview).toMatchObject({
          actorProfileId: coach,
          organizationId,
          scopeKind: "assigned_engagements",
          definitions: { version: "coaching-quality-overview.v1" },
          aggregates: {
            activeEngagementCount: 3,
            pausedEngagementCount: 1,
            activeWithoutPrimaryCount: 2,
          },
        });
        expect(coachOverview.snapshotAsOf).toBeInstanceOf(Date);
        const qualityOverview = await ownerCaller.coachingQuality.overview({ organizationId });
        expect(qualityOverview).toMatchObject({
          scopeKind: "organization_admin",
          aggregates: {
            activeEngagementCount: 7,
            pausedEngagementCount: 1,
            activeWithoutPrimaryCount: 6,
          },
        });
        const operationalOverview = await ownerCaller.lifecycle.operationalOverview({
          organizationId,
        });
        expect(qualityOverview.aggregates).toEqual({
          activeEngagementCount: operationalOverview.activeEngagements,
          pausedEngagementCount: operationalOverview.pausedEngagements,
          activeWithoutPrimaryCount: operationalOverview.activeEngagementsWithoutPrimary,
        });
        expect(
          await organizationsRouter
            .createCaller(context(db, admin))
            .coachingQuality.overview({ organizationId }),
        ).toMatchObject({ scopeKind: "organization_admin" });
        expect(
          await organizationsRouter
            .createCaller(context(db, ordinary))
            .coachingQuality.overview({ organizationId }),
        ).toMatchObject({
          scopeKind: "assigned_engagements",
          aggregates: {
            activeEngagementCount: 0,
            pausedEngagementCount: 0,
            activeWithoutPrimaryCount: 0,
          },
        });
        await expect(
          organizationsRouter
            .createCaller(context(db, foreign))
            .coachingQuality.overview({ organizationId }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        const foreignOrganizationId = randomUUID();
        const foreignOwnerCaller = organizationsRouter.createCaller(context(db, foreignOwner));
        await foreignOwnerCaller.create({
          organizationId: foreignOrganizationId,
          name: "Foreign quality scope",
          slug: `foreign-quality-scope-${foreignOrganizationId}`,
          timezone: "UTC",
        });
        const foreignStaff = await staff(db, foreignOrganizationId, foreign, "coach");
        const foreignEngagement = randomUUID();
        await db.insert(coachingEngagements).values({
          id: foreignEngagement,
          organization_id: foreignOrganizationId,
          athlete_profile_id: await person(db, "Foreign athlete"),
        });
        await db.insert(coachingAssignments).values({
          organization_id: foreignOrganizationId,
          engagement_id: foreignEngagement,
          coach_membership_id: foreignStaff.id,
          assignment_kind: "primary",
        });
        await expect(
          organizationsRouter
            .createCaller(context(db, foreign))
            .coachingQuality.overview({ organizationId }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await db
          .update(organizationMembershipRoleGrants)
          .set({ revoked_at: future })
          .where(eq(organizationMembershipRoleGrants.id, futureRevokedStaff.roleId));
        await db
          .update(organizationMemberships)
          .set({ suspended_at: future })
          .where(eq(organizationMemberships.id, futureSuspendedStaff.id));
        await db
          .update(organizationMemberships)
          .set({ ended_at: future })
          .where(eq(organizationMemberships.id, futureEndedStaff.id));
        for (const actor of [futureRevokedCoach, futureSuspendedCoach, futureEndedCoach])
          await expect(
            organizationsRouter
              .createCaller(context(db, actor))
              .coachingQuality.overview({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await db
          .update(organizationMembershipRoleGrants)
          .set({ revoked_at: sql`transaction_timestamp()` })
          .where(eq(organizationMembershipRoleGrants.id, coachStaff.roleId));
        await expect(coachCaller.overview({ organizationId })).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await db
          .update(organizationMemberships)
          .set({ suspended_at: sql`transaction_timestamp()` })
          .where(eq(organizationMemberships.id, adminStaff.id));
        await expect(
          organizationsRouter
            .createCaller(context(db, admin))
            .coachingQuality.overview({ organizationId }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await client.close();
      }
    },
  );
});
