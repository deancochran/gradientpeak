import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  organizationAuditEvents,
  organizationMembershipRoleGrants,
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
import { describe, expect, it } from "vitest";
import { assertProfileAccess } from "../account/profile-access";
import { profileAccessRouter } from "../account/profile-access-router";

function caller(db: DrizzleDbClient, userId: string) {
  return profileAccessRouter.createCaller({
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id: userId, email: "untrusted-session@example.test" } },
    trpcSource: "vitest-live-db",
  } as never);
}

function context(db: DrizzleDbClient, userId: string) {
  return {
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id: userId, email: "untrusted-session@example.test" } },
    trpcSource: "vitest-live-db",
  } as never;
}

async function person(db: DrizzleDbClient, label: string) {
  const id = randomUUID();
  const email = `${label}-${id}@profile-access-retirement.test`;
  await db.insert(users).values({ id, name: label, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return id;
}

describe("profile access revoke retirement against a disposable migrated PostgreSQL database", () => {
  it("fails closed for every authenticated relationship party without changing delegated authority", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "profile_access_retirement",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const athleteId = await person(client.db, "athlete");
          const coachId = await person(client.db, "coach");
          const outsiderId = await person(client.db, "outsider");
          const organizationId = randomUUID();
          const membershipId = randomUUID();
          const engagementId = randomUUID();
          await client.db.transaction(async (transaction) => {
            await transaction.execute(sql`set constraints all deferred`);
            await transaction.execute(sql`
              insert into organizations (id, created_by_profile_id, root_owner_membership_id, name, slug, timezone)
              values (${organizationId}::uuid, ${coachId}::uuid, ${membershipId}::uuid, 'Retirement', ${`retirement-${organizationId}`}, 'UTC')
            `);
            await transaction.execute(sql`
              insert into organization_memberships (id, organization_id, profile_id)
              values (${membershipId}::uuid, ${organizationId}::uuid, ${coachId}::uuid)
            `);
            await transaction.execute(sql`
              insert into organization_membership_role_grants (organization_id, membership_id, role_key)
              values (${organizationId}::uuid, ${membershipId}::uuid, 'admin'), (${organizationId}::uuid, ${membershipId}::uuid, 'coach')
            `);
            await transaction.execute(sql`
              insert into coaching_engagements (id, organization_id, athlete_profile_id)
              values (${engagementId}::uuid, ${organizationId}::uuid, ${athleteId}::uuid)
            `);
            await transaction.execute(sql`
              insert into coaching_assignments (organization_id, engagement_id, coach_membership_id, assignment_kind)
              values (${organizationId}::uuid, ${engagementId}::uuid, ${membershipId}::uuid, 'primary')
            `);
          });

          for (const userId of [athleteId, coachId, outsiderId]) {
            await expect(
              caller(client.db, userId).revoke({ coach_id: coachId, athlete_id: athleteId }),
            ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
          }

          await expect(
            assertProfileAccess({ ctx: context(client.db, coachId), profileId: athleteId }),
          ).resolves.toBeUndefined();
          await expect(
            assertProfileAccess({ ctx: context(client.db, outsiderId), profileId: athleteId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            client.db
              .select({ id: organizationAuditEvents.id })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.organization_id, organizationId)),
          ).resolves.toHaveLength(0);
          await expect(
            client.db
              .select({ id: organizationMembershipRoleGrants.id })
              .from(organizationMembershipRoleGrants)
              .where(
                and(
                  eq(organizationMembershipRoleGrants.organization_id, organizationId),
                  eq(organizationMembershipRoleGrants.membership_id, membershipId),
                  eq(organizationMembershipRoleGrants.role_key, "coach"),
                  isNull(organizationMembershipRoleGrants.revoked_at),
                ),
              ),
          ).resolves.toHaveLength(1);
          await expect(
            client.db.execute(sql`
              select
                (select ended_at is null from coaching_engagements where id = ${engagementId}::uuid) as engagement_active,
                (select count(*)::int from coaching_assignments where engagement_id = ${engagementId}::uuid and ended_at is null) as active_assignments
            `),
          ).resolves.toMatchObject({
            rows: [expect.objectContaining({ engagement_active: true, active_assignments: 1 })],
          });
        } finally {
          await client.close();
        }
      },
    );
  });
});
