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
import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { withAuthorizedAthleteRead } from "../../application/organizations/authorize-athlete-read";
import { createOrganizationCoachAthleteRepository } from "../../repositories/organization-coach-athlete-repository";
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
  await db.insert(users).values({ id, name, email: `${id}@workspace.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${id}@workspace.test`,
    full_name: name,
    username: `fixture-${id}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return id;
}
it("proves assigned identity pagination, exact lookup, temporal/group authority and selected-org denial on fresh PostgreSQL", async () => {
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "coach_workspace",
    async (pool, url) => {
      await bootstrapSupabaseSchemas(pool);
      for (const path of requireFreshBaseline().migrationPaths) await applySqlFile(pool, path);
      const client = createDbClient({ url });
      try {
        const db = client.db;
        const owner = await person(db, "Owner");
        const coach = await person(db, "Coach");
        const org = randomUUID();
        const otherOrg = randomUUID();
        const ownerCaller = organizationsRouter.createCaller(context(db, owner));
        for (const organizationId of [org, otherOrg])
          await ownerCaller.create({
            organizationId,
            name: "Workspace",
            slug: `workspace-${organizationId}`,
            timezone: "UTC",
          });
        const [ownerMembership] = await db
          .select()
          .from(organizationMemberships)
          .where(eq(organizationMemberships.profile_id, owner));
        const ownerId = (
          await db
            .select()
            .from(organizationMemberships)
            .where(eq(organizationMemberships.organization_id, org))
        )[0]?.id;
        if (!ownerMembership || !ownerId) throw new Error("Missing fixture owner");
        const membership = randomUUID();
        await db
          .insert(organizationMemberships)
          .values({ id: membership, organization_id: org, profile_id: coach });
        const role = randomUUID();
        await db
          .insert(organizationMembershipRoleGrants)
          .values({ id: role, organization_id: org, membership_id: membership, role_key: "coach" });
        const caller = organizationsRouter.createCaller(context(db, coach)).coachAthletes;
        const expected: string[] = [];
        const engagements: string[] = [];
        for (let index = 0; index < 25; index++) {
          const id = await person(db, index === 0 ? "Literal_% athlete" : `Athlete ${index}`);
          const engagement = randomUUID();
          expected.push(id);
          engagements.push(engagement);
          await db
            .insert(coachingEngagements)
            .values({ id: engagement, organization_id: org, athlete_profile_id: id });
          await db.insert(coachingAssignments).values({
            organization_id: org,
            engagement_id: engagement,
            coach_membership_id: membership,
            assignment_kind: "primary",
          });
        }
        expected.sort();
        const seen: string[] = [];
        let cursor: string | null = null;
        do {
          const page = await caller.listAssigned({ organizationId: org, limit: 7, cursor });
          seen.push(...page.items.map((item) => item.profileId));
          cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toEqual(expected);
        const last = expected.at(-1);
        if (!last) throw new Error("Missing fixture athlete");
        expect(
          (await caller.getAssigned({ organizationId: org, athleteProfileId: last }))?.profileId,
        ).toBe(last);
        expect(
          (await caller.listAssigned({ organizationId: org, search: "_%" })).items,
        ).toHaveLength(1);
        expect(
          await caller.getAssigned({ organizationId: otherOrg, athleteProfileId: last }),
        ).toBeNull();
        await expect(
          caller.listAssigned({ organizationId: otherOrg, cursor: last }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          ownerCaller.coachAthletes.listAssigned({ organizationId: org }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(
          (await ownerCaller.lifecycle.adminRoster.list({ organizationId: org, limit: 1 })).items,
        ).toHaveLength(1);
        let reads = 0;
        for (const actor of [owner, coach]) {
          const result = await withAuthorizedAthleteRead({
            db,
            actorProfileId: actor,
            organizationId: org,
            athleteProfileId: last,
            scope: "metrics",
            read: async () => {
              reads++;
              return "private";
            },
          });
          expect(result.decision.outcome).toBe("deny");
        }
        expect(reads).toBe(0);
        const group = randomUUID();
        await db.insert(organizationGroups).values({
          id: group,
          organization_id: org,
          name: "Assigned group",
          created_by_membership_id: ownerId,
        });
        await db.insert(organizationGroupCoachAssignments).values({
          organization_id: org,
          group_id: group,
          coach_membership_id: membership,
          assigned_by_membership_id: ownerId,
        });
        const duplicateEngagement = engagements[0];
        if (!duplicateEngagement) throw new Error("Missing engagement");
        await db.insert(organizationGroupAthletes).values({
          organization_id: org,
          group_id: group,
          engagement_id: duplicateEngagement,
          added_by_membership_id: ownerId,
        });
        expect((await caller.listAssigned({ organizationId: org, limit: 50 })).items).toHaveLength(
          25,
        );
        const groupOnly = await person(db, "Group only");
        const groupEngagement = randomUUID();
        await db
          .insert(coachingEngagements)
          .values({ id: groupEngagement, organization_id: org, athlete_profile_id: groupOnly });
        await db.insert(organizationGroupAthletes).values({
          organization_id: org,
          group_id: group,
          engagement_id: groupEngagement,
          added_by_membership_id: ownerId,
        });
        expect(
          (await caller.getAssigned({ organizationId: org, athleteProfileId: groupOnly }))
            ?.profileId,
        ).toBe(groupOnly);
        await db
          .update(organizationGroups)
          .set({ archived_at: new Date(), archived_by_membership_id: ownerId })
          .where(eq(organizationGroups.id, group));
        expect(
          await caller.getAssigned({ organizationId: org, athleteProfileId: groupOnly }),
        ).toBeNull();
        const future = new Date(Date.now() + 86400000);
        for (const kind of ["engagement", "assignment"] as const) {
          const athlete = await person(db, `Future ${kind}`);
          const engagement = randomUUID();
          await db.insert(coachingEngagements).values({
            id: engagement,
            organization_id: org,
            athlete_profile_id: athlete,
            ...(kind === "engagement" ? { created_at: future } : {}),
          });
          const insertion = db.insert(coachingAssignments).values({
            organization_id: org,
            engagement_id: engagement,
            coach_membership_id: membership,
            assignment_kind: "primary",
            ...(kind === "assignment" ? { assigned_at: future } : {}),
          });
          if (kind === "assignment")
            await expect(insertion).rejects.toMatchObject({
              cause: { message: "coaching assignment assigned_at cannot be in the future" },
            });
          else await insertion;
          expect(
            await caller.getAssigned({ organizationId: org, athleteProfileId: athlete }),
          ).toBeNull();
        }
        // Revoke between the preliminary capability read and the exact data query.
        const repo = createOrganizationCoachAthleteRepository(db);
        expect(await repo.hasActiveCoachMembership({ organizationId: org, profileId: coach })).toBe(
          true,
        );
        await db
          .update(organizationMembershipRoleGrants)
          .set({ revoked_at: sql`now()` })
          .where(eq(organizationMembershipRoleGrants.id, role));
        expect(
          await repo.listAssigned({
            organizationId: org,
            coachProfileId: coach,
            limit: 50,
            cursor: null,
            search: null,
          }),
        ).toEqual([]);
        expect(
          await caller.getAssigned({ organizationId: org, athleteProfileId: last }),
        ).toBeNull();
      } finally {
        await client.close();
      }
    },
  );
});
